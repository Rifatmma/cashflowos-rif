// 👉 A small icon set, drawn rather than imported.
//
// The explainer said "billboards, transit screens, mall displays" and showed
// two lines of abstract text. Three named things should arrive as three
// things — that is most of what makes an explainer feel like it is
// explaining rather than captioning.
//
// Every icon is built in a 100×100 space and stroked, so one line weight
// governs the whole set and they scale to any size without a raster. They
// are deliberately plain: an icon beside a headline is read in about a
// third of a second, and detail at that speed is noise.
//
// Each takes a `k` from 0 to 1 and draws itself progressively, because an
// icon that pops is a sticker and one that draws itself is motion design.

export type IconName =
  | 'billboard' | 'transit' | 'mall' | 'target' | 'bolt' | 'chart'
  | 'cursor' | 'people' | 'clock' | 'check' | 'screen' | 'pin'

type Seg = [number, number][]

/** Each icon as polylines in a 100×100 box, plus any circles. */
const SHAPES: Record<IconName, { lines: Seg[]; dots?: [number, number, number][] }> = {
  // A roadside hoarding: a WIDE panel on two splayed legs.
  //
  // The first attempt was a near-square panel on a single centred stem,
  // which is a computer monitor. An outdoor billboard reads as billboard
  // because it is much wider than it is tall and stands on two legs.
  billboard: {
    lines: [
      [[6, 20], [94, 20], [94, 56], [6, 56], [6, 20]],
      [[30, 56], [22, 94]],
      [[70, 56], [78, 94]],
      [[16, 76], [84, 76]],
      [[18, 32], [66, 32]],
      [[18, 44], [48, 44]],
    ],
  },
  // A train, seen head on: rounded roof, windscreen, headlights, track.
  //
  // Was a laptop-shaped box. "Transit" in out-of-home means trains, metros
  // and buses, and an icon labelled TRANSIT has to be one of those.
  transit: {
    lines: [
      [[22, 82], [22, 30], [30, 14], [70, 14], [78, 30], [78, 82], [22, 82]],
      [[30, 30], [70, 30], [70, 52], [30, 52], [30, 30]],
      [[22, 64], [78, 64]],
      [[32, 88], [32, 94]],
      [[68, 88], [68, 94]],
      [[10, 94], [90, 94]],
    ],
    dots: [[34, 73, 4], [66, 73, 4]],
  },
  // A shopping bag. Unambiguous at any size, which a storefront is not —
  // the previous one was read as a house, because that is what a gable
  // over a box looks like.
  mall: {
    lines: [
      [[18, 34], [82, 34], [88, 92], [12, 92], [18, 34]],
      [[36, 44], [36, 24], [64, 24], [64, 44]],
    ],
  },
  target: {
    lines: [[[50, 10], [50, 22]], [[50, 78], [50, 90]], [[10, 50], [22, 50]], [[78, 50], [90, 50]]],
    dots: [[50, 50, 30], [50, 50, 16], [50, 50, 5]],
  },
  bolt: {
    lines: [[[58, 8], [26, 54], [48, 54], [42, 92], [76, 44], [54, 44], [58, 8]]],
  },
  chart: {
    lines: [
      [[14, 88], [86, 88]],
      [[14, 88], [14, 16]],
      [[28, 72], [28, 88]],
      [[46, 52], [46, 88]],
      [[64, 60], [64, 88]],
      [[82, 30], [82, 88]],
      [[28, 66], [46, 44], [64, 52], [82, 22]],
    ],
  },
  // A pointer over a panel: bought by machine.
  cursor: {
    lines: [
      [[16, 18], [72, 18], [72, 58], [16, 58], [16, 18]],
      [[52, 50], [52, 92], [63, 80], [72, 96], [80, 91], [71, 76], [86, 74], [52, 50]],
    ],
  },
  people: {
    lines: [
      [[20, 86], [20, 72], [44, 64], [44, 86]],
      [[56, 86], [56, 68], [80, 60], [80, 86]],
    ],
    dots: [[32, 44, 13], [68, 38, 13]],
  },
  clock: {
    lines: [[[50, 28], [50, 52], [68, 62]]],
    dots: [[50, 52, 38]],
  },
  check: {
    lines: [[[22, 52], [42, 72], [80, 28]]],
    dots: [[50, 50, 42]],
  },
  screen: {
    lines: [
      [[10, 20], [90, 20], [90, 68], [10, 68], [10, 20]],
      [[40, 68], [40, 84]], [[60, 68], [60, 84]], [[30, 84], [70, 84]],
    ],
  },
  pin: {
    lines: [[[50, 92], [50, 92], [22, 54], [22, 40], [50, 12], [78, 40], [78, 54], [50, 92]]],
    dots: [[50, 42, 13]],
  },
}

export const ICON_NAMES = Object.keys(SHAPES) as IconName[]

/**
 * Draw an icon, optionally mid-draw.
 *
 * `k` reveals the strokes in order, so an icon assembles the way someone
 * would sketch it. Circles scale from their centre rather than being
 * revealed, because a partially drawn circle reads as a mistake.
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: IconName,
  x: number, y: number, size: number,
  colour: string,
  k = 1,
  weight = 7,
) {
  const sh = SHAPES[name]
  if (!sh || k <= 0) return
  const s = size / 100
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.strokeStyle = colour
  ctx.lineWidth = weight
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Strokes are revealed across the whole icon, not per segment, so the
  // drawing has one continuous pace instead of stalling between parts.
  const totalLen = sh.lines.reduce((n, seg) => n + segLen(seg), 0)
  let used = 0
  for (const seg of sh.lines) {
    const len = segLen(seg)
    const from = used / totalLen
    const to = (used + len) / totalLen
    used += len
    const local = (k - from) / (to - from)
    if (local <= 0) continue
    ctx.save()
    ctx.setLineDash([len, len])
    ctx.lineDashOffset = len * (1 - Math.min(1, local))
    ctx.beginPath()
    ctx.moveTo(seg[0][0], seg[0][1])
    for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i][0], seg[i][1])
    ctx.stroke()
    ctx.restore()
  }

  for (const [cx, cy, r] of sh.dots ?? []) {
    const grow = Math.max(0, Math.min(1, (k - 0.25) / 0.6))
    if (grow <= 0) continue
    ctx.beginPath()
    ctx.arc(cx, cy, r * grow, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function segLen(seg: Seg): number {
  let n = 0
  for (let i = 1; i < seg.length; i++) {
    n += Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1])
  }
  return n || 1
}

/**
 * A labelled icon, for a row of named things.
 *
 * The label sits under the icon and shares its progress, so the pair
 * arrives as one object rather than two that happen to be near each other.
 */
export function drawIconLabel(
  ctx: CanvasRenderingContext2D,
  name: IconName, label: string,
  cx: number, cy: number, size: number,
  colour: string, textColour: string,
  k: number, font: string, weight = 7,
) {
  if (k <= 0) return
  ctx.save()
  ctx.globalAlpha *= Math.min(1, k * 1.6)
  drawIcon(ctx, name, cx - size / 2, cy - size / 2, size, colour, k, weight)
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.fillStyle = textColour
  ctx.fillText(label, cx, cy + size * 0.82)
  ctx.restore()
}
