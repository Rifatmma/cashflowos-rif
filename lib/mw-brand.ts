import { MW_MARK, MW_CHEVRON, MW_WAVE_UNIT, MW_WAVE_OUTLINE } from './mw-brand-assets'

// 👉 Drawing the brand's own graphic elements.
//
// The raw artwork lives in mw-brand-assets.ts (read out of the guide's PDF
// operators) and mw-brand-dots.ts (the constellation from p19). This is the
// layer that puts them on a canvas: the wave band, the chevron, the mark,
// and the connection-dots mesh — each in any of the brand's colourways and
// each able to animate, because a showreel needs them to.
//
// Three things from the guide drive the design here:
//
//   p11  the two blue gradients, derived from the logo itself
//   p12  Crimson Blend, Sunburst and Emerald Wave as supporting families
//   p16  "Special Event" colourways, which add pink, orange and teal
//
// The band ALTERNATES a filled unit with an outline one. That alternation
// is the pattern; a row of identical units is just a zigzag, which is what
// the first version of this drew and why it never looked like the brand.

export type Rgb = string

export type Colourway = {
  id: string
  name: string
  /** Large areas. Two stops, as the guide specifies gradients. */
  field: [Rgb, Rgb]
  /** The wave and other graphic elements against a dark field. */
  onDark: [Rgb, Rgb]
  /** The same against a light field. */
  onLight: [Rgb, Rgb]
}

/**
 * The colourways, straight from the guide's hex values.
 *
 * Blue is the brand. The rest are supporting families (p12) and the Special
 * Event palette (p15–16) — the guide allows them for the graphic elements
 * while the logo, the typeface and the motifs stay fixed, which is exactly
 * what makes them safe to offer as a theme choice.
 */
export const COLOURWAYS: Colourway[] = [
  {
    id: 'blue', name: 'Moving Walls blue',
    field: ['#2554A2', '#1B1E2B'],
    onDark: ['#66C9F3', '#BFE7FB'],
    onLight: ['#2554A2', '#66C9F3'],
  },
  {
    id: 'crimson', name: 'Crimson Blend',
    field: ['#871A1C', '#1B1E2B'],
    onDark: ['#E03A36', '#EE2E2D'],
    onLight: ['#871A1C', '#E03A36'],
  },
  {
    id: 'sunburst', name: 'Sunburst',
    field: ['#F59222', '#871A1C'],
    onDark: ['#FEDA24', '#FFDF40'],
    onLight: ['#F59222', '#FEDA24'],
  },
  {
    id: 'emerald', name: 'Emerald Wave',
    field: ['#25534A', '#1B1E2B'],
    onDark: ['#4BEF6E', '#6DDF6A'],
    onLight: ['#25534A', '#6DDF6A'],
  },
  // ── Special Event (p15–16) ──────────────────────────────────────────────
  {
    id: 'magenta', name: 'Event · Magenta',
    field: ['#8C0786', '#1B1E2B'],
    onDark: ['#F22CD0', '#B83280'],
    onLight: ['#8C0786', '#F22CD0'],
  },
  {
    id: 'orange', name: 'Event · Orange',
    field: ['#F04923', '#1B1E2B'],
    onDark: ['#FAA41C', '#FFA500'],
    onLight: ['#F04923', '#FAA41C'],
  },
  {
    id: 'teal', name: 'Event · Teal',
    field: ['#007876', '#1B1E2B'],
    onDark: ['#00E3E3', '#56C5CF'],
    onLight: ['#007876', '#009291'],
  },
]

export const colourway = (id: string | undefined): Colourway =>
  COLOURWAYS.find(c => c.id === id) ?? COLOURWAYS[0]

// Path2D is a browser GLOBAL but an IMPORT in @napi-rs/canvas, and this
// module has to run in both. Rather than branch on the environment — which
// would pull a native module into the browser bundle — the constructor is
// injectable: the browser's global is picked up automatically, and a node
// script passes canvas's own in.
type P2D = Path2D
type P2DCtor = new (d: string) => P2D

let Ctor: P2DCtor | null = (globalThis as any).Path2D ?? null

/** Node entry points call this once with @napi-rs/canvas's Path2D. */
export function usePath2D(impl: P2DCtor) {
  Ctor = impl
  cache = {}
}

