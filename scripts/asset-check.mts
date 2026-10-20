// Proof that the extracted brand paths really are the right shapes.
//   npx -y tsx --conditions=react-server scripts/asset-check.mts

import { writeFileSync, existsSync } from 'node:fs'
import { createCanvas, Path2D as P2D, GlobalFonts } from '@napi-rs/canvas'
import { MW_MARK, MW_CHEVRON, MW_WAVE_UNIT, MARK_STOPS } from '../lib/mw-brand-assets'

for (const f of ['Poppins-Bold.ttf', 'Poppins-Medium.ttf']) {
  const p = `C:/Users/MOVING WELLS/mw-social/${f}`
  if (existsSync(p)) GlobalFonts.registerFromPath(p, 'Poppins')
}

const W = 1240, H = 560
const c = createCanvas(W, H)
const x = c.getContext('2d') as any
x.fillStyle = '#ffffff'
x.fillRect(0, 0, W, H)

const put = (d: string, px: number, py: number, s: number, fill: any) => {
  x.save(); x.translate(px, py); x.scale(s, s); x.fillStyle = fill; x.fill(new P2D(d)); x.restore()
}
const label = (t: string, px: number, py: number) => {
  x.fillStyle = '#6b7280'; x.font = '18px Poppins, sans-serif'; x.fillText(t, px, py)
}

// 1. the mark, gradient-filled with the colours sampled from the guide
const s = 2.0
label('MW mark — gradient as sampled from the guide', 60, 46)
const g = x.createLinearGradient(60, 0, 60 + MW_MARK.w * s, 0)
g.addColorStop(0, '#55BFEA'); g.addColorStop(0.45, '#1B64B3'); g.addColorStop(1, '#1C212F')
put(MW_MARK.d, 60, 62, s, g)

// 2. the same mark reversed out of navy
x.fillStyle = '#1B1E2B'; x.fillRect(560, 56, 620, 150)
label('reversed on navy', 560, 46)
put(MW_MARK.d, 610, 76, s, '#ffffff')

// 3. the chevrons
label('triple chevron', 60, 266)
MW_CHEVRON.ds.forEach(d => put(d, 60, 282, 3.4, '#FEDA24'))

// 4. the wave band, tiled, alternating as the guide does
label('wave band — one unit, tiled', 60, 400)
const ws = 1.5
for (let i = 0; i < 11; i++) {
  put(MW_WAVE_UNIT.d, 60 + i * MW_WAVE_UNIT.w * ws, 420, ws, i % 2 ? '#66C9F3' : '#BFE7FB')
}

writeFileSync('C:/Users/MOVING WELLS/mw-social/guide2/assets.png', c.toBuffer('image/png'))
console.log('mark', MW_MARK.w, 'x', MW_MARK.h)
console.log('chevron', MW_CHEVRON.w, 'x', MW_CHEVRON.h, '(' + MW_CHEVRON.ds.length + ' shapes)')
console.log('wave unit', MW_WAVE_UNIT.w, 'x', MW_WAVE_UNIT.h)
console.log('sampled', MARK_STOPS)
