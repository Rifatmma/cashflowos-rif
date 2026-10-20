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

usePath2D(NodePath2D as any)
for (const f of ['Poppins-Bold.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Regular.ttf', 'Poppins-Medium.ttf']) {
  const p = `C:/Users/MOVING WELLS/mw-social/${f}`
  if (existsSync(p)) GlobalFonts.registerFromPath(p, 'Poppins')
}

const WIDE = process.argv.includes('--wide')
const W = WIDE ? 1920 : 1080
const H = WIDE ? 1080 : 1920
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
  kind: 'statement' | 'bignum' | 'dots' | 'bars' | 'define' | 'logo'
  dark?: boolean
  value?: number
  suffix?: string
  sub?: string
  note?: string
  chapter?: string
}

const SCRIPT: Card[] = [
  { kind: 'statement', dark: true, chapter: '01 — THE SHIFT',
    say: 'Okay so, out of home advertising was the last big medium you could not really measure.',
    show: 'The last medium\nyou couldn’t measure.' },
  { kind: 'statement', dark: false, chapter: '01 — THE SHIFT',
    say: 'That is over.', show: 'That’s over.', pause: 0.15 },
  { kind: 'define', dark: true, chapter: '02 — WHAT IT IS',
    say: 'This is programmatic digital out of home.',
    show: 'Programmatic DOOH', sub: 'pDOOH' },
  { kind: 'statement', dark: false, chapter: '02 — WHAT IT IS',
    say: 'Billboards, transit screens, mall displays — bought automatically, in real time.',
    show: 'Bought automatically.\nIn real time.' },
  { kind: 'dots', dark: true, chapter: '03 — THE NUMBERS', value: 75,
    say: 'The I A B expects digital to reach seventy five percent of all out of home.',
    show: 'of all out-of-home\nwill be digital', note: 'IAB forecast' },
  { kind: 'bars', dark: false, chapter: '03 — THE NUMBERS', value: 16,
    say: 'And by twenty twenty seven, sixteen percent of outdoor spend will be programmatic.',
    show: 'of outdoor spend,\nprogrammatic by 2027', note: 'Moving Walls · Programmatic DOOH Explained' },
  { kind: 'statement', dark: true, chapter: '04 — WHY',
    say: 'Here is why brands are moving.', show: 'Why brands\nare moving.', pause: 0.1 },
  { kind: 'statement', dark: false, chapter: '04 — WHY',
    say: 'You target by audience and context. Not just location.',
    show: 'Audience.\nNot just location.' },
  { kind: 'statement', dark: true, chapter: '04 — WHY',
    say: 'You change the creative mid flight.', show: 'Change creative\nmid-flight.' },
  { kind: 'statement', dark: false, chapter: '04 — WHY',
    say: 'And you measure what actually happened.', show: 'Measure what\nactually happened.' },
  { kind: 'statement', dark: true, chapter: '05 — PROOF',
    say: 'Lancôme ran a Chinese New Year campaign across high footfall malls.',
    show: 'Lancôme.\nChinese New Year.', note: 'Case study · Moving Walls' },
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
    show: 'Not a billboard.\nA performance channel.', pause: 0.3 },
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
const u = (n: number) => Math.round(W * n)       // sizes relative to width
const PAD = u(0.075)

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
  const s = u(0.0135)
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
  ctx.fillRect(PAD, H - PAD * 0.9, W - PAD * 2, u(0.003))
  ctx.fillStyle = dark ? SKY : BLUE
  ctx.fillRect(PAD, H - PAD * 0.9, (W - PAD * 2) * k, u(0.003))
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

function note(text: string | undefined, t0: number, t: number, dark: boolean) {
  if (!text) return
  const k = at(t, t0 + 0.5, 0.5)
  layer(ctx, k * 0.9, 0, 0, () => {
    ctx.font = `400 ${u(0.0165)}px Poppins`
    ctx.textAlign = 'center'
    ctx.fillStyle = dark ? 'rgba(191,231,251,.75)' : 'rgba(27,30,43,.55)'
    ctx.fillText(text, W / 2, H - PAD * 1.9)
  })
}

