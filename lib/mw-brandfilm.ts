// 👉 Moving Walls → Studio → Brand video. The typed half.
//
// A brand video is three things that have to agree with each other to the
// frame: what Ava says, when she says each word, and what is on screen while
// she says it. They are built in that order and only joined at the end:
//
//   Plan   — written by Claude from the article: Ava's lines, plus a scene
//            for each line saying what to SHOW. Scenes point at words
//            ("land this headline on 'revenue'"), never at seconds, because
//            nobody knows the seconds until she has spoken.
//   Voice  — each line spoken separately, with Microsoft's word timings.
//   Film   — the plan resolved against the voice: every cue an absolute
//            time. This is what the engine draws.
//
// Pointing at words rather than indexes is deliberate. The speech service
// tokenises in its own way ("out-of-home" is one word, a comma is none), so
// an index written before synthesis is a guess; a word is not.

export type FilmFormat = '916' | '169' | '11' | '45'

export const FILM_FORMATS: Record<FilmFormat, { w: number; h: number; label: string; use: string }> = {
  '916': { w: 1080, h: 1920, label: '9:16', use: 'Reels, Shorts, TikTok, Stories' },
  '45': { w: 1080, h: 1350, label: '4:5', use: 'Instagram and LinkedIn feed' },
  '11': { w: 1080, h: 1080, label: '1:1', use: 'Square feed post' },
  '169': { w: 1920, h: 1080, label: '16:9', use: 'YouTube, website, presentations' },
}

export type Audience = 'agencies' | 'brands' | 'media-owners'
export type SubLang = 'none' | 'zh'

/** Backgrounds the engine knows. */
export const BACKGROUNDS = ['cover', 'navy', 'sky', 'white'] as const
type Bg = (typeof BACKGROUNDS)[number]

/** Illustrations the engine knows, and the event fields each one reads. */
export const ARTS = ['routes', 'network', 'formats', 'number', 'lines', 'reports', 'board', 'rail', 'crossing', 'skyline'] as const
type Art = (typeof ARTS)[number]

export type PlanText = {
  s: string
  /** lab = chevron label · h = headline · hx = hero word · s = italic sub · b = small print */
  st: 'lab' | 'h' | 'hx' | 's' | 'b'
  /** The word in this scene's line it lands on. Absent = as the scene opens. */
  on?: string
  /** Sunburst — at most one line per scene. */
  accent?: boolean
  /** Draw a strike-through when this word is spoken. */
  strikeOn?: string
}

export type PlanScene = {
  kind: 'cover' | 'panel' | 'logo' | 'burst' | 'end'
  /** Index into plan.lines. */
  line: number
  /** Start mid-line, on this word, instead of when the line starts. */
  from?: string
  bg?: Bg
  art?: Art
  /** Art parameters. Any `at`/`on` entries that are words are resolved to times. */
  ev?: Record<string, any>
  text?: PlanText[]
  /** burst only: one word per beat. */
  words?: { s: string; on: string; bg?: Bg }[]
}

export type Plan = {
  title: string
  lines: string[]
  /** Optional subtitles: per line, one or two chunks in the target language. */
  supers?: string[][]
  scenes: PlanScene[]
}

/** One spoken line as the voice step returns it. */
export type VoiceLine = {
  text: string
  /** Seconds of audio. */
  dur: number
  /** [word, start seconds from the line's start] */
  words: [string, number][]
}

/** What the engine draws: every cue resolved to absolute seconds. */
export type Film = {
  title: string
  dur: number
  bpm: number
  /** When each line starts. */
  starts: number[]
  supers?: { a: number; b: number; zh: string }[]
  scenes: any[]
}

const BEAT = 0.5   // 120 BPM: every line starts on the beat, so cuts land on the music

const norm = (w: string) => w.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * Seconds-into-the-line for a word, searching forward from `after`.
 *
 * Forward so that a scene saying "new" twice ("new media, new buying rules")
 * gets the second one for the second cue. A word that is not there falls
 * back proportionally through the line rather than to 0 — a headline a beat
 * early is a nuisance, one at the very start of the scene is visibly wrong.
 */
function wordTime(v: VoiceLine, word: string | undefined, after = -1): number {
  if (!word) return 0
  const want = norm(word)
  if (!want) return 0
  for (const [w, t] of v.words) if (t > after && (norm(w) === want || norm(w).startsWith(want))) return t
  for (const [w, t] of v.words) if (norm(w).includes(want)) return t
  const pos = v.text.toLowerCase().indexOf(word.toLowerCase())
  return pos > 0 ? (pos / Math.max(1, v.text.length)) * v.dur : 0
}

/** Where each line starts: on the beat, with room to breathe after the last. */
export function lineStarts(voice: VoiceLine[]): number[] {
  const out: number[] = []
  let t = BEAT
  for (let i = 0; i < voice.length; i++) {
    out.push(t)
    t = Math.ceil((t + voice[i].dur + 0.2) / BEAT) * BEAT
  }
  return out
}

