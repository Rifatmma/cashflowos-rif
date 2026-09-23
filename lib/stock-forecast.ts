// How much of an ingredient a normal day uses -- and therefore what runs out
// tonight and what to buy this morning.
//
// The owner shops most days, so the question is never "how much did we use on
// average since forever", it is "will tonight's service eat more than what's on
// the shelf, and what do I pick up on the way in".
//
// FORECAST, in order of trust:
//   1. the same weekday, averaged over recent weeks -- a Saturday is not a Monday
//      in a restaurant, and a flat average over-buys on quiet days;
//   2. the last 7 trading days, once there are a few;
//   3. every day on record.
// Each rung needs enough days to mean anything, so a new install degrades to (3)
// and says so rather than pretending to know.
//
// Pure: no imports beyond date maths, so it can be tested directly.
import { addDays, daysBetween } from './period'

export type SaleDay = { date: string; qty: number }

export type Forecast = {
  /** Used on the last full day of trading, and which day that was. */
  yesterday: number
  yesterdayDate: string | null
  /** Average per trading day over the last 7 days on record. */
  avg7: number
  /** Typical usage for the day being forecast (see the ladder above). */
  perDay: number
  basis: 'weekday' | 'week' | 'all' | 'none'
  /** How many days of history it is built on -- shown so a thin forecast is visible. */
  days: number
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0)

/**
 * `usage` is one entry per day the item was used (positive quantities).
 * `today` is the day being planned for; its own weekday drives the forecast.
 */
export function forecastFor(usage: SaleDay[], today: string): Forecast {
  const byDay = new Map<string, number>()
  for (const u of usage) {
    if (!u.date || !(u.qty > 0)) continue
    byDay.set(u.date, (byDay.get(u.date) ?? 0) + u.qty)
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  if (!days.length) return { yesterday: 0, yesterdayDate: null, avg7: 0, perDay: 0, basis: 'none', days: 0 }

  const yesterdayDate = days.at(-1)![0]
  const yesterday = days.at(-1)![1]

  const week = days.filter(([d]) => daysBetween(d, today) <= 7).map(([, q]) => q)
  const avg7 = mean(week)

  // Same weekday, up to 4 weeks back. Needs 2+ to be worth trusting.
  const wd = new Date(today + 'T12:00:00Z').getUTCDay()
  const sameWeekday = days
    .filter(([d]) => new Date(d + 'T12:00:00Z').getUTCDay() === wd && daysBetween(d, today) <= 28 && d !== today)
    .map(([, q]) => q)

  if (sameWeekday.length >= 2) return { yesterday, yesterdayDate, avg7, perDay: mean(sameWeekday), basis: 'weekday', days: days.length }
  if (week.length >= 3) return { yesterday, yesterdayDate, avg7, perDay: avg7, basis: 'week', days: days.length }
  return { yesterday, yesterdayDate, avg7, perDay: mean(days.map(([, q]) => q)), basis: 'all', days: days.length }
}

/** Short by this much for tonight (0 = enough). */
export const shortTonight = (onHand: number, f: Forecast) => Math.max(0, f.perDay - Math.max(onHand, 0))

/** How much to buy to cover `days` more days of trading, 0 when already covered. */
export const buyFor = (onHand: number, f: Forecast, days: number) =>
  Math.max(0, f.perDay * days - Math.max(onHand, 0))

/** Days of cover left at the forecast pace. null when nothing is ever used. */
export const coverDays = (onHand: number, f: Forecast) =>
  f.perDay > 0 ? Math.max(onHand, 0) / f.perDay : null

/** Round a buy amount up to how the kitchen actually buys it. */
export function roundBuy(qty: number, unit: 'g' | 'pc' | 'fish', bagG?: number): { qty: number; label: string } {
  if (qty <= 0) return { qty: 0, label: '' }
  if (unit === 'g') {
    if (bagG) { const bags = Math.ceil(qty / bagG); return { qty: bags * bagG, label: `${bags} bag${bags === 1 ? '' : 's'}` } }
    const kg = Math.ceil((qty / 1000) * 2) / 2          // to the next half kilo
    return { qty: kg * 1000, label: `${kg} kg` }
  }
  const n = Math.ceil(qty)
  return { qty: n, label: unit === 'fish' ? `${n} fish` : `${n} pc${n === 1 ? '' : 's'}` }
}

export const BASIS_WORD: Record<Forecast['basis'], string> = {
  weekday: 'same weekday, recent weeks',
  week: 'last 7 days',
  all: 'every day on record',
  none: 'no sales yet',
}
