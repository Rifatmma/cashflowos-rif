// The Moving Walls showreel. Sixty seconds, picture and sound from one
// timeline, rendered and encoded without a browser.
//
//   npx -y tsx --conditions=react-server scripts/showreel.mts            16:9
//   npx -y tsx --conditions=react-server scripts/showreel.mts --vertical 9:16
//
// THE SPINE comes from what the company actually is. Moving Walls serves
// both sides of the same market — the people who own the screens and the
// people who want to buy them — and neither side could previously prove
// anything to the other. That is a two-sided story, and the brand already
// carries it: the monogram is two halves, and the guide describes the
// connection-dots motif as "interconnected nodes representing collaboration
// and partnership". So the film separates the two sides, holds them apart,
// and resolves them into the mark.
//
// EVERY NUMBER IS LABELLED. Industry figures carry their source on screen,
// Moving Walls' own figures are named as ours, and anything illustrative
// says so. A measurement company cannot put an unattributed number in its
// own showreel.
//
// Cuts land on bars of the 100bpm score — every scene boundary below is a
// multiple of 2.4 seconds — which is why the hits coincide with the edits.

import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createCanvas, GlobalFonts, Path2D as NodePath2D } from '@napi-rs/canvas'
import ffmpegPath from 'ffmpeg-static'
import { ease, at, counter, stagger, layer, clamp01, lerp, tween, drawPath } from '../lib/mw-motion'
import { render as renderAudio, toWav, type Voice } from '../lib/mw-score'
import {
  usePath2D, drawMark, drawChevron, drawWaveBand, drawDots,
  markHeight, chevronHeight, colourway,
} from '../lib/mw-brand'

usePath2D(NodePath2D as any)
for (const f of ['Poppins-Bold.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Regular.ttf', 'Poppins-Medium.ttf']) {
  const p = `C:/Users/MOVING WELLS/mw-social/${f}`
  if (existsSync(p)) GlobalFonts.registerFromPath(p, 'Poppins')
}

const VERT = process.argv.includes('--vertical')
const W = VERT ? 1080 : 1920
const H = VERT ? 1920 : 1080
const FPS = 30
const BAR = 2.4
const BEAT = 0.6
const TOTAL = 60
const OUT = 'C:/Users/MOVING WELLS/mw-social/showreel'
mkdirSync(OUT, { recursive: true })

const CW = colourway('blue')
const NAVY = '#1B1E2B'
const SKY = '#66C9F3'
const ICE = '#BFE7FB'
const SUN = '#FEDA24'

// Real markets, from the app's own city-page table.
const MARKETS = [
  'India', 'UAE', 'China', 'South Africa', 'Singapore', 'South Korea',
  'Japan', 'Saudi Arabia', 'Indonesia', 'Malaysia', 'United Kingdom',
]

// ── scenes, all starting on a bar ──────────────────────────────────────────
const S = {
  logo: 0,        // 3 bars
  sides: 7.2,     // 4 bars
  gap: 16.8,      // 4 bars
  bridge: 26.4,   // 4 bars
  reach: 36,      // 4 bars
  proof: 45.6,    // 3 bars
  lockup: 52.8,   // 3 bars
}

// ── the score ──────────────────────────────────────────────────────────────
const voices: Voice[] = []
voices.push({ kind: 'swell', at: 0, dur: 5.0, hz: 110, gain: 1.2 })
voices.push({ kind: 'riser', at: 3.2, dur: 1.9 })
voices.push({ kind: 'impact', at: S.logo + 5.1, gain: 1.2 })

