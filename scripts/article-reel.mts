// A narrated explainer built from a Moving Walls article.
//
//   npx -y tsx --conditions=react-server scripts/article-reel.mts [--wide]
//
// Source: /blog/programmatic-dooh-explained. Every number on screen is from
// that article, including the Lancôme results, and each card says where it
// came from.
//
// THE FILM IS CUT TO THE READ. Each line of narration is synthesised on its
// own and measured, so a card's duration IS the duration of the sentence
// being spoken over it. Nothing is estimated from word counts, which is why
// the captions cannot drift.
//
// The format follows the reference the owner sent: one idea per card, huge
// type, alternating light and dark, persistent editorial chrome down the
// edges, and infographic cards — dot grids and counters — carrying the
// numbers rather than paragraphs of text.

import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createCanvas, GlobalFonts, Path2D as NodePath2D } from '@napi-rs/canvas'
import ffmpegPath from 'ffmpeg-static'
import { ease, at, counter, stagger, layer, lerp, clamp01 } from '../lib/mw-motion'
import { render as renderAudio, toWav, type Voice } from '../lib/mw-score'
import { narrate, type Line } from '../lib/mw-voice'
import { buildNarration, decodePcm, mixUnder } from '../lib/mw-vo-mix'
import { usePath2D, drawMark, drawWaveBand, drawDots, markHeight } from '../lib/mw-brand'
import { drawIcon, drawIconLabel, type IconName } from '../lib/mw-icons'

usePath2D(NodePath2D as any)
for (const f of ['Poppins-Bold.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Regular.ttf', 'Poppins-Medium.ttf']) {
  const p = `C:/Users/MOVING WELLS/mw-social/${f}`
  if (existsSync(p)) GlobalFonts.registerFromPath(p, 'Poppins')
}

// ONE FORMAT PER RENDER, chosen up front.
//
// The first version rendered every shape from a single layout riddled with
// `WIDE ? a : b`, which produced output that was consistent and wrong: the
// landscape cut had its dot grid starting above the top of the frame and
// its labels sitting on the chrome. The deeper fault was that VERTICAL
// positions were computed from the frame's WIDTH — u(0.3) is 17% of height
// in 9:16 and 53% of it in 16:9 — so a layout tuned in portrait could not
// survive the change of aspect. Hence `v()` below, and a layout table per
// format rather than ternaries scattered through the drawing code.
//
// It is also cheaper: one render, not two, and nothing is spent making a
// shape that was never going to be right.

type Fmt = 'vertical' | 'square' | 'wide'
const FMT: Fmt =
  process.argv.includes('--wide') ? 'wide'
  : process.argv.includes('--square') ? 'square'
  : 'vertical'

const SIZES: Record<Fmt, [number, number]> = {
  vertical: [1080, 1920],
  square: [1080, 1080],
  wide: [1920, 1080],
}
const [W, H] = SIZES[FMT]
const WIDE = FMT === 'wide'

/**
 * Per-format numbers, declared in one place.
 *
 * Fractions of HEIGHT for anything vertical, fractions of WIDTH for
 * anything horizontal. Mixing the two is what broke the landscape cut.
 */
const LAYOUTS: Record<Fmt, {
  mid: number          // where the content centres, as a fraction of height
  statement: number    // caption size, fraction of width
  bignum: number
  iconSize: number
  iconLabel: number
  dotCols: number
  dotRows: number
  gridTop: number      // fraction of HEIGHT
  barW: number
  barMax: number       // fraction of HEIGHT
}> = {
  vertical: { mid: 0.46, statement: 0.082, bignum: 0.26, iconSize: 0.225, iconLabel: 0.026,
              dotCols: 10, dotRows: 10, gridTop: 0.20, barW: 0.2, barMax: 0.22 },
  square:   { mid: 0.47, statement: 0.070, bignum: 0.22, iconSize: 0.185, iconLabel: 0.022,
              dotCols: 12, dotRows: 8,  gridTop: 0.20, barW: 0.16, barMax: 0.30 },
  wide:     { mid: 0.50, statement: 0.048, bignum: 0.15, iconSize: 0.128, iconLabel: 0.016,
              dotCols: 20, dotRows: 8,  gridTop: 0.20, barW: 0.075, barMax: 0.38 },
}
const L = LAYOUTS[FMT]
const FPS = 30
const OUT = 'C:/Users/MOVING WELLS/mw-social/article'
mkdirSync(OUT, { recursive: true })