/** Plan + voice → film. Pure; runs in the browser after Ava has spoken. */
export function resolveFilm(plan: Plan, voice: VoiceLine[]): Film {
  const starts = lineStarts(voice)
  const last = voice.length - 1
  const dur = Math.ceil((starts[last] + voice[last].dur + 1.2) / BEAT) * BEAT
  const at = (line: number, word?: string, after = -1) =>
    +(starts[line] + wordTime(voice[line], word, after)).toFixed(3)

  const scenes = plan.scenes.map((sc, i) => {
    const v = voice[sc.line]
    const a = i === 0 ? 0 : sc.from ? Math.max(starts[sc.line], at(sc.line, sc.from) - 0.1) : starts[sc.line]
    let cursor = sc.from ? wordTime(v, sc.from) - 0.01 : -1
    const text = (sc.text ?? []).map(t => {
      const time = t.on ? at(sc.line, t.on, cursor) : a + (t.st === 'lab' ? 0.08 : 0.15)
      if (t.on) cursor = time - starts[sc.line]
      return {
        t: time, s: t.s, st: t.st,
        ...(t.accent ? { color: '#FEDA24' } : {}),
        ...(t.strikeOn ? { strike: at(sc.line, t.strikeOn, cursor) } : {}),
        ...(t.st === 'b' ? { scale: 0.75 } : {}),
      }
    })
    const ev: Record<string, any> = { ...(sc.ev ?? {}) }
    let artAt = a
    // Word cues inside art become seconds after the art starts.
    const rel = (w: any, k: number) => (typeof w === 'string' ? Math.max(0, at(sc.line, w) - a) : typeof w === 'number' ? w : 0.3 + k * 0.25)
    if (Array.isArray(ev.at)) ev.at = ev.at.map(rel)
    if (sc.art === 'lines') ev.freshAt = rel(ev.freshOn ?? ev.freshAt, 0)
    if (sc.art === 'crossing' && ev.screensOn) ev.screens = rel(ev.screensOn, 0)
    if (sc.art === 'network') ev.centre = typeof ev.centre === 'number' ? ev.centre : 0
    // A number settles about 1.1s after it starts rolling, so start it so the
    // last digit lands as she says it.
    if (sc.art === 'number' && ev.on) artAt = Math.max(a, at(sc.line, ev.on) + 0.2 - 1.1)
    const words = sc.words?.map((w, k) => ({ t: at(sc.line, w.on), s: w.s, bg: w.bg ?? (k % 2 ? 'cover' : 'white'), ...(w.s.trim().includes(' ') ? { st: 'h' } : {}) }))
    return { ...sc, a, artAt, ev, text, ...(words ? { words } : {}) }
  })

  // Scenes tile the timeline; transitions alternate so consecutive cuts differ.
  scenes.forEach((sc: any, i) => {
    sc.b = i + 1 < scenes.length ? scenes[i + 1].a : dur
    if (i > 0 && sc.kind !== 'burst') sc.tr = i % 2 ? 'zig' : 'chev'
    if (sc.kind === 'burst') sc.bg = sc.bg ?? 'white'
  })

  let supers: Film['supers']
  if (plan.supers?.some(s => s?.length)) {
    supers = []
    plan.supers.forEach((chunks, i) => {
      if (!chunks?.length || i > last) return
      const a = starts[i], end = starts[i] + voice[i].dur + 0.2
      if (chunks.length === 1) supers!.push({ a, b: end, zh: chunks[0] })
      else {
        // Split where the first chunk's share of characters says the pause is.
        const share = chunks[0].length / (chunks[0].length + chunks[1].length)
        const mid = a + voice[i].dur * share
        supers!.push({ a, b: mid, zh: chunks[0] }, { a: mid, b: end, zh: chunks[1] })
      }
    })
  }

  return { title: plan.title, dur, bpm: 120, starts, scenes, ...(supers ? { supers } : {}) }
}

/**
 * Make a plan from the model safe to draw.
 *
 * The engine trusts its input completely — an unknown art name or a scene
 * pointing at line 9 of 7 would throw mid-render, 20 seconds into an encode.
 * So everything is checked here once, and anything unknown is dropped or
 * replaced with something that cannot fail, and said so.
 */
