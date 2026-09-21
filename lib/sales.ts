// Daily sales from the POS -- the shared rules for "has a day's sales arrived?".
//
// One cash_in row per business day, written by the POS import:
//   category 'cash_in', status 'paid', meta.kind 'daily_sales', meta.sales_date.
// The nightly reminder, the morning brief and the Cash Out food-cost card all read
// through these helpers, so the three can never disagree about whether a day is in.
//
// Pure functions: no server imports, safe to test directly.
import { addDays } from './period'

export const SALES_KIND = 'daily_sales'

type Row = { category: string | null; due_date?: string | null; meta?: any }

export const isSalesRow = (r: Row) => r.category === 'cash_in' && r.meta?.kind === SALES_KIND

export const salesDayOf = (r: Row): string => String(r.meta?.sales_date || r.due_date || '')

/**
 * Has the owner started using the POS import at all? The reminders stay silent
 * until they have: nagging someone to send a file the system cannot yet read is
 * worse than no reminder, and teaches them to ignore the next one.
 */
export const salesImportInUse = (rows: Row[]) => rows.some(isSalesRow)

export const salesFiledFor = (rows: Row[], day: string) =>
  rows.some(r => isSalesRow(r) && salesDayOf(r) === day)

/**
 * The most recent business days, up to and including `through`, with no sales.
 * Bounded to a short look-back so one forgotten week does not turn every morning
 * brief into a list -- and never earlier than the first day ever imported, so a
 * business that started importing yesterday is not told it is missing all of
 * last month.
 */
export function missingSalesDays(rows: Row[], through: string, lookBack = 7): string[] {
  const days = rows.filter(isSalesRow).map(salesDayOf).filter(Boolean).sort()
  if (days.length === 0) return []
  const first = days[0]
  const have = new Set(days)
  const out: string[] = []
  for (let i = lookBack - 1; i >= 0; i--) {
    const d = addDays(through, -i)
    if (d >= first && !have.has(d)) out.push(d)
  }
  return out
}
