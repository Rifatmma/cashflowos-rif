// The pace chart shared by Cash Out (spending) and Cash In (sales). Plain SVG,
// drawn on the server: no chart library, nothing to download on a phone. The
// current period builds up as a solid Pandan line; the same period last time sits
// behind it dashed, so "faster or slower than usual?" is answered by which line
// is higher -- no reading required.
import { shortDate, type PeriodWindows } from '@/lib/period'

const money2 = (n: number) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PaceChart({ cur, cmp, W, hasCmp, what = 'business spending' }: {
  cur: number[]; cmp: number[]; W: PeriodWindows; hasCmp: boolean; what?: string
}) {
  // The SVG is stretched to the card's width (preserveAspectRatio="none") so the
  // lines always span it -- but stretching distorts anything round or written.
  // So the SVG draws ONLY lines (with non-scaling strokes), and the end dot and
  // day labels sit on top as ordinary HTML, positioned by percentage.
  const w = 600, h = 150, top = 10, bottom = 3
  const n = Math.max(W.axisDays, 2)
  const maxY = Math.max(cur.at(-1) ?? 0, hasCmp ? (cmp.at(-1) ?? 0) : 0, 1) * 1.12
  const xPct = (i: number) => (i / (n - 1)) * 100
  const yPct = (v: number) => ((top + (1 - v / maxY) * (h - top - bottom)) / h) * 100
  const pts = (a: number[]) =>
    a.map((v, i) => `${((xPct(i) / 100) * w).toFixed(1)},${((yPct(v) / 100) * h).toFixed(1)}`).join(' ')
  const last = cur.length - 1

  const tick = (i: number) => {
    if (W.key === '3m') return shortDate(new Date(Date.parse(W.current.start + 'T12:00:00Z') + i * 86_400_000).toISOString().slice(0, 10))
    if (W.key === 'week') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]
    return String(i + 1)
  }
  const ticks = W.key === 'week' ? [0, 3, 6] : [0, Math.round((n - 1) / 2), n - 1]

  const summary =
    `Running total of ${what}: ${money2(cur.at(-1) ?? 0)} so far` +
    (hasCmp ? `, against ${money2(cmp.at(-1) ?? 0)} for the whole comparison period.` : '.')

  return (
    <div className="co-chart-wrap" role="img" aria-label={summary}>
      <div className="co-plot">
        <svg className="co-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2={w} y1={h - bottom} y2={h - bottom} stroke="var(--line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {hasCmp && cmp.length > 1 && (
            <polyline points={pts(cmp)} fill="none" stroke="var(--ink-faint)" strokeWidth="1.5"
              strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
          )}
          {cur.length > 1 && (
            <polyline points={pts(cur)} fill="none" stroke="var(--green)" strokeWidth="2.75"
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {cur.length > 0 && (
          <span className="co-dot" style={{ left: `${xPct(last)}%`, top: `${yPct(cur[last])}%` }} aria-hidden="true" />
        )}
      </div>
      <div className="co-ticks mono" aria-hidden="true">
        {ticks.map((i, k) => (
          <span key={i} style={{ left: `${xPct(i)}%` }}
            className={k === 0 ? 'first' : k === ticks.length - 1 ? 'last' : undefined}>{tick(i)}</span>
        ))}
      </div>
    </div>
  )
}
