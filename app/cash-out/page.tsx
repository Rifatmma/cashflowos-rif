// 👉 This is your Cash Out tab — money going OUT. It reads the ONE `records`
// table, filtered to category='cash_out'.
//
// DESIGNED FOR A PHONE, AROUND SERVICE. The owner's brief: open it standing up,
// see how much has gone out this month, glance at whether that's fast or slow,
// check the latest receipts. So the page is one column that reads top to bottom
// in that order, and everything slower -- per-unit prices, supplier notes -- is
// folded away at the bottom. On a laptop the middle cards sit side by side.
//
// Colours and type follow the Jaosamut brand guideline (see app/globals.css).
//
// ONE RECEIPT STAYS ONE ROW. Line items live in `meta.items[]`, the per-line
// expense split in `meta.type_split`, so money totals on every tab stay correct
// while the detail sits underneath. See lib/vision.ts for how they are read.
import Link from 'next/link'
import { getRecords, rm, type Rec } from '@/lib/records'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { supplierKey } from '@/lib/supplier-rules'
import {
  PERIODS, isPeriodKey, periodWindows, mytDate, inWin, cumulative, dayLabel, shortDate,
} from '@/lib/period'
import { isSalesRow, salesDayOf } from '@/lib/sales'
import RuleToggle from './RuleToggle'
import PaceChart from '@/app/_components/PaceChart'

export const dynamic = 'force-dynamic'

// The owner's target (agreed 21 Sep 2026). A seafood-led menu runs dearer than a
// general restaurant's; 35% is where the card's target line sits and where it
// turns red.
const FOOD_COST_TARGET_PCT = 35

type Item = {
  name: string; key?: string; qty: number; unit: string
  unit_price: number; line_total: number; group?: string
  pack_size?: number; pack_unit?: string
  base_qty?: number; base_unit?: string; price_per_base?: number
  expense_type?: string
}

const TYPE_LABEL: Record<string, string> = {
  cogs_food: 'Food',
  cogs_beverage: 'Drinks',
  cogs_packaging: 'Packaging',
  supplies_cleaning: 'Cleaning & supplies',
  owner_drawings: "Owner's drawings",
  labour: 'Labour',
  rent: 'Rent',
  utilities: 'Utilities',
  marketing: 'Marketing',
  equipment: 'Equipment',
  services: 'Services',
  other: 'Other',
}
const IS_COGS = (t?: string) => !!t && t.startsWith('cogs_')

const money2 = (n: number) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const plain2 = (n: number) => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const itemsOf = (r: Rec): Item[] => (Array.isArray(r.meta?.items) ? (r.meta.items as Item[]) : [])

// The day the money was spent: the date printed on the receipt, else the day it
// was filed -- in Malaysia time, never UTC.
const dateOf = (r: Rec) => r.due_date || mytDate(r.created_at)

// How ONE receipt's money divides across expense types. The per-line split wins
// when present (a grocery run is rarely one category); older rows fall back to
// their single type; rows with neither are 'unclassified' -- an unknown is not a
// zero, and it is never quietly folded into overhead.
function spendByType(r: Rec): Record<string, number> {
  const split = r.meta?.type_split as Record<string, number> | undefined
  if (split && typeof split === 'object') {
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(split)) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) clean[k] = n
    }
    if (Object.keys(clean).length) return clean
  }
  return { [(r.meta?.expense_type as string) || 'unclassified']: Number(r.amount || 0) }
}
// Owner's drawings are real money out but not business spending, so every
// headline figure on this page is BUSINESS spending with drawings taken off.
const drawingsOf = (r: Rec) => spendByType(r).owner_drawings ?? 0
const businessOf = (r: Rec) => Number(r.amount || 0) - drawingsOf(r)

