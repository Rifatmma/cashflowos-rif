// 👉 Cash In — "Am I making profit?"
//
// The owner's brief (22 Sep 2026): open it on the phone and see profit first.
// Sales arrive once a day from the EasyEat "Dish Report Over Time" upload (the
// card on this page); each dish sold takes its recipe's stock off the shelf
// (lib/recipes.ts), so food cost is known per day, not just per shopping trip.
//
// TWO FOOD COSTS, ON PURPOSE.
//   • By recipe: what the dishes sold SHOULD have cost (recipes × latest price).
//   • By purchases: what was actually bought (Cash Out's cost of goods).
// Day to day they differ because shopping is lumpy. Over weeks, if bought stays
// above recipe, food is going somewhere other than plates -- and the weekly count
// on the Stock page says which item.
//
// Recipe cost covers the TRACKED items only (proteins, eggs, rice). Veg, sauces
// and drinks are in "by purchases", which is why that one reads higher.
import Link from 'next/link'
import { getRecords, type Rec } from '@/lib/records'
import {
  PERIODS, isPeriodKey, periodWindows, mytDate, inWin, cumulative, dayLabel, addDays, daysBetween,
} from '@/lib/period'
import { isSalesRow, salesDayOf, missingSalesDays } from '@/lib/sales'
import { getItems, getMoves, unitCosts, costOfUse, wasteBetween } from '@/lib/stock-data'
import PaceChart from '@/app/_components/PaceChart'
import UploadReport from './UploadReport'

export const dynamic = 'force-dynamic'

const FOOD_COST_TARGET_PCT = 35

