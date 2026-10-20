import type { Film } from './mw-brandfilm'

// 👉 The brand video's soundtrack: a 120 BPM bed, Ava on top, the music
//    pulled down while she speaks, and sound design on every cut.
//
// A port of the skill's score.py, so a video made here and one made by the
// skill sound the same. Differences are only mechanical: scipy's Butterworth
// filters became RBJ biquads, and the VO arrives as decoded Float32 rather
// than wav files.
//
// Pure function of the film and the VO samples — no AudioContext, no clock —
// so the encoder gets the same audio on every run, exactly like the frames.

export const SR = 48_000

type Buf = Float32Array

// ---------------------------------------------------------------- dsp bits

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
}

/** RBJ biquad, applied in place over a buffer. */
function biquad(x: Buf, kind: 'lp' | 'hp' | 'bp', f: number, q = 0.707): Buf {
  const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q)
  let b0, b1, b2
  if (kind === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2 }
  else if (kind === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2 }
  else { b0 = al; b1 = 0; b2 = -al }
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]
    const y = (b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1; x1 = xi; y2 = y1; y1 = y; x[i] = y
  }
  return x
}
const band = (x: Buf, lo: number, hi: number) => biquad(x, 'bp', Math.sqrt(lo * hi), Math.sqrt(lo * hi) / (hi - lo))

function env(n: number, a = 0.002, d = 0.2): Buf {
  const e = new Float32Array(n)
  for (let i = 0; i < n; i++) { const t = i / SR; e[i] = Math.min(t / a, 1) * Math.exp(-t / d) }
  return e
}
const mul = (a: Buf, b: Buf) => { for (let i = 0; i < a.length; i++) a[i] *= b[i]; return a }
const noise = (n: number, r: () => number) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = r(); return o }
const note = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

function saw(f: number, n: number, det = 0.005): Buf {
  const o = new Float32Array(n)
  for (const d of [-det, 0, det]) for (let i = 0; i < n; i++) o[i] += (2 * ((i / SR * f * (1 + d)) % 1) - 1) / 3
  return o
}

// ---------------------------------------------------------------- voices

function kick(): Buf {
  const n = Math.floor(0.4 * SR), o = new Float32Array(n), e = env(n, 0.001, 0.15)
  let ph = 0
  for (let i = 0; i < n; i++) { ph += 2 * Math.PI * (48 + 100 * Math.exp(-i / SR / 0.03)) / SR; o[i] = Math.sin(ph) * e[i] }
  return o
}
function clap(r: () => number): Buf {
  const n = Math.floor(0.25 * SR), s = band(noise(n, r), 1000, 3000), e = new Float32Array(n)
  for (const [o, d] of [[0, 0.012], [0.01, 0.012], [0.02, 0.1]]) {
    const k = Math.floor(o * SR), ee = env(n - k, 0.0005, d)
    for (let i = 0; i < ee.length; i++) e[k + i] += ee[i]
  }
  return mul(s, e)
}
const hat = (r: () => number, d = 0.018) => { const n = Math.floor(0.08 * SR); return mul(biquad(noise(n, r), 'hp', 8000), env(n, 0.0005, d)) }
function pad(ms: number[], n: number, cut: number): Buf {
  const o = new Float32Array(n)
  for (const m of ms) { const s = saw(note(m), n); for (let i = 0; i < n; i++) o[i] += s[i] / ms.length }
  biquad(o, 'lp', cut); biquad(o, 'lp', cut)
  const f = 0.3 * SR
  for (let i = 0; i < n; i++) o[i] *= Math.min(i / f, 1) * Math.min((n - i) / f, 1)
  return o
}
function bass(m: number, n: number): Buf {
  const o = saw(note(m), n, 0), sub = note(m - 12)
  for (let i = 0; i < n; i++) o[i] = o[i] * 0.6 + Math.sin(2 * Math.PI * sub * i / SR) * 0.7
  biquad(o, 'lp', 300); biquad(o, 'lp', 300)
  return mul(o, env(n, 0.003, 0.2))
}
function pluck(m: number, n = Math.floor(0.25 * SR)): Buf {
  const o = new Float32Array(n), f = note(m), e = env(n, 0.001, 0.09)
  for (let i = 0; i < n; i++) o[i] = (Math.sin(2 * Math.PI * f * i / SR) + 0.3 * Math.sin(4 * Math.PI * f * i / SR)) * e[i]
  return o
}
/** Noise swept through a moving band — a swell into a cut, or a tail out of one. */
function whoosh(r: () => number, len = 0.4, rising = true): Buf {
  const n = Math.floor(len * SR), src = noise(n, r), out = new Float32Array(n), blk = 512
  for (let i = 0; i < n; i += blk) {
    const p = i / n, c = 300 + 5000 * Math.pow(rising ? p : 1 - p, 2)
    const seg = band(src.slice(i, Math.min(n, i + blk + 256)), c * 0.6, Math.min(c * 1.7, 18_000))
    out.set(seg.subarray(0, Math.min(blk, n - i)), i)
  }
  for (let i = 0; i < n; i++) { const p = i / n; out[i] *= (rising ? p * p : Math.pow(1 - p, 1.5)) * 1.5 }
  return out
}
function impact(r: () => number): Buf {
  const n = SR, o = new Float32Array(n), e = env(n, 0.001, 0.4), cr = biquad(noise(n, r), 'lp', 4000), ce = env(n, 0.0005, 0.04)
  for (let i = 0; i < n; i++) { const t = i / SR; o[i] = Math.sin(2 * Math.PI * (40 + 55 * Math.exp(-t / 0.05)) * t) * e[i] + cr[i] * ce[i] * 0.3 }
  return o
}
const tick = (r: () => number) => { const n = Math.floor(0.03 * SR); return mul(band(noise(n, r), 2500, 6500), env(n, 0.0003, 0.004)) }
function riser(r: () => number, len: number): Buf {
  const n = Math.floor(len * SR), o = new Float32Array(n), hs = biquad(noise(n, r), 'hp', 3000)
  let ph = 0
  for (let i = 0; i < n; i++) { const t = i / SR; ph += 2 * Math.PI * 220 * Math.pow(6, t / len) / SR; o[i] = (Math.sin(ph) * 0.2 + hs[i] * 0.35) * Math.pow(t / len, 2.5) }
  return o
}