const NAVY = '#1B1E2B'
const BLUE = '#2554A2'
const SKY = '#66C9F3'
const ICE = '#BFE7FB'
const SUN = '#FEDA24'
const PAPER = '#F7FAFD'

// ── the script ─────────────────────────────────────────────────────────────
//
// `say` is spoken; `show` is what appears, which is shorter because a
// caption is read in a glance and a sentence is not.

type Card = Line & {
  kind: 'statement' | 'bignum' | 'dots' | 'bars' | 'define' | 'logo' | 'icons'
  dark?: boolean
  value?: number
  suffix?: string
  sub?: string
  note?: string
  chapter?: string
  /**
   * Successive lines that appear IN STEP WITH THE READ, spread across the
   * time she is speaking. A single caption that lands once and then sits
   * still for three seconds is a slide; this is the sentence arriving as
   * it is said.
   */
  phrases?: string[]
  /** Named things get drawn as things. */
  icons?: { name: IconName; label: string }[]
}

const SCRIPT: Card[] = [
  { kind: 'statement', dark: true, chapter: '01 — THE SHIFT',
    say: 'Okay so, out of home advertising was the last big medium you could not really measure.',
    phrases: ['Out of home', 'was the last medium', 'you couldn’t measure.'] },
  { kind: 'statement', dark: false, chapter: '01 — THE SHIFT',
    say: 'That is over.', show: 'That’s over.', pause: 0.15 },
  { kind: 'define', dark: true, chapter: '02 — WHAT IT IS',
    say: 'This is programmatic digital out of home.',
    show: 'Programmatic DOOH', sub: 'pDOOH' },
  { kind: 'icons', dark: false, chapter: '02 — WHAT IT IS',
    say: 'Billboards, transit screens, mall displays — bought automatically, in real time.',
    show: 'Bought automatically.\nIn real time.',
    icons: [
      { name: 'billboard', label: 'BILLBOARDS' },
      { name: 'transit', label: 'TRANSIT' },
      { name: 'mall', label: 'MALLS' },
    ] },
  { kind: 'dots', dark: true, chapter: '03 — THE NUMBERS', value: 75,
    say: 'The I A B expects digital to reach seventy five percent of all out of home.',
    show: 'of all out-of-home\nwill be digital', note: 'IAB forecast' },
  { kind: 'bars', dark: false, chapter: '03 — THE NUMBERS', value: 16,
    say: 'And by twenty twenty seven, sixteen percent of outdoor spend will be programmatic.',
    show: 'of outdoor spend,\nprogrammatic by 2027', note: 'Moving Walls · Programmatic DOOH Explained' },
  { kind: 'statement', dark: true, chapter: '04 — WHY',
    say: 'Here is why brands are moving.', show: 'Why brands\nare moving.', pause: 0.1 },
  { kind: 'icons', dark: false, chapter: '04 — WHY',
    say: 'You target by audience and context. Not just location.',
    show: 'Audience and context.',
    icons: [
      { name: 'target', label: 'AUDIENCE' },
      { name: 'pin', label: 'CONTEXT' },
      { name: 'clock', label: 'MOMENT' },
    ] },
  { kind: 'statement', dark: true, chapter: '04 — WHY',
    say: 'You change the creative mid flight.',
    phrases: ['Change the creative', 'mid-flight.'] },
  { kind: 'statement', dark: false, chapter: '04 — WHY',
    say: 'And you measure what actually happened.', show: 'Measure what\nactually happened.' },
  { kind: 'statement', dark: true, chapter: '05 — PROOF',
    say: 'Lancôme ran a Chinese New Year campaign across high footfall malls.',
    phrases: ['Lancôme.', 'Chinese New Year.', 'High-footfall malls.'],
    note: 'Case study · Moving Walls' },
  { kind: 'bignum', dark: false, chapter: '05 — PROOF', value: 107, suffix: '%',
    say: 'Impressions came in a hundred and seven percent above estimate.',
    show: 'above estimated\nimpressions', note: 'Lancôme campaign · Moving Walls' },
  { kind: 'bignum', dark: true, chapter: '05 — PROOF', value: 105, suffix: '%',
    say: 'Audience match, a hundred and five percent better.',
    show: 'better audience\nmatch', note: 'Lancôme campaign · Moving Walls' },
  { kind: 'bignum', dark: false, chapter: '05 — PROOF', value: 78, suffix: '%',
    say: 'And seventy eight percent of viewers were repeat visitors to the target malls.',
    show: 'were repeat visitors\nto target malls', note: 'Lancôme campaign · Moving Walls' },
  { kind: 'statement', dark: true, chapter: '06 — SO',
    say: 'That is not a billboard. That is a performance channel.',
    phrases: ['Not a billboard.', 'A performance channel.'], pause: 0.3 },
  { kind: 'logo', dark: true, chapter: '06 — SO',
    say: 'Moving Walls. Plan it, prove it.', show: 'Plan it. Prove it.', pause: 0.9 },
]