// A kick from the second scene to the last, with the hats entering later so
// the track builds rather than simply looping.
for (let t = S.sides; t < S.lockup + 4.8; t += BEAT) {
  voices.push({ kind: 'kick', at: t, gain: t < S.bridge ? 0.72 : 1 })
  if (t >= S.gap) voices.push({ kind: 'hat', at: t + BEAT / 2, gain: 0.6 })
  if (t >= S.bridge && Math.round((t - S.bridge) / BEAT) % 2 === 0) {
    voices.push({ kind: 'sub', at: t, dur: BEAT * 1.7, hz: 55, gain: 0.9 })
  }
}
// A hit on every scene change.
for (const t of [S.sides, S.gap, S.bridge, S.reach, S.proof, S.lockup]) {
  voices.push({ kind: 'riser', at: t - 1.2, dur: 1.2, gain: 0.75 })
  voices.push({ kind: 'impact', at: t, gain: 0.95 })
}
// An arpeggio over the reach and proof sections.
const SCALE = [220, 277, 330, 440, 554, 440, 330, 277]
for (let i = 0; i < 40; i++) {
  const t = S.reach + i * (BEAT / 2)
  if (t > S.lockup) break
  voices.push({ kind: 'note', at: t, dur: 0.46, hz: SCALE[i % SCALE.length], gain: 0.75 })
}
// Resolve: a long pad under the lockup.
voices.push({ kind: 'swell', at: S.lockup, dur: 7.2, hz: 110, gain: 1.3 })
voices.push({ kind: 'impact', at: S.lockup + 2.4, gain: 1.1 })

writeFileSync(`${OUT}/score.wav`, toWav(...Object.values(renderAudio(voices, TOTAL)) as [Float32Array, Float32Array]))
console.log('score rendered')

// ── painting ───────────────────────────────────────────────────────────────
const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D

const grad = (x0: number, y0: number, x1: number, y1: number, a: string, b: string) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g
}
const field = () => { ctx.fillStyle = grad(0, 0, W, H, CW.field[0], CW.field[1]); ctx.fillRect(0, 0, W, H) }

/** Centred text, returning nothing — layout here is all by eye and ratio. */
function centre(text: string, size: number, y: number, fill: string | CanvasGradient, weight = 700) {
  ctx.font = `${weight} ${size}px Poppins`
  ctx.textAlign = 'center'
  ctx.fillStyle = fill
  ctx.fillText(text, W / 2, y)
}

/** A line of words that arrive one after another, centred as a block. */
function wordsIn(
  text: string, size: number, y: number, t: number, start: number, fill: string, accentLast = false,
) {
  const words = text.split(' ')
  ctx.font = `700 ${size}px Poppins`
  ctx.textAlign = 'left'
  const ws = words.map(w => ctx.measureText(w + ' ').width)
  let x = (W - ws.reduce((a, b) => a + b, 0)) / 2
  words.forEach((w, i) => {
    const k = stagger(t, start, 0.5, i, 0.065, ease.outQuart)
    layer(ctx, k, 0, lerp(size * 0.35, 0, k), () => {
      ctx.font = `700 ${size}px Poppins`
      ctx.fillStyle = accentLast && i === words.length - 1 ? SKY : fill
      ctx.fillText(w, x, y)
    })
    x += ws[i]
  })
}

/** The source strip every factual claim carries. */
function source(text: string, t: number, start: number) {
  const k = at(t, start, 0.6)
  layer(ctx, k * 0.85, 0, 0, () => {
    // Had been 1.15% of width, which at 1920 is 22px of thin grey on a
    // gradient — present but not actually readable, which defeats the point
    // of insisting every number carries its source.
    ctx.font = `500 ${Math.round(W * 0.0145)}px Poppins`
    ctx.textAlign = 'center'
    ctx.fillStyle = '#C3D8F0'
    ctx.fillText(text, W / 2, H - H * 0.075)
  })
}

const flash = (t: number, hitAt: number) => {
  const k = at(t, hitAt, 0.05, ease.linear) * (1 - at(t, hitAt + 0.05, 0.35, ease.outCubic))
  if (k > 0.01) { ctx.fillStyle = `rgba(255,255,255,${k * 0.42})`; ctx.fillRect(0, 0, W, H) }
}

