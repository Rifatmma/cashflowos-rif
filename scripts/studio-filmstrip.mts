// A filmstrip of one slide across its life, as PNGs.
//   npx -y tsx --conditions=react-server scripts/studio-filmstrip.mts
//
// Written because the animation could not be checked in the browser: driving
// Chrome remotely puts its window behind the app, the browser throttles
// requestAnimationFrame in an occluded window, and every recording came back
// stuttered. That is the recorder's own guard working correctly, but it meant
// the frames themselves were never looked at.
//
// drawSlide is isomorphic and wants nothing but a 2D context, so node can
// render the exact frames the recorder captures. This is the proof that the
// text enters, holds and leaves, and that nothing else moves.

import { writeFileSync, mkdirSync } from 'node:fs'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { drawSlide, SIZE, type Slide } from '../lib/mw-studio-design'

// Poppins if the machine has it; otherwise the shapes are wrong but the
// motion — which is what is being checked — is identical.
const sys = GlobalFonts.families.map(f => f.family)
console.log('Poppins available to node:', sys.includes('Poppins'))

const slide: Slide = {
  kind: 'stat',
  kicker: 'THE SHIFT',
  headline: 'of outdoor budgets now trade programmatically',
  figure: '34%',
  body: 'Up from 19% two years ago. Buyers who can prove delivery are moving fastest.',
  source: 'IAB Outlook 2026',
}

const TOTAL = 4
const moments = [0, 0.15, 0.35, 0.7, 2, 3.6, 3.8, 3.99]

const out = 'C:/Users/MOVING WELLS/mw-social/frames'
mkdirSync(out, { recursive: true })

const { w, h } = SIZE.carousel
// One wide contact sheet is easier to judge than eight files.
const cols = moments.length
const tw = 300
const th = Math.round(tw * h / w)
const sheet = createCanvas(tw * cols, th + 34)
const sctx = sheet.getContext('2d')
sctx.fillStyle = '#555'
sctx.fillRect(0, 0, sheet.width, sheet.height)

moments.forEach((at, i) => {
  const c = createCanvas(w, h)
  const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D
  drawSlide(ctx, slide, 'carousel', {}, { at, total: TOTAL })
  writeFileSync(`${out}/t${String(at).replace('.', '_')}.png`, c.toBuffer('image/png'))
  sctx.drawImage(c as any, i * tw, 28, tw, th)
  sctx.fillStyle = '#fff'
  sctx.font = '16px sans-serif'
  sctx.fillText(`${at.toFixed(2)}s`, i * tw + 8, 20)
})

writeFileSync(`${out}/filmstrip.png`, sheet.toBuffer('image/png'))
console.log(`wrote ${moments.length} frames + filmstrip.png to ${out}`)
