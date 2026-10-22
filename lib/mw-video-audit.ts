// 👉 The Studio's check before an export: the skills' audit, run in the browser.
//
// The mw-video-audit skill audits every video a Claude session makes, fixes
// what it can, re-renders and re-audits before anyone sees it. This is the
// same loop for /mw/studio, where the fixing has to happen without a person:
//
//   auditExport   the layout audit (lib/mw-brandfilm-audit.ts, generated from
//                 the skills' engine/audit.js) on an offscreen canvas
//   autoFix       timing only — a text that lands late or early is moved onto
//                 Ava's word, a text that is not up long enough comes in
//                 earlier — then audited again, up to three rounds
//   loudness      the mix measured as ITU-R BS.1770 and set to −14 LUFS, peaks
//                 kept under −2 dBFS (the skills' render.js does the same)
//
// Everything that changes what the video SAYS (words, claims, numbering) is
// left alone and reported for Rif to approve. Pure apart from the canvas.

import { auditFilm } from './mw-brandfilm-audit'
import type { Film } from './mw-brandfilm'

export type Severity = 'blocker' | 'should fix' | 'nice to have'
export type Finding = {
  severity: Severity
  kind: string
  /** layout (the engine), media (the file), voice (Ava), review (Claude, from the frames) */
  source: 'layout' | 'media' | 'voice' | 'review'
  /** auto: design/timing, fixed in the loop · approve: changes what the video says */
  fix: 'auto' | 'approve'
  scene: string
  t: number | null
  text: string
  detail: string
  rule: string
  /** for the round it was fixed in, once it is gone */
  fixedInRound?: number
  si?: number; d?: number; wordAt?: number; readable?: number; need?: number; burst?: boolean
}

const APPROVE = new Set(['sequence', 'figure', 'claim', 'copy', 'spelling'])
export const fixClass = (kind: string): 'auto' | 'approve' => (APPROVE.has(kind) ? 'approve' : 'auto')

export type Draw = ((t: number) => void) & { safe?: unknown; format?: string }

/** One layout audit of `film`, drawn by `engine(ctx)` on a canvas of the format's size. */
export function auditExport(
  film: Film, size: { w: number; h: number }, engine: (ctx: CanvasRenderingContext2D, film: Film) => Draw,
  vo: { t: number; words: [string, number][] }[], source: string,
): Finding[] {
  const c = document.createElement('canvas')
  c.width = size.w; c.height = size.h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const raw: any[] = auditFilm(ctx, size.w, size.h, film, engine(ctx, film), { vo, source })
  return raw.map(q => ({ ...q, source: 'layout', fix: fixClass(q.kind), scene: q.scene ?? '', t: q.t ?? null, text: q.text ?? '' }))
}

/**
 * Timing fixes, on a copy of the film. Returns the new film and what changed.
 * Late/early: onto Ava's word (0.1s before it, as the engine eases text in).
 * Hold: in earlier by what is missing, never more than 0.6s ahead of its word
 * and never before its scene has opened.
 */
export function autoFix(film: Film, findings: Finding[]): { film: Film; changed: string[] } {
  const f: Film = JSON.parse(JSON.stringify(film))
  const changed: string[] = []
  for (const q of findings) {
    if (q.fix !== 'auto' || q.si == null || !['late', 'early', 'hold'].includes(q.kind)) continue
    const sc = f.scenes[q.si]
    if (!sc) continue
    const it = (q.burst ? sc.words : sc.text)?.find((x: any) => x.s === q.text)
    if (!it) continue
    const first = sc.a + 0.15, before = it.t
    if ((q.kind === 'late' || q.kind === 'early') && q.wordAt != null) it.t = Math.max(first, q.wordAt - 0.1)
    if (q.kind === 'hold' && q.need != null && q.readable != null) {
      const floor = q.wordAt != null ? q.wordAt - 0.6 : first
      it.t = Math.max(first, floor, it.t - (q.need - q.readable) - 0.05)
    }
    it.t = +it.t.toFixed(3)
    // burst words are drawn in time order
    if (q.burst && sc.words) for (let i = 1; i < sc.words.length; i++) sc.words[i].t = Math.max(sc.words[i].t, sc.words[i - 1].t + 0.2)
    if (it.t !== before) changed.push(`“${q.text}” ${q.kind === 'hold' ? 'comes in' : 'moved'} ${before.toFixed(2)}s → ${it.t.toFixed(2)}s`)
  }
  return { film: f, changed }
}