function frame(t: number) {
  const card = cards.find(c => t >= c.start && t < c.end) ?? cards[cards.length - 1]
  const l = t - card.start
  const dark = card.dark ?? true

  // ground
  if (dark) {
    ctx.fillStyle = grad(0, 0, W, H, BLUE, NAVY); ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 0.2
    drawDots(ctx, 0, 0, W, H, { colours: [SKY, ICE], density: WIDE ? 13 : 9, link: 0.16, time: t, seed: 2 })
    ctx.globalAlpha = 1
  } else {
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 0.5
    drawDots(ctx, 0, 0, W, H, { colours: ['#9EC3E8', '#2554A2'], density: WIDE ? 13 : 9, link: 0.16, time: t, seed: 3 })
    ctx.globalAlpha = 1
  }

  // a wipe on the cut, so cards change rather than crossfade
  const wipe = at(l, 0, 0.26, ease.outQuart)
  if (wipe < 1) {
    ctx.fillStyle = dark ? PAPER : NAVY
    ctx.fillRect(0, H * wipe, W, H)
  }

  const mid = H * (WIDE ? 0.5 : 0.46)

  if (card.kind === 'statement' || card.kind === 'logo') {
    if (card.kind === 'logo') {
      const land = at(l, 0.1, 0.7, ease.outExpo)
      const mw = W * (WIDE ? 0.2 : 0.42) * lerp(1.15, 1, land)
      layer(ctx, land, 0, 0, () =>
        drawMark(ctx, (W - mw) / 2, mid - markHeight(mw) - u(0.05), mw, '#FFFFFF'))
      caption(card.show ?? '', card.start + 0.55, t, dark, u(WIDE ? 0.05 : 0.082), mid + u(0.06))
    } else {
      caption(card.show ?? '', card.start + 0.1, t, dark, u(WIDE ? 0.055 : 0.082), mid)
    }
  }

  else if (card.kind === 'define') {
    const k = at(l, 0.15, 0.5, ease.outQuart)
    layer(ctx, k, 0, lerp(u(0.03), 0, k), () => {
      ctx.font = `700 ${u(WIDE ? 0.058 : 0.092)}px Poppins`
      ctx.textAlign = 'center'
      ctx.fillStyle = dark ? '#FFFFFF' : NAVY
      ctx.fillText(card.show ?? '', W / 2, mid)
    })
    const k2 = at(l, 0.5, 0.4)
    layer(ctx, k2, 0, 0, () => {
      const s = u(WIDE ? 0.026 : 0.042)
      const w = trackedWidth(card.sub ?? '', s, s * 0.3)
      tracked(card.sub ?? '', (W - w) / 2, mid + u(0.075), s, s * 0.3, SUN)
    })
  }

  else if (card.kind === 'bignum') {
    const k = at(l, 0.12, Math.min(1.5, card.speech * 0.8), ease.linear)
    const size = u(WIDE ? 0.17 : 0.26)
    layer(ctx, at(l, 0.05, 0.3), 0, 0, () => {
      ctx.font = `700 ${size}px Poppins`
      ctx.textAlign = 'center'
      ctx.fillStyle = dark
        ? grad(W * 0.25, 0, W * 0.75, 0, ICE, SKY)
        : grad(W * 0.25, 0, W * 0.75, 0, BLUE, SKY)
      ctx.fillText(counter(card.value ?? 0, k, n => Math.round(n) + (card.suffix ?? '')), W / 2, mid - u(0.02))
    })
    caption(card.show ?? '', card.start + 0.45, t, dark, u(WIDE ? 0.032 : 0.05), mid + u(0.09))
  }

  else if (card.kind === 'dots') {
    // A grid where the filled share IS the number.
    const cols = WIDE ? 20 : 10
    const rows = 10
    const total = cols * rows
    const target = Math.round(total * (card.value ?? 0) / 100)
    const k = at(l, 0.15, Math.min(1.6, card.speech * 0.75), ease.outCubic)
    const lit = Math.round(target * k)
    const gapX = u(WIDE ? 0.034 : 0.066)
    const r = u(WIDE ? 0.0085 : 0.017)
    const x0 = W / 2 - (gapX * (cols - 1)) / 2
    // Grid, number and caption are one stack; starting higher stops the
    // caption landing on top of the number.
    const y0 = mid - u(0.30)
    for (let i = 0; i < total; i++) {
      const cx = x0 + (i % cols) * gapX
      const cy = y0 + Math.floor(i / cols) * gapX
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      if (i < lit) { ctx.fillStyle = dark ? SKY : BLUE; ctx.fill() }
      else { ctx.strokeStyle = dark ? 'rgba(191,231,251,.3)' : 'rgba(37,84,162,.25)'; ctx.lineWidth = u(0.0018); ctx.stroke() }
    }
    layer(ctx, at(l, 0.3, 0.4), 0, 0, () => {
      ctx.font = `700 ${u(WIDE ? 0.1 : 0.15)}px Poppins`
      ctx.textAlign = 'center'
      ctx.fillStyle = dark ? '#FFFFFF' : NAVY
      ctx.fillText(counter(card.value ?? 0, k, n => Math.round(n) + '%'), W / 2, y0 + gapX * rows + u(0.13))
    })
    caption(card.show ?? '', card.start + 0.6, t, dark, u(WIDE ? 0.03 : 0.046), y0 + gapX * rows + u(0.235))
  }

  else if (card.kind === 'bars') {
    // 2027 against today, as two bars.
    const k = at(l, 0.2, 1.1, ease.outQuart)
    const bw = u(WIDE ? 0.09 : 0.2)
    const maxH = H * (WIDE ? 0.3 : 0.22)
    const base = mid + u(0.1)
    const pairs: [string, number][] = [['TODAY', 6], ['2027', card.value ?? 16]]
    pairs.forEach(([lab, v], i) => {
      const x = W / 2 + (i - 0.5) * bw * 2.1
      const hgt = maxH * (v / 20) * (i === 0 ? at(l, 0.2, 0.6, ease.outQuart) : k)
      ctx.fillStyle = i === 1
        ? grad(0, base - hgt, 0, base, SKY, BLUE)
        : (dark ? 'rgba(191,231,251,.35)' : 'rgba(37,84,162,.25)')
      ctx.fillRect(x - bw / 2, base - hgt, bw, hgt)
      ctx.font = `600 ${u(0.022)}px Poppins`
      ctx.textAlign = 'center'
      // Was .6 alpha navy on near-white: drawn, but not visible.
      ctx.fillStyle = dark ? 'rgba(191,231,251,.9)' : 'rgba(27,30,43,.85)'
      ctx.fillText(lab, x, base + u(0.042))
      if (i === 1) {
        ctx.font = `700 ${u(WIDE ? 0.045 : 0.07)}px Poppins`
        ctx.fillStyle = dark ? '#FFFFFF' : NAVY
        ctx.fillText(counter(v, k, n => Math.round(n) + '%'), x, base - hgt - u(0.022))
      }
    })
    caption(card.show ?? '', card.start + 0.55, t, dark, u(WIDE ? 0.03 : 0.046), base + u(0.14))
  }

  // a wave band at the foot of every card
  const bandH = H * (WIDE ? 0.05 : 0.028)
  drawWaveBand(ctx, 0, H - bandH * 2.6, W, {
    height: bandH, colours: dark ? [SKY, ICE] : [BLUE, '#9EC3E8'],
    reveal: at(l, 0.1, 0.8), alpha: dark ? 0.75 : 0.5, offset: t * 18,
  })

  note(card.note, card.start, t, dark)
  chrome(t, card, dark)
}

// ── encode ─────────────────────────────────────────────────────────────────
const name = WIDE ? 'article-16x9' : 'article-9x16'
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
