// 👉 The costs that arrive whether or not anybody photographs a receipt.
//
// Owner, 23 Sep 2026: "we paid in cash for salary and rent, we just transfer to
// the owner, so it's hard to file it -- and since the costs are going to be the
// same then you can file that automatically right?"
//
// So Jarvis files them himself: wages once a day, rent and the rest once a
// month. Every auto-filed row carries meta.auto_fixed and a meta.auto_key, so a
// day or a month can never be filed twice, and so they can always be told apart
// from a real receipt.
//
// When a figure changes -- a pay rise, the wifi bill finally arriving -- a NEW
// row is written with `from` set to the day it starts. Past months keep the
// figure they were filed with; nothing is rewritten behind the owner's back.
import { supabase, supabaseConfigured } from './supabase'
import { addDays, mytDate } from './period'

export type FixedCosts = {
  from: string              // effective from this date (YYYY-MM-DD)
  wages_per_day: number     // whole team, per day open
  unit_rent: number         // per month
  staff_house: number       // per month
  pos_per_year: number
  licence_per_year: number
  wifi_per_month: number    // 0 until the first bill lands
  note?: string
}

// The owner's figures, 23 Sep 2026. Wages: chef 120, cook helper 100, two
// kitchen helpers at 60, waiter 60, manager 80, dishwasher (part time) 35.
export const DEFAULT_FIXED: FixedCosts = {
  from: '2026-09-01',
  wages_per_day: 515,
  unit_rent: 5000,
  staff_house: 3150,
  pos_per_year: 2500,
  licence_per_year: 1500,
  wifi_per_month: 0,
  note: 'Owner, 23 Sep 2026. Open 7 days.',
}

export const CATEGORY = 'fixed_costs'

