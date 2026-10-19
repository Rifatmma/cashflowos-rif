import {
  type Surface, type Template, type SlideKind,
  DEFAULT_TEMPLATE, wantsPhoto,
} from './mw-studio-templates'

// 👉 The Moving Walls post design, as code.
//
// Isomorphic on purpose: no node imports, no React, nothing but a 2D context.
// The browser draws the preview with it, the download draws the full-size PNG
// with it, the recorder draws every video frame with it, and a node script
// renders contact sheets with it. One draw path, so a video can never
// disagree with the still it came from.
//
// WHY CANVAS AND NOT HTML-TO-IMAGE. The app runs on Vercel, which has no
// Chrome, so a server-side screenshot is not available. In the browser the
// alternatives were an SVG foreignObject (fonts and line breaking differ per
// browser; Safari drops it) or a dom-to-image dependency (same problems plus
// a dependency). Drawing means wrapping and spacing are ours and the output
// is identical everywhere, at the cost of writing the layout by hand.
//
// COLOURS come from the Visual Identity Guidelines, p11-13. They are not
// approximations and must not be nudged to taste. WHICH surface a slide gets
// is the template's decision — see mw-studio-templates.ts.

export {
  TEMPLATES, DEFAULT_TEMPLATE, templateById, wantsPhoto,
  usesPhotoAnywhere, photoTemplatesFor,
} from './mw-studio-templates'
export type { Template, SlideKind, Surface } from './mw-studio-templates'

export const INK = {
  navy: '#1B1E2B',
  blue: '#2554A2',
  sky: '#66C9F3',
  ice: '#BFE7FB',
  sun1: '#FEDA24',
  sun2: '#F59222',
  paper: '#FFFFFF',
  body: '#3B4A63',
  faint: '#7A8AA3',
  onDark: '#E8F4FD',
  faintOnDark: '#BFD4EE',
} as const

/** Poppins throughout, per the guide. Weight is part of the token. */
export const FONT = 'Poppins'

export type Format = 'carousel' | 'single'

/** 4:5 for the carousel, 1:1 for the standalone. Both are 1080 wide. */
export const SIZE: Record<Format, { w: number; h: number }> = {
  carousel: { w: 1080, h: 1350 },
  single: { w: 1080, h: 1080 },
}

export type Slide = {
  kind: SlideKind
  /** Small uppercase line above the headline. Kept to ~22 characters. */
  kicker: string
  headline: string
  /** `stat` only: the figure that carries the slide, e.g. "34%". */
  figure?: string
  /** Supporting sentence under the headline. */
  body?: string
  /** `cover` only: the pill. */
  cta?: string
  /** Where the claim came from. Every slide carries one. */
  source?: string
}

export type Deck = {
  topic: string
  format: Format
  /** Which of the five looks. Stored with the deck so it survives an edit. */
  template: string
  slides: Slide[]
}

// ----------------------------------------------------------------- geometry

const PAD = 84

/** The top ~22% of a 4:5 is covered by the profile row in-feed. */
const SAFE_TOP = 0.22

// ------------------------------------------------------------- animation
//
//   "The animation will only animate the entry and exit of the text only,
//    most of the element will still be static image."   (owner, 19 Oct 2026)
//
// Taken literally. The photo, the gradient field, the zigzag, the logo and
// the source line never move. Only the typographic blocks enter and leave,
// in reading order, because a slide is read top to bottom and animating
// everything at once just makes it flash.
//
// The chevron travels with its kicker. It is not text, but it is the
// kicker's own furniture and leaving it hanging while its label flies in
// looks like a bug. Nothing else moves. mw-studio-anim.test.mts pins all of
// this mechanically, because a logo drifting two pixels over four seconds is
// invisible in review and obvious once it is posted.

export type Anim = {
  /** Seconds since this slide appeared. */
  at: number
  /** How long this slide is on screen, start to finish. */
  total: number
}

export const TIMING = {
  in: 0.7,
  out: 0.45,
  stagger: 0.1,
  rise: 26,
  fall: 18,
} as const

