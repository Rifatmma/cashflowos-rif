// 👉 The Moving Walls post design, as code.
//
// This module is the single source of truth for what a generated post LOOKS
// like, and it is deliberately isomorphic: no node imports, no React, no DOM
// beyond a 2D context. The browser draws the preview with it, the download
// draws the full-size PNG with it, and — when the animation half lands — the
// frame renderer will call the same functions per frame. One draw path, so a
// video can never disagree with the still it came from.
//
// WHY CANVAS AND NOT HTML-TO-IMAGE
// The app runs on Vercel, which has no Chrome, so a server-side screenshot is
// not available. The alternatives in the browser were: serialise HTML to an
// SVG foreignObject (fonts and line-breaking differ per browser, and Safari
// drops it), add a dom-to-image dependency (same problems, plus a dependency),
// or draw. Drawing means we control wrapping and spacing exactly and the
// output is identical everywhere, at the cost of writing the layout by hand.
//
// COLOURS come from the Visual Identity Guidelines, p11–13. They are not
// approximations and must not be nudged to taste:
//
//   Primary gradient    #2554A2 → #1B1E2B      large areas
//   Secondary gradient  #BFE7FB → #66C9F3      large areas
//   Sunburst            #FEDA24 → #F59222      SUPPORTING ONLY
//   Crimson             #E03A36 → #871A1C      supporting only, unused here
//   Emerald             #6DDF6A → #25534A      supporting only, unused here
//
// The guide allows a gradient's start, end and midpoint to move but not its
// colours. It also says the accents are never used for large areas, which is
// why Sunburst appears here on exactly three things: the chevron, the CTA
// pill and a 132px rule.

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

export type SlideKind = 'cover' | 'stat' | 'point' | 'closer'

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
  /** `cover` only: a Pexels URL. Absent means the blue field is used instead. */
  photo?: string
  /** Pexels requires the photographer be credited. */
  credit?: string
}

export type Deck = {
  topic: string
  format: Format
  slides: Slide[]
}

// ----------------------------------------------------------------- geometry
//
// One margin everywhere. 84px at 1080 is ~7.8%, which keeps type clear of
// Instagram's own chrome and of the crop a 4:5 takes in the grid.

const PAD = 84

/** The top ~22% of a 4:5 is covered by the profile row in-feed. */
const SAFE_TOP = 0.22

// ------------------------------------------------------------------- pieces

function grad(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  from: string, to: string,
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
 * length. Measuring is cheap and it is the difference between a headline that
 * fills the line and one that breaks early.
 */
export function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []
  // An explicit newline in the copy is honoured — it is how a writer forces
  // a break that reads better than the measured one.
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

/**
 * Draw wrapped text, returning the y below the last line.
 *
 * `lead` is a multiplier, not a pixel value, so a size change keeps its
 * proportions. Returning the next y is what lets the callers below stack
 * blocks without hard-coding where each one starts — the thing that made the
 * first HTML mock-up need a magic number per slide.
 */
function lines(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, max: number, lead: number,
): number {
  const size = sizeOf(ctx.font)
  const ls = wrap(ctx, text, max)
  for (const l of ls) {
    ctx.fillText(l, x, y)
    y += size * lead
  }
  return y
}

/** Pull the px size back out of a canvas font string. */
function sizeOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font)
  return m ? Number(m[1]) : 16
}