// ---------------------------------------------------------------- the mix

/**
 * Build the finished stereo mix.
 * `vo[i]` is line i decoded to mono at SR; it is placed at `film.starts[i]`.
 */
export function buildMix(film: Film, vo: Float32Array[]): { left: Float32Array; right: Float32Array } {
  const N = Math.ceil(film.dur * SR), BEAT = 60 / film.bpm, bar = 4 * BEAT
  const L = new Float32Array(N), R = new Float32Array(N)
  const mL = new Float32Array(N), mR = new Float32Array(N)
  const r = rng(3)
  const add = (sig: Buf, t: number, g = 1, pan = 0, toMusic = false) => {
    const i0 = Math.floor(t * SR), [l, rr] = toMusic ? [mL, mR] : [L, R]
    const gl = g * (1 - Math.max(pan, 0)), gr = g * (1 + Math.min(pan, 0))
    for (let k = Math.max(0, -i0); k < sig.length && i0 + k < N; k++) { l[i0 + k] += sig[k] * gl; rr[i0 + k] += sig[k] * gr }
  }

  // The bed: A minor, Am F C G, one chord a bar. Drums stop at the end card.
  const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], roots = [45, 41, 48, 43]
  for (let b = 0; b * bar < film.dur - 0.5; b++) {
    const t0 = b * bar, ch = prog[b % 4]
    add(pad([...ch, ch[0] + 12], Math.floor(bar * SR), 1500), t0, 0.2, 0, true)
    for (let k = 0; k < 8; k++) {
      if (t0 + k * BEAT / 2 < BEAT * 2) continue
      add(bass(roots[b % 4] + (k === 3 || k === 7 ? 12 : 0), Math.floor(BEAT / 2 * SR)), t0 + k * BEAT / 2, 0.3, 0, true)
    }
  }
  const endAt = film.scenes[film.scenes.length - 1].a
  for (let k = 0; k * BEAT < endAt; k++) {
    const t = k * BEAT
    add(kick(), t, t >= BEAT * 2 ? 0.8 : 0.5, 0, true)
    if (k % 2) add(clap(r), t, 0.3, 0.1, true)
    add(hat(r), t + BEAT / 2, 0.18, 0.3, true)
    if (k % 4 === 3) add(hat(r, 0.08), t + BEAT / 2, 0.1, -0.3, true)
  }
  const arp = [0, 7, 12, 7, 3, 7, 12, 15]
  for (let k = 0; k * BEAT / 4 < film.dur; k++) {
    const t = k * BEAT / 4
    if (t > film.dur * 0.35 && t < film.dur * 0.62) add(pluck(prog[Math.floor(t / bar) % 4][0] + 12 + arp[k % 8]), t, 0.06, k % 2 ? 0.3 : -0.3, true)
  }

  // Ava, and the music ducked under her by her own loudness.
  const V = new Float32Array(N)
  vo.forEach((line, i) => { const i0 = Math.floor((film.starts[i] ?? 0) * SR); for (let k = 0; k < line.length && i0 + k < N; k++) V[i0 + k] += line[k] })
  const envV = new Float32Array(N)
  for (let i = 0; i < N; i++) envV[i] = Math.abs(V[i])
  biquad(envV, 'lp', 6); biquad(envV, 'lp', 6)
  let peak = 1e-9; for (let i = 0; i < N; i++) peak = Math.max(peak, envV[i])
  const duck = new Float32Array(N)
  for (let i = 0; i < N; i++) duck[i] = 1 - 0.55 * Math.min(1, envV[i] / peak * 3)
  biquad(duck, 'lp', 4); biquad(duck, 'lp', 4)
  for (let i = 0; i < N; i++) { L[i] += mL[i] * duck[i]; R[i] += mR[i] * duck[i] }

  // Sound design, from the same scene list that drives the picture.
  film.scenes.forEach((sc: any, i: number) => {
    const a = sc.a
    if (i) add(whoosh(r, 0.35), a - 0.35, 0.3, r() * 0.4)
    if (sc.tr === 'zig') { add(whoosh(r, 0.5, false), a, 0.25, 0.3); add(impact(r), a, 0.35) }
    if (sc.tr === 'chev' || sc.tr === 'slide') { add(whoosh(r, 0.25), a - 0.25, 0.3, -0.3); add(impact(r), a, 0.3) }
    if (sc.tr === 'iris') { add(impact(r), a, 0.32); add(whoosh(r, 0.45, false), a, 0.22) }
    if (sc.tr === 'bars') { add(whoosh(r, 0.3), a - 0.3, 0.28); add(impact(r), a, 0.32); add(whoosh(r, 0.3, false), a, 0.2, 0.3) }
    if (sc.kind === 'burst') {
      for (const w of sc.words) { add(impact(r), w.t, 0.45); add(kick(), w.t, 0.7) }
      add(riser(r, 1.2), a - 1.2, 0.25)
    }
    if (sc.art === 'board') for (let k = 0; k < 40; k++) add(tick(r), a + 0.1 + k * 0.016, 0.25, r() * 0.6)
    if (sc.art === 'number') for (let k = 0; k < 30; k++) add(tick(r), (sc.artAt ?? a) + 0.1 + Math.pow(k / 30, 0.7), 0.3)
    for (const it of sc.text ?? []) {
      if (it.st === 'h' || it.st === 'hx') add(whoosh(r, 0.18), it.t - 0.18, 0.12, r() * 0.3)
      if (it.strike != null) add(whoosh(r, 0.25, false), it.strike, 0.3, 0.4)
    }
    if (sc.kind === 'end') {
      const n = Math.floor(2.6 * SR), s = pad([57, 64, 69, 72, 76], n, 3000)
      for (let k = 0; k < n; k++) s[k] *= Math.exp(-k / SR / 0.9)
      add(s, a, 0.7); add(pluck(81), a, 0.18); add(pluck(88), a + BEAT, 0.1)
    }
  })

  for (let i = 0; i < N; i++) { L[i] += V[i]; R[i] += V[i] }

  // A little room, a soft limiter, a fade, and normalise to -1 dB.
  const room = (x: Buf) => {
    const y = Float32Array.from(x)
    for (const [d, g] of [[0.029, 0.25], [0.051, 0.2], [0.083, 0.16], [0.131, 0.12]]) {
      const k = Math.floor(d * SR); for (let i = k; i < N; i++) y[i] += x[i - k] * g
    }
    biquad(y, 'lp', 7000)
    for (let i = 0; i < N; i++) x[i] = 0.85 * x[i] + 0.15 * y[i]
  }
  room(L); room(R)
  const fade = Math.floor((film.dur - 0.6) * SR), t13 = Math.tanh(1.2)
  let pk = 1e-9
  for (let i = 0; i < N; i++) {
    const f = i > fade ? 1 - (i - fade) / (N - fade) : 1
    L[i] = Math.tanh(L[i] * 1.2) / t13 * f; R[i] = Math.tanh(R[i] * 1.2) / t13 * f
    pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]))
  }
  const g = 0.89 / pk
  for (let i = 0; i < N; i++) { L[i] *= g; R[i] *= g }
  return { left: L, right: R }
}
