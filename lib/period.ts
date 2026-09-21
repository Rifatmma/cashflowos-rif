// Time windows for the money tabs, in MALAYSIA time.
//
// The rest of the app's todayISO() is UTC, which means that between midnight and
// 8 am in Kuala Lumpur it still thinks it is yesterday. For a restaurant that
// closes at 11 pm and files sales at 11:30 pm, "which day did this happen" has to
// be the local day -- so these helpers never touch UTC dates.
//
// Pure functions, no server imports, so they can be tested directly.

export type PeriodKey = 'week' | 'month' | 'last' | '3m'

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: '3m', label: 'Last 3 months' },
]

export const isPeriodKey = (x: unknown): x is PeriodKey =>
  x === 'week' || x === 'month' || x === 'last' || x === '3m'

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 86_400_000
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON3 = MONTHS.map(m => m.slice(0, 3))

/** The calendar date in Malaysia (UTC+8) for an instant, as YYYY-MM-DD. */
export function mytDate(at: Date | string | number = new Date()): string {
  const t = new Date(at).getTime()
  return new Date(t + MYT_OFFSET_MS).toISOString().slice(0, 10)
}

// Dates below are treated as plain calendar days (noon UTC avoids any DST-style
// edge -- Malaysia has none, but the arithmetic stays honest either way).
const parse = (iso: string) => new Date(iso + 'T12:00:00Z')
const fmt = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => fmt(new Date(parse(iso).getTime() + n * DAY_MS))
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY_MS)
const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()

export function shortDate(iso: string): string {
  const d = parse(iso)
  return `${d.getUTCDate()} ${MON3[d.getUTCMonth()]}`
}

/** "Today", "Yesterday", or "Sat 20 Sep" -- how a phone list should label a day. */
export function dayLabel(iso: string, today: string): string {
  const diff = daysBetween(iso, today)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const d = parse(iso)
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]
  return `${wd} ${d.getUTCDate()} ${MON3[d.getUTCMonth()]}`
}

export type Win = { start: string; end: string } // inclusive, YYYY-MM-DD

export type PeriodWindows = {
  key: PeriodKey
  label: string            // shown on the switcher: "September", "This week"
  current: Win             // the period being looked at (up to today where live)
  compareToDate: Win       // the SAME stretch of the comparison period -> the headline delta
  compareFull: Win         // the whole comparison period -> the dashed line on the chart
  compareLabel: string     // "by 21 Aug", "same days last week", "July"
  axisDays: number         // x-axis length of the pace chart
  elapsedDays: number      // how far into the current period we are
  live: boolean            // true if the current period is still running
}

/**
 * Work out the current and comparison windows for a period.
 *
 * The comparison is deliberately LIKE FOR LIKE. On 21 September, "this month"
 * is set against 1-21 August, not all of August -- comparing three weeks with a
 * whole month would always make you look under budget, and the headline would
 * quietly lie until the last day of every month.
 */
export function periodWindows(key: PeriodKey, today: string): PeriodWindows {
  const t = parse(today)
  const y = t.getUTCFullYear(), m0 = t.getUTCMonth(), dom = t.getUTCDate()

  if (key === 'week') {
    const dow = (t.getUTCDay() + 6) % 7                 // Monday = 0
    const start = addDays(today, -dow)
    const prevStart = addDays(start, -7)
    return {
      key, label: 'This week',
      current: { start, end: today },
      compareToDate: { start: prevStart, end: addDays(prevStart, dow) },
      compareFull: { start: prevStart, end: addDays(prevStart, 6) },
      compareLabel: 'same days last week',
      axisDays: 7, elapsedDays: dow + 1, live: true,
    }
  }

  if (key === 'month') {
    const start = fmt(new Date(Date.UTC(y, m0, 1, 12)))
    const pY = m0 === 0 ? y - 1 : y, pM = (m0 + 11) % 12
    const prevStart = fmt(new Date(Date.UTC(pY, pM, 1, 12)))
    const prevLen = daysInMonth(pY, pM)
    const sameDay = Math.min(dom, prevLen)             // 31 Mar vs a 28-day Feb
    return {
      key, label: MONTHS[m0],
      current: { start, end: today },
      compareToDate: { start: prevStart, end: addDays(prevStart, sameDay - 1) },
      compareFull: { start: prevStart, end: addDays(prevStart, prevLen - 1) },
      compareLabel: `by ${sameDay} ${MON3[pM]}`,
      axisDays: daysInMonth(y, m0), elapsedDays: dom, live: true,
    }
  }

  if (key === 'last') {
    const lY = m0 === 0 ? y - 1 : y, lM = (m0 + 11) % 12
    const start = fmt(new Date(Date.UTC(lY, lM, 1, 12)))
    const len = daysInMonth(lY, lM)
    const pY = lM === 0 ? lY - 1 : lY, pM = (lM + 11) % 12
    const prevStart = fmt(new Date(Date.UTC(pY, pM, 1, 12)))
    const prevLen = daysInMonth(pY, pM)
    const cmp = { start: prevStart, end: addDays(prevStart, prevLen - 1) }
    return {
      key, label: MONTHS[lM],
      current: { start, end: addDays(start, len - 1) },
      compareToDate: cmp, compareFull: cmp,
      compareLabel: MONTHS[pM],
      axisDays: Math.max(len, prevLen), elapsedDays: len, live: false,
    }
  }

  // '3m' -- a rolling 90 days against the 90 before it.
  const start = addDays(today, -89)
  const prevStart = addDays(start, -90)
  const cmp = { start: prevStart, end: addDays(start, -1) }
  return {
    key, label: 'Last 3 months',
    current: { start, end: today },
    compareToDate: cmp, compareFull: cmp,
    compareLabel: 'the 3 months before',
    axisDays: 90, elapsedDays: 90, live: true,
  }
}

export const inWin = (iso: string | null | undefined, w: Win) =>
  !!iso && iso >= w.start && iso <= w.end

/**
 * Running total, one point per day of the window: point i = everything spent
 * from day 0 to day i. `upTo` stops the line at today for a live period, so the
 * chart shows where you ARE, not a flat line into the future.
 */
export function cumulative(
  byDay: Map<string, number>,
  w: Win,
  upTo?: number,
): number[] {
  const n = Math.min(daysBetween(w.start, w.end) + 1, upTo ?? Infinity)
  const out: number[] = []
  let run = 0
  for (let i = 0; i < n; i++) {
    run += byDay.get(addDays(w.start, i)) ?? 0
    out.push(Math.round(run * 100) / 100)
  }
  return out
}