/**
 * Letter-spaced text, drawn a glyph at a time.
 *
 * `ctx.letterSpacing` exists but only in recent Chrome and Safari 17+, and a
 * kicker that silently loses its tracking in one browser is the kind of fault
 * nobody reports and everybody sees. Drawing it is a few lines.
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
 * and it fought the headline badly. In the guide it separates things; here it
 * only ever sits at an edge, and never behind type.
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
 * guide is specific about clear space (the middle triangle of the mark on all
 * four sides) and about the extended wording being Arial Rounded MT Bold,
 * neither of which a redrawn path can promise. Until then this is close and
 * it means the generator has no missing asset.
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
  // Measure the tracked width so the wordmark can be right-aligned under the
  // mark; tracked() draws left-to-right and cannot right-align itself.
  let tw = 0
  for (const ch of label) tw += ctx.measureText(ch).width + 7
  tracked(ctx, label, x + w - tw + 7, y + h + 26, 7)
  ctx.restore()
}

/** The attribution strip every slide carries. */
function footer(
  ctx: CanvasRenderingContext2D, w: number, h: number, source: string | undefined, onDark: boolean,
) {
  if (source) {
    ctx.font = `400 22px ${FONT}`
    ctx.fillStyle = onDark ? INK.faintOnDark : INK.faint
    ctx.textAlign = 'left'
    ctx.fillText(source, PAD, h - 92)
  }
  mark(ctx, w - PAD - 118, h - 118, 118, onDark)
}

// ------------------------------------------------------------------- slides
//
// Each kind is one function. They share the furniture above and otherwise
// hard-code their own composition, which is the honest way to do this — a
// generalised "layout engine" over four fixed layouts is more code and worse
// output than four layouts.

type Assets = { photo?: CanvasImageSource }

