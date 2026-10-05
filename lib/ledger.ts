import 'server-only'
// 👉 Reading the money ledger: filtered in the database, paged, one day at a time.
//
// WHY THIS EXISTS. `getRecords()` selects the entire `records` table with no
// filter and no limit, and every money screen then filters in JavaScript. Three
// things follow from that, and together they are why a receipt from last month
// could not be found:
//
//   1. Cash Out windowed to the CALENDAR MONTH, so on 2 October exactly two
//      days existed. The widest option was 90 days; there was no "all time".
//   2. Only eight receipts rendered; the rest went under "show 65 more".
//   3. PostgREST caps an unbounded select at 1,000 rows, newest first — so the
//      OLDEST rows silently vanish from every screen at once. 265 rows today at
//      ~200 a month: that lands around February, with no error to notice.
//
// The right pattern was already in the repo — `getMoves` in lib/stock-data.ts
// filters server-side and pages in 1,000-row loops. The money side never
// adopted it. This module is that pattern, for records (owner, 5 Oct 2026).

import { supabase, supabaseConfigured } from './supabase'
import type { Rec } from './records'

const PAGE = 1000
/** A sane ceiling so a bug can never walk the whole table. ~2 years of receipts. */
const MAX_ROWS = 20_000

const clean = (rows: any[]): Rec[] =>
  rows.map(r => ({ ...r, meta: r.meta ?? {} })) as Rec[]

/**
 * The day a receipt belongs to.
 *
 * `due_date` is the date PRINTED ON THE BILL; `created_at` is when it was filed.
 * A bill typed today can be yesterday's shopping, so the printed date wins —
 * this is the same rule the old `dateOf()` used, moved into SQL so it survives a
 * truncated fetch.
 */
export const dayOf = (r: Rec): string =>
  r.due_date || new Date(new Date(r.created_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10)

/**
 * Every row in a category between two days, inclusive, by the day it belongs to.
 *
 * Asks twice on purpose: rows WITH a `due_date` are filtered on it, rows without
 * fall back to `created_at`. One query cannot express that, and doing it in JS
 * after a capped fetch is what broke this in the first place.
 */
export async function recordsBetween(
  category: string,
  from: string,
  to: string,
): Promise<Rec[]> {
  if (!supabaseConfigured) return []

  const seen = new Map<number, Rec>()

  const page = async (build: (q: any) => any) => {
    for (let at = 0; at < MAX_ROWS; at += PAGE) {
      const { data, error } = await build(
        supabase.from('records').select('*').eq('category', category),
      ).range(at, at + PAGE - 1)
      if (error) { console.warn('[CFO] ledger:', error.message); return }
      for (const r of clean(data ?? [])) seen.set(r.id, r)
      if (!data || data.length < PAGE) return
    }
    console.warn(`[CFO] ledger: hit the ${MAX_ROWS} row ceiling for ${category}`)
  }

  // MYT is UTC+8, so a day that starts at 00:00 local began at 16:00 UTC the
  // day before. Widen by one day either side and let dayOf() do the deciding —
  // cheaper and far less error-prone than timezone arithmetic in SQL.
  const wide = (d: string, days: number) =>
    new Date(new Date(d + 'T00:00:00Z').getTime() + days * 86_400_000).toISOString()

  await page(q => q.not('due_date', 'is', null).gte('due_date', from).lte('due_date', to).order('due_date', { ascending: false }))
  await page(q => q.is('due_date', null).gte('created_at', wide(from, -1)).lte('created_at', wide(to, 1)).order('created_at', { ascending: false }))

  return [...seen.values()]
    .filter(r => { const d = dayOf(r); return d >= from && d <= to })
    .sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || b.created_at.localeCompare(a.created_at))
}

/** One day's receipts, newest-filed first. */
export const cashOutOn = (day: string) => recordsBetween('cash_out', day, day)

/**
 * Which days in a month have spending, so the stepper can skip empty ones and
 * the date picker can show where the receipts are.
 */
export async function daysWithSpend(month: string): Promise<string[]> {
  const [y, m] = month.split('-').map(Number)
  const from = `${month}-01`
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const rows = await recordsBetween('cash_out', from, to)
  return [...new Set(rows.map(dayOf))].sort()
}

/**
 * The nearest earlier day that has a receipt.
 *
 * So the back arrow never becomes a tapping game on a quiet week. Looks back a
 * year at most; null means there is genuinely nothing older.
 */
export async function previousDayWithSpend(before: string): Promise<string | null> {
  const back = new Date(new Date(before + 'T00:00:00Z').getTime() - 365 * 86_400_000)
    .toISOString().slice(0, 10)
  const prior = new Date(new Date(before + 'T00:00:00Z').getTime() - 86_400_000)
    .toISOString().slice(0, 10)
  const rows = await recordsBetween('cash_out', back, prior)
  return rows.length ? dayOf(rows[0]) : null
}

/** The nearest later day with a receipt, for the forward arrow. */
export async function nextDayWithSpend(after: string): Promise<string | null> {
  const ahead = new Date(new Date(after + 'T00:00:00Z').getTime() + 86_400_000)
    .toISOString().slice(0, 10)
  const far = new Date(new Date(after + 'T00:00:00Z').getTime() + 365 * 86_400_000)
    .toISOString().slice(0, 10)
  const rows = await recordsBetween('cash_out', ahead, far)
  return rows.length ? dayOf(rows[rows.length - 1]) : null
}

/**
 * Everything that needs a human, all time — no window.
 *
 * Deliberately not windowed: a bill with no photo from three weeks ago is still
 * a bill with no photo. The old "to check" list inherited the month window from
 * the page it lived on, so a problem aged out of view instead of being fixed.
 */
export async function needsAttention(sinceDays = 180): Promise<Rec[]> {
  const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const from = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10)
  return recordsBetween('cash_out', from, to)
}
