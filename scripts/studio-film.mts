// The three beats of a 15-second film, with their entrance caught mid-flight.
//   npx -y tsx --conditions=react-server scripts/studio-film.mts
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import { drawFilmSurface, drawSegmentText, templateById, SIZE, SEGMENT_SECONDS, type Segment } from '../lib/mw-studio-design'

for (const f of ['Poppins-Bold.ttf','Poppins-SemiBold.ttf','Poppins-Regular.ttf','Poppins-Medium.ttf']) {
  const p = `C:/Users/MOVING WELLS/mw-social/${f}`
  if (existsSync(p)) GlobalFonts.registerFromPath(p, 'Poppins')
}
const photo = await loadImage(readFileSync('C:/Users/MOVING WELLS/mw-social/photo.jpg'))

const beats: Segment[] = [
  { sub: 'THE QUESTION', headline: 'Who actually saw your billboard?', body: 'Most outdoor campaigns still answer this with a traffic count from a survey.' },
  { sub: 'THE NUMBER', headline: '34% of outdoor spend now trades programmatically', body: 'Up from 19% two years ago. The money is moving to inventory that can prove delivery.' },
  { sub: 'WHAT WE THINK', headline: 'Measurement decides the next budget', body: 'Not inventory. The screens that can prove an audience are the ones that get bought.' },
]

const tmpl = templateById('bleed')
const { w, h } = SIZE.carousel
const out = 'C:/Users/MOVING WELLS/mw-social/film'
mkdirSync(out, { recursive: true })

// Two moments per beat: arriving, and settled.
const shots: { at: number; i: number; label: string }[] = []
beats.forEach((_, i) => {
  shots.push({ at: 0.3, i, label: `${i * 5}.3s in` })
  shots.push({ at: 2.5, i, label: `${i * 5 + 2.5}s held` })
})

const tw = 250, th = Math.round(tw * h / w)
const sheet = createCanvas(tw * shots.length, th + 34)
const sc = sheet.getContext('2d')
sc.fillStyle = '#555'; sc.fillRect(0, 0, sheet.width, sheet.height)

shots.forEach((shot, n) => {
  const c = createCanvas(w, h)
  const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D
  const surface = drawFilmSurface(ctx, 'carousel', tmpl, { photo: photo as any }, 'IAB Outlook 2026')
  drawSegmentText(ctx, beats[shot.i], 'carousel', surface, { at: shot.at, total: SEGMENT_SECONDS })
  sc.drawImage(c as any, n * tw, 28, tw, th)
  sc.fillStyle = '#fff'; sc.font = '15px sans-serif'
  sc.fillText(shot.label, n * tw + 8, 19)
})
writeFileSync(`${out}/film.png`, sheet.toBuffer('image/png'))
console.log('wrote', out, '— 15s =', beats.length * SEGMENT_SECONDS)
