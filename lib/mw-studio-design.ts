import {
  type Surface, type Template, type SlideKind, type FormatFamily,
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
  TEMPLATES, CAROUSEL_TEMPLATES, SINGLE_TEMPLATES, DEFAULT_TEMPLATE,
  templatesFor, templateById, wantsPhoto, usesPhotoAnywhere, photoTemplatesFor,
} from './mw-studio-templates'
export type { Template, SlideKind, Surface, FormatFamily } from './mw-studio-templates'

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

// 4:5 for a carousel, 1:1 for a standalone image, 9:16 for a Reel. All
// 1080 wide. `reel` is a VIDEO size only — it is never an image format, and
// it borrows the single-image looks because a Reel is one design with the
// words changing on it.
export type Format = 'carousel' | 'single' | 'reel'

export const SIZE: Record<Format, { w: number; h: number }> = {
  carousel: { w: 1080, h: 1350 },
  single: { w: 1080, h: 1080 },
  reel: { w: 1080, h: 1920 },
}

/** Which set of looks applies. A Reel is dressed as a single image. */
export function familyOf(format: Format): FormatFamily {
  return format === 'carousel' ? 'carousel' : 'single'
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

  if (s.kind === 'card') {
    // A photograph with a white panel laid over its lower half. The panel is
    // what makes this usable over ANY picture: a white headline on a photo
    // depends on the scrim winning against whatever Pexels returned, and a
    // panel does not depend on anything.
    const top = Math.round(h * (s.cardTop ?? 0.5))
    if (a.photo) {
      drawPhoto(ctx, a.photo, 0, 0, w, h)
      const g = ctx.createLinearGradient(0, 0, 0, top)
      g.addColorStop(0, 'rgba(27,30,43,.30)')
      g.addColorStop(1, 'rgba(27,30,43,.10)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, top)
    } else {
      ctx.fillStyle = grad(ctx, 0, 0, w, top, INK.blue, INK.navy)
      ctx.fillRect(0, 0, w, h)
    }
    const m = 48                                  // the card's own margin
    ctx.fillStyle = INK.paper
    roundRect(ctx, m, top, w - m * 2, h - top - m, 22)
    ctx.fill()
    // The wave rides the card's top edge, which is where the guide puts a
    // divider: between two things.
    zigzag(ctx, top, w, INK.sky, 0.9, 18, 40, 7)
    return { top: top + 74, bottom: h - m - 10 }
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

// The logo's own box, bottom right. Everything else in the footer has to
// keep out of it.
const LOGO_W = 118
const LOGO_GAP = 24
const SOURCE_SIZE = 22
const SOURCE_LEAD = 27
const SOURCE_MAX_LINES = 3

/** How much room the source line actually has before it reaches the mark. */
export function sourceWidth(w: number): number {
  return w - PAD - LOGO_W - LOGO_GAP - PAD
}

/**
 * The source line, broken to fit beside the logo.
 *
 * It used to be one fillText at the full frame width, so a long attribution
 * — and a real one like "invidis, reporting the WOO Global pDooH
 * Expenditure Study (Sept 2026)" is long — ran straight through the
 * wordmark. Now it wraps into the gap left of the mark and grows UPWARD, so
 * the last line keeps the baseline it always had and the block rises into
 * empty space rather than off the bottom of the frame.
 *
 * Exported so it can be tested without a canvas: the invariant is that no
 * line is ever wider than the room available.
 */
export function sourceLines(
  ctx: CanvasRenderingContext2D, source: string, w: number,
): string[] {
  const maxW = sourceWidth(w)
  let ls = wrap(ctx, source, maxW)

  if (ls.length > SOURCE_MAX_LINES) {
    ls = ls.slice(0, SOURCE_MAX_LINES)
    ls[SOURCE_MAX_LINES - 1] += ' …'
  }
  // A single unbroken token — a URL, usually — is kept whole by wrap() and
  // would still overhang, so every line is trimmed to the room it has.
  return ls.map(l => (ctx.measureText(l).width <= maxW ? l : clip(ctx, l, maxW)))
}

function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t.replace(/[\s,;:.\-]+$/, '') + '…'
}

/** The attribution strip every slide carries. */
function footer(
  ctx: CanvasRenderingContext2D, w: number, h: number, source: string | undefined, onDark: boolean,
) {
  mark(ctx, w - PAD - LOGO_W, h - 118, LOGO_W, onDark)
  if (!source) return

  ctx.font = `400 ${SOURCE_SIZE}px ${FONT}`
  ctx.fillStyle = onDark ? INK.faintOnDark : INK.faint
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  const ls = sourceLines(ctx, source, w)
  // Bottom-up: the final line sits where the single line always sat.
  ls.forEach((l, i) => ctx.fillText(l, PAD, h - 92 - (ls.length - 1 - i) * SOURCE_LEAD))
}

/** How tall the source block is, so the copy above it can keep clear. */
function sourceHeight(ctx: CanvasRenderingContext2D, source: string | undefined, w: number): number {
  if (!source) return 0
  ctx.save()
  ctx.font = `400 ${SOURCE_SIZE}px ${FONT}`
  const n = sourceLines(ctx, source, w).length
  ctx.restore()
  return (n - 1) * SOURCE_LEAD
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
  template: Template = DEFAULT_TEMPLATE[familyOf(format)],
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
  // The footer's reserve depends on where the footer IS. On a card it sits
  // inside the panel, close under the text, so reserving a full 170px of
  // frame-bottom squeezed the text area to nothing and the first render
  // overflowed the panel and ran through the logo.
  const card = surface.kind === 'card'
  // A two- or three-line source grows upward, so the copy above it has to
  // give way by the same amount or the fix would simply move the collision.
  const extra = sourceHeight(ctx, s.source, w)
  const floor = Math.min(area.bottom, (card ? h - 48 : h) - (card ? 162 : 170) - extra)
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
  // Centre between the area's own top and its floor, then clamp so a block
  // can never start past the point where it would overrun.
  //
  // The previous version added the frame's safe-top offset to area.top for a
  // centred block. SAFE_TOP exists because Instagram's profile row covers
  // the top of the FRAME — it has nothing to say about where a card's panel
  // begins, and adding it to the card's own top pushed the text 119px below
  // its floor, straight through the source line and the logo. top0 already
  // honours the frame.
  const mid = (top0 + floor - total) / 2
  let y =
    anchor === 'bottom' ? Math.max(top0, floor - total)
    : anchor === 'middle' ? Math.max(top0, Math.min(mid, floor - total))
    : top0

  pieces.forEach((p, i) => {
    const at = y
    block(ctx, anim, i, () => p.paint(at))
    y += p.h
  })

  // On a card the attribution belongs on the panel, not floating on the
  // photograph below it, so the footer is pulled up by the card's margin.
  footer(ctx, w, surface.kind === 'card' ? h - 44 : h, s.source, inkFor(surface).onDark)
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
