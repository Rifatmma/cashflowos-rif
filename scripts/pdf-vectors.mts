// Pull the real vector artwork out of the brand guide.
//
//   npx -y tsx --conditions=react-server scripts/pdf-vectors.mts <page> [out.svg]
//
// Everything brand-shaped in the Studio so far — the MW mark, the zigzag,
// the chevron — was redrawn by eye from a rendered page. Close is not the
// same as correct, and the owner can open the real file in Illustrator and
// see exactly how wrong it is. This reads the PDF's own drawing operators
// and writes them back out as SVG, so the shapes in the app are the shapes
// in the guide rather than my impression of them.
//
// pdf.js v6 removed its SVG backend, so the operator list is interpreted
// here: a small graphics state machine over save / restore / transform /
// setFillRGBColor / constructPath. That is less work than it sounds,
// because artwork like this uses a narrow slice of PDF.

import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = 'C:/Users/MOVING WELLS/Downloads/Moving Wall Visual guide book-compressed (2).pdf'
const pageNo = Number(process.argv[2] ?? 10)
const outFile = process.argv[3] ?? `C:/Users/MOVING WELLS/mw-social/guide2/page${pageNo}.svg`

type M = [number, number, number, number, number, number]
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
]
const apply = (m: M, x: number, y: number): [number, number] =>
  [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

/**
 * Decode pdf.js's packed path array.
 *
 * It is a flat run of [code, ...coords]: 0 moveTo, 1 lineTo, 2 cubic
 * (three points), 3 a shorthand cubic (two points). Anything else means
 * the encoding has changed and guessing would silently produce wrong
 * artwork, so it stops instead.
 */
function decode(flat: ArrayLike<number>, m: M): string {
  const d: string[] = []
  let i = 0
  let cx = 0, cy = 0
  const n = (flat as any).length ?? Object.keys(flat).length
  const get = (k: number) => (flat as any)[k] as number

  while (i < n) {
    const code = get(i++)
    if (code === 0) {
      const [x, y] = apply(m, get(i++), get(i++)); d.push(`M${x.toFixed(2)} ${y.toFixed(2)}`); cx = x; cy = y
    } else if (code === 1) {
      const [x, y] = apply(m, get(i++), get(i++)); d.push(`L${x.toFixed(2)} ${y.toFixed(2)}`); cx = x; cy = y
    } else if (code === 2) {
      const p1 = apply(m, get(i++), get(i++))
      const p2 = apply(m, get(i++), get(i++))
      const p3 = apply(m, get(i++), get(i++))
      d.push(`C${p1[0].toFixed(2)} ${p1[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)} ${p3[0].toFixed(2)} ${p3[1].toFixed(2)}`)
      cx = p3[0]; cy = p3[1]
    } else if (code === 3) {
      const p1 = apply(m, get(i++), get(i++))
      const p2 = apply(m, get(i++), get(i++))
      d.push(`C${p1[0].toFixed(2)} ${p1[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`)
      cx = p2[0]; cy = p2[1]
    } else {
      break
    }
  }
  return d.join(' ')
}

const doc = await getDocument({ data: new Uint8Array(readFileSync(FILE)) }).promise
const page = await doc.getPage(pageNo)
const vp = page.getViewport({ scale: 1 })
const ol = await page.getOperatorList()

const base = vp.transform as unknown as M
let ctm: M = [...base] as M
const stack: M[] = []
let fill = '#000000'
const fillStack: string[] = []

type Shape = { d: string; fill: string }
const shapes: Shape[] = []

for (let i = 0; i < ol.fnArray.length; i++) {
  const op = ol.fnArray[i]
  const a = ol.argsArray[i] as any

  if (op === OPS.save) { stack.push([...ctm] as M); fillStack.push(fill) }
  else if (op === OPS.restore) { ctm = (stack.pop() ?? [...base]) as M; fill = fillStack.pop() ?? '#000000' }
  else if (op === OPS.transform) { ctm = mul(ctm, a as M) }
  else if (op === OPS.setFillRGBColor) { fill = hex(a[0], a[1], a[2]) }
  else if (op === OPS.constructPath) {
    // a[1] is an ARRAY of Float32Arrays, one per subpath — not a single
    // buffer. Reading it as one silently produced zero paths.
    const subpaths = a[1] as Float32Array[]
    const d = subpaths.map(sp => decode(sp, ctm)).filter(Boolean).join(' ')
    if (d) shapes.push({ d, fill })
  }
}

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vp.width.toFixed(0)} ${vp.height.toFixed(0)}" width="${vp.width.toFixed(0)}" height="${vp.height.toFixed(0)}">`,
  ...shapes.map((s, i) => `  <path id="s${i}" d="${s.d}" fill="${s.fill}"/>`),
  '</svg>',
].join('\n')

writeFileSync(outFile, svg)
console.log(`page ${pageNo}: ${shapes.length} paths -> ${outFile}`)
const byFill: Record<string, number> = {}
for (const s of shapes) byFill[s.fill] = (byFill[s.fill] ?? 0) + 1
console.log('fills:', Object.entries(byFill).sort((x, y) => y[1] - x[1]).slice(0, 12))