const daysInMonth = (iso: string) => {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
const monthStart = (iso: string) => iso.slice(0, 7) + '-01'
const nextMonth = (iso: string) => {
  const [y, m] = iso.split('-').map(Number)
  return (m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`) + '-01'
}

/** Every version of the figures, oldest first. */
export async function getFixedHistory(): Promise<FixedCosts[]> {
  if (!supabaseConfigured) return [DEFAULT_FIXED]
  const { data } = await supabase.from('records').select('meta').eq('category', CATEGORY).eq('status', 'active')
  const rows = (data ?? []).map((r: any) => r.meta as FixedCosts).filter(c => c?.from)
  if (!rows.length) return [DEFAULT_FIXED]
  return rows.sort((a, b) => a.from.localeCompare(b.from))
}

/** Write the owner's starting figures once, so the dashboard has something to stand on. */
export async function ensureFixedSeed(): Promise<void> {
  if (!supabaseConfigured) return
  const { count } = await supabase.from('records').select('id', { count: 'exact', head: true }).eq('category', CATEGORY)
  if (count) return
  await supabase.from('records').insert({
    title: `Fixed costs from ${DEFAULT_FIXED.from}`, status: 'active', amount: 0,
    category: CATEGORY, due_date: DEFAULT_FIXED.from, notes: DEFAULT_FIXED.note ?? null, meta: DEFAULT_FIXED,
  })
}

/** The figures in force on a given day. */
export function costsOn(history: FixedCosts[], date: string): FixedCosts {
  let cur = history[0] ?? DEFAULT_FIXED
  for (const c of history) if (c.from <= date) cur = c
  return cur
}

/**
 * What one day costs before a single plate is sold: wages, plus the monthly
 * things spread over that month's days, plus the yearly things over 365.
 */
export function fixedPerDay(c: FixedCosts, date: string): number {
  const perMonth = (Number(c.unit_rent) || 0) + (Number(c.staff_house) || 0) + (Number(c.wifi_per_month) || 0)
  const perYear = (Number(c.pos_per_year) || 0) + (Number(c.licence_per_year) || 0)
  return (Number(c.wages_per_day) || 0) + perMonth / daysInMonth(date) + perYear / 365
}

/** The sum in words, for the dashboard: nothing is a number out of nowhere. */
export function fixedBreakdown(c: FixedCosts, date: string) {
  const dim = daysInMonth(date)
  return [
    { what: 'Wages (whole team)', perDay: Number(c.wages_per_day) || 0, how: 'per day' },
    { what: 'Unit rent', perDay: (Number(c.unit_rent) || 0) / dim, how: `RM ${c.unit_rent} a month / ${dim} days` },
    { what: 'Staff house', perDay: (Number(c.staff_house) || 0) / dim, how: `RM ${c.staff_house} a month / ${dim} days` },
    ...(c.wifi_per_month ? [{ what: 'Wifi / phone', perDay: c.wifi_per_month / dim, how: `RM ${c.wifi_per_month} a month / ${dim} days` }] : []),
    { what: 'POS (EasyEat)', perDay: (Number(c.pos_per_year) || 0) / 365, how: `RM ${c.pos_per_year} a year / 365` },
    { what: 'Licence', perDay: (Number(c.licence_per_year) || 0) / 365, how: `RM ${c.licence_per_year} a year / 365` },
  ]
}

/**
 * Sales a day has to take to cover everything, at the food cost the kitchen is
 * actually running at. Every ringgit of sales keeps (1 - food%) towards the
 * fixed costs, so break-even is fixed / (1 - food%).
 */
export function breakEvenSales(fixedDay: number, foodPct: number): number {
  const keep = 1 - Math.min(Math.max(foodPct, 0), 0.9) / 1
  return keep > 0.05 ? fixedDay / keep : fixedDay * 20
}

type AutoRow = { key: string; title: string; amount: number; date: string; type: string; category: string }

/**
 * Which auto rows SHOULD exist between two dates, given the figures in force.
 *
 * EVERY day carries its own share: wages, a day of rent, a day of the yearly
 * things. Rent could be filed as one lump on the 1st, but then the first days of
 * a month look like a disaster and the last days look like a windfall -- and the
 * owner reads this every morning. A day's share is also exactly what break-even
 * uses, so the two can never disagree.
 */
export function autoRowsFor(history: FixedCosts[], from: string, throughDay: string): AutoRow[] {
  const out: AutoRow[] = []
  for (let d = from; d <= throughDay; d = addDays(d, 1)) {
    const c = costsOn(history, d)
    const dim = daysInMonth(d)
    const day: [string, number, string, string, string][] = [
      ['wages', c.wages_per_day, 'Staff wages (auto)', 'labour', 'Wages'],
      ['rent', ((Number(c.unit_rent) || 0) + (Number(c.staff_house) || 0)) / dim,
        'Rent, unit + staff house (auto)', 'rent', 'Rent'],
      ['wifi', (Number(c.wifi_per_month) || 0) / dim, 'Wifi and phone (auto)', 'utilities', 'Wifi'],
      ['sub', ((Number(c.pos_per_year) || 0) + (Number(c.licence_per_year) || 0)) / 365,
        'POS and licence (auto)', 'services', 'POS & licence'],
    ]
    for (const [k, amount, title, type, category] of day) {
      if (!amount) continue
      out.push({ key: `${k}-${d}`, title, amount: Math.round(amount * 100) / 100, date: d, type, category })
    }
  }
  return out
}

/**
 * File anything missing. Safe to call as often as you like: a row whose
 * auto_key already exists is skipped, so nothing is ever counted twice.
 * Wages stop at YESTERDAY -- today is not over yet.
 */
export async function ensureFixedFiled(today = mytDate(), notBefore?: string): Promise<{ filed: number; skipped: number }> {
  if (!supabaseConfigured) return { filed: 0, skipped: 0 }
  await ensureFixedSeed()
  const history = await getFixedHistory()
  // Never charge for days the business has no sales for: the books begin where
  // the first POS report begins, or profit reads as a loss that never happened.
  const figuresFrom = history[0]?.from ?? DEFAULT_FIXED.from
  const start = notBefore && notBefore > figuresFrom ? notBefore : figuresFrom
  const want = autoRowsFor(history, start, addDays(today, -1))
  if (!want.length) return { filed: 0, skipped: 0 }

  const { data: have } = await supabase.from('records').select('meta').eq('category', 'cash_out').eq('meta->>auto_fixed', 'true')
  const seen = new Set((have ?? []).map((r: any) => String(r.meta?.auto_key ?? '')))
  const rows = want.filter(w => !seen.has(w.key)).map(w => ({
    title: w.title, status: 'filed', amount: w.amount, category: 'cash_out', due_date: w.date,
    notes: 'Filed automatically — paid in cash, no receipt (owner, 23 Sep 2026).',
    meta: { auto_fixed: true, auto_key: w.key, expense_type: w.type, category: w.category, filed_by: 'Jarvis' },
  }))
  if (!rows.length) return { filed: 0, skipped: want.length }
  // Chunked: a first run backfills a whole month of wage rows in one go.
  for (let i = 0; i < rows.length; i += 100) await supabase.from('records').insert(rows.slice(i, i + 100))
  return { filed: rows.length, skipped: want.length - rows.length }
}