// ── narration first: the picture is cut to it ──────────────────────────────
console.log('narrating…')
const { timed, total } = await narrate(SCRIPT, `${OUT}/vo`, 'ava', '+14%', 0.45)
timed.forEach((t, i) => console.log(`  ${t.start.toFixed(2)}s  ${t.dur.toFixed(2)}s  ${SCRIPT[i].show?.replace(/\n/g, ' ')}`))
const TOTAL = Math.ceil((total + 0.9) * 10) / 10
console.log('runtime', TOTAL.toFixed(1), 's')

// Each card runs from its line's start until the next line starts.
const cards = SCRIPT.map((c, i) => ({
  ...c,
  start: timed[i].start,
  end: i + 1 < timed.length ? timed[i + 1].start : TOTAL,
  speech: timed[i].dur,
}))

// ── score: faster than the first film, as asked ────────────────────────────
const BPM = 124
const BEAT = 60 / BPM
const voices: Voice[] = []
for (let t = 0; t < TOTAL; t += BEAT) {
  voices.push({ kind: 'kick', at: t, gain: 0.82 })
  voices.push({ kind: 'hat', at: t + BEAT / 2, gain: 0.5 })
  if (Math.round(t / BEAT) % 4 === 0) voices.push({ kind: 'sub', at: t, dur: BEAT * 1.8, hz: 55, gain: 0.8 })
}
// A hit on every card change, which is also every new sentence.
for (const c of cards) voices.push({ kind: 'impact', at: c.start, gain: 0.5 })
voices.push({ kind: 'swell', at: 0, dur: 2.2, hz: 110, gain: 0.9 })
const last = cards[cards.length - 1]
voices.push({ kind: 'impact', at: last.start, gain: 1.0 })
voices.push({ kind: 'swell', at: last.start, dur: TOTAL - last.start, hz: 110, gain: 1.1 })

const music = renderAudio(voices, TOTAL)
console.log('mixing…')
const narration = await buildNarration(timed.map(t => ({ file: t.file, start: t.start })), TOTAL)
const mixed = mixUnder(music.left, music.right, narration)
writeFileSync(`${OUT}/mix.wav`, toWav(mixed.left, mixed.right))

// ── painting ───────────────────────────────────────────────────────────────
const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
const u = (n: number) => Math.round(W * n)       // anything horizontal
const v = (n: number) => Math.round(H * n)       // anything vertical
const PAD = Math.round(Math.min(W, H) * 0.075)

const grad = (x0: number, y0: number, x1: number, y1: number, a: string, b: string) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g
}

function tracked(text: string, x: number, y: number, size: number, space: number, fill: string) {
  ctx.font = `600 ${size}px Poppins`
  ctx.fillStyle = fill
  ctx.textAlign = 'left'
  let cx = x
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + space }
}
function trackedWidth(text: string, size: number, space: number) {
  ctx.font = `600 ${size}px Poppins`
  let w = 0
  for (const ch of text) w += ctx.measureText(ch).width + space
  return w - space
}