const makePath = (d: string): P2D => {
  if (!Ctor) {
    throw new Error(
      'No Path2D available. In node, import { Path2D } from "@napi-rs/canvas" and call usePath2D(Path2D).',
    )
  }
  return new Ctor(d)
}

let cache: { mark?: P2D; wave?: P2D; waveOutline?: P2D; chevrons?: P2D[] } = {}

/** Path2D objects are immutable once built, so build each one once. */
function paths() {
  if (!cache.mark) {
    cache = {
      mark: makePath(MW_MARK.d),
      wave: makePath(MW_WAVE_UNIT.d),
      waveOutline: makePath(MW_WAVE_OUTLINE.d),
      chevrons: MW_CHEVRON.ds.map(makePath),
    }
  }
  return cache as Required<typeof cache>
}

/**
 * The MW mark.
 *
 * One shape. Its light-to-dark look is a gradient across it, not separate
 * coloured strokes — which is why the guide can also show it as solid
 * white on navy without anything else changing.
 */
export function drawMark(
  ctx: CanvasRenderingContext2D, x: number, y: number, width: number,
  fill: string | CanvasGradient,
) {
  const s = width / MW_MARK.w
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = fill
  ctx.fill(paths().mark)
  ctx.restore()
}

export const markHeight = (width: number) => (width / MW_MARK.w) * MW_MARK.h

/** The mark's own gradient, sampled from the guide. */
export function markGradient(
  ctx: CanvasRenderingContext2D, x: number, y: number, width: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x + width, y)
  g.addColorStop(0, '#55BFEA')
  g.addColorStop(0.45, '#1B64B3')
  g.addColorStop(1, '#1C212F')
  return g
}

/** The triple chevron that precedes a heading. */
export function drawChevron(
  ctx: CanvasRenderingContext2D, x: number, y: number, width: number, fill: string | CanvasGradient,
) {
  const s = width / MW_CHEVRON.w
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = fill
  for (const p of paths().chevrons) ctx.fill(p)
  ctx.restore()
}

export const chevronHeight = (width: number) => (width / MW_CHEVRON.w) * MW_CHEVRON.h

export type BandOpts = {
  /** Unit height in px; the width follows from the artwork's ratio. */
  height: number
  colours: [Rgb, Rgb]
  /** 0..1 — how much of the band has arrived, for animating it in. */
  reveal?: number
  alpha?: number
  /** Shifts the tiling, so a band can drift sideways over time. */
  offset?: number
}

/**
 * A band of the wave, tiled across a width.
 *
 * Filled and outline units alternate, which is the actual pattern in the
 * guide. `reveal` lets the band draw on unit by unit rather than appearing
 * whole — the difference between a motif and a motion graphic.
 */
export function drawWaveBand(
  ctx: CanvasRenderingContext2D, x: number, y: number, width: number, o: BandOpts,
) {
  const s = o.height / MW_WAVE_UNIT.h
  const unitW = MW_WAVE_UNIT.w * s
  const n = Math.ceil(width / unitW) + 2
  const reveal = o.reveal ?? 1
  const shown = n * Math.max(0, Math.min(1, reveal))
  const off = ((o.offset ?? 0) % unitW) - unitW

  ctx.save()
  ctx.globalAlpha *= o.alpha ?? 1
  ctx.beginPath()
  ctx.rect(x, y, width, o.height)
  ctx.clip()
  for (let i = 0; i < n; i++) {
    if (i >= shown) break
    // A unit arriving mid-reveal fades rather than popping into place.
    const edge = Math.min(1, shown - i)
    ctx.save()
    ctx.globalAlpha *= edge
    ctx.translate(x + off + i * unitW, y)
    ctx.scale(s, s)
    ctx.fillStyle = o.colours[i % 2]
    ctx.fill(i % 2 === 0 ? paths().wave : paths().waveOutline)
    ctx.restore()
  }
  ctx.restore()
}

export const bandUnitWidth = (height: number) => (height / MW_WAVE_UNIT.h) * MW_WAVE_UNIT.w

export type DotsOpts = {
  colours: [Rgb, Rgb]
  /** How near two nodes must be, in units of the box's width, to be joined. */
  link?: number
  /** 0..1 — edges knit together, then nodes arrive. */
  reveal?: number
  alpha?: number
  /** Seconds, for the slow drift. Omit to hold still. */
  time?: number
  /** Roughly how many nodes across the box. Higher is denser. */
  density?: number
  /** Changes the arrangement without changing its character. */
  seed?: number
}