/** Default seconds per slide: in, a readable hold, out. */
export const SLIDE_SECONDS = 4

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
const easeIn = (x: number) => x * x
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function blockPhase(anim: Anim | undefined, i: number): { alpha: number; dy: number } {
  if (!anim) return { alpha: 1, dy: 0 }
  const inStart = i * TIMING.stagger
  const outStart = Math.max(inStart + TIMING.in, anim.total - TIMING.out - i * 0.06)

  if (anim.at < inStart) return { alpha: 0, dy: TIMING.rise }
  if (anim.at < inStart + TIMING.in) {
    const k = easeOut(clamp01((anim.at - inStart) / TIMING.in))
    return { alpha: k, dy: TIMING.rise * (1 - k) }
  }
  if (anim.at < outStart) return { alpha: 1, dy: 0 }
  const k = easeIn(clamp01((anim.at - outStart) / TIMING.out))
  return { alpha: 1 - k, dy: -TIMING.fall * k }
}

/**
 * Draw one text block under its own entrance/exit transform.
 *
 * Skips the draw entirely when invisible — not an optimisation, but so a
 * block that has not arrived cannot leave a 0-alpha artefact on a gradient.
 */
function block(
  ctx: CanvasRenderingContext2D, anim: Anim | undefined, i: number, draw: () => void,
) {
  const { alpha, dy } = blockPhase(anim, i)
  if (alpha <= 0.001) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(0, dy)
  draw()
  ctx.restore()
}

// ------------------------------------------------------------------- pieces

function grad(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number, from: string, to: string,
) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, from)
  g.addColorStop(1, to)
  return g
}

/**
 * Word wrap against real measured text.
 *
 * A character-count estimate was the obvious shortcut and it is wrong for
 * Poppins, where "Illinois" and "Manawwar" differ by a third at the same
 * length. Measuring is cheap and it is the difference between a headline
 * that fills the line and one that breaks early.
 */
export function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []
  // An explicit newline is honoured — it is how a writer forces a break that
  // reads better than the measured one.
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && ctx.measureText(next).width > max) {
        out.push(line)
        line = word
      } else {
        line = next
      }
    }
    if (line) out.push(line)
  }
  return out
}

function lines(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, max: number, lead: number,
): number {
  const size = sizeOf(ctx.font)
  for (const l of wrap(ctx, text, max)) {
    ctx.fillText(l, x, y)
    y += size * lead
  }
  return y
}

function sizeOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font)
  return m ? Number(m[1]) : 16
}

/**
 * Letter-spaced text, drawn a glyph at a time.
 *
 * `ctx.letterSpacing` exists but only in recent Chrome and Safari 17+, and a
 * kicker that silently loses its tracking in one browser is the kind of
 * fault nobody reports and everybody sees.
 */
function tracked(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, space: number,
): number {
  for (const ch of text) {
    ctx.fillText(ch, x, y)
    x += ctx.measureText(ch).width + space
  }
  return x
}

function trackedWidth(ctx: CanvasRenderingContext2D, text: string, space: number): number {
  let w = 0
  for (const ch of text) w += ctx.measureText(ch).width + space
  return w
}

/** The yellow triple chevron that precedes every heading in the guide. */
function chevrons(ctx: CanvasRenderingContext2D, x: number, y: number, h = 22) {
  const w = h * 0.68
  const cols = [INK.sun1, '#FFC83D', INK.sun2]
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = cols[i]
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w, y + h / 2)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    ctx.fill()
    x += w + 8
  }
}

/**
 * The MW zigzag, used as a divider.
 *
 * The first attempt ran this across the full frame as a background texture
 * and it fought the headline badly. In the guide it separates things; here
 * it only ever sits at an edge, and never behind type.
 */
