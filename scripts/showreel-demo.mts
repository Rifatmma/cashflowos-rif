// A short proof that the whole pipeline works: canvas frames piped into
// ffmpeg, with a synthesised score muxed in, all from one timeline.
//
//   npx -y tsx --conditions=react-server scripts/showreel-demo.mts
//
// The point of this file is to de-risk the two claims that mattered before
// committing to a full minute: that node can render and encode video
// without a browser, and that the soundtrack can be written as code and
// land exactly on the cuts. Eight seconds is enough to prove both.

import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import ffmpegPath from 'ffmpeg-static'
import { ease, at, counter, drawPath, stagger, layer, clamp01, lerp } from '../lib/mw-motion'
import { render as renderAudio, toWav, type Voice } from '../lib/mw-score'
import { INK, FONT } from '../lib/mw-studio-design'

for (const f of ['Poppins-Bold.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Regular.ttf', 'Poppins-Medium.ttf']) {
  const p = `C:/Users/MOVING WELLS/mw-social/${f}`
  if (existsSync(p)) GlobalFonts.registerFromPath(p, 'Poppins')
}

const W = 1920, H = 1080, FPS = 30, SECONDS = 8
const out = 'C:/Users/MOVING WELLS/mw-social/showreel'
mkdirSync(out, { recursive: true })

// ── the score ──────────────────────────────────────────────────────────────
// 100bpm: a beat is 0.6s, a bar 2.4s. The cuts below sit on bars, which is
// the entire trick — picture and sound are computed from the same grid.
const BEAT = 60 / 100
const voices: Voice[] = []
for (let b = 0; b < SECONDS / BEAT; b++) {
  const t = b * BEAT
  if (t >= 2.4) voices.push({ kind: 'kick', at: t })
  if (t >= 2.4) voices.push({ kind: 'hat', at: t + BEAT / 2, gain: 0.7 })
  if (t >= 4.8 && b % 2 === 0) voices.push({ kind: 'sub', at: t, dur: BEAT * 1.6, hz: 55 })
}
voices.push({ kind: 'swell', at: 0, dur: 2.6, hz: 110, gain: 1.1 })
voices.push({ kind: 'riser', at: 0.9, dur: 1.5 })
voices.push({ kind: 'impact', at: 2.4, gain: 1.15 })
voices.push({ kind: 'riser', at: 3.9, dur: 0.9, gain: 0.7 })
voices.push({ kind: 'impact', at: 4.8, gain: 0.9 })
// An arpeggio over the last bars, so it does not end on drums alone.
const scale = [220, 277, 330, 440, 330, 277]
for (let i = 0; i < 12; i++) {
  voices.push({ kind: 'note', at: 4.8 + i * (BEAT / 2), dur: 0.5, hz: scale[i % scale.length], gain: 0.9 })
}

const { left, right } = renderAudio(voices, SECONDS)
writeFileSync(`${out}/demo.wav`, toWav(left, right))
console.log('score rendered')

// ── the picture ────────────────────────────────────────────────────────────
const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D

const grad = (x0: number, y0: number, x1: number, y1: number, a: string, b: string) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, a); g.addColorStop(1, b); return g
}

/** The MW zigzag as a point list, so it can be drawn progressively. */
function wavePoints(cx: number, cy: number, w: number, amp: number, n = 8): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    pts.push([cx - w / 2 + (w / n) * i, cy + (i % 2 === 0 ? amp : -amp)])
  }
  return pts
}