const tc = (t: number) => {
  const f = Math.floor((t % 1) * FPS)
  return `00:00:${String(Math.floor(t)).padStart(2, '0')}:${String(f).padStart(2, '0')}`
}

/** The editorial frame that runs through every card. */
function chrome(t: number, card: typeof cards[number], dark: boolean) {
  const ink = dark ? 'rgba(191,231,251,.55)' : 'rgba(27,30,43,.45)'
  const s = Math.round(Math.min(W, H) * 0.0135)
  tracked('MOVING WALLS · PROGRAMMATIC DOOH', PAD, PAD, s, s * 0.22, ink)
  const ch = card.chapter ?? ''
  tracked(ch, W - PAD - trackedWidth(ch, s, s * 0.22), PAD, s, s * 0.22, ink)
  tracked(tc(t), PAD, H - PAD * 0.55, s, s * 0.22, ink)
  const tag = 'NO BOUNDARIES'
  tracked(tag, W - PAD - trackedWidth(tag, s, s * 0.22), H - PAD * 0.55, s, s * 0.22,
    dark ? 'rgba(254,218,36,.8)' : 'rgba(37,84,162,.65)')

  // A progress rule across the foot: how far through the film we are.
  const k = clamp01(t / TOTAL)
  ctx.fillStyle = dark ? 'rgba(255,255,255,.12)' : 'rgba(27,30,43,.1)'
  ctx.fillRect(PAD, H - PAD * 0.9, W - PAD * 2, Math.max(2, Math.round(Math.min(W, H) * 0.003)))
  ctx.fillStyle = dark ? SKY : BLUE
  ctx.fillRect(PAD, H - PAD * 0.9, (W - PAD * 2) * k, Math.max(2, Math.round(Math.min(W, H) * 0.003)))
}

/**
 * The largest size at which every line of a caption fits the frame.
 *
 * Captions were set at a fixed fraction of the width, which works until
 * a line is long — and then "you couldn't measure." simply ran off both
 * edges. A caption that does not fit is not a caption, so the size is
 * measured down until it does rather than trusting a constant.
 */
function fitSize(text: string, want: number, maxW: number): number {
  let size = want
  for (let i = 0; i < 24; i++) {
    ctx.font = `700 ${size}px Poppins`
    const widest = Math.max(...text.split('\n').map(l => ctx.measureText(l).width))
    if (widest <= maxW) return size
    size *= 0.94
  }
  return size
}

/** The caption: the spoken line, set big, arriving a word at a time. */
function caption(text: string, t0: number, t: number, dark: boolean, want: number, yCentre: number) {
  const lines = text.split('\n')
  const size = fitSize(text, want, W - PAD * 2)
  const lh = size * 1.12
  let y = yCentre - ((lines.length - 1) * lh) / 2
  let wi = 0
  for (const line of lines) {
    const words = line.split(' ')
    ctx.font = `700 ${size}px Poppins`
    const ws = words.map(w => ctx.measureText(w + ' ').width)
    let x = (W - (ws.reduce((a, b) => a + b, 0) - ctx.measureText(' ').width)) / 2
    words.forEach((w, i) => {
      const k = stagger(t, t0, 0.42, wi++, 0.055, ease.outQuart)
      layer(ctx, k, 0, lerp(size * 0.3, 0, k), () => {
        ctx.font = `700 ${size}px Poppins`
        ctx.fillStyle = dark ? '#FFFFFF' : NAVY
        ctx.textAlign = 'left'
        ctx.fillText(w, x, y)
      })
      x += ws[i]
    })
    y += lh
  }
}

/**
 * Successive phrases, timed to the read.
 *
 * Each phrase gets an equal share of the time she is speaking, holds while
 * the next arrives beneath it, and the whole stack lifts away at the end.
 * The earlier version put one caption on screen and left it there: about
 * half a second of motion followed by three seconds of nothing, which is
 * what made the film feel like slides.
 */