/** Audit, fix the timing, audit again — up to `rounds` times. */
export function auditAndFix(
  film: Film, size: { w: number; h: number }, engine: (ctx: CanvasRenderingContext2D, film: Film) => Draw,
  vo: { t: number; words: [string, number][] }[], source: string, rounds = 3,
): { film: Film; findings: Finding[]; fixed: Finding[]; changed: string[]; rounds: number } {
  let cur = film, findings = auditExport(cur, size, engine, vo, source)
  const fixed: Finding[] = [], made: string[] = []
  // when Ava says each text's word, remembered across rounds: a hold finding does not carry it, and
  // without it the hold fix pulls a text back ahead of the word the timing fix just moved it onto
  const wordAt = new Map<string, number>()
  const remember = (qs: Finding[]) => qs.forEach(q => { if (q.wordAt != null) wordAt.set(`${q.si}|${q.text}`, q.wordAt) })
  let r = 1
  for (; r < rounds; r++) {
    remember(findings)
    const { film: next, changed } = autoFix(cur, findings.map(q => (q.wordAt == null && wordAt.has(`${q.si}|${q.text}`) ? { ...q, wordAt: wordAt.get(`${q.si}|${q.text}`) } : q)))
    if (!changed.length) break
    const after = auditExport(next, size, engine, vo, source)
    const sig = (q: Finding) => `${q.kind}|${q.scene}|${q.text}`
    const still = new Set(after.map(sig))
    // keep a fix only if it did not make things worse
    if (after.filter(q => q.severity !== 'nice to have').length > findings.filter(q => q.severity !== 'nice to have').length) break
    fixed.push(...findings.filter(q => !still.has(sig(q))).map(q => ({ ...q, fixedInRound: r + 1 })))
    cur = next; findings = after; made.push(...changed)
  }
  return { film: cur, findings, fixed, changed: made, rounds: r }
}

// ---------------------------------------------------------------- loudness

/** ITU-R BS.1770-4 integrated loudness (LUFS) of a stereo mix at 48 kHz. */
export function loudness(left: Float32Array, right: Float32Array, sr = 48_000): number {
  // K-weighting at 48 kHz: the high-shelf pre-filter, then the RLB high-pass
  const kw = (x: Float32Array) => {
    const y = new Float32Array(x.length)
    const stage = (inp: Float32Array, out: Float32Array, b: number[], a: number[]) => {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0
      for (let i = 0; i < inp.length; i++) {
        const v = b[0] * inp[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
        x2 = x1; x1 = inp[i]; y2 = y1; y1 = v; out[i] = v
      }
    }
    const mid = new Float32Array(x.length)
    stage(x, mid, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585])
    stage(mid, y, [1, -2, 1], [1, -1.99004745483398, 0.99007225036621])
    return y
  }
  const L = kw(left), R = kw(right)
  const block = Math.round(0.4 * sr), hop = Math.round(0.1 * sr)
  const z: number[] = []
  for (let s = 0; s + block <= L.length; s += hop) {
    let acc = 0
    for (let i = s; i < s + block; i++) acc += L[i] * L[i] + R[i] * R[i]
    z.push(acc / block)
  }
  const lk = (p: number) => -0.691 + 10 * Math.log10(p)
  const abs = z.filter(p => p > 0 && lk(p) > -70)
  if (!abs.length) return -Infinity
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10
  const gated = abs.filter(p => lk(p) > rel)
  return lk(gated.reduce((a, b) => a + b, 0) / gated.length)
}

/** The mix at −14 LUFS with its peaks under −2 dBFS (≈ −1 dBTP after AAC), as new arrays. */
export function normaliseMix(mix: { left: Float32Array; right: Float32Array }, target = -14, ceiling = -2) {
  const before = loudness(mix.left, mix.right)
  let peak = 0
  for (const ch of [mix.left, mix.right]) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]))
  if (!Number.isFinite(before) || !peak) return { ...mix, before, after: before, gainDb: 0 }
  const want = Math.pow(10, (target - before) / 20), cap = Math.pow(10, ceiling / 20) / peak
  const g = Math.min(want, cap)
  const left = mix.left.map(v => v * g), right = mix.right.map(v => v * g)
  return { left, right, before, after: before + 20 * Math.log10(g), gainDb: 20 * Math.log10(g) }
}

// ------------------------------------------------------------------ policy
//
// Rif's rules (22 Oct 2026): the team never sees the check. Rif is emailed only
// when something is still wrong after the automatic fixes; wording is raised
// only when it is a wrong FACT or a visible mistake, never taste; and what the
// Studio cannot fix itself — an engine bug — goes to Claude's inbox on its own.

/** Still wrong after the loop: worth an email. Nice-to-haves never are. */
export const stillWrong = (qs: Finding[]) => qs.filter(q => q.severity !== 'nice to have')

const ENGINE = new Set(['off-frame', 'unsafe', 'overlap', 'contrast', 'graphic', 'tiny', 'cut-off', 'visual'])
/** Problems in how the engine draws (not in the words, not timing the script can't fit): for Claude to fix in code. */
export const engineBugs = (qs: Finding[]) => stillWrong(qs).filter(q => q.fix === 'auto' && ENGINE.has(q.kind))

// ----------------------------------------------------------------- verdict

export function verdict(findings: Finding[]): 'Blocked' | 'Should fix' | 'Pass' {
  if (findings.some(q => q.severity === 'blocker')) return 'Blocked'
  if (findings.some(q => q.severity === 'should fix')) return 'Should fix'
  return 'Pass'
}