function frame(t: number) {
  ctx.globalAlpha = 1
  ctx.fillStyle = NAVY
  ctx.fillRect(0, 0, W, H)

  // ── 1. the mark builds ──────────────────────────────────────────────────
  if (t < S.sides) {
    const l = t - S.logo
    field()
    ctx.globalAlpha = tween(l, 0.4, 2.2, 0, 0.5, ease.inOutCubic) * (1 - at(l, 5.6, 1.0))
    drawDots(ctx, 0, 0, W, H, { colours: [SKY, ICE], density: VERT ? 9 : 13, link: 0.16, time: l, reveal: at(l, 0.3, 2.6) })
    ctx.globalAlpha = 1

    // The wave draws across, then the mark lands on the impact.
    const draw = at(l, 0.6, 2.6, ease.inOutCubic)
    const bandH = H * (VERT ? 0.075 : 0.1)
    layer(ctx, 1 - at(l, 5.0, 0.7), 0, 0, () => {
      drawWaveBand(ctx, 0, H / 2 - bandH / 2, W, {
        height: bandH, colours: [SKY, ICE], reveal: draw,
      })
    })

    const land = at(l, 5.1, 0.7, ease.outExpo)
    if (land > 0) {
      const mw = W * (VERT ? 0.62 : 0.34) * lerp(1.35, 1, land)
      layer(ctx, land, 0, 0, () => {
        drawMark(ctx, (W - mw) / 2, H / 2 - markHeight(mw) / 2, mw, '#FFFFFF')
      })
    }
    flash(t, S.logo + 5.1)
  }

  // ── 2. two sides that cannot see each other ─────────────────────────────
  else if (t < S.gap) {
    const l = t - S.sides
    field()
    const half = VERT ? H / 2 : W / 2
    // Two meshes, held apart. The gap between them is the whole point.
    ctx.save()
    ctx.globalAlpha = 0.72
    if (VERT) {
      drawDots(ctx, 0, 0, W, half - H * 0.03, { colours: [SKY, ICE], density: 8, link: 0.2, time: l, reveal: at(l, 0.2, 1.4), seed: 2 })
      drawDots(ctx, 0, half + H * 0.03, W, half - H * 0.03, { colours: [SUN, '#FFDF40'], density: 8, link: 0.2, time: l + 3, reveal: at(l, 0.5, 1.4), seed: 5 })
    } else {
      drawDots(ctx, 0, 0, half - W * 0.02, H, { colours: [SKY, ICE], density: 7, link: 0.22, time: l, reveal: at(l, 0.2, 1.4), seed: 2 })
      drawDots(ctx, half + W * 0.02, 0, half - W * 0.02, H, { colours: [SUN, '#FFDF40'], density: 7, link: 0.22, time: l + 3, reveal: at(l, 0.5, 1.4), seed: 5 })
    }
    ctx.restore()

    // THE GAP IS THE POINT, so it is drawn rather than implied. A dark
    // channel with a bright edge either side reads instantly as two things
    // held apart; without it the two meshes simply looked like one.
    const split = at(l, 0.3, 1.2, ease.outCubic)
    if (split > 0) {
      ctx.save()
      ctx.globalAlpha = split
      if (VERT) {
        const gy = H / 2
        const gh = H * 0.052
        ctx.fillStyle = NAVY
        ctx.fillRect(0, gy - gh / 2, W, gh)
        ctx.fillStyle = grad(0, 0, W, 0, 'rgba(102,201,243,0)', 'rgba(102,201,243,.75)')
        ctx.fillRect(0, gy - gh / 2 - 2, W, 2)
        ctx.fillStyle = grad(0, 0, W, 0, 'rgba(254,218,36,.75)', 'rgba(254,218,36,0)')
        ctx.fillRect(0, gy + gh / 2, W, 2)
      } else {
        const gx = W / 2
        const gw = W * 0.045
        ctx.fillStyle = NAVY
        ctx.fillRect(gx - gw / 2, 0, gw, H)
        ctx.fillStyle = grad(0, 0, 0, H, 'rgba(102,201,243,0)', 'rgba(102,201,243,.75)')
        ctx.fillRect(gx - gw / 2 - 2, 0, 2, H)
        ctx.fillStyle = grad(0, 0, 0, H, 'rgba(254,218,36,.75)', 'rgba(254,218,36,0)')
        ctx.fillRect(gx + gw / 2, 0, 2, H)
      }
      ctx.restore()
    }

    const lab = Math.round(W * (VERT ? 0.038 : 0.026))
    ctx.textAlign = 'center'
    layer(ctx, at(l, 0.8, 0.6), 0, 0, () => {
      ctx.font = `600 ${lab}px Poppins`
      ctx.fillStyle = ICE
      ctx.fillText('T H E   S C R E E N S', VERT ? W / 2 : W * 0.25, VERT ? H * 0.2 : H * 0.42)
      ctx.fillStyle = SUN
      ctx.fillText('T H E   B U D G E T S', VERT ? W / 2 : W * 0.75, VERT ? H * 0.78 : H * 0.42)
    })

    // The headline sits over the divider on a band of its own, so it is
    // legible against both meshes at once.
    const hsz = Math.round(W * (VERT ? 0.058 : 0.04))
    const hy = H * (VERT ? 0.47 : 0.52)
    const bandA = at(l, 1.5, 0.6, ease.outCubic)
    if (bandA > 0) {
      ctx.save()
      ctx.globalAlpha = bandA * 0.88
      ctx.fillStyle = NAVY
      ctx.fillRect(0, hy - hsz * 1.25, W, hsz * 3.1)
      ctx.restore()
    }
    wordsIn('Neither side could prove anything', hsz, hy, l, 1.8, '#FFFFFF')
    wordsIn('to the other.', hsz, hy + hsz * 1.35, l, 2.4, '#FFFFFF', true)
    flash(t, S.sides)
  }

  // ── 3. the gap, as a number ─────────────────────────────────────────────
  else if (t < S.bridge) {
    const l = t - S.gap
    field()
    ctx.globalAlpha = 0.22
    drawDots(ctx, 0, 0, W, H, { colours: [SKY, ICE], density: VERT ? 8 : 12, link: 0.16, time: l })
    ctx.globalAlpha = 1

    const k = at(l, 0.6, 2.6, ease.linear)
    const big = Math.round(W * (VERT ? 0.30 : 0.19))
    layer(ctx, at(l, 0.4, 0.5), 0, 0, () => {
      centre(counter(1.7, k, n => n.toFixed(1) + '%'), big, H * (VERT ? 0.44 : 0.5),
        grad(W * 0.3, 0, W * 0.7, 0, ICE, SKY))
    })
    wordsIn('of Asia-Pacific outdoor spend trades programmatically',
      Math.round(W * (VERT ? 0.05 : 0.031)), H * (VERT ? 0.55 : 0.63), l, 2.0, '#FFFFFF')
    wordsIn('The lowest penetration of any region.',
      Math.round(W * (VERT ? 0.042 : 0.024)), H * (VERT ? 0.61 : 0.70), l, 3.0, ICE)
    source('WOO Global pDOOH Expenditure Study, aggregated by PwC · Sept 2026', l, 3.6)
    flash(t, S.gap)
  }

  // ── 4. the two sides connect ────────────────────────────────────────────
  else if (t < S.reach) {
    const l = t - S.bridge
    field()
    // One mesh now, knitting across the whole frame — the two halves of the
    // previous scene becoming a single network.
    const knit = at(l, 0.2, 3.4, ease.inOutCubic)
    ctx.globalAlpha = 0.85
    drawDots(ctx, 0, 0, W, H, {
      colours: [SKY, '#FFFFFF'], density: VERT ? 10 : 14, link: 0.15, time: l, reveal: knit, seed: 3,
    })
    ctx.globalAlpha = 1

    wordsIn('One network. Both sides.', Math.round(W * (VERT ? 0.068 : 0.046)),
      H * (VERT ? 0.46 : 0.5), l, 2.2, '#FFFFFF', true)
    wordsIn('Measured the same way, in every market.',
      Math.round(W * (VERT ? 0.042 : 0.026)), H * (VERT ? 0.53 : 0.58), l, 3.2, ICE)

    const bandH = H * (VERT ? 0.05 : 0.07)
    drawWaveBand(ctx, 0, H - bandH * 1.6, W, {
      height: bandH, colours: [SKY, ICE], reveal: at(l, 4.0, 1.6), alpha: 0.9,
    })
    flash(t, S.bridge)
  }

  // ── 5. reach — real markets ─────────────────────────────────────────────
  else if (t < S.proof) {
    const l = t - S.reach
    field()
    ctx.globalAlpha = 0.3
    drawDots(ctx, 0, 0, W, H, { colours: [SKY, ICE], density: VERT ? 9 : 13, link: 0.15, time: l, seed: 4 })
    ctx.globalAlpha = 1

    const k = at(l, 0.5, 1.8, ease.linear)
    layer(ctx, at(l, 0.3, 0.5), 0, 0, () => {
      centre(counter(11, k), Math.round(W * (VERT ? 0.30 : 0.2)), H * (VERT ? 0.26 : 0.3),
        grad(W * 0.35, 0, W * 0.65, 0, '#FFFFFF', SKY))
      ctx.font = `600 ${Math.round(W * (VERT ? 0.032 : 0.019))}px Poppins`
      ctx.fillStyle = ICE
      ctx.textAlign = 'center'
      ctx.fillText('M A R K E T S', W / 2, H * (VERT ? 0.31 : 0.36))
    })

    // The market names arrive in order, as a block.
    const fs = Math.round(W * (VERT ? 0.036 : 0.023))
    ctx.font = `600 ${fs}px Poppins`
    const perRow = VERT ? 2 : 4
    const rows = Math.ceil(MARKETS.length / perRow)
    MARKETS.forEach((m, i) => {
      const row = Math.floor(i / perRow), col = i % perRow
      const inRow = Math.min(perRow, MARKETS.length - row * perRow)
      const cw = W * (VERT ? 0.42 : 0.21)
      const x = W / 2 + (col - (inRow - 1) / 2) * cw
      const y = H * (VERT ? 0.42 : 0.5) + row * fs * 2.1
      const kk = stagger(l, 1.6, 0.5, i, 0.11, ease.outQuart)
      layer(ctx, kk, 0, lerp(26, 0, kk), () => {
        ctx.font = `600 ${fs}px Poppins`
        ctx.fillStyle = '#FFFFFF'
        ctx.textAlign = 'center'
        ctx.fillText(m, x, y)
      })
    })
    source('Moving Walls location coverage · live in the platform', l, 4.4)
    flash(t, S.reach)
  }

  // ── 6. proof — a measurement chart, labelled illustrative ───────────────
  else if (t < S.lockup) {
    const l = t - S.proof
    field()
    wordsIn('Audience, delivered and proven.',
      Math.round(W * (VERT ? 0.058 : 0.038)), H * (VERT ? 0.22 : 0.24), l, 0.5, '#FFFFFF', true)

    // Bars draw up in sequence; a line traces over them.
    const n = 9
    const bw = W * (VERT ? 0.065 : 0.045)
    const gapX = W * (VERT ? 0.085 : 0.058)
    const x0 = W / 2 - (gapX * (n - 1)) / 2
    const base = H * (VERT ? 0.68 : 0.76)
    const pts: [number, number][] = []
    for (let i = 0; i < n; i++) {
      const target = (0.35 + 0.62 * Math.sin((i / (n - 1)) * Math.PI * 0.82)) * H * (VERT ? 0.26 : 0.36)
      const kk = stagger(l, 1.0, 0.6, i, 0.1, ease.outQuart)
      const hgt = target * kk
      ctx.fillStyle = grad(0, base - target, 0, base, SKY, '#2554A2')
      ctx.globalAlpha = 0.9
      ctx.fillRect(x0 + i * gapX - bw / 2, base - hgt, bw, hgt)
      ctx.globalAlpha = 1
      pts.push([x0 + i * gapX, base - target])
    }
    ctx.strokeStyle = SUN
    ctx.lineWidth = Math.max(2, W * 0.0022)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    drawPath(ctx, pts, at(l, 2.2, 1.8, ease.inOutCubic))

    source('Illustrative — shape of a delivery curve, not a client result', l, 3.6)
    flash(t, S.proof)
  }

  // ── 7. the lockup ───────────────────────────────────────────────────────
  else {
    const l = t - S.lockup
    field()
    ctx.globalAlpha = 0.28
    drawDots(ctx, 0, 0, W, H, { colours: [SKY, ICE], density: VERT ? 9 : 13, link: 0.16, time: l, seed: 6 })
    ctx.globalAlpha = 1

    const land = at(l, 0.1, 0.9, ease.outExpo)
    const mw = W * (VERT ? 0.58 : 0.26) * lerp(1.18, 1, land)
    const mx = (W - mw) / 2
    const my = H * (VERT ? 0.40 : 0.40) - markHeight(mw) / 2
    layer(ctx, land, 0, 0, () => drawMark(ctx, mx, my, mw, '#FFFFFF'))

    // The wordmark. Set as tracked Poppins — the guide's own wordmark is
    // live text in the PDF rather than outlines, so this is the closest
    // honest approximation until the real lockup file exists.
    const wk = at(l, 0.7, 0.7)
    layer(ctx, wk, 0, 0, () => {
      const fs = Math.round(mw * 0.082)
      ctx.font = `500 ${fs}px Poppins`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#FFFFFF'
      const label = 'moving walls'
      const track = fs * 0.55
      const total = [...label].reduce((a, ch) => a + ctx.measureText(ch).width + track, 0) - track
      let cx = W / 2 - total / 2
      for (const ch of label) {
        ctx.textAlign = 'left'
        ctx.fillText(ch, cx, my + markHeight(mw) + fs * 1.9)
        cx += ctx.measureText(ch).width + track
      }
    })

    wordsIn('No boundaries for customer success.',
      Math.round(W * (VERT ? 0.042 : 0.027)), H * (VERT ? 0.60 : 0.63), l, 2.4, ICE)

    const bandH = H * (VERT ? 0.05 : 0.07)
    drawWaveBand(ctx, 0, H - bandH * 1.5, W, {
      height: bandH, colours: [SKY, ICE], reveal: at(l, 3.2, 2.0), alpha: 0.9,
    })
    // Fade to black on the last beat.
    const outK = at(l, 6.4, 0.8, ease.inQuad)
    if (outK > 0) { ctx.fillStyle = `rgba(27,30,43,${outK})`; ctx.fillRect(0, 0, W, H) }
    flash(t, S.lockup)
  }
}

// ── encode ─────────────────────────────────────────────────────────────────
const name = VERT ? 'showreel-9x16' : 'showreel-16x9'
const ff = spawn(ffmpegPath as string, [
  '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
  '-i', `${OUT}/score.wav`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
  `${OUT}/${name}.mp4`,
], { stdio: ['pipe', 'ignore', 'pipe'] })
let err = ''
ff.stderr.on('data', d => { err += d.toString() })
const done = new Promise<void>((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(err.slice(-1400))))))

const frames = TOTAL * FPS
for (let f = 0; f < frames; f++) {
  frame(f / FPS)
  const buf = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer)
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
  if (f % 150 === 0) console.log(`  ${f}/${frames}`)
}
ff.stdin.end()
await done
console.log('wrote', `${OUT}/${name}.mp4`)