// Suppliers print their legal names in capitals: "99 SPEED MART SDN. BHD.".
// On a phone that is noise. Strip the suffixes and tidy the case for display;
// the stored name is never changed.
function displayMerchant(raw: string): string {
  const s = String(raw || '')
    // Order matters: a legal name in brackets goes WHOLE first, or stripping its
    // "SDN BHD" leaves "(Pelita Hijrah )" behind.
    .replace(/\(\s*[^)]*\b(sdn|bhd|berhad)\b[^)]*\)/gi, '')
    .replace(/\(\s*m\s*\)/gi, '')
    .replace(/\b(sdn\.?\s*bhd\.?|s\/b|berhad|bhd|pte\.?\s*ltd\.?)(?=\s|$|[.,)])/gi, '')
    .replace(/\([^)]*$/, '')                 // a bracket the receipt printer clipped: "(M"
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s.,-]+$/, '')
    .trim()
  if (!s) return raw
  const shouting = s === s.toUpperCase() && /[A-Z]{3}/.test(s)
  if (!shouting) return s
  // Title-case it, but leave initials alone: "TH", "NSK" have no vowels and are
  // abbreviations, not words -- "Th Supermart" reads as a typo.
  return s.toLowerCase().replace(/[a-z0-9]+/g, w =>
    w.length <= 3 && !/[aeiou]/.test(w) && /[a-z]/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
}
const merchantOf = (r: Rec) => displayMerchant(String(r.meta?.merchant || r.title.split(' — ')[0] || r.title))

function typeOf(r: Rec): string {
  const parts = Object.keys(spendByType(r))
  if (parts.length > 1) return 'Mixed'
  return TYPE_LABEL[parts[0]] ?? 'Unclassified'
}