function frame(t: number) {
  ctx.globalAlpha = 1
  ctx.fillStyle = INK.navy
  ctx.fillRect(0, 0, W, H)

  // 0.0–2.4  the wave draws itself, then slams into the mark
  if (t < 3.2) {
    const k = at(t, 0.2, 1.9, ease.inOutCubic)
    const land = at(t, 2.4, 0.5, ease.outExpo)
    const spread = lerp(900, 320, land)
    const amp = lerp(120, 44, land)
    ctx.save()
    ctx.strokeStyle = grad(W / 2 - 450, 0, W / 2 + 450, 0, INK.sky, '#FFFFFF')
    ctx.lineWidth = lerp(16, 30, land)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.globalAlpha = 1 - at(t, 2.9, 0.3, ease.inQuad)
    drawPath(ctx, wavePoints(W / 2, H / 2, spread, amp), k)
    ctx.restore()

    // A flash on the impact, which is where the audio hits too.
    const flash = at(t, 2.4, 0.06, ease.linear) * (1 - at(t, 2.46, 0.34, ease.outCubic))
    if (flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  // 2.5–5.0  a line of type, arriving word by word
  if (t > 2.5 && t < 5.4) {
    const words = ['The', 'medium', 'you', 'could', 'never', 'measure.']
    ctx.font = `700 96px ${FONT}`
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    const widths = words.map(w2 => ctx.measureText(w2 + ' ').width)
    const total = widths.reduce((a, b) => a + b, 0)
    let x = (W - total) / 2
    words.forEach((word, i) => {
      const k = stagger(t, 2.6, 0.5, i, 0.07, ease.outQuart)
      const outK = at(t, 5.0, 0.4, ease.inQuad)
      layer(ctx, k * (1 - outK), 0, lerp(40, 0, k) - outK * 30, () => {
        ctx.fillStyle = i === 5 ? INK.sky : '#FFFFFF'
        ctx.fillText(word, x, H / 2 + 34)
      })
      x += widths[i]
    })
  }

  // 4.8–8.0  a counter, because nothing says motion graphics like one
  if (t > 4.9) {
    const k = at(t, 5.1, 2.0, ease.linear)
    ctx.textAlign = 'center'
    ctx.font = `700 260px ${FONT}`
    ctx.fillStyle = grad(W / 2 - 400, H / 2 - 160, W / 2 + 400, H / 2 + 160, INK.ice, INK.sky)
    layer(ctx, at(t, 4.9, 0.4), 0, 0, () => {
      ctx.fillText(counter(1240, k, n => Math.round(n).toLocaleString()), W / 2, H / 2 + 40)
    })
    ctx.font = `600 34px ${FONT}`
    ctx.fillStyle = INK.faintOnDark
    layer(ctx, at(t, 5.6, 0.5), 0, 0, () => {
      ctx.fillText('S C R E E N S   M E A S U R E D', W / 2, H / 2 + 130)
    })
    // The underline wipes in on the last bar.
    const u = at(t, 6.6, 0.7, ease.outQuart)
    ctx.fillStyle = grad(W / 2 - 200, 0, W / 2 + 200, 0, INK.sun1, INK.sun2)
    ctx.fillRect(W / 2 - 200 * u, H / 2 + 180, 400 * u, 7)
  }
}

// ── pipe frames straight into ffmpeg ───────────────────────────────────────
//
// Raw RGBA on stdin: no PNG encode, no temp files, and ffmpeg does the
// h.264 work. 1920x1080x4 bytes a frame is large but it is a pipe, not a
// disk.
const args = [
  '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
  '-i', `${out}/demo.wav`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k',
  '-shortest', '-movflags', '+faststart',
  `${out}/demo.mp4`,
]
const ff = spawn(ffmpegPath as string, args, { stdio: ['pipe', 'ignore', 'pipe'] })
let err = ''
ff.stderr.on('data', d => { err += d.toString() })

const done = new Promise<void>((res, rej) => {
  ff.on('close', c => (c === 0 ? res() : rej(new Error(err.slice(-1200)))))
})

const total = SECONDS * FPS
for (let f = 0; f < total; f++) {
  frame(f / FPS)
  const buf = Buffer.from(canvas.getContext('2d').getImageData(0, 0, W, H).data.buffer)
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
  if (f % 60 === 0) console.log(`  ${f}/${total}`)
}
ff.stdin.end()
await done
console.log('wrote', `${out}/demo.mp4`)
