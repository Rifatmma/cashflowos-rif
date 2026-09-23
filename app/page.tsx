// 👉 The Dashboard — the owner's morning read.
//
// Rebuilt 23 Sep 2026 from his own brief. He wanted all four morning numbers at
// once (last night's profit, last night against a normal night, money he
// actually has, what to buy today), profit this month as the number that says
// whether the month is going well, the full picture every day rather than
// alerts only, and the starter kit's lead funnel replaced by the ads.
//
// Every figure shows its sum. He has been burnt twice by numbers that appeared
// from nowhere ("how did a 2 kg pack become 3.84 kg?"), so nothing here is a
// bare total: break-even prints its ingredients, profit prints its subtractions.
//
// Wages and rent are paid in cash and never photographed, so Jarvis files them
// himself (lib/fixed-costs.ts) and they are in the money-out figures below just
// like any receipt.
import Link from 'next/link'
import { getRecords, type Rec } from '@/lib/records'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { mytDate, dayLabel, shortDate, addDays, daysBetween } from '@/lib/period'
import { isSalesRow, salesDayOf, missingSalesDays } from '@/lib/sales'
import { getItems, getMoves, stockState, unitCosts, costOfUse } from '@/lib/stock-data'
import { buyList, showQty } from '@/lib/stock-view'
import {
  ensureFixedFiled, getFixedHistory, costsOn, fixedPerDay, breakEvenSales,
} from '@/lib/fixed-costs'

export const dynamic = 'force-dynamic'

const rm0 = (n: number) => 'RM ' + Math.round(Number(n) || 0).toLocaleString('en-MY')
const rm2 = (n: number) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n: number) => `${Math.round(n * 100)}%`
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekdayOf = (iso: string) => WEEKDAY[new Date(iso + 'T12:00:00Z').getUTCDay()]

const spendDate = (r: Rec) => r.due_date || mytDate(r.created_at)
/** A receipt can be part food, part personal; meta.type_split holds the split. */
function splitOf(r: Rec): Record<string, number> {
  const split = r.meta?.type_split as Record<string, number> | undefined
  if (split && typeof split === 'object' && Object.keys(split).length) return split
  return { [String(r.meta?.expense_type || 'other')]: Number(r.amount || 0) }
}
const amountOfType = (r: Rec, test: (t: string) => boolean) =>
  Object.entries(splitOf(r)).filter(([t]) => test(t)).reduce((s, [, v]) => s + (Number(v) || 0), 0)