function phrases(
  list: string[], t0: number, speech: number, t: number, dark: boolean, want: number, yCentre: number,
) {
  const each = speech / list.length
  const size = fitSize(list.join('\n'), want, W - PAD * 2)
  const lh = size * 1.18
  const yTop = yCentre - ((list.length - 1) * lh) / 2

  list.forEach((line, i) => {
    const start = t0 + i * each * 0.86
    const k = at(t, start, 0.34, ease.outQuart)
    if (k <= 0) return
    // Everything already on screen eases up a little as the next arrives,
    // so the block keeps moving for the whole line rather than freezing.
    const pushed = list.slice(i + 1).reduce(
      (n, _, j) => n + at(t, t0 + (i + 1 + j) * each * 0.86, 0.34, ease.outQuart), 0)
    const y = yTop + i * lh - pushed * lh * 0.16
    ctx.font = `700 ${size}px Poppins`
    ctx.textAlign = 'center'
    layer(ctx, k, 0, lerp(size * 0.38, 0, k), () => {
      ctx.font = `700 ${size}px Poppins`
      // The line being spoken is brightest; earlier ones recede.
      const live = t < start + each * 1.1
      ctx.fillStyle = dark
        ? (live ? '#FFFFFF' : 'rgba(255,255,255,.62)')
        : (live ? NAVY : 'rgba(27,30,43,.5)')
      ctx.fillText(line, W / 2, y)
    })
  })
}

/** A slow sine, for things that should never be completely still. */
const breathe = (t: number, hz: number, amount: number) => Math.sin(t * hz * Math.PI * 2) * amount

function note(text: string | undefined, t0: number, t: number, dark: boolean) {
  if (!text) return
  const k = at(t, t0 + 0.5, 0.5)
  layer(ctx, k * 0.9, 0, 0, () => {
    ctx.font = `400 ${Math.round(Math.min(W, H) * 0.0165)}px Poppins`
    ctx.textAlign = 'center'
    ctx.fillStyle = dark ? 'rgba(191,231,251,.75)' : 'rgba(27,30,43,.55)'
    ctx.fillText(text, W / 2, H - PAD * 2.1)
  })
}