const money2 = (n: number) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const plain2 = (n: number) => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const strip = (s: string) => String(s || '').replace(/[฀-๿]+/g, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim()

// Cash Out's rule: owner's drawings are money out, but not business spending.
function drawingsOf(r: Rec): number {
  const split = r.meta?.type_split as Record<string, number> | undefined
  if (split && typeof split === 'object' && Object.keys(split).length) return Number(split.owner_drawings) || 0
  return r.meta?.expense_type === 'owner_drawings' ? Number(r.amount || 0) : 0
}
function cogsOf(r: Rec): number {
  const split = r.meta?.type_split as Record<string, number> | undefined
  if (split && typeof split === 'object' && Object.keys(split).length)
    return Object.entries(split).filter(([k]) => k.startsWith('cogs_')).reduce((t, [, v]) => t + (Number(v) || 0), 0)
  return String(r.meta?.expense_type || '').startsWith('cogs_') ? Number(r.amount || 0) : 0
}
const spendDate = (r: Rec) => r.due_date || mytDate(r.created_at)

export default async function CashIn({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams
  const today = mytDate()
  const W = periodWindows(isPeriodKey(p) ? p : 'month', today)

  const [all, items, moves] = await Promise.all([getRecords(), getItems(), getMoves()])
  const costs = unitCosts(moves, items)
  const estimated = items.filter(i => costs[i.key]?.estimated).map(i => i.name)

  const salesRows = all.filter(isSalesRow)
  const cur = salesRows.filter(r => inWin(salesDayOf(r), W.current))
  const cmp = salesRows.filter(r => inWin(salesDayOf(r), W.compareToDate))

  const sum = (rs: Rec[]) => rs.reduce((t, r) => t + Number(r.amount || 0), 0)
  const recipeCost = (rs: Rec[]) => rs.reduce((t, r) => t + costOfUse(r.meta?.usage, costs), 0)

  // ---- the headline: profit after food (by recipe) ---------------------------
  const sales = sum(cur)
  const food = recipeCost(cur)
  const profit = sales - food
  const foodPct = sales > 0 ? (food / sales) * 100 : null
  const profitBefore = sum(cmp) - recipeCost(cmp)
  const delta = cmp.length && profitBefore > 0 ? ((profit - profitBefore) / profitBefore) * 100 : null

  // ---- after ALL spending -------------------------------------------------------
  const spendRows = all.filter(r => r.category === 'cash_out' && inWin(spendDate(r), W.current))
  const spent = spendRows.reduce((t, r) => t + Number(r.amount || 0) - drawingsOf(r), 0)
  const bought = spendRows.reduce((t, r) => t + cogsOf(r), 0)
  const net = sales - spent
  const boughtPct = sales > 0 ? (bought / sales) * 100 : null

  // ---- pace -------------------------------------------------------------------------
  const perDay = (win: { start: string; end: string }) => {
    const m = new Map<string, number>()
    for (const r of salesRows) {
      const d = salesDayOf(r)
      if (inWin(d, win)) m.set(d, (m.get(d) ?? 0) + Number(r.amount || 0))
    }
    return m
  }
  const curLine = cumulative(perDay(W.current), W.current, W.live ? W.elapsedDays : undefined)
  const cmpLine = cumulative(perDay(W.compareFull), W.compareFull)
  const hasCmp = (cmpLine.at(-1) ?? 0) > 0
  const cmpNoun = W.key === 'month' ? 'last month' : W.key === 'week' ? 'last week' : W.key === 'last' ? W.compareLabel : 'the 3 months before'

  // ---- days on record -------------------------------------------------------------
  const days = [...new Set(cur.map(salesDayOf))].sort().reverse()
  // Today's sales only exist after closing (11 pm), so "missing" runs to YESTERDAY,
  // and never counts days before the first report was ever uploaded.
  const yesterday = addDays(today, -1)
  const missing = missingSalesDays(salesRows, yesterday).filter(d => inWin(d, W.current))
  const firstDay = salesRows.map(salesDayOf).filter(Boolean).sort()[0]
  const expectFrom = firstDay && firstDay > W.current.start ? firstDay : W.current.start
  const expectTo = W.current.end < yesterday ? W.current.end : yesterday
  const expectedDays = firstDay && expectTo >= expectFrom ? daysBetween(expectFrom, expectTo) + 1 : 0
  const daysIn = days.filter(d => d <= expectTo).length
  const latest = [...salesRows].sort((a, b) => salesDayOf(b).localeCompare(salesDayOf(a)))[0]
  const latestUnmatched = (latest?.meta?.unmatched ?? []) as { name: string; variation: string; qty: number }[]

  // ---- dishes: what each earns after its tracked ingredients -----------------------
  type Dish = { name: string; qty: number; revenue: number; cost: number; tracked: boolean }
  const dishes = new Map<string, Dish>()
  for (const r of cur) {
    for (const l of (r.meta?.lines ?? []) as any[]) {
      const name = strip(l.name)
      const d = dishes.get(name) ?? { name, qty: 0, revenue: 0, cost: 0, tracked: false }
      d.qty += Number(l.qty) || 0
      d.revenue += Number(l.total) || 0
      const c = costOfUse(l.each, costs) * (Number(l.qty) || 0)
      d.cost += c
      d.tracked ||= l.status === 'deducted'
      dishes.set(name, d)
    }
  }
  const food_dishes = [...dishes.values()].filter(d => d.tracked && d.revenue > 0)
  const byProfit = [...food_dishes].sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost))
  const byMargin = [...food_dishes].filter(d => d.qty >= 1)
    .sort((a, b) => (a.revenue - a.cost) / a.revenue - (b.revenue - b.cost) / b.revenue)
  const maxProfit = Math.max(...byProfit.map(d => d.revenue - d.cost), 1)

  // ---- waste gap from weekly counts --------------------------------------------------
  const waste = wasteBetween(moves, costs, W.current.start, W.current.end)
  const wasteRm = Object.values(waste).reduce((t, w) => t + w.rm, 0)
  const hasWasteData = Object.keys(waste).length > 0

  const periodWord = W.key === 'month' ? 'this month' : W.key === 'week' ? 'this week' : W.key === 'last' ? `in ${W.label}` : 'in the last 3 months'

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">Cash in</h1>
        <details className="co-period">
          <summary className="mono">{W.label} <span aria-hidden="true">▾</span></summary>
          <div className="co-period-menu">
            {PERIODS.map(opt => (
              <Link key={opt.key} href={`/cash-in?p=${opt.key}`} className={opt.key === W.key ? 'on' : undefined}>{opt.label}</Link>
            ))}
          </div>
        </details>
      </div>

      {(missing.length > 0 || latestUnmatched.length > 0) && (
        <div className="co-needs" role="status">
          <span aria-hidden="true">●</span>
          {missing.length > 0 && <a href="#upload">Sales missing for {missing.map(d => dayLabel(d, today)).join(', ')}</a>}
          {latestUnmatched.length > 0 && <Link href="/stock/recipes">{latestUnmatched.length} dish{latestUnmatched.length === 1 ? '' : 'es'} need a recipe</Link>}
        </div>
      )}

      {/* ── the headline ───────────────────────────────────────────────── */}
      <section className="co-card co-hero">
        <div className="eyebrow">Profit after food {periodWord}</div>
        {cur.length === 0 ? (
          <>
            <div className="co-big num">—</div>
            <p className="co-sub">No sales on record {periodWord} yet. Upload tonight&rsquo;s EasyEat report below and this fills in.</p>
          </>
        ) : (
          <>
            <div className="co-big num">{money2(profit)}</div>
            <p className="co-sub">
              <span className="num">{money2(sales)}</span> sales − <span className="num">{money2(food)}</span> food by recipe
              {delta !== null && (
                <>
                  {' '}·{' '}
                  <span className={delta >= 0 ? 'co-down' : 'co-up'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%</span>{' '}
                  vs {W.compareLabel}
                </>
              )}
            </p>
            {foodPct !== null && (
              <>
                <div className="co-track" aria-hidden="true" style={{ marginTop: 12 }}>
                  <div className="co-fill" style={{ width: `${Math.min(foodPct, 100)}%`, background: foodPct > FOOD_COST_TARGET_PCT ? 'var(--bad)' : 'var(--green)' }} />
                  <div className="co-target" style={{ left: `${FOOD_COST_TARGET_PCT}%` }} />
                </div>
                <p className="co-sub" style={{ marginTop: 6 }}>
                  Food cost <b className="num">{foodPct.toFixed(0)}%</b> by recipe · target {FOOD_COST_TARGET_PCT}%
                  {' '}· proteins, eggs &amp; rice only
                </p>
              </>
            )}
            <PaceChart cur={curLine} cmp={cmpLine} W={W} hasCmp={hasCmp} what="sales" />
            <div className="co-legend">
              <span><i className="co-key co-key-cur" /> sales {W.live ? 'so far' : W.label}</span>
              {hasCmp
                ? <span><i className="co-key co-key-cmp" /> {cmpNoun}</span>
                : <span>{cmpNoun[0].toUpperCase() + cmpNoun.slice(1)}&rsquo;s line appears once it&rsquo;s on record</span>}
            </div>
            {daysIn < expectedDays && (
              <p className="co-sub co-flag">Sales are in for {daysIn} of {expectedDays} days since you started uploading.</p>
            )}
          </>
        )}
      </section>

      {/* ── upload ────────────────────────────────────────────────────────── */}
      <section className="co-card" id="upload">
        <div className="co-row" style={{ marginBottom: 8 }}>
          <span className="eyebrow">Upload sales</span>
          {latest && <span className="co-dim">last filed {dayLabel(salesDayOf(latest), today).toLowerCase()}</span>}
        </div>
        <UploadReport today={today} />
        <p className="co-meta" style={{ marginTop: 10 }}>
          Grab &amp; Foodpanda weekly reports: coming next. Send me one export of each and I&rsquo;ll add them here.
        </p>
      </section>

      {cur.length > 0 && (
      <div className="co-pair">
        {/* ── after everything ──────────────────────────────────────────── */}
        <section className="co-card">
          <div className="eyebrow" style={{ marginBottom: 6 }}>After all spending</div>
          <div className={`co-mid num ${net < 0 ? 'co-up' : ''}`}>{money2(net)}</div>
          <p className="co-sub">
            Sales <span className="num">{money2(sales)}</span> − everything in <Link href={`/cash-out?p=${W.key}`}>Cash Out</Link>{' '}
            <span className="num">{money2(spent)}</span>{' '}(owner&rsquo;s drawings left out).
          </p>
          <p className="co-meta">Rent, salaries and bills count here only once they&rsquo;re filed in Cash Out.</p>
        </section>

        {/* ── food cost two ways ─────────────────────────────────────────── */}
        <section className="co-card">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Food cost, two ways</div>
          <div className="co-row"><span>By recipe (what dishes should cost)</span><span className="num">{foodPct === null ? '—' : `${foodPct.toFixed(0)}%`}</span></div>
          <div className="co-row" style={{ marginTop: 6 }}><span>By purchases (what you bought)</span><span className="num">{boughtPct === null ? '—' : `${boughtPct.toFixed(0)}%`}</span></div>
          <p className="co-sub">
            Purchases include veg, sauces and drinks, so they always read higher, and a big shopping day spikes them.
            Watch the weekly count on <Link href="/stock">Stock</Link> for the real gap.
          </p>
          {hasWasteData ? (
            <p className={`co-sub ${wasteRm > 0 ? 'co-flag' : ''}`}>
              Weekly counts {periodWord}: <span className="num">{money2(Math.abs(wasteRm))}</span>{' '}
              {wasteRm > 0 ? 'of stock missing against the book' : 'more on the shelf than the book expected'}.
            </p>
          ) : (
            <p className="co-meta">The missing-stock figure appears after your second weekly count.</p>
          )}
        </section>
      </div>
      )}

      {/* ── dishes ────────────────────────────────────────────────────────── */}
      {byProfit.length > 0 && (
        <section className="co-card">
          <div className="co-row" style={{ marginBottom: 8 }}>
            <span className="eyebrow">What earns most</span>
            <span className="co-dim">after tracked ingredients</span>
          </div>
          {byProfit.slice(0, 6).map(d => (
            <div key={d.name} className="co-bar">
              <div className="co-row">
                <span>{d.name}<span className="co-dim"> · {d.qty} sold</span></span>
                <span className="num">{plain2(d.revenue - d.cost)}</span>
              </div>
              <div className="co-track" aria-hidden="true">
                <div className="co-fill" style={{ width: `${Math.max(2, ((d.revenue - d.cost) / maxProfit) * 100)}%`, background: 'var(--green)' }} />
              </div>
            </div>
          ))}
          <details className="co-more">
            <summary>Thinnest margins</summary>
            <ul className="co-lines">
              {byMargin.slice(0, 6).map(d => (
                <li key={d.name}>
                  <span>{d.name}<span className="co-dim"> · ingredients {money2(d.cost / d.qty)} of {money2(d.revenue / d.qty)}</span></span>
                  <span className="num">{(((d.revenue - d.cost) / d.revenue) * 100).toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          </details>
          <p className="co-meta">
            Profit per dish = its price minus its proteins, eggs and rice at your latest prices. Veg, sauces and gas aren&rsquo;t in it.
          </p>
        </section>
      )}

      {/* ── days ──────────────────────────────────────────────────────────── */}
      {cur.length > 0 && (
        <details className="co-card co-fold">
          <summary>
            <span>Day by day</span>
            <span className="co-dim num">{days.length} day{days.length === 1 ? '' : 's'}</span>
          </summary>
          <ul className="co-lines">
            {[...cur].sort((a, b) => salesDayOf(b).localeCompare(salesDayOf(a))).map(r => {
              const f = costOfUse(r.meta?.usage, costs)
              const s = Number(r.amount || 0)
              return (
                <li key={r.id}>
                  <span>
                    {dayLabel(salesDayOf(r), today)}
                    <span className="co-dim"> · {r.meta?.qty ?? '—'} items{r.meta?.sets_sold ? ` · ${r.meta.sets_sold} sets` : ''} · food {s ? ((f / s) * 100).toFixed(0) : '—'}%</span>
                  </span>
                  <span className="num">{plain2(s)}</span>
                </li>
              )
            })}
          </ul>
        </details>
      )}

      {cur.length > 0 && estimated.length > 0 && (
        <p className="co-meta" style={{ marginTop: 12 }}>
          Estimated prices until a receipt shows the real one: {estimated.join(', ')}.
        </p>
      )}
    </div>
  )
}