function drawCover(ctx: CanvasRenderingContext2D, s: Slide, w: number, h: number, a: Assets) {
  if (a.photo) {
    cover(ctx, a.photo, w, h)
    // The scrim is heavier at the foot because that is where the type sits.
    // Without it a bright pavement in the photo eats a white headline.
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(27,30,43,.15)')
    g.addColorStop(0.46, 'rgba(27,30,43,.55)')
    g.addColorStop(1, 'rgba(27,30,43,.94)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  } else {
    ctx.fillStyle = grad(ctx, 0, 0, w, h, INK.blue, INK.navy)
    ctx.fillRect(0, 0, w, h)
  }

  zigzag(ctx, h - 30, w, '#9FDBF7', 0.3)

  // Laid out from the bottom up: the headline is anchored low, clear of the
  // profile row and of the thumbnail crop.
  const maxW = w - PAD * 2
  ctx.font = `700 92px ${FONT}`
  const hl = wrap(ctx, s.headline, maxW)
  const ctaH = s.cta ? 96 : 0
  let y = h - 240 - ctaH - hl.length * 92 * 1.04

  chevrons(ctx, PAD, y - 86)
  ctx.font = `600 26px ${FONT}`
  ctx.fillStyle = INK.sky
  tracked(ctx, s.kicker.toUpperCase(), PAD, y - 34, 3.6)

  ctx.font = `700 92px ${FONT}`
  ctx.fillStyle = '#FFFFFF'
  ctx.textBaseline = 'top'
  for (const l of hl) { ctx.fillText(l, PAD, y); y += 92 * 1.04 }
  ctx.textBaseline = 'alphabetic'

  if (s.cta) pill(ctx, s.cta, PAD, y + 24)
  footer(ctx, w, h, s.source, true)
}

function drawStat(ctx: CanvasRenderingContext2D, s: Slide, w: number, h: number) {
  ctx.fillStyle = INK.paper
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = grad(ctx, 0, 0, w, 300, INK.blue, INK.navy)
  ctx.fillRect(0, 0, w, 300)
  zigzag(ctx, 300, w, INK.ice, 1)
  zigzag(ctx, 372, w, INK.sky, 1)

  chevrons(ctx, PAD, 86)
  ctx.font = `600 26px ${FONT}`
  ctx.fillStyle = INK.sky
  tracked(ctx, s.kicker.toUpperCase(), PAD, 148, 3.6)

  ctx.textBaseline = 'top'
  let y = 430
  if (s.figure) {
    ctx.font = `700 240px ${FONT}`
    ctx.fillStyle = grad(ctx, PAD, y, PAD + 600, y + 240, INK.blue, INK.sky)
    ctx.fillText(s.figure, PAD, y)
    y += 240 * 0.9 + 34
  }
  ctx.font = `700 64px ${FONT}`
  ctx.fillStyle = INK.navy
  y = lines(ctx, s.headline, PAD, y, w - PAD * 2, 1.1)
  if (s.body) {
    ctx.font = `500 30px ${FONT}`
    ctx.fillStyle = INK.body
    lines(ctx, s.body, PAD, y + 18, w - PAD * 2 - 80, 1.45)
  }
  ctx.textBaseline = 'alphabetic'
  footer(ctx, w, h, s.source, false)
}

function drawPoint(ctx: CanvasRenderingContext2D, s: Slide, w: number, h: number) {
  ctx.fillStyle = INK.paper
  ctx.fillRect(0, 0, w, h)
  zigzag(ctx, h - 30, w, INK.ice, 1)

  chevrons(ctx, PAD, 110)
  ctx.font = `600 26px ${FONT}`
  ctx.fillStyle = INK.blue
  tracked(ctx, s.kicker.toUpperCase(), PAD, 172, 3.6)

  ctx.textBaseline = 'top'
  rule(ctx, PAD, 300)
  ctx.font = `700 72px ${FONT}`
  ctx.fillStyle = INK.navy
  let y = lines(ctx, s.headline, PAD, 336, w - PAD * 2, 1.1)
  if (s.body) {
    ctx.font = `400 32px ${FONT}`
    ctx.fillStyle = INK.body
    lines(ctx, s.body, PAD, y + 26, w - PAD * 2 - 60, 1.5)
  }
  ctx.textBaseline = 'alphabetic'
  footer(ctx, w, h, s.source, false)
}

function drawCloser(ctx: CanvasRenderingContext2D, s: Slide, w: number, h: number) {
  ctx.fillStyle = grad(ctx, 0, 0, w, h, INK.blue, INK.navy)
  ctx.fillRect(0, 0, w, h)
  zigzag(ctx, h - 30, w, INK.sky, 0.32)
  zigzag(ctx, h - 30, w, INK.ice, 0.22, 26, 46, 4)

  const top = Math.round(h * SAFE_TOP * 0.5)
  chevrons(ctx, PAD, top)
  ctx.font = `600 26px ${FONT}`
  ctx.fillStyle = INK.sky
  tracked(ctx, s.kicker.toUpperCase(), PAD, top + 62, 3.6)

  ctx.textBaseline = 'top'
  rule(ctx, PAD, Math.round(h * 0.3))
  ctx.font = `700 86px ${FONT}`
  ctx.fillStyle = '#FFFFFF'
  let y = lines(ctx, s.headline, PAD, Math.round(h * 0.3) + 36, w - PAD * 2, 1.04)
  if (s.body) {
    ctx.font = `400 32px ${FONT}`
    ctx.fillStyle = INK.onDark
    lines(ctx, s.body, PAD, y + 26, w - PAD * 2 - 80, 1.5)
  }
  ctx.textBaseline = 'alphabetic'
  footer(ctx, w, h, s.source, true)
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
  ctx.textBaseline = 'alphabetic'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  // roundRect is not in older Safari, and this is three lines.
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** object-fit: cover, by hand. */
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number) {
  const iw = (img as HTMLImageElement).width || w
  const ih = (img as HTMLImageElement).height || h
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

/** Paint one slide at full size. The caller sizes the canvas. */
export function drawSlide(
  ctx: CanvasRenderingContext2D, s: Slide, format: Format, assets: Assets = {},
) {
  const { w, h } = SIZE[format]
  ctx.clearRect(0, 0, w, h)
  ctx.textAlign = 'left'
  if (s.kind === 'cover') drawCover(ctx, s, w, h, assets)
  else if (s.kind === 'stat') drawStat(ctx, s, w, h)
  else if (s.kind === 'closer') drawCloser(ctx, s, w, h)
  else drawPoint(ctx, s, w, h)
}

// --------------------------------------------------------------- copy limits
//
// These are checked before a deck is shown, not after someone notices a slide
// looks wrong. The limits come from measuring the real layouts above, not
// from taste: past them, a headline takes a fourth line and pushes the body
// under the fold of the in-feed crop.

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
