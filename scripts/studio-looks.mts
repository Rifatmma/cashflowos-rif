// A contact sheet of the five templates.
//   npx -y tsx --conditions=react-server scripts/studio-looks.mts
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { createCanvas, loadImage, GlobalFonts, Path2D as NodePath2D } from '@napi-rs/canvas'
import { drawSlide, CAROUSEL_TEMPLATES, SINGLE_TEMPLATES, SIZE, type Slide, type Format } from '../lib/mw-studio-design'
import { usePath2D } from '../lib/mw-brand'

usePath2D(NodePath2D as any)

const fontFile = 'C:/Users/MOVING WELLS/mw-social/Poppins-Bold.ttf'
for (const [f, name] of [['Poppins-Bold.ttf','Poppins'],['Poppins-SemiBold.ttf','Poppins'],['Poppins-Regular.ttf','Poppins'],['Poppins-Medium.ttf','Poppins']] as const) {
  const p = `C:/Users/MOVING WELLS/mw-social/${f}`
  if (existsSync(p)) GlobalFonts.registerFromPath(p, name)
}
console.log('Poppins:', GlobalFonts.families.some(x => x.family === 'Poppins'))

const photoPath = 'C:/Users/MOVING WELLS/mw-social/photo.jpg'
const photo = existsSync(photoPath) ? await loadImage(readFileSync(photoPath)) : undefined
console.log('photo:', !!photo)

const base = {
  kicker: 'THE SHIFT',
  headline: 'of outdoor budgets now trade programmatically',
  figure: '34%',
  body: 'Up from 19% two years ago. Buyers who can prove delivery move fastest.',
  source: 'IAB Outlook 2026',
}
const out = 'C:/Users/MOVING WELLS/mw-social/looks'
mkdirSync(out, { recursive: true })

for (const [name, set, format, kind] of [
  ['carousel', CAROUSEL_TEMPLATES, 'carousel', 'stat'],
  ['single', SINGLE_TEMPLATES, 'single', 'closer'],
] as const) {
  const slide = { ...base, kind } as Slide
  const { w, h } = SIZE[format as Format]
  const tw = 330, th = Math.round(tw * h / w)
  const sheet = createCanvas(tw * set.length, th + 36)
  const sc = sheet.getContext('2d')
  sc.fillStyle = '#555'; sc.fillRect(0, 0, sheet.width, sheet.height)
  set.forEach((t, i) => {
    const c = createCanvas(w, h)
    const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D
    drawSlide(ctx, slide, format as Format, photo ? { photo: photo as any } : {}, undefined, t)
    writeFileSync(`${out}/${t.id}.png`, c.toBuffer('image/png'))
    sc.drawImage(c as any, i * tw, 30, tw, th)
    sc.fillStyle = '#fff'; sc.font = '18px sans-serif'
    sc.fillText(t.name, i * tw + 10, 21)
  })
  writeFileSync(`${out}/${name}.png`, sheet.toBuffer('image/png'))
}
console.log('wrote', out)