function zigzag(
  ctx: CanvasRenderingContext2D,
  y: number, w: number, colour: string, alpha: number, amp = 26, step = 46, width = 9,
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  let up = true
  ctx.moveTo(-step, y + amp)
  for (let x = -step; x <= w + step; x += step) {
    ctx.lineTo(x, up ? y - amp : y + amp)
    up = !up
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * The MW mark, drawn rather than loaded.
 *
 * The real logo file should replace this once someone drops the SVG in — the
 * guide is specific about clear space (the middle triangle of the mark on
 * all four sides) and about the extended wording being Arial Rounded MT
 * Bold, neither of which a redrawn path can promise.
 */
function mark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, onDark: boolean) {
  const h = w * 0.34
  ctx.save()
  ctx.lineWidth = w * 0.073
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = onDark ? '#FFFFFF' : grad(ctx, x, y, x + w, y + h, INK.sky, INK.navy)
  ctx.beginPath()
  const n = 7
  for (let i = 0; i <= n; i++) {
    const px = x + (w / n) * i
    const py = i % 2 === 0 ? y + h : y
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.font = `500 17px ${FONT}`
  ctx.fillStyle = onDark ? '#CFE4F7' : '#9FB2CC'
  ctx.textAlign = 'left'
  const label = 'moving walls'
  tracked(ctx, label, x + w - trackedWidth(ctx, label, 7) + 7, y + h + 26, 7)
  ctx.restore()
}

function rule(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = grad(ctx, x, y, x + 132, y, INK.sun1, INK.sun2)
  roundRect(ctx, x, y, 132, 6, 3)
  ctx.fill()
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = `600 24px ${FONT}`
  const w = ctx.measureText(text).width + 44
  ctx.fillStyle = grad(ctx, x, y, x + w, y + 52, INK.sun1, INK.sun2)
  roundRect(ctx, x, y, w, 52, 26)
  ctx.fill()
  ctx.fillStyle = '#2A1D00'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 22, y + 27)
  ctx.textBaseline = 'top'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  // roundRect is missing in older Safari, and this is three lines.
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** object-fit: cover, by hand, clipped to a box. */
function drawPhoto(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource,
  x: number, y: number, w: number, h: number,
) {
  const iw = (img as HTMLImageElement).width || w
  const ih = (img as HTMLImageElement).height || h
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

// ------------------------------------------------------------------ surfaces

type Assets = { photo?: CanvasImageSource }

/** The colours type takes on a given surface. Decided once, never guessed. */
function inkFor(s: Surface) {
  if (s.kind === 'light') {
    // Navy on pale blue. The usual sky kicker would all but vanish here, and
    // the figure gradient has to run dark-to-mid rather than mid-to-light.
    return {
      kicker: '#1B3A6B', head: INK.navy, body: '#27405E',
      figFrom: INK.navy, figTo: INK.blue, faint: '#41618C', onDark: false,
    }
  }
  if (s.onDark) {
    return {
      kicker: INK.sky, head: '#FFFFFF', body: INK.onDark,
      figFrom: INK.ice, figTo: INK.sky, faint: INK.faintOnDark, onDark: true,
    }
  }
  return {
    kicker: INK.blue, head: INK.navy, body: INK.body,
    figFrom: INK.blue, figTo: INK.sky, faint: INK.faint, onDark: false,
  }
}

/**
 * Paint the background, and return the vertical band the text may use.
 *
 * Returning the text area is what lets Split work without a special case
 * everywhere downstream: it hands back the white panel below the
 * photograph, and the composition code never knows the difference.
 */
function paintSurface(
  ctx: CanvasRenderingContext2D, s: Surface, w: number, h: number, a: Assets,
): { top: number; bottom: number } {
  const full = { top: 0, bottom: h }

  if (s.kind === 'photo') {
    if (a.photo) {
      drawPhoto(ctx, a.photo, 0, 0, w, h)
      // Heavier at the foot, where the type sits. Without it a bright
      // pavement in the photograph eats a white headline.
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, 'rgba(27,30,43,.18)')
      g.addColorStop(0.44, 'rgba(27,30,43,.58)')
      g.addColorStop(1, 'rgba(27,30,43,.95)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    } else {
      // No picture chosen, or it failed to load. The brand gradient is the
      // honest fallback — a grey box would look broken.
      ctx.fillStyle = grad(ctx, 0, 0, w, h, INK.blue, INK.navy)
      ctx.fillRect(0, 0, w, h)
    }
    if (s.wave !== null) zigzag(ctx, h * s.wave, w, '#9FDBF7', 0.3)
    return full
  }

  if (s.kind === 'split') {
    const cut = Math.round(h * (s.photoShare ?? 0.46))
    ctx.fillStyle = INK.paper
    ctx.fillRect(0, 0, w, h)
    if (a.photo) drawPhoto(ctx, a.photo, 0, 0, w, cut)
    else {
      ctx.fillStyle = grad(ctx, 0, 0, w, cut, INK.blue, INK.navy)
      ctx.fillRect(0, 0, w, cut)
    }
    zigzag(ctx, cut, w, INK.ice, 1)
    zigzag(ctx, cut + 62, w, INK.sky, 1)
    // Text lives in the white panel, clear of the wave.
    return { top: cut + 120, bottom: h }
  }

  if (s.kind === 'field') {
    ctx.fillStyle = grad(ctx, 0, 0, w, h, INK.blue, INK.navy)
    ctx.fillRect(0, 0, w, h)
    if (s.wave !== null) {
      zigzag(ctx, h * s.wave, w, INK.sky, 0.32)
      zigzag(ctx, h * s.wave, w, INK.ice, 0.22, 26, 46, 4)
    }
    return full
  }

  if (s.kind === 'light') {
    ctx.fillStyle = grad(ctx, 0, 0, w, h, INK.ice, INK.sky)
    ctx.fillRect(0, 0, w, h)
    if (s.wave !== null) zigzag(ctx, h * s.wave, w, '#FFFFFF', 0.5)
    return full
  }

  // paper, optionally with a band of primary gradient across the top
  ctx.fillStyle = INK.paper
  ctx.fillRect(0, 0, w, h)
  if (s.band) {
    const b = Math.round(h * s.band)
    ctx.fillStyle = grad(ctx, 0, 0, w, b, INK.blue, INK.navy)
    ctx.fillRect(0, 0, w, b)
    zigzag(ctx, b, w, INK.ice, 1)
    zigzag(ctx, b + 72, w, INK.sky, 1)
  }
  return full
}

/** The attribution strip every slide carries. */
function footer(
  ctx: CanvasRenderingContext2D, w: number, h: number, source: string | undefined, onDark: boolean,
) {
  if (source) {
    ctx.font = `400 22px ${FONT}`
    ctx.fillStyle = onDark ? INK.faintOnDark : INK.faint
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(source, PAD, h - 92)
  }
  mark(ctx, w - PAD - 118, h - 118, 118, onDark)
}

// --------------------------------------------------------------- composition
//
// One engine instead of four hardcoded layouts. Each slide becomes a list of
// measured pieces; the pieces are stacked from an anchor and painted inside
// the animation wrapper. Four layouts times five templates would have been
// twenty functions, which is how a design system rots.

type Piece = { h: number; paint: (y: number) => void }

function piecesFor(
  ctx: CanvasRenderingContext2D, s: Slide, w: number, h: number, surface: Surface,
  /** Everything scales together when the block will not fit its area. */
  k = 1,
): { pieces: Piece[]; anchor: 'top' | 'bottom' | 'middle' } {
  const ink = inkFor(surface)
  const maxW = w - PAD * 2
  const square = h <= w                       // 1:1 needs tighter type
  const pieces: Piece[] = []
  const px = (n: number) => Math.round(n * k)

  const kickSize = px(26)
  pieces.push({
    h: px(96),
    paint: y => {
      chevrons(ctx, PAD, y, px(22))
      ctx.font = `600 ${kickSize}px ${FONT}`
      ctx.fillStyle = ink.kicker
      ctx.textBaseline = 'alphabetic'
      tracked(ctx, s.kicker.toUpperCase(), PAD, y + px(62), 3.6 * k)
      ctx.textBaseline = 'top'
    },
  })

  if (s.kind === 'point' || s.kind === 'closer') {
    pieces.push({ h: px(36), paint: y => rule(ctx, PAD, y) })
  }

  if (s.figure) {
    const size = px(square ? 190 : 240)
    pieces.push({
      h: size * 0.9 + px(28),
      paint: y => {
        ctx.font = `700 ${size}px ${FONT}`
        ctx.fillStyle = grad(ctx, PAD, y, PAD + 600, y + size, ink.figFrom, ink.figTo)
        ctx.fillText(s.figure!, PAD, y)
      },
    })
  }

  const headSize = px(
    s.kind === 'cover' ? (square ? 78 : 92)
      : s.kind === 'stat' ? (square ? 56 : 64)
      : square ? 72 : 80,
  )
  ctx.font = `700 ${headSize}px ${FONT}`
  const headLines = wrap(ctx, s.headline, maxW).length
  pieces.push({
    h: headLines * headSize * 1.06,
    paint: y => {
      ctx.font = `700 ${headSize}px ${FONT}`
      ctx.fillStyle = ink.head
      lines(ctx, s.headline, PAD, y, maxW, 1.06)
    },
  })

  if (s.body) {
    const bodySize = px(square ? 29 : 32)
    ctx.font = `400 ${bodySize}px ${FONT}`
    const bodyLines = wrap(ctx, s.body, maxW - 60).length
    pieces.push({
      h: px(24) + bodyLines * bodySize * 1.5,
      paint: y => {
        ctx.font = `400 ${bodySize}px ${FONT}`
        ctx.fillStyle = ink.body
        lines(ctx, s.body!, PAD, y + px(24), maxW - 60, 1.5)
      },
    })
  }

  if (s.cta) {
    pieces.push({ h: px(76), paint: y => pill(ctx, s.cta!, PAD, y + px(24)) })
  }

  // WHERE THE BLOCK SITS IS THE SURFACE'S DECISION, not the slide kind's.
  //
  // A photographic surface carries its scrim heaviest at the foot, because
  // that is where type was always going to sit. Anchoring a stat slide to
  // the TOP of a photograph puts the kicker and the figure over the lightest
  // part of the scrim — fine against a dark sky, unreadable against a bright
  // one, and which of those you get is whatever Pexels returned.
  const onPhoto = surface.kind === 'photo'
  const anchor: 'top' | 'bottom' | 'middle' =
    s.kind === 'cover' ? 'bottom'
      : onPhoto ? 'bottom'
      : s.kind === 'closer' ? 'middle'
      : 'top'
  return { pieces, anchor }
}

/** Paint one slide. `anim` omitted draws the still. */
export function drawSlide(
  ctx: CanvasRenderingContext2D,
  s: Slide,
  format: Format,
  assets: Assets = {},
  anim?: Anim,
  template: Template = DEFAULT_TEMPLATE,
) {
  const { w, h } = SIZE[format]
  const surface = template.surfaceFor(s.kind)
  // The template decides whether this slide is photographic. Handing the
  // picture to a slide that does not want one is how it came to be chosen
  // and then never drawn.
  const a = wantsPhoto(template, s.kind) ? assets : {}

  ctx.clearRect(0, 0, w, h)
  ctx.textAlign = 'left'
  ctx.globalAlpha = 1
  const area = paintSurface(ctx, surface, w, h, a)

  ctx.textBaseline = 'top'

  // FIT THE BLOCK TO ITS AREA.
  //
  // Split hands back only the white panel below the photograph, which on a
  // 4:5 is about 600px. A stat slide with a 240px figure, a two-line
  // headline and three lines of body wants closer to 600 before leading, so
  // the first version ran its description straight through the logo. Rather
  // than special-casing Split, anything that does not fit is re-measured at
  // a smaller size — which is what a designer would do.
  const floor = Math.min(area.bottom, h - 170)
  const top0 = Math.max(area.top, h * (surface.band ? surface.band + 0.09 : 0.07))
  const room = floor - top0

  let { pieces, anchor } = piecesFor(ctx, s, w, h, surface)
  let total = pieces.reduce((n, p) => n + p.h, 0)
  if (total > room && room > 0) {
    // Floor at 0.62: past that the type is too small to read in a feed, and
    // the honest answer is that the copy is too long — which `faults` says.
    const k = Math.max(0.62, room / total)
    ;({ pieces, anchor } = piecesFor(ctx, s, w, h, surface, k))
    total = pieces.reduce((n, p) => n + p.h, 0)
  }
  let y =
    anchor === 'bottom' ? Math.max(area.top, floor - total)
    : anchor === 'middle' ? Math.max(area.top + h * SAFE_TOP * 0.5, (area.top + floor - total) / 2)
    : top0

  pieces.forEach((p, i) => {
    const at = y
    block(ctx, anim, i, () => p.paint(at))
    y += p.h
  })

  footer(ctx, w, h, s.source, inkFor(surface).onDark)
}

// --------------------------------------------------------------- video script
//
// A fifteen-second film is not four-second slides played longer. The owner
// asked for the text to CHANGE every five seconds over a design that stays
// put — the same requirement as before, scaled up: the background is the
// static image, and successive blocks of words enter and leave on it.

export type Segment = {
  headline: string
  /** The small uppercase line. Called a subheadline on the screen. */
  sub?: string
  body?: string
}

export const SEGMENT_SECONDS = 5

/** The background a film sits on. Drawn once, reused for every frame. */
export function drawFilmSurface(
  ctx: CanvasRenderingContext2D, format: Format, template: Template,
  assets: Assets = {}, source?: string,
): Surface {
  const { w, h } = SIZE[format]
  const surface = template.surfaceFor('closer')
  const a = template.photo === 'none' ? {} : assets
  ctx.clearRect(0, 0, w, h)
  ctx.globalAlpha = 1
  paintSurface(ctx, surface, w, h, a)
  footer(ctx, w, h, source, inkFor(surface).onDark)
  return surface
}

/** Paint one five-second beat of a film over an already-drawn surface. */
export function drawSegmentText(
  ctx: CanvasRenderingContext2D,
  seg: Segment,
  format: Format,
  surface: Surface,
  anim?: Anim,
) {
  const { w, h } = SIZE[format]
  const ink = inkFor(surface)
  const maxW = w - PAD * 2
  const square = h <= w

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.globalAlpha = 1

  const pieces: Piece[] = []

  if (seg.sub) {
    pieces.push({
      h: 96,
      paint: y => {
        chevrons(ctx, PAD, y)
        ctx.font = `600 26px ${FONT}`
        ctx.fillStyle = ink.kicker
        ctx.textBaseline = 'alphabetic'
        tracked(ctx, seg.sub!.toUpperCase(), PAD, y + 62, 3.6)
        ctx.textBaseline = 'top'
      },
    })
  }

  const headSize = square ? 78 : 88
  ctx.font = `700 ${headSize}px ${FONT}`
  const n = wrap(ctx, seg.headline, maxW).length
  pieces.push({
    h: n * headSize * 1.06,
    paint: y => {
      ctx.font = `700 ${headSize}px ${FONT}`
      ctx.fillStyle = ink.head
      lines(ctx, seg.headline, PAD, y, maxW, 1.06)
    },
  })

  if (seg.body) {
    const bodySize = square ? 30 : 33
    ctx.font = `400 ${bodySize}px ${FONT}`
    const bn = wrap(ctx, seg.body, maxW - 60).length
    pieces.push({
      h: 26 + bn * bodySize * 1.5,
      paint: y => {
        ctx.font = `400 ${bodySize}px ${FONT}`
        ctx.fillStyle = ink.body
        lines(ctx, seg.body!, PAD, y + 26, maxW - 60, 1.5)
      },
    })
  }

  // Centred, because every beat carries a different amount of text and a
  // top-anchored block would jump up and down between them.
  const total = pieces.reduce((s, p) => s + p.h, 0)
  let y = Math.max(h * 0.2, (h - 170 - total) / 2)
  pieces.forEach((p, i) => {
    const at = y
    block(ctx, anim, i, () => p.paint(at))
    y += p.h
  })

  ctx.restore()
}

// --------------------------------------------------------------- copy limits

export const LIMITS: Record<SlideKind, { headline: number; body: number }> = {
  cover: { headline: 62, body: 0 },
  stat: { headline: 64, body: 170 },
  point: { headline: 58, body: 200 },
  closer: { headline: 62, body: 120 },
}

export const KICKER_MAX = 22

/** Everything wrong with a deck, in words a person can act on. */
export function faults(deck: Deck): string[] {
  const out: string[] = []
  deck.slides.forEach((s, i) => {
    const n = i + 1
    const lim = LIMITS[s.kind]
    if (s.kicker.length > KICKER_MAX)
      out.push(`Slide ${n}: the kicker is ${s.kicker.length} characters, over ${KICKER_MAX}.`)
    if (s.headline.length > lim.headline)
      out.push(`Slide ${n}: the headline is ${s.headline.length} characters, over ${lim.headline} — it will take an extra line.`)
    if (s.body && lim.body && s.body.length > lim.body)
      out.push(`Slide ${n}: the supporting text is ${s.body.length} characters, over ${lim.body}.`)
    if (s.kind === 'stat' && !s.figure)
      out.push(`Slide ${n} is a stat slide with no figure on it.`)
    // A statistic with no attribution is the one thing a measurement company
    // cannot post. This is a fault, not a nicety.
    if (!s.source && (s.kind === 'stat' || s.figure))
      out.push(`Slide ${n} carries a number with no source.`)
  })
  if (deck.format === 'single' && deck.slides.length !== 1)
    out.push(`A single image has ${deck.slides.length} slides.`)
  if (deck.format === 'carousel' && (deck.slides.length < 3 || deck.slides.length > 8))
    out.push(`A carousel of ${deck.slides.length} slides — Instagram allows up to 10, and under 3 is not a carousel.`)
  return out
}

/** Beat copy that will not fit. The same idea as `faults`, for a film. */
export function segmentFaults(segs: Segment[]): string[] {
  const out: string[] = []
  segs.forEach((s, i) => {
    const n = i + 1
    if (!s.headline.trim()) out.push(`Beat ${n} has no headline.`)
    if (s.headline.length > 70)
      out.push(`Beat ${n}: the headline is ${s.headline.length} characters, over 70 — it will crowd the frame.`)
    if (s.sub && s.sub.length > KICKER_MAX)
      out.push(`Beat ${n}: the subheadline is ${s.sub.length} characters, over ${KICKER_MAX}.`)
    if (s.body && s.body.length > 150)
      out.push(`Beat ${n}: the description is ${s.body.length} characters, over 150.`)
  })
  return out
}