export default async function CashOut({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams
  const today = mytDate()
  const W = periodWindows(isPeriodKey(p) ? p : 'month', today)

  const all = await getRecords()
  const rows = all.filter(r => r.category === 'cash_out')
  const cur = rows.filter(r => inWin(dateOf(r), W.current))
  const cmpToDate = rows.filter(r => inWin(dateOf(r), W.compareToDate))

  // ---- the headline ---------------------------------------------------------
  const spent = cur.reduce((t, r) => t + businessOf(r), 0)
  const spentBefore = cmpToDate.reduce((t, r) => t + businessOf(r), 0)
  const drawings = cur.reduce((t, r) => t + drawingsOf(r), 0)
  const delta = spentBefore > 0 ? ((spent - spentBefore) / spentBefore) * 100 : null

  // ---- the pace chart -------------------------------------------------------
  const perDay = (win: { start: string; end: string }) => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const d = dateOf(r)
      if (inWin(d, win)) m.set(d, (m.get(d) ?? 0) + businessOf(r))
    }
    return m
  }
  const curLine = cumulative(perDay(W.current), W.current, W.live ? W.elapsedDays : undefined)
  const cmpLine = cumulative(perDay(W.compareFull), W.compareFull)
  // No spending on record for the comparison period is NOT "spent nothing" --
  // it usually means the app wasn't in use yet. Don't draw it as a flat zero.
  const hasCmp = (cmpLine.at(-1) ?? 0) > 0
  const cmpNoun =
    W.key === 'month' ? 'last month'
    : W.key === 'week' ? 'last week'
    : W.key === 'last' ? W.compareLabel
    : 'the 3 months before'

  // ---- where it goes --------------------------------------------------------
  const byType = new Map<string, number>()
  for (const r of cur) for (const [t, v] of Object.entries(spendByType(r))) byType.set(t, (byType.get(t) ?? 0) + v)
  const unclassified = byType.get('unclassified') ?? 0
  const typeRows = [...byType.entries()]
    .filter(([t]) => t !== 'owner_drawings' && t !== 'unclassified')
    .sort((a, b) => b[1] - a[1])
  const maxType = Math.max(...typeRows.map(([, v]) => v), 1)
  const cogs = typeRows.filter(([t]) => IS_COGS(t)).reduce((t, [, v]) => t + v, 0)

  // ---- food cost --------------------------------------------------------------
  // Real food cost % = cost of goods ÷ SALES. Sales arrive as one cash_in row per
  // day from the POS import (meta.kind 'daily_sales'). Where days are missing the
  // card says so, rather than showing a percentage inflated by absent sales.
  const salesRows = all.filter(r => isSalesRow(r) && inWin(salesDayOf(r), W.current))
  const sales = salesRows.reduce((t, r) => t + Number(r.amount || 0), 0)
  const salesDays = new Set(salesRows.map(salesDayOf)).size
  const foodCostPct = sales > 0 ? (cogs / sales) * 100 : null
  const over = foodCostPct !== null && foodCostPct > FOOD_COST_TARGET_PCT

  // ---- needs you ------------------------------------------------------------
  let waiting: { id: number; payload: any; proposed_at: string }[] = []
  if (supabaseConfigured) {
    const { data } = await supabase
      .from('agent_actions')
      .select('id, payload, proposed_at')
      .eq('status', 'proposed')
      .eq('agent_key', 'expense')
      .gt('expires_at', new Date().toISOString())
      .order('proposed_at', { ascending: false })
    waiting = (data ?? []) as any[]
  }
  const unreadable = cur.filter(r => r.meta?.items_note).length
  const needs = [
    waiting.length && { href: '/approvals', text: `${waiting.length} waiting for approval` },
    unreadable && { href: '#receipts', text: `${unreadable} receipt${unreadable === 1 ? '' : 's'} to check` },
    unclassified > 0 && { href: '#receipts', text: `${money2(unclassified)} not yet categorised` },
  ].filter(Boolean) as { href: string; text: string }[]

  // ---- latest receipts, grouped by day ------------------------------------------
  const sorted = [...cur].sort((a, b) =>
    dateOf(b).localeCompare(dateOf(a)) || b.created_at.localeCompare(a.created_at))
  const SHOW = 8
  const groupByDay = (rs: Rec[]) => {
    const g: { day: string; rows: Rec[] }[] = []
    for (const r of rs) {
      const d = dateOf(r)
      const last = g.at(-1)
      if (last && last.day === d) last.rows.push(r)
      else g.push({ day: d, rows: [r] })
    }
    return g
  }

  // ---- per-unit prices: ALL time (price history is the point) -------------------
  type Price = {
    key: string; name: string; unit: string
    buys: number; qty: number; spend: number
    lo: number; hi: number; latest: number; latestDate: string
    base?: string; bBuys: number
    bLo: number; bHi: number; bLatest: number; bDate: string
  }
  const prices = new Map<string, Price>()
  for (const r of rows) {
    // Personal purchases are not the kitchen's cost base.
    if (r.meta?.expense_type === 'owner_drawings') continue
    for (const it of itemsOf(r)) {
      if (!it || typeof it.unit_price !== 'number') continue
      const k = (it.key || it.name || '').toLowerCase()
      if (!k) continue
      const date = dateOf(r)
      const per = typeof it.price_per_base === 'number' ? it.price_per_base : null
      const p = prices.get(k)
      if (!p) {
        prices.set(k, {
          key: k, name: it.name, unit: it.unit, buys: 1, qty: it.qty, spend: it.line_total,
          lo: it.unit_price, hi: it.unit_price, latest: it.unit_price, latestDate: date,
          base: per !== null ? it.base_unit : undefined, bBuys: per !== null ? 1 : 0,
          bLo: per ?? 0, bHi: per ?? 0, bLatest: per ?? 0, bDate: date,
        })
      } else {
        p.buys++; p.qty += it.qty; p.spend += it.line_total
        p.lo = Math.min(p.lo, it.unit_price); p.hi = Math.max(p.hi, it.unit_price)
        if (date >= p.latestDate) { p.latest = it.unit_price; p.latestDate = date }
        // Never average a per-kg figure with a per-litre one.
        if (per !== null && (!p.base || p.base === it.base_unit)) {
          if (!p.base) { p.base = it.base_unit; p.bLo = per; p.bHi = per; p.bLatest = per; p.bDate = date }
          else { p.bLo = Math.min(p.bLo, per); p.bHi = Math.max(p.bHi, per) }
          p.bBuys++
          if (date >= p.bDate) { p.bLatest = per; p.bDate = date }
        }
      }
    }
  }
  const priceRows = [...prices.values()].sort((a, b) => b.spend - a.spend)

  // ---- supplier notes, grouped by shop (notes ACCUMULATE; see lib/supplier-rules)
  const ruleGroups = (() => {
    const g = new Map<string, { supplier: string; notes: Rec[] }>()
    for (const r of all.filter(x => x.category === 'supplier_rule')) {
      const k = supplierKey(r.title)
      const hit = g.get(k)
      if (hit) hit.notes.push(r)
      else g.set(k, { supplier: r.title, notes: [r] })
    }
    for (const v of g.values()) {
      v.notes.sort((a, b) => Number(b.status !== 'off') - Number(a.status !== 'off') ||
        String(a.meta?.taught_at ?? '').localeCompare(String(b.meta?.taught_at ?? '')))
    }
    return [...g.values()].sort((a, b) => a.supplier.localeCompare(b.supplier))
  })()
  const activeNotes = ruleGroups.reduce((t, g) => t + g.notes.filter(n => n.status !== 'off').length, 0)

  // ---------------------------------------------------------------------------
  const Receipt = ({ r }: { r: Rec }) => {
    const items = itemsOf(r)
    const split = r.meta?.type_split as Record<string, number> | undefined
    const bits = [typeOf(r), items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : null, r.meta?.filed_by]
      .filter(Boolean).join(' · ')
    return (
      <details className="co-rx">
        <summary>
          <span className="co-rx-main">
            <span className="co-rx-name">{merchantOf(r)}</span>
            <span className="co-rx-sub">
              {bits}
              {r.meta?.items_note && <span className="co-flag"> · check</span>}
            </span>
          </span>
          <span className="co-rx-amt num">{plain2(Number(r.amount))}</span>
        </summary>
        <div className="co-rx-body">
          {items.length > 0 ? (
            <ul className="co-lines">
              {items.map((it, i) => (
                <li key={i}>
                  <span>
                    {it.name}
                    <span className="co-dim">
                      {' '}· {it.qty} {it.unit !== 'unit' ? it.unit : ''} × {plain2(it.unit_price)}
                      {typeof it.price_per_base === 'number' && ` = ${money2(it.price_per_base)}/${it.base_unit}`}
                      {it.expense_type && split && Object.keys(split).length > 1 && ` · ${TYPE_LABEL[it.expense_type] ?? it.expense_type}`}
                    </span>
                  </span>
                  <span className="num">{plain2(it.line_total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="co-dim" style={{ margin: 0 }}>No line items on this one.</p>
          )}
          {split && Object.keys(split).length > 1 && (
            <p className="co-meta">
              Split: {Object.entries(split).sort((a, b) => b[1] - a[1])
                .map(([t, v]) => `${TYPE_LABEL[t] ?? t} ${money2(v)}`).join(' · ')}
            </p>
          )}
          {typeof r.meta?.tax === 'number' && r.meta.tax > 0 && <p className="co-meta">Tax {money2(r.meta.tax)}</p>}
          {r.meta?.items_note && <p className="co-meta co-flag">{String(r.meta.items_note)}</p>}
          <p className="co-meta">
            {shortDate(dateOf(r))}
            {r.meta?.receipt_no ? ` · #${r.meta.receipt_no}` : ''}
            {r.meta?.auto_filed ? ' · filed automatically' : ''}
          </p>
        </div>
      </details>
    )
  }

  const Day = ({ g }: { g: { day: string; rows: Rec[] } }) => (
    <div className="co-day">
      <div className="eyebrow co-day-label">
        <span>{dayLabel(g.day, today)}</span>
        <span className="num">{plain2(g.rows.reduce((t, r) => t + Number(r.amount || 0), 0))}</span>
      </div>
      {g.rows.map(r => <Receipt key={r.id} r={r} />)}
    </div>
  )

  return (
    <div className="co">
      {/* ── header + period ───────────────────────────────────────────── */}
      <div className="co-head">
        <h1 className="ph">Cash out</h1>
        <details className="co-period">
          <summary className="mono">{W.label} <span aria-hidden="true">▾</span></summary>
          <div className="co-period-menu">
            {PERIODS.map(opt => (
              <Link key={opt.key} href={`/cash-out?p=${opt.key}`}
                className={opt.key === W.key ? 'on' : undefined}>{opt.label}</Link>
            ))}
          </div>
        </details>
      </div>

      {/* ── needs you (only when something does) ──────────────────────── */}
      {needs.length > 0 && (
        <div className="co-needs" role="status">
          <span aria-hidden="true">●</span>
          {needs.map((n, i) => (
            <Link key={i} href={n.href}>{n.text}</Link>
          ))}
        </div>
      )}

      {/* ── the headline ────────────────────────────────────────────────── */}
      <section className="co-card co-hero">
        <div className="eyebrow">Spent {W.key === 'month' ? 'this month' : W.key === 'week' ? 'this week' : W.key === 'last' ? `in ${W.label}` : 'in the last 3 months'}</div>
        <div className="co-big num">{money2(spent)}</div>
        <p className="co-sub">
          {delta === null ? (
            <>No spending on record for {cmpNoun} yet, so there&rsquo;s nothing to compare with.</>
          ) : (
            <>
              <span className={delta > 0 ? 'co-up' : 'co-down'}>
                {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
              </span>{' '}
              vs <span className="num">{money2(spentBefore)}</span> {W.compareLabel}
            </>
          )}
        </p>
        {/* Its own line: tacked onto the sentence above it wrapped to a line starting "·". */}
        {drawings > 0 && (
          <p className="co-sub" style={{ marginTop: 2 }}>
            Plus <span className="num">{money2(drawings)}</span>{' '}owner&rsquo;s drawings, not counted as spending.
          </p>
        )}
        <PaceChart cur={curLine} cmp={cmpLine} W={W} hasCmp={hasCmp} />
        <div className="co-legend">
          <span><i className="co-key co-key-cur" /> {W.live ? 'so far' : W.label}</span>
          {hasCmp ? (
            <span><i className="co-key co-key-cmp" /> {cmpNoun}</span>
          ) : (
            // A dashed line flat along zero would read as "spent nothing last month".
            // Having no record is not the same as spending nothing -- so say so instead.
            <span>{cmpNoun[0].toUpperCase() + cmpNoun.slice(1)}&rsquo;s line appears once it&rsquo;s on record</span>
          )}
        </div>
      </section>

      <div className="co-pair">
        {/* ── food cost ─────────────────────────────────────────────────── */}
        <section className="co-card">
          <div className="co-row">
            <span className="eyebrow">Food cost</span>
            {foodCostPct !== null && (
              <span className={`co-mid num ${over ? 'co-up' : ''}`}>{foodCostPct.toFixed(0)}%</span>
            )}
          </div>
          {foodCostPct !== null ? (
            <>
              <div className="co-track" aria-hidden="true">
                <div className="co-fill" style={{ width: `${Math.min(foodCostPct, 100)}%`, background: over ? 'var(--bad)' : 'var(--green)' }} />
                <div className="co-target" style={{ left: `${FOOD_COST_TARGET_PCT}%` }} />
              </div>
              <p className="co-sub">
                Target {FOOD_COST_TARGET_PCT}% · cost of goods <span className="num">{money2(cogs)}</span>{' '}on sales <span className="num">{money2(sales)}</span>
              </p>
              {W.live && salesDays < W.elapsedDays && (
                <p className="co-sub co-flag">
                  Sales are in for {salesDays} of {W.elapsedDays} days, so this reads high until the rest arrive.
                </p>
              )}
            </>
          ) : (
            <p className="co-sub">
              Needs your sales. Upload tonight&rsquo;s EasyEat report on <Link href="/cash-in#upload">Cash In</Link> and
              this shows your real food cost against your {FOOD_COST_TARGET_PCT}% target.
            </p>
          )}
        </section>

        {/* ── where it goes ──────────────────────────────────────────────── */}
        <section className="co-card">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Where it goes</div>
          {typeRows.length === 0 ? (
            <p className="co-sub">Nothing categorised in this period yet.</p>
          ) : (
            typeRows.map(([t, v]) => (
              <div key={t} className="co-bar">
                <div className="co-row">
                  <span>{TYPE_LABEL[t] ?? t}{IS_COGS(t) && <span className="co-tag">COGS</span>}</span>
                  <span className="num">{money2(v)}</span>
                </div>
                <div className="co-track" aria-hidden="true">
                  <div className="co-fill" style={{ width: `${Math.max(2, (v / maxType) * 100)}%`, background: IS_COGS(t) ? 'var(--green)' : 'var(--info-fill)' }} />
                </div>
              </div>
            ))
          )}
          {drawings > 0 && (
            <p className="co-sub">Owner&rsquo;s drawings <span className="num">{money2(drawings)}</span>{' '}· not an expense, kept out of the above</p>
          )}
          {unclassified > 0 && (
            <p className="co-sub co-flag">
              <span className="num">{money2(unclassified)}</span>{' '}not yet categorised, so not counted above.
            </p>
          )}
        </section>
      </div>

      {/* ── latest receipts ─────────────────────────────────────────────── */}
      <section className="co-card" id="receipts">
        <div className="co-row" style={{ marginBottom: 4 }}>
          <span className="eyebrow">Receipts</span>
          <span className="co-dim num">{cur.length} in {W.label.toLowerCase().startsWith('this') || W.key === '3m' ? W.label.toLowerCase() : W.label}</span>
        </div>

        {waiting.length > 0 && (
          <div className="co-day">
            <div className="eyebrow co-day-label co-flag"><span>Waiting for you</span></div>
            {waiting.map(a => (
              <Link key={a.id} href="/approvals" className="co-rx co-rx-wait">
                <span className="co-rx-main">
                  <span className="co-rx-name">{displayMerchant(String(a.payload?.merchant || 'Receipt'))}</span>
                  <span className="co-rx-sub co-flag">
                    {a.payload?.payment_proof ? 'E-wallet payment' : 'Needs your approval'} · tap to decide
                  </span>
                </span>
                <span className="co-rx-amt num">{plain2(Number(a.payload?.amount || 0))}</span>
              </Link>
            ))}
          </div>
        )}

        {sorted.length === 0 && waiting.length === 0 ? (
          <p className="co-sub">
            No receipts in {W.label} yet. Photograph one into Telegram and Jarvis files it here, line by line.
          </p>
        ) : (
          <>
            {groupByDay(sorted.slice(0, SHOW)).map(g => <Day key={g.day} g={g} />)}
            {sorted.length > SHOW && (
              <details className="co-more">
                <summary>Show {sorted.length - SHOW} more</summary>
                {/* Re-group the remainder so a day split across the fold still reads as one day. */}
                {groupByDay(sorted.slice(SHOW)).map(g => <Day key={'more-' + g.day} g={g} />)}
              </details>
            )}
          </>
        )}
      </section>

      {/* ── folded away: slower, laptop-shaped reading ───────────────────── */}
      <details className="co-card co-fold">
        <summary>
          <span>What you pay per unit</span>
          <span className="co-dim num">{priceRows.length} item{priceRows.length === 1 ? '' : 's'}</span>
        </summary>
        {priceRows.length === 0 ? (
          <p className="co-sub">Fills itself as receipts are read line by line.</p>
        ) : (
          <>
            <ul className="co-prices">
              {priceRows.map(p => {
                const cmp = !!p.base && p.bBuys > 0
                const rising = cmp
                  ? p.bHi > p.bLo && p.bLatest >= p.bHi && p.bBuys > 1
                  : p.hi > p.lo && p.latest >= p.hi && p.buys > 1
                const [lo, hi, latest, unit] = cmp
                  ? [p.bLo, p.bHi, p.bLatest, p.base!]
                  : [p.lo, p.hi, p.latest, p.unit]
                return (
                  <li key={p.key}>
                    <div className="co-row">
                      <span className="co-rx-name">{p.name}</span>
                      <span className="num">{money2(latest)}<span className="co-dim">/{unit}</span></span>
                    </div>
                    <div className="co-row co-dim">
                      <span>
                        {lo === hi ? 'one price so far' : `range ${plain2(lo)}–${plain2(hi)}`}
                        {' · '}bought {p.buys}×{!cmp && ' · no weight on label'}
                      </span>
                      {rising && <span className="co-flag">highest yet</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="co-sub">
              Prices are per kg or litre wherever the label printed a weight, so a 100 g pack and a 1 kg bag
              compare fairly. &ldquo;Highest yet&rdquo; means your latest buy was the dearest so far.
            </p>
          </>
        )}
      </details>

      <details className="co-card co-fold">
        <summary>
          <span>Supplier notes</span>
          <span className="co-dim num">{activeNotes} active</span>
        </summary>
        {ruleGroups.length === 0 ? (
          <p className="co-sub">
            When a receipt is read wrong, tell Jarvis what it should have said, like &ldquo;for 99 Speed Mart
            the first number is a shelf code&rdquo;, and it&rsquo;s applied to every future photo from that shop.
          </p>
        ) : (
          <>
            {ruleGroups.map(g => (
              <div key={g.supplier} className="co-note-group">
                <div className="co-rx-name">{displayMerchant(g.supplier)}</div>
                {g.notes.map(r => {
                  const on = r.status !== 'off'
                  return (
                    <div key={r.id} className={`co-note ${on ? '' : 'co-off'}`}>
                      <div>
                        <p style={{ margin: 0 }}>{r.notes}</p>
                        <p className="co-meta">
                          {on ? 'Applied' : 'Switched off'} · taught {String(r.meta?.taught_at ?? '—')}
                          {r.meta?.example ? ` · from: ${String(r.meta.example)}` : ''}
                        </p>
                      </div>
                      <RuleToggle id={r.id} active={on} />
                    </div>
                  )
                })}
              </div>
            ))}
            <p className="co-sub">
              Notes add up: telling Jarvis something new never wipes what you told him before. They apply to
              future photos only, so switch one off the moment you doubt it.
            </p>
          </>
        )}
      </details>
    </div>
  )
}
