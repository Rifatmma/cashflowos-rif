// npx -y tsx --conditions=react-server tests/mw-gsc-trend.test.mts
import { addWeeks, agg, beforeAfter, resultLine, decaying, buyerPositions, topTen } from '../lib/mw-gsc-trend'

let bad = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }

// ── weeks
check(addWeeks('2026-W44', 1) === '2026-W45' && addWeeks('2026-W01', -1) === '2025-W52', 'weeks step across a year end')

// ── aggregate
const a = agg([{ week: 'w1', clicks: 2, impr: 100, pos: 10 }, { week: 'w2', clicks: 3, impr: 300, pos: 20 }])
check(a.clicks === 5 && a.impr === 400 && a.pos === 17.5 && a.weeks === 2, 'position is weighted by impressions, not averaged')

// ── before / after
const w = (k: number) => addWeeks('2026-W40', k)
const rows = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(k => ({ week: w(k), clicks: k > 0 ? 10 : 2, impr: 100, pos: k > 0 ? 8 : 19 }))
const ba = beforeAfter(rows, '2026-W40', w(4))
check(ba.ready && ba.before.clicks === 8 && ba.after.clicks === 40, 'four weeks before against four after; the change week counts for neither')
check(ba.before.pos === 19 && ba.after.pos === 8, 'positions before and after')
check(resultLine(ba).startsWith('#19 → #8, clicks 8 → 40'), 'the result reads "#19 → #8, clicks 8 → 40"')
const early = beforeAfter(rows, '2026-W40', w(2))
check(!early.ready && early.weeksAfter === 2 && /Result on 2026-11-02/.test(resultLine(early)), 'too early: says when the result arrives, and how many weeks are in')

// ── decay
const latest = '2026-W43'
const pageRows = (page: string, perBlock: number[]) =>
  perBlock.flatMap((c, b) => Array.from({ length: 4 }, (_, i) => ({ page, week: addWeeks(latest, -(15 - (b * 4 + i))), clicks: c / 4, impr: 100, pos: 5 })))
const d = decaying([...pageRows('/down', [40, 30, 20, 12]), ...pageRows('/flat', [40, 42, 39, 41]), ...pageRows('/tiny', [8, 6, 4, 2]), ...pageRows('/blip', [40, 20, 30, 10])], latest)
check(d.length === 1 && d[0].page === '/down' && d[0].drop === 0.7, 'a page down three blocks running, by 30% or more, is decaying')
check(!d.some(x => x.page === '/tiny'), 'a page too small to judge is left out')
check(!d.some(x => x.page === '/blip'), 'one recovery breaks the run')

// ── buyer searches
const q = [
  { week: 'x', query: 'Billboard Advertising Mumbai', page: '/locations/india/mumbai', country: 'ind', clicks: 1, impr: 50, pos: 7 },
  { week: 'x', query: 'billboard advertising mumbai', page: '/blog/x', country: 'ind', clicks: 0, impr: 50, pos: 30 },
  { week: 'x', query: 'billboard advertising mumbai', page: '/locations/india/mumbai', country: 'usa', clicks: 0, impr: 5, pos: 2 },
  { week: 'x', query: 'hoardings in pune', page: '/locations/india/pune', country: 'ind', clicks: 0, impr: 20, pos: 14 },
]
const ps = buyerPositions([
  { market: 'india', query: 'billboard advertising mumbai', country: 'ind' },
  { market: 'india', query: 'hoardings in pune', country: 'ind' },
  { market: 'india', query: 'unipole advertising delhi', country: 'ind' },
], q)
check(ps[0].pos === 7, 'the best page counts, in the search\'s own country, any letter case')
const t = topTen(ps).get('india')!
check(t.total === 3 && t.ranked === 2 && t.top10 === 1, 'per market: 3 tracked, 2 ranking, 1 in the top 10')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
