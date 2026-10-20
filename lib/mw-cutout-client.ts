// 👉 Cutting a subject out of a stock photo, in the browser, for free.
//
// Two ways, cheapest first:
//
//   key    — the photo was shot on white or green (we ask Pexels for that,
//            and Claude has already said which). The backdrop is flood-
//            filled from the edges inwards, so a white shirt INSIDE the
//            subject is not removed with the white wall behind it, and the
//            boundary gets a soft alpha ramp instead of a jagged step.
//   model  — anything else: BiRefNet-lite (MIT licence) through
//            transformers.js (Apache-2.0), loaded from the jsDelivr CDN the
//            first time it is needed. ~100–200 MB once, then cached by the
//            browser. Never bundled: the npm package drags in a native
//            Node runtime that is useless here and breaks installs.
//
// Both end the same way: trimmed to the subject, checked to be plausibly
// "one thing" (not empty, not the whole frame), returned as a PNG.

export type CutResult = { blob: Blob; width: number; height: number; method: 'key' | 'model'; img: HTMLImageElement }

const MAX = 1600   // longest side worked on; cut-outs are drawn at most ~1000px

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => res(i)
    i.onerror = () => rej(new Error('The photo did not load.'))
    i.src = src
  })
}

function toCanvas(img: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, w, h)
  return c
}

/**
 * Remove a plain white or green backdrop.
 * Returns null when the edges are not one plain colour — then keying would
 * eat the subject, and the model should do it instead.
 */
export function keyOut(src: HTMLCanvasElement, kind: 'white' | 'green'): HTMLCanvasElement | null {
  const w = src.width, h = src.height
  const ctx = src.getContext('2d', { willReadFrequently: true })!
  const im = ctx.getImageData(0, 0, w, h), d = im.data

  // The backdrop colour: the median of the border band.
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.02))
  const rs: number[] = [], gs: number[] = [], bs: number[] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= band && x < w - band && y >= band && y < h - band) continue
    if ((x + y) % 3) continue
    const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2])
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]
  const bg = [med(rs), med(gs), med(bs)]
  const dist = (i: number) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2])

  // Is the border actually plain? Most of it must be near the median.
  let near = 0, n = 0
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
    if (x >= band && x < w - band && y >= band && y < h - band) continue
    n++; if (dist((y * w + x) * 4) < 40) near++
  }
  if (n === 0 || near / n < 0.7) return null
  if (kind === 'white' && bg[0] + bg[1] + bg[2] < 560) return null          // greyish, not white
  if (kind === 'green' && !(bg[1] > bg[0] + 40 && bg[1] > bg[2] + 40)) return null

  // Flood from every edge pixel through backdrop-coloured pixels.
  const T1 = kind === 'white' ? 14 : 55, T2 = kind === 'white' ? 40 : 110
  const seen = new Uint8Array(w * h), stack: number[] = []
  const push = (p: number) => { if (!seen[p] && dist(p * 4) < T2) { seen[p] = 1; stack.push(p) } }
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1) }
  while (stack.length) {
    const p = stack.pop()!, x = p % w, y = (p / w) | 0
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1)
    if (y > 0) push(p - w); if (y < h - 1) push(p + w)
  }
  // Flooded pixels fade from transparent (backdrop) to opaque (edge of subject).
  for (let p = 0; p < w * h; p++) {
    if (!seen[p]) continue
    const i = p * 4, a = Math.max(0, Math.min(1, (dist(i) - T1) / (T2 - T1)))
    d[i + 3] = Math.round(d[i + 3] * a)
  }
  if (kind === 'green') {
    // Green spill on the subject's edges: pull green down to the larger of red and blue.
    for (let i = 0; i < d.length; i += 4) { const m = Math.max(d[i], d[i + 2]); if (d[i + 1] > m) d[i + 1] = m }
  }
  ctx.putImageData(im, 0, 0)
  return src
}

