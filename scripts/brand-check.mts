// Every brand element, in every colourway, on both field types.
//   npx -y tsx --conditions=react-server scripts/brand-check.mts

import { writeFileSync, existsSync } from 'node:fs'
import { createCanvas, GlobalFonts, Path2D as NodePath2D } from '@napi-rs/canvas'
import {
  COLOURWAYS, drawWaveBand, drawDots, drawMark, drawChevron,
  markGradient, markHeight, chevronHeight, usePath2D,
} from '../lib/mw-brand'

usePath2D(NodePath2D as any)

for (const f of ['Poppins-Bold.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Medium.ttf']) {
  const p = `C:/Users/MOVING WELLS/mw-social/${f}`
  if (existsSync(p)) GlobalFonts.registerFromPath(p, 'Poppins')
}

const W = 1500
const ROW = 118
const H = 120 + COLOURWAYS.length * ROW + 430
const c = createCanvas(W, H)
const x = c.getContext('2d') as unknown as CanvasRenderingContext2D
x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H)

// header
drawChevron(x, 60, 46, 46, '#FEDA24')
x.fillStyle = '#1B1E2B'; x.font = '700 30px Poppins'
x.fillText('Brand elements — the real artwork, every colourway', 60 + 60, 46 + chevronHeight(46))

COLOURWAYS.forEach((cw, i) => {
  const y = 112 + i * ROW

  // dark field with its band
  const g = x.createLinearGradient(60, y, 760, y + 92)
  g.addColorStop(0, cw.field[0]); g.addColorStop(1, cw.field[1])
  x.fillStyle = g; x.fillRect(60, y, 700, 92)
  drawWaveBand(x, 60, y + 30, 700, { height: 34, colours: cw.onDark })

  // light field with its band
  const g2 = x.createLinearGradient(790, y, 1440, y + 92)
  g2.addColorStop(0, '#BFE7FB'); g2.addColorStop(1, '#66C9F3')
  x.fillStyle = g2; x.fillRect(790, y, 650, 92)
  drawWaveBand(x, 790, y + 30, 650, { height: 34, colours: cw.onLight })

  x.fillStyle = '#FFFFFF'; x.font = '600 15px Poppins'
  x.fillText(cw.name, 72, y + 22)
})

// ── the mark and the chevron ───────────────────────────────────────────────
const by = 112 + COLOURWAYS.length * ROW + 24
x.fillStyle = '#6b7280'; x.font = '500 15px Poppins'
x.fillText('mark · gradient', 60, by)
drawMark(x, 60, by + 14, 220, markGradient(x, 60, by + 14, 220))

x.fillStyle = '#1B1E2B'
x.fillRect(330, by - 6, 280, markHeight(220) + 34)
x.fillStyle = '#6b7280'; x.fillText('reversed', 330, by)
drawMark(x, 352, by + 14, 220, '#FFFFFF')

x.fillStyle = '#6b7280'; x.fillText('chevron', 660, by)
drawChevron(x, 660, by + 16, 120, '#FEDA24')

// ── the connection dots ────────────────────────────────────────────────────
const dy = by + 130
const tiles: [string, [string, string], [string, string]][] = [
  ['on primary', ['#2554A2', '#1B1E2B'], COLOURWAYS[0].onDark],
  ['on secondary', ['#BFE7FB', '#66C9F3'], ['#2554A2', '#FFFFFF']],
  ['event · magenta', ['#8C0786', '#1B1E2B'], COLOURWAYS[4].onDark],
  ['event · teal', ['#007876', '#1B1E2B'], COLOURWAYS[6].onDark],
]
tiles.forEach(([label, field, ink], i) => {
  const tx = 60 + i * 356, ty = dy + 18, tw = 330, th = 240
  const gg = x.createLinearGradient(tx, ty, tx + tw, ty + th)
  gg.addColorStop(0, field[0]); gg.addColorStop(1, field[1])
  x.fillStyle = gg; x.fillRect(tx, ty, tw, th)
  drawDots(x, tx, ty, tw, th, { colours: ink, link: 0.15, density: 11, seed: i + 1 })
  x.fillStyle = '#6b7280'; x.font = '500 15px Poppins'
  x.fillText('connection dots — ' + label, tx, ty - 8)
})

writeFileSync('C:/Users/MOVING WELLS/mw-social/guide2/brand.png', c.toBuffer('image/png'))
console.log('colourways:', COLOURWAYS.map(c2 => c2.id).join(', '))