async function proposedCount(): Promise<number> {
  if (!supabaseConfigured) return 0
  const { count, error } = await supabase
    .from('agent_actions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'proposed')
    .gt('expires_at', new Date().toISOString())   // expired ones can no longer be approved
  if (error) return 0
  return count ?? 0
}

export default async function Dashboard() {
  const today = mytDate()
  // Wages for every finished day, rent for each month, never earlier than the
  // first day of sales on record. Idempotent, so a page load only fills a gap.
  let rows = await getRecords()
  const firstSalesDay = rows.filter(isSalesRow).map(salesDayOf).filter(Boolean).sort()[0]
  const auto = await ensureFixedFiled(today, firstSalesDay).catch(() => ({ filed: 0 }))
  if (auto.filed) rows = await getRecords()

  const [items, moves, history, waiting] = await Promise.all([
    getItems(), getMoves(), getFixedHistory(), proposedCount(),
  ])
  const costs = unitCosts(moves, items)

  // ── last night ────────────────────────────────────────────────────────────
  const salesRows = rows.filter(isSalesRow).sort((a, b) => salesDayOf(b).localeCompare(salesDayOf(a)))
  const foodOf = (r: Rec) =>
    ((r.meta?.lines ?? []) as any[]).reduce((t, l) => t + costOfUse(l.each, costs) * (Number(l.qty) || 0), 0)

  const last = salesRows[0]
  const lastDay = last ? salesDayOf(last) : null
  const lastSales = last ? Number(last.amount) || 0 : 0
  const lastFood = last ? foodOf(last) : 0

  const fixedToday = costsOn(history, lastDay ?? today)
  const fixedDay = fixedPerDay(fixedToday, lastDay ?? today)

  // A usual <weekday>, from the other days filed so far.
  const sameWeekday = lastDay
    ? salesRows.filter(r => salesDayOf(r) !== lastDay && weekdayOf(salesDayOf(r)) === weekdayOf(lastDay))
    : []
  const usualWeekday = sameWeekday.length
    ? sameWeekday.reduce((t, r) => t + (Number(r.amount) || 0), 0) / sameWeekday.length
    : null

  // ── this month ────────────────────────────────────────────────────────────
  // The books begin at the first day of sales on record. Counting costs from
  // before that -- receipts filed while the system was being set up -- against
  // sales that were never uploaded would invent a loss that never happened.
  const monthFrom = today.slice(0, 7) + '-01'
  const bookStart = firstSalesDay && firstSalesDay > monthFrom ? firstSalesDay : monthFrom
  const inMonth = (d: string) => d >= bookStart && d <= today
  const mSales = salesRows.filter(r => inMonth(salesDayOf(r))).reduce((t, r) => t + (Number(r.amount) || 0), 0)
  const out = rows.filter(r => r.category === 'cash_out' && inMonth(spendDate(r)))
  const group = (test: (t: string) => boolean) => out.reduce((t, r) => t + amountOfType(r, test), 0)
  const mFood = group(t => t.startsWith('cogs_') || t === 'supplies_cleaning')
  const mWages = group(t => t === 'labour')
  const mRent = group(t => t === 'rent')
  const mAds = group(t => t === 'marketing')
  const mOther = group(t => ['utilities', 'services', 'equipment', 'other', 'unclassified'].includes(t))
  const mDrawings = group(t => t === 'owner_drawings')
  const mSpend = mFood + mWages + mRent + mAds + mOther
  const mProfit = mSales - mSpend - mDrawings          // owner's rule: drawings count as a cost
  const mDays = daysBetween(bookStart, today) + 1
  const mFoodPct = mSales > 0 ? mFood / mSales : 0

  // ── money, from what is filed ─────────────────────────────────────────────
  const inAll = mSales
  const outAll = out.reduce((t, r) => t + (Number(r.amount) || 0), 0)

  // ── ads ───────────────────────────────────────────────────────────────────
  const setsSold = salesRows.filter(r => inMonth(salesDayOf(r)))
    .reduce((t, r) => t + (Number(r.meta?.sets_sold) || 0), 0)

  // ── buy today ─────────────────────────────────────────────────────────────
  const state = stockState(items, moves, today)
  const buy = buyList(state, moves, today).filter(b => b.seen && b.buy.qty > 0 && b.perDay > 0).slice(0, 5)
  const tonight = buyList(state, moves, today).filter(b => b.seen && b.short > 0 && b.perDay > 0)

  // ── waiting on you ────────────────────────────────────────────────────────
  const missing = lastDay ? missingSalesDays(salesRows, addDays(today, -1)) : []
  const needs = [
    waiting > 0 && { href: '/approvals', text: `${waiting} waiting for your YES` },
    missing.length > 0 && { href: '/cash-in', text: `${missing.length} day${missing.length === 1 ? '' : 's'} of sales not uploaded` },
    tonight.length > 0 && { href: '/stock', text: `${tonight.length} item${tonight.length === 1 ? '' : 's'} run out tonight` },
  ].filter(Boolean) as { href: string; text: string }[]

  // WHICH FOOD COST BREAK-EVEN USES.
  //   • The recipes only price the tracked items (proteins, eggs, rice), so they
  //     read far too low -- 15% of sales -- and would flatter break-even.
  //   • Actual food buying is the truth, but shopping is lumpy: three days of it
  //     says 50% one week and 20% the next.
  // So: the owner's planning figure until two weeks of days are filed, then his
  // own spending. The card says which one is in use.
  const PLANNING_FOOD_PCT = 0.35
  const enoughDays = salesRows.filter(r => inMonth(salesDayOf(r))).length >= 14
  const spentFoodPct = mSales > 0 ? mFood / mSales : PLANNING_FOOD_PCT
  const foodPct = enoughDays ? spentFoodPct : PLANNING_FOOD_PCT
  const breakEven = breakEvenSales(fixedDay, foodPct)
  const lastFoodShare = lastSales * foodPct
  const lastProfit = lastSales - lastFoodShare - fixedDay
  const above = lastSales - breakEven

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">Jaosamut</h1>
        <span className="co-dim">{dayLabel(today, today)} · open 7 days</span>
      </div>

      {/* ── last night ─────────────────────────────────────────────── */}
      <section className="co-card">
        <div className="co-row" style={{ marginBottom: 6 }}>
          <span className="eyebrow">{lastDay ? `${weekdayOf(lastDay)} · ${dayLabel(lastDay, today)}` : 'Last night'}</span>
          {lastDay && <Link href="/cash-in" className="co-dim">Cash In →</Link>}
        </div>
        {!last ? (
          <p className="co-sub" style={{ marginTop: 0 }}>
            No sales uploaded yet. <Link href="/cash-in">Upload last night&apos;s EasyEat report</Link> and this fills in.
          </p>
        ) : (
          <>
            <div className="co-hero-row">
              <span className="co-big">{rm0(lastSales)}</span>
              <span className={above >= 0 ? 'co-good' : 'co-flag'}>
                {above >= 0 ? `${rm0(above)} above break-even` : `${rm0(-above)} short of break-even`}
              </span>
            </div>
            <ul className="co-lines">
              <li><span>Sales</span><span className="num">{rm2(lastSales)}</span></li>
              <li><span>Food <span className="co-dim">({pct(foodPct)} of sales{enoughDays ? '' : ', planning figure'})</span></span><span className="num">− {rm2(lastFoodShare)}</span></li>
              <li><span>Wages, rent and the rest <span className="co-dim">(one day)</span></span><span className="num">− {rm2(fixedDay)}</span></li>
              <li className="co-total"><span>Profit for the night</span><span className="num">{rm2(lastProfit)}</span></li>
            </ul>
            <p className="co-meta">
              Break-even is {rm0(breakEven)} a night: {rm2(fixedDay)} of fixed cost divided by {pct(1 - foodPct)},
              the share of every ringgit left after food. Food is counted at {pct(foodPct)}
              {enoughDays ? ' — what you have actually been spending' : ' until two weeks of sales are filed, then it switches to what you actually spend'}.
              The recipes say last night&apos;s tracked ingredients cost {rm2(lastFood)}.
              {usualWeekday !== null
                ? ` A usual ${weekdayOf(lastDay!)} takes ${rm0(usualWeekday)}.`
                : ` Not enough ${weekdayOf(lastDay!)}s filed yet to say what a usual one takes.`}
            </p>
          </>
        )}
      </section>

      {/* ── this month ─────────────────────────────────────────────── */}
      <section className="co-card">
        <div className="co-row" style={{ marginBottom: 6 }}>
          <span className="eyebrow">
            {bookStart === monthFrom ? 'This month' : `Since ${shortDate(bookStart)}`} · {mDays} day{mDays === 1 ? '' : 's'}
          </span>
          <span className={mProfit >= 0 ? 'co-good num' : 'co-flag num'}>{rm0(mProfit)}</span>
        </div>
        <ul className="co-lines">
          <li><span>Sales</span><span className="num">{rm2(mSales)}</span></li>
          <li><span>Food and kitchen supplies <span className="co-dim">({pct(mFoodPct)} of sales)</span></span><span className="num">− {rm2(mFood)}</span></li>
          <li><span>Wages</span><span className="num">− {rm2(mWages)}</span></li>
          <li><span>Rent <span className="co-dim">(unit + staff house)</span></span><span className="num">− {rm2(mRent)}</span></li>
          <li><span>Ads</span><span className="num">− {rm2(mAds)}</span></li>
          <li><span>Everything else <span className="co-dim">(utilities, licence, POS, services)</span></span><span className="num">− {rm2(mOther)}</span></li>
          <li><span>What you took out</span><span className="num">− {rm2(mDrawings)}</span></li>
          <li className="co-total"><span>Profit this month so far</span><span className="num">{rm0(mProfit)}</span></li>
        </ul>
        <p className="co-meta">
          Wages ({rm0(fixedToday.wages_per_day)} a day), rent, POS and licence are filed automatically —
          they are paid in cash, so no receipt ever reaches Jarvis. <Link href="/settings/costs">Change a figure</Link>.
        </p>
      </section>

      {/* ── money + ads ───────────────────────────────────────────── */}
      <div className="co-two">
        <section className="co-card">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Money in minus money out</div>
          <p className="co-big" style={{ marginTop: 0 }}>{rm0(inAll - outAll)}</p>
          <p className="co-meta">
            Everything filed since {shortDate(bookStart)}: {rm0(inAll)} in, {rm0(outAll)} out.
            This is movement, not a bank balance — it does not know what was in the account before.
          </p>
        </section>
        <section className="co-card">
          <div className="co-row" style={{ marginBottom: 6 }}>
            <span className="eyebrow">Ads this month</span>
            <Link href="/ads" className="co-dim">Ads →</Link>
          </div>
          <ul className="co-lines">
            <li><span>Spend <span className="co-dim">(from the card charges filed)</span></span><span className="num">{rm2(mAds)}</span></li>
            <li><span>Sets sold</span><span className="num">{setsSold}</span></li>
            <li className="co-total"><span>Ad cost per set</span><span className="num">{setsSold > 0 && mAds > 0 ? rm2(mAds / setsSold) : '—'}</span></li>
          </ul>
          {mAds === 0 && <p className="co-meta">No ad charge filed this month yet. Once Meta is reconnected this fills itself.</p>}
        </section>
      </div>

      {/* ── buy today ─────────────────────────────────────────────── */}
      <section className="co-card">
        <div className="co-row" style={{ marginBottom: 6 }}>
          <span className="eyebrow">Buy today</span>
          <Link href="/stock" className="co-dim">Stock →</Link>
        </div>
        {buy.length === 0 ? (
          <p className="co-sub" style={{ marginTop: 0 }}>Nothing needs buying for the next two days.</p>
        ) : (
          <ul className="co-lines">
            {buy.map(b => (
              <li key={b.key}>
                <span>{b.name}{b.short > 0 && <span className="co-flag"> · runs out tonight</span>}</span>
                <span className="num">{b.buy.label || showQty(b.key, b.buy.qty, b.unit)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── waiting + shortcuts ───────────────────────────────────── */}
      {needs.length > 0 && (
        <section className="co-card">
          <div className="eyebrow co-flag" style={{ marginBottom: 6 }}>Waiting on you</div>
          <ul className="co-lines">
            {needs.map(n => (
              <li key={n.href + n.text}><Link href={n.href}>{n.text}</Link><span className="co-dim">→</span></li>
            ))}
          </ul>
        </section>
      )}

      <div className="co-two">
        <Link href="/cash-in" className="co-card co-tap">Upload last night&apos;s sales</Link>
        <Link href="/stock" className="co-card co-tap">Today&apos;s buy list</Link>
      </div>
    </div>
  )
}