function frame(t: number) {
  const card = cards.find(c => t >= c.start && t < c.end) ?? cards[cards.length - 1]
  const l = t - card.start
  const dark = card.dark ?? true

  // GROUND, AND IT NEVER STOPS MOVING.
  //
  // The mesh drifts, the whole field creeps slowly across and scales a
  // fraction, and the brightness breathes. None of it is noticeable on its
  // own, which is the point: a frame with nothing moving in it reads as a
  // slide even when the type has only just landed.
  const driftX = breathe(t, 0.035, W * 0.012)
  const driftY = breathe(t + 3, 0.028, H * 0.008)
  const zoom = 1 + 0.016 + breathe(t, 0.021, 0.016)

  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.scale(zoom, zoom)
  ctx.translate(-W / 2 + driftX, -H / 2 + driftY)
  if (dark) {
    ctx.fillStyle = grad(0, 0, W, H, BLUE, NAVY); ctx.fillRect(-W, -H, W * 3, H * 3)
    ctx.globalAlpha = 0.2 + breathe(t, 0.07, 0.05)
    drawDots(ctx, 0, 0, W, H, { colours: [SKY, ICE], density: WIDE ? 13 : 9, link: 0.16, time: t * 1.6, seed: 2 })
  } else {
    ctx.fillStyle = PAPER; ctx.fillRect(-W, -H, W * 3, H * 3)
    ctx.globalAlpha = 0.5 + breathe(t, 0.07, 0.08)
    drawDots(ctx, 0, 0, W, H, { colours: ['#9EC3E8', '#2554A2'], density: WIDE ? 13 : 9, link: 0.16, time: t * 1.6, seed: 3 })
  }
  ctx.globalAlpha = 1
  ctx.restore()

  // A light sweep across the cut, so the change of card has direction.
  const sweep = at(l, 0, 0.55, ease.outQuart)
  if (sweep < 1) {
    const sx = -W * 0.5 + sweep * W * 1.9
    const g2 = ctx.createLinearGradient(sx - W * 0.35, 0, sx + W * 0.35, 0)
    g2.addColorStop(0, 'rgba(255,255,255,0)')
    g2.addColorStop(0.5, dark ? 'rgba(102,201,243,.22)' : 'rgba(37,84,162,.14)')
    g2.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g2
    ctx.fillRect(0, 0, W, H)
  }

  // a wipe on the cut, so cards change rather than crossfade
  const wipe = at(l, 0, 0.26, ease.outQuart)
  if (wipe < 1) {
    ctx.fillStyle = dark ? PAPER : NAVY
    ctx.fillRect(0, H * wipe, W, H)
  }

  const mid = H * L.mid

  if (card.kind === 'statement' || card.kind === 'logo') {
    if (card.kind === 'logo') {
      const land = at(l, 0.1, 0.7, ease.outExpo)
      const mw = W * (WIDE ? 0.22 : 0.42) * lerp(1.15, 1, land)
      layer(ctx, land, 0, 0, () =>
        drawMark(ctx, (W - mw) / 2, mid - markHeight(mw) - v(0.015), mw, '#FFFFFF'))
      caption(card.show ?? '', card.start + 0.55, t, dark, u(L.statement), mid + v(0.07))
    } else if (card.phrases) {
      phrases(card.phrases, card.start + 0.12, card.speech, t, dark, u(L.statement), mid)
    } else {
      caption(card.show ?? '', card.start + 0.1, t, dark, u(L.statement), mid)
    }
  }

  else if (card.kind === 'icons') {
    // Three named things, arriving as she names them, each drawing itself
    // in and then floating so the row is never static.
    const icons = card.icons ?? []
    const size = u(L.iconSize)
    const span = W * (WIDE ? 0.62 : 0.80)

    // CENTRE THE BLOCK, NOT ITS FIRST ELEMENT.
    //
    // The icons were centred on `mid` and the labels and caption left to
    // hang below them, so the thing a viewer actually sees — icons, labels
    // and a line of type — had its centre well under the middle of the
    // frame. In landscape the caption ended up nearly off the bottom.
    // Measure the whole stack, then place it so ITS centre is the frame's.
    const capSize = u(WIDE ? 0.034 : 0.056)
    const capLines = (card.show ?? '').split('\n').length
    const labelDrop = size * 0.82                       // label baseline below icon centre
    const capDrop = labelDrop + capSize * 1.1 + v(0.05) // caption centre below icon centre
    const blockTop = -size / 2
    const blockBottom = capDrop + (capLines * capSize * 1.12) / 2
    const y = mid - (blockTop + blockBottom) / 2
    icons.forEach((ic, i) => {
      const cx = W / 2 + (i - (icons.length - 1) / 2) * (span / icons.length)
      const k = at(t, card.start + 0.18 + i * (card.speech * 0.2), 0.55, ease.outQuart)
      if (k <= 0) return
      const float = breathe(t + i * 0.9, 0.3, u(0.008))
      const pop = 1 + at(t, card.start + 0.18 + i * (card.speech * 0.2), 0.3, ease.outBack) * 0.0
      ctx.save()
      ctx.translate(0, float)
      drawIconLabel(
        ctx, ic.name, ic.label, cx, y, size * pop,
        dark ? SKY : BLUE, dark ? 'rgba(191,231,251,.9)' : 'rgba(27,30,43,.6)',
        // 1.6% of width is 17px at 1080 — drawn, but not readable at a
        // glance, which is the only speed an icon label is read at.
                // A CONSTANT, because the weight is in the icon's own units and is
        // scaled with it. Deriving it from frame width made the landscape
        // icons almost twice as heavy as the square ones.
        k, `700 ${u(L.iconLabel)}px Poppins`, 6.5,
      )
      ctx.restore()
    })
    // Clear of the icon labels, which sit at roughly mid + 0.10W.
    caption(card.show ?? '', card.start + card.speech * 0.62, t, dark, capSize, y + capDrop)
  }

  else if (card.kind === 'define') {
    const k = at(l, 0.15, 0.5, ease.outQuart)
    layer(ctx, k, 0, lerp(u(0.03), 0, k), () => {
      ctx.font = `700 ${u(L.statement * 1.12)}px Poppins`
      ctx.textAlign = 'center'
      ctx.fillStyle = dark ? '#FFFFFF' : NAVY
      ctx.fillText(card.show ?? '', W / 2, mid)
    })
    const k2 = at(l, 0.5, 0.4)
    layer(ctx, k2, 0, 0, () => {
      const s = u(WIDE ? 0.022 : 0.042)
      const w = trackedWidth(card.sub ?? '', s, s * 0.3)
      tracked(card.sub ?? '', (W - w) / 2, mid + v(0.06), s, s * 0.3, SUN)
    })
  }

  else if (card.kind === 'bignum') {
    const k = at(l, 0.12, Math.min(1.5, card.speech * 0.8), ease.linear)
    const size = u(L.bignum)
    // The figure sits on its baseline and the caption hangs below it, so
    // the pair is centred as a pair rather than the number alone.
    const bigCap = u(WIDE ? 0.03 : 0.05)
    const bigCapDrop = size * 0.42 + bigCap * 1.3
    const numY = mid - bigCapDrop / 2 + size * 0.3
    layer(ctx, at(l, 0.05, 0.3), 0, 0, () => {
      // A counter that stops dead looks switched off, so the figure keeps a
      // slow scale once it has landed.
      const alive = 1 + breathe(t, 0.26, 0.012)
      ctx.save()
      ctx.translate(W / 2, numY)
      ctx.scale(alive, alive)
      ctx.translate(-W / 2, -numY)
      ctx.font = `700 ${size}px Poppins`
      ctx.textAlign = 'center'
      ctx.fillStyle = dark
        ? grad(W * 0.25, 0, W * 0.75, 0, ICE, SKY)
        : grad(W * 0.25, 0, W * 0.75, 0, BLUE, SKY)
      ctx.fillText(counter(card.value ?? 0, k, n => Math.round(n) + (card.suffix ?? '')), W / 2, numY)
      ctx.restore()
    })
    caption(card.show ?? '', card.start + 0.45, t, dark, bigCap, numY + bigCapDrop)
  }

  else if (card.kind === 'dots') {
    // A grid where the filled share IS the number.
    const cols = L.dotCols
    const rows = L.dotRows
    const total = cols * rows
    const target = Math.round(total * (card.value ?? 0) / 100)
    const k = at(l, 0.15, Math.min(1.6, card.speech * 0.75), ease.outCubic)
    const lit = Math.round(target * k)
    // The grid is sized so that it, the number and the caption together
    // fit between the chrome and the foot — measured against HEIGHT, which
    // is the whole reason the landscape version used to start off-frame.
    const gridH = v(0.30)
    const gapY = gridH / rows
    const gapX = Math.min(gapY, (W - PAD * 2) / cols)
    const r = gapX * 0.26
    const x0 = W / 2 - (gapX * (cols - 1)) / 2

    // Grid, figure and caption are one stack, centred as one. It used to
    // start at a fixed fraction of the height and let the rest fall where
    // it fell, which put the block high in some shapes and low in others.
    const numSize = u(L.bignum * 0.62)
    const capSize2 = u(WIDE ? 0.028 : 0.046)
    const numDrop = gapY * rows + v(0.09)
    const capDrop2 = numDrop + numSize * 0.55 + v(0.045)
    const stackH = numDrop + (capDrop2 - numDrop) + capSize2 * 1.12
    const y0 = mid - stackH / 2
    for (let i = 0; i < total; i++) {
      const cx = x0 + (i % cols) * gapX
      const cy = y0 + Math.floor(i / cols) * gapY
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      if (i < lit) {
        // A slow travelling highlight across the lit dots, so the grid is
        // still alive once it has filled.
        const wave = Math.sin(t * 2.2 - (i % cols) * 0.35 - Math.floor(i / cols) * 0.2)
        ctx.fillStyle = dark
          ? (wave > 0.82 ? '#FFFFFF' : SKY)
          : (wave > 0.82 ? SKY : BLUE)
        ctx.fill()
      }
      else { ctx.strokeStyle = dark ? 'rgba(191,231,251,.3)' : 'rgba(37,84,162,.25)'; ctx.lineWidth = u(0.0018); ctx.stroke() }
    }
    layer(ctx, at(l, 0.3, 0.4), 0, 0, () => {
      ctx.font = `700 ${u(L.bignum * 0.62)}px Poppins`
      ctx.textAlign = 'center'
      ctx.fillStyle = dark ? '#FFFFFF' : NAVY
      ctx.fillText(counter(card.value ?? 0, k, n => Math.round(n) + '%'), W / 2, y0 + numDrop)
    })
    caption(card.show ?? '', card.start + 0.6, t, dark, capSize2, y0 + capDrop2)
  }

  else if (card.kind === 'bars') {
    // 2027 against today, as two bars.
    const k = at(l, 0.2, 1.1, ease.outQuart)
    const bw = u(L.barW)
    const maxH = H * L.barMax
    // Bars rise from `base`, labels and caption sit under it, so the stack
    // runs from base - maxH to roughly base + caption. Centre that.
    const barCap = u(WIDE ? 0.028 : 0.046)
    const barCapDrop = v(0.105)
    const base = mid + (maxH - barCapDrop - barCap * 1.12) / 2
    const pairs: [string, number][] = [['TODAY', 6], ['2027', card.value ?? 16]]
    pairs.forEach(([lab, val], i) => {
      const x = W / 2 + (i - 0.5) * bw * 2.1
      const hgt = maxH * (val / 20) * (i === 0 ? at(l, 0.2, 0.6, ease.outQuart) : k)
      ctx.fillStyle = i === 1
        ? grad(0, base - hgt, 0, base, SKY, BLUE)
        : (dark ? 'rgba(191,231,251,.35)' : 'rgba(37,84,162,.25)')
      ctx.fillRect(x - bw / 2, base - hgt, bw, hgt)
      ctx.font = `600 ${u(0.022)}px Poppins`
      ctx.textAlign = 'center'
      // Was .6 alpha navy on near-white: drawn, but not visible.
      ctx.fillStyle = dark ? 'rgba(191,231,251,.9)' : 'rgba(27,30,43,.85)'
      ctx.fillText(lab, x, base + v(0.038))
      if (i === 1) {
        ctx.font = `700 ${u(WIDE ? 0.045 : 0.07)}px Poppins`
        ctx.fillStyle = dark ? '#FFFFFF' : NAVY
        ctx.fillText(counter(val, k, n => Math.round(n) + '%'), x, base - hgt - v(0.022))
      }
    })
    caption(card.show ?? '', card.start + 0.55, t, dark, barCap, base + barCapDrop)
  }

  // a wave band at the foot of every card
  const bandH = H * (WIDE ? 0.05 : 0.028)
  drawWaveBand(ctx, 0, H - bandH * 2.6, W, {
    height: bandH, colours: dark ? [SKY, ICE] : [BLUE, '#9EC3E8'],
    reveal: at(l, 0.1, 0.8), alpha: dark ? 0.75 : 0.5, offset: t * 46,
  })

  note(card.note, card.start, t, dark)
  chrome(t, card, dark)
}

// ── encode ─────────────────────────────────────────────────────────────────
const name = FMT === 'wide' ? 'article-16x9' : FMT === 'square' ? 'article-1x1' : 'article-9x16'
const ff = spawn(ffmpegPath as string, [
  '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
  '-i', `${OUT}/mix.wav`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
  `${OUT}/${name}.mp4`,
], { stdio: ['pipe', 'ignore', 'pipe'] })
let err = ''
ff.stderr.on('data', d => { err += d.toString() })
const done = new Promise<void>((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(err.slice(-1400))))))

const frames = Math.round(TOTAL * FPS)
for (let f = 0; f < frames; f++) {
  frame(f / FPS)
  const buf = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer)
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
  if (f % 150 === 0) console.log(`  ${f}/${frames}`)
}
ff.stdin.end()
await done
console.log('wrote', `${OUT}/${name}.mp4`)