export function sanitizePlan(raw: any): { plan: Plan; notes: string[] } {
  const notes: string[] = []
  const lines: string[] = (Array.isArray(raw?.lines) ? raw.lines : []).map((l: any) => String(l ?? '').trim()).filter(Boolean).slice(0, 10)
  const KINDS = ['cover', 'panel', 'logo', 'burst', 'end']
  const str = (v: any, n = 60) => String(v ?? '').trim().slice(0, n)
  const bg = (v: any): Bg | undefined => (BACKGROUNDS as readonly string[]).includes(v) ? v : undefined

  const scenes: PlanScene[] = []
  for (const s of Array.isArray(raw?.scenes) ? raw.scenes : []) {
    const line = Number(s?.line)
    if (!Number.isInteger(line) || line < 0 || line >= lines.length) { notes.push('A scene pointed at a line that does not exist and was dropped.'); continue }
    let kind = KINDS.includes(s?.kind) ? s.kind : 'panel'
    let art: Art | undefined = (ARTS as readonly string[]).includes(s?.art) ? s.art : undefined
    if (s?.art && !art) notes.push(`Unknown illustration "${s.art}" was left out.`)
    const ev = s?.ev && typeof s.ev === 'object' ? s.ev : {}
    // Each illustration needs its own fields; without them it would draw nothing or throw.
    const need: Partial<Record<Art, () => boolean>> = {
      routes: () => Array.isArray(ev.origin) && Array.isArray(ev.dests) && ev.dests.length > 0,
      network: () => Array.isArray(ev.labels) && ev.labels.length >= 2,
      formats: () => Array.isArray(ev.items) && ev.items.length > 0,
      number: () => ev.value != null && /\d/.test(String(ev.value)),
      lines: () => Array.isArray(ev.items) && ev.items.length >= 2,
      reports: () => Array.isArray(ev.items) && ev.items.length > 0,
      board: () => Array.isArray(ev.rows) && ev.rows.length > 0,
      rail: () => Array.isArray(ev.stations) && ev.stations.length >= 2,
    }
    if (art && need[art] && !need[art]!()) { notes.push(`The ${art} illustration was missing its details and was left out.`); art = undefined }
    if (art === 'formats') ev.items = ev.items.slice(0, 4).map((it: any) => [['plane', 'train', 'bag', 'screen', 'road'].includes(it?.[0]) ? it[0] : 'screen', str(it?.[1], 16)])
    if (art === 'board') ev.rows = ev.rows.slice(0, 5).map((r: any) => str(r, 14).toUpperCase())
    if (art === 'number') ev.value = String(ev.value).replace(/[^\d.,%+]/g, '').slice(0, 6)

    const text = (Array.isArray(s?.text) ? s.text : []).slice(0, 5).map((t: any) => ({
      s: str(t?.s, 48), st: ['lab', 'h', 'hx', 's', 'b'].includes(t?.st) ? t.st : 'h',
      ...(t?.on ? { on: str(t.on, 30) } : {}), ...(t?.accent ? { accent: true } : {}),
      ...(t?.strikeOn ? { strikeOn: str(t.strikeOn, 30) } : {}),
    })).filter((t: PlanText) => t.s)
    const words = kind === 'burst'
      ? (Array.isArray(s?.words) ? s.words : []).slice(0, 8).map((w: any) => ({ s: str(w?.s, 18), on: str(w?.on, 30), ...(bg(w?.bg) ? { bg: bg(w.bg) } : {}) })).filter((w: any) => w.s && w.on)
      : undefined
    if (kind === 'burst' && !words?.length) kind = 'panel'

    scenes.push({
      kind, line, ...(s?.from ? { from: str(s.from, 30) } : {}),
      bg: bg(s?.bg) ?? (kind === 'panel' ? (scenes.length % 2 ? 'white' : 'navy') : undefined),
      ...(art ? { art, ev } : {}), text, ...(words ? { words } : {}),
    } as PlanScene)
  }

  // Scenes must be in spoken order or the timeline folds back on itself.
  scenes.sort((p, q) => p.line - q.line)
  // The film needs an opening and a close; make sure it has both.
  if (scenes.length && scenes[0].kind !== 'cover') scenes[0].kind = 'cover'
  if (scenes.length && scenes[scenes.length - 1].kind !== 'end') {
    const lastLine = lines.length - 1
    if (scenes[scenes.length - 1].line === lastLine) scenes[scenes.length - 1].kind = 'end'
    else scenes.push({ kind: 'end', line: lastLine, text: [{ s: 'No boundaries.', st: 's' }] })
  }
  // Textures on dark panels, as the finished films have.
  for (const s of scenes) if (s.kind === 'panel' && (s.bg === 'navy' || s.bg === 'white')) (s as any).tex = true

  const supers = Array.isArray(raw?.supers)
    ? raw.supers.slice(0, lines.length).map((c: any) => (Array.isArray(c) ? c : [c]).map((x: any) => str(x, 40)).filter(Boolean).slice(0, 2))
    : undefined
  return { plan: { title: str(raw?.title, 80) || 'Brand video', lines, scenes, ...(supers?.some((c: string[]) => c.length) ? { supers } : {}) }, notes }
}

/** Approximate length before Ava has spoken (2.6 words a second at +6%). */
export function estimateSeconds(lines: string[]): number {
  const words = lines.join(' ').split(/\s+/).filter(Boolean).length
  return Math.round(words / 2.6 + lines.length * 0.6 + 1.5)
}