/**
 * Deterministic noise. Not Math.random, because every frame of a render
 * must produce the same field — a constellation that reshuffles 30 times a
 * second is static, not animation.
 */
function rnd(i: number, seed: number): number {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * The node field.
 *
 * NOT the point cloud extracted from page 19, and that is a deliberate
 * reversal. The guide draws this graphic as 4,830 fixed vector paths, and
 * pulling node positions out of them produced fragments of the mesh's own
 * edges rather than its nodes: filtered hard enough to exclude those, what
 * survived was a sparse, clumped cloud that looked nothing like the even
 * triangulated field on the page.
 *
 * A jittered grid reproduces that field exactly — even coverage, local
 * clustering, no holes — and unlike a fixed cloud it fills any aspect
 * ratio, scales to any size, and can drift. The brand value of this
 * element is "interconnected nodes", not one particular arrangement of
 * them, which the guide itself demonstrates by showing four different
 * arrangements on the same page.
 */
function field(w: number, h: number, density: number, seed: number) {
  const cols = Math.max(3, Math.round(density))
  const rows = Math.max(3, Math.round((density * h) / w))
  const cw = w / cols, ch = h / rows
  const pts: { x: number; y: number; r: number }[] = []
  for (let gy = 0; gy <= rows; gy++) {
    for (let gx = 0; gx <= cols; gx++) {
      const i = gy * (cols + 1) + gx
      pts.push({
        // Jitter up to 70% of a cell: enough to break the grid, not enough
        // to leave gaps.
        x: (gx + (rnd(i, seed) - 0.5) * 0.7) * cw,
        y: (gy + (rnd(i + 7919, seed) - 0.5) * 0.7) * ch,
        r: 0.45 + rnd(i + 104729, seed) * 0.8,
      })
    }
  }
  return pts
}

/**
 * The connection-dots mesh.
 *
 * Edges are rebuilt by proximity every frame, so they stay correct while
 * the nodes drift. The drift is a pair of sine waves per node rather than
 * a simulation: it only has to look alive, and a simulation would not be
 * reproducible frame to frame, which the encoder depends on.
 */
export function drawDots(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: DotsOpts,
) {
  const reveal = Math.max(0, Math.min(1, o.reveal ?? 1))
  if (reveal <= 0) return
  const t = o.time ?? 0
  const seed = o.seed ?? 1
  const link = (o.link ?? 0.145) * w

  const base = field(w, h, o.density ?? 11, seed)
  const nodes = base.map((d, i) => ({
    x: x + d.x + Math.sin(t * 0.42 + i * 1.7) * w * 0.008,
    y: y + d.y + Math.cos(t * 0.37 + i * 2.3) * h * 0.008,
    r: d.r,
  }))

  // Knit outward from the top-left so the mesh assembles rather than
  // switching on.
  const order = (n: { x: number; y: number }) =>
    ((n.x - x) / w) * 0.55 + ((n.y - y) / h) * 0.45

  ctx.save()
  // The jittered grid runs a little past its box by design, so that the
  // mesh has no thinned edge. Clipping is what keeps that off the layout.
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.globalAlpha *= (o.alpha ?? 1) * 0.42
  ctx.strokeStyle = o.colours[0]
  ctx.lineWidth = Math.max(0.7, w * 0.0011)
  const edgeReveal = Math.min(1, reveal / 0.75)
  ctx.beginPath()
  for (let i = 0; i < nodes.length; i++) {
    if (order(nodes[i]) > edgeReveal) continue
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y
      if (Math.abs(dx) > link || Math.abs(dy) > link) continue
      if (Math.hypot(dx, dy) > link) continue
      if (order(nodes[j]) > edgeReveal) continue
      ctx.moveTo(nodes[i].x, nodes[i].y)
      ctx.lineTo(nodes[j].x, nodes[j].y)
    }
  }
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.globalAlpha *= o.alpha ?? 1
  ctx.fillStyle = o.colours[1]
  const nodeReveal = Math.max(0, (reveal - 0.2) / 0.8)
  for (const n of nodes) {
    const k = Math.max(0, Math.min(1, (nodeReveal - order(n) * 0.8) * 4))
    if (k <= 0) continue
    ctx.beginPath()
    ctx.arc(n.x, n.y, Math.max(0.9, n.r * w * 0.0032) * k, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
