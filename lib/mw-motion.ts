// 👉 A small motion engine: easing, timelines and the primitives a minute of
//    motion graphics actually needs.
//
// The Studio's animation so far does exactly one thing — text fades up and
// settles — which is right for a social post and nowhere near enough for a
// showreel. This is the layer underneath a longer piece: curves worth
// looking at, scenes that can overlap, and the handful of drawing moves
// that carry motion design (something counting up, a line drawing itself,
// a shape wiping in, type arriving a character at a time).
//
// It is deliberately isomorphic, like the rest of the drawing code: no DOM
// beyond a 2D context, so node can render contact sheets of any frame and
// the browser can encode the same frames to MP4 without a second renderer.
//
// NOTHING HERE READS THE CLOCK. Everything is a pure function of a time in
// seconds. That is what makes a 1,800-frame render deterministic, and it is
// the lesson from the video that came back at 19.6fps: if the picture
// depends on when it was drawn rather than on which frame it is, it will
// eventually be drawn late and nobody will know why.

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export type Ease = (t: number) => number

/**
 * The curves, and what each is for.
 *
 * A showreel that uses one easing everywhere reads as a template. These are
 * chosen so that each has a job: things ARRIVE with an out-curve, LEAVE
 * with an in-curve, and move between two held states with an in-out.
 */
export const ease = {
  linear: (t: number) => t,

  /** Arrivals. Fast then settling — the default for anything entering. */
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  /** A harder stop, for something landing with weight. */
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),

  /** Exits. Slow then away. */
  inCubic: (t: number) => t * t * t,
  inQuad: (t: number) => t * t,

  /** Moves between two resting states. The safest choice for a camera. */
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  smooth: (t: number) => t * t * (3 - 2 * t),

  /** A slight overshoot. Use sparingly — on everything it reads as cheap. */
  outBack: (t: number) => {
    const c = 1.70158
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
  },

  /**
   * A counter settling on its final value.
   *
   * Not outExpo: a number that stops dead looks switched off. This keeps a
   * long, slowing tail so the last digits tick over visibly, which is the
   * whole appeal of a counter.
   */
  count: (t: number) => 1 - Math.pow(1 - t, 5),
} as const

/**
 * Local progress of something that starts at `start` and lasts `dur`.
 *
 * Returns 0 before it begins and 1 after it ends, so a caller can use it
 * without guarding — the commonest source of one-frame flickers is a
 * progress value that goes negative or past one for a single frame.
 */
export function at(time: number, start: number, dur: number, curve: Ease = ease.outCubic): number {
  if (dur <= 0) return time >= start ? 1 : 0
  return curve(clamp01((time - start) / dur))
}

/** Progress that runs up and back down again, for a pulse or a breath. */
export function pingPong(time: number, start: number, dur: number, curve: Ease = ease.smooth): number {
  const k = clamp01((time - start) / dur)
  return curve(k < 0.5 ? k * 2 : (1 - k) * 2)
}

/**
 * A value that is held, then moves, then is held again.
 *
 * Most motion is this shape and writing it out by hand every time is where
 * off-by-one timing errors come from.
 */
export function tween(
  time: number, start: number, dur: number, from: number, to: number, curve: Ease = ease.inOutCubic,
): number {
  return lerp(from, to, at(time, start, dur, curve))
}

// ----------------------------------------------------------------- scenes

export type Stage = {
  w: number
  h: number
  /** Seconds since the whole piece began. */
  time: number
}

export type Scene = {
  name: string
  start: number
  dur: number
  /** `local` is seconds since this scene began. */
  draw: (ctx: CanvasRenderingContext2D, local: number, stage: Stage) => void
  /**
   * Seconds this scene keeps drawing after the next one starts, so they can
   * overlap. Without this every cut is hard, and a minute of hard cuts is
   * a slideshow.
   */
  tail?: number
}

/** The scenes alive at `time`, in draw order. */
export function activeScenes(scenes: Scene[], time: number): Scene[] {
  return scenes.filter(s => time >= s.start && time < s.start + s.dur + (s.tail ?? 0))
}

/** Total running time, so the encoder knows how many frames to ask for. */
export function duration(scenes: Scene[]): number {
  return scenes.reduce((n, s) => Math.max(n, s.start + s.dur), 0)
}

// ------------------------------------------------------------- primitives

/**
 * A number counting up to its value.
 *
 * Takes a formatter rather than a suffix, because the interesting cases are
 * "RM 1,240" and "2.4×" and "87%", not "1240".
 */
export function counter(
  target: number, k: number, format: (n: number) => string = n => Math.round(n).toLocaleString(),
): string {
  return format(target * ease.count(clamp01(k)))
}

/**
 * Draw a polyline as if it were being drawn, left to right.
 *
 * Uses the dash offset rather than slicing points, so a partially drawn
 * line keeps its joins and caps and does not shimmer as segments appear.
 */
export function drawPath(
  ctx: CanvasRenderingContext2D, pts: [number, number][], k: number,
) {
  if (pts.length < 2) return
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  }
  ctx.save()
  ctx.setLineDash([len, len])
  ctx.lineDashOffset = len * (1 - clamp01(k))
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.stroke()
  ctx.restore()
}

export type WipeFrom = 'left' | 'right' | 'up' | 'down'

/** Run `draw` behind a reveal that slides in from one edge. */
export function wipe(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, k: number, from: WipeFrom,
  draw: () => void,
) {
  const p = clamp01(k)
  if (p <= 0) return
  ctx.save()
  ctx.beginPath()
  if (from === 'left') ctx.rect(x, y, w * p, h)
  else if (from === 'right') ctx.rect(x + w * (1 - p), y, w * p, h)
  else if (from === 'up') ctx.rect(x, y, w, h * p)
  else ctx.rect(x, y + h * (1 - p), w, h * p)
  ctx.clip()
  draw()
  ctx.restore()
}

/**
 * How much of a string to show, for type arriving a character at a time.
 *
 * Breaks on whole words past a certain length, because character-by-
 * character on a long line reads as a terminal, not as design.
 */
export function typeOn(text: string, k: number): string {
  const p = clamp01(k)
  if (text.length <= 24) return text.slice(0, Math.round(text.length * p))
  const words = text.split(' ')
  return words.slice(0, Math.round(words.length * p)).join(' ')
}

/**
 * Stagger: the local progress of item `i` in a group that arrives in order.
 *
 * The single most useful function here. A group of things that all move at
 * once reads as one thing moving; the same group offset by a tenth of a
 * second reads as designed.
 */
export function stagger(
  time: number, start: number, dur: number, i: number, gap = 0.08, curve: Ease = ease.outCubic,
): number {
  return at(time, start + i * gap, dur, curve)
}

/** Shorthand for drawing something with a temporary alpha and offset. */
export function layer(
  ctx: CanvasRenderingContext2D, alpha: number, dx: number, dy: number, draw: () => void,
) {
  if (alpha <= 0.001) return
  ctx.save()
  ctx.globalAlpha *= clamp01(alpha)
  ctx.translate(dx, dy)
  draw()
  ctx.restore()
}

/** Shorthand for a scaled draw about a point — for a logo landing, say. */
export function scaleAbout(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, draw: () => void,
) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.translate(-cx, -cy)
  draw()
  ctx.restore()
}