/** Crop to the opaque pixels and sanity-check the result. */
function trim(c: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = c.width, h = c.height, d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1, solid = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 40) { solid++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  const share = solid / (w * h)
  // Nothing left, or nothing removed: either way it is not a cut-out.
  if (x1 < 0 || share < 0.04 || share > 0.9) return null
  const pad = Math.round(Math.max(w, h) * 0.01)
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad)
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

// ------------------------------------------------------------------ model

const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/+esm'   // +esm: jsDelivr resolves its imports
// BiRefNet-lite exported at 512×512 (MIT). The 1024 export ran out of memory
// on machines without a GPU; at 512 it fits, and cut-outs are drawn at
// most ~1000px tall, where the mask is upscaled with the photo's own edges.
const MODEL = 'JONNYVERSE/birefnet-lite-512'
let segmenter: Promise<any> | null = null

/** Loaded once per page. `import()` through Function so no bundler tries to resolve a URL. */
function getSegmenter(onStatus?: (s: string) => void): Promise<any> {
  segmenter ??= (async () => {
    const tjs: any = await (new Function('u', 'return import(u)'))(TJS)
    // A GPU runs half precision (≈100 MB); the CPU path needs full (≈200 MB).
    // Either is downloaded once and then cached by the browser.
    const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator && !!(await (navigator as any).gpu.requestAdapter().catch(() => null))
    onStatus?.(`Loading the cut-out model (about ${gpu ? 100 : 200} MB the first time, then cached)…`)
    if (gpu) {
      try { return await tjs.pipeline('background-removal', MODEL, { device: 'webgpu', dtype: 'fp16' }) } catch { /* fall through to the CPU */ }
    }
    return await tjs.pipeline('background-removal', MODEL, { device: 'wasm', dtype: 'fp32' })
  })()
  segmenter.catch(() => { segmenter = null })   // let a later attempt retry
  return segmenter
}

async function modelOut(src: HTMLCanvasElement, onStatus?: (s: string) => void): Promise<HTMLCanvasElement> {
  const seg = await getSegmenter(onStatus)
  onStatus?.('Cutting out…')
  const res = await seg(src.toDataURL('image/jpeg', 0.92))
  const out = Array.isArray(res) ? res[0] : res          // one image in, one out (or a list of one)
  // The mask comes back at the photo's size with alpha; draw it at our working size.
  const c = toCanvas(out.toCanvas(), src.width, src.height)
  return c
}

// ------------------------------------------------------------------- main

/**
 * Cut the subject out of a photo. `background` is Claude's read of the
 * backdrop; keying is tried for white/green and the model for the rest, or
 * when keying fails its own checks.
 */
export async function cutOut(
  src: string, background: 'white' | 'green' | 'other', onStatus?: (s: string) => void,
): Promise<CutResult | null> {
  const img = await loadImage(src)
  const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k)

  let method: CutResult['method'] = 'key'
  let cut: HTMLCanvasElement | null = null
  if (background !== 'other') {
    const keyed = keyOut(toCanvas(img, w, h), background)
    cut = keyed && trim(keyed)
  }
  if (!cut) {
    method = 'model'
    try { cut = trim(await modelOut(toCanvas(img, w, h), onStatus)) } catch (e) {
      throw new Error(`The cut-out model could not run in this browser: ${String((e as any)?.message ?? e).slice(0, 120)}`)
    }
  }
  if (!cut) return null
  const blob: Blob = await new Promise((res, rej) => cut!.toBlob(b => (b ? res(b) : rej(new Error('Encoding the cut-out failed.'))), 'image/png'))
  const url = URL.createObjectURL(blob)
  const out = await loadImage(url)
  return { blob, width: cut.width, height: cut.height, method, img: out }
}

/** Load a finished cut-out (from the library) for drawing. */
export function loadCutout(src: string): Promise<HTMLImageElement> {
  return loadImage(src)
}
