// 👉 What the weekly Search Console store answers (owner, 28 Oct 2026):
//
//  • did a finished card work?   four weeks before the change against four after
//  • which pages are decaying?   clicks down three 4-week blocks running
//  • are buyers finding us?      how many of a market's money searches are top 10
//
// Pure: the rows come in, the answers go out. Tested in tests/mw-gsc-trend.test.mts.

import { isoWeek, mondayOf } from './mw-week'

export type WeekRow = { week: string; clicks: number; impr: number; pos: number }
export type Agg = { clicks: number; impr: number; pos: number | null; weeks: number }

/** The ISO week `n` weeks after `week` (negative for before). */
export const addWeeks = (week: string, n: number) =>
  isoWeek(new Date(Date.parse(`${mondayOf(week)}T00:00:00Z`) + n * 7 * 864e5).toISOString().slice(0, 10))

/** Rows added up: clicks and impressions summed, position weighted by impressions. */
export function agg(rows: WeekRow[]): Agg {
  const clicks = rows.reduce((t, r) => t + r.clicks, 0)
  const impr = rows.reduce((t, r) => t + r.impr, 0)
  const posW = rows.reduce((t, r) => t + r.pos * r.impr, 0)
  return { clicks, impr, pos: impr ? Math.round((posW / impr) * 10) / 10 : null, weeks: new Set(rows.map(r => r.week)).size }
}

export type BeforeAfter = {
  before: Agg
  after: Agg
  /** Whole weeks of "after" Search Console already has. */
  weeksAfter: number
  /** The first Monday the full four weeks after are in. */
  readyOn: string
  ready: boolean
}

/**
 * A change made in `changeWeek`: the four weeks before it against the four
 * weeks after it. The change week itself is left out of both — half of it is
 * before and half after.
 */
export function beforeAfter(rows: WeekRow[], changeWeek: string, latestWeek: string, n = 4): BeforeAfter {
  const before = new Set(Array.from({ length: n }, (_, i) => addWeeks(changeWeek, -(i + 1))))
  const after = new Set(Array.from({ length: n }, (_, i) => addWeeks(changeWeek, i + 1)))
  const have = [...after].filter(w => w <= latestWeek)
  return {
    before: agg(rows.filter(r => before.has(r.week))),
    after: agg(rows.filter(r => after.has(r.week) && r.week <= latestWeek)),
    weeksAfter: have.length,
    // Search Console needs a couple of days after the last week ends.
    readyOn: mondayOf(addWeeks(changeWeek, n + 1)),
    ready: have.length >= n,
  }
}

/** "#19 → #9, clicks 2 → 11" — or why there is nothing to say yet. */
export function resultLine(r: BeforeAfter): string {
  if (!r.ready) return `Result on ${r.readyOn}: ${r.weeksAfter} of 4 weeks in`
  const p = (v: number | null) => (v === null ? '—' : `#${Math.round(v)}`)
  return `${p(r.before.pos)} → ${p(r.after.pos)}, clicks ${r.before.clicks} → ${r.after.clicks}, impressions ${r.before.impr} → ${r.after.impr} (4 weeks each)`
}

export type Decay = { page: string; blocks: number[]; drop: number }

/**
 * Pages losing clicks three months running (owner, 28 Oct 2026). Sixteen
 * weeks become four 4-week blocks, oldest first; a page decays when every
 * block is below the one before and the latest has lost at least 30% of the
 * first. Pages with under 12 clicks in the first block are too small to judge.
 */
export function decaying(rows: (WeekRow & { page: string })[], latestWeek: string, minClicks = 12): Decay[] {
  const blockOf = new Map<string, number>()
  for (let i = 0; i < 16; i++) blockOf.set(addWeeks(latestWeek, -i), 3 - Math.floor(i / 4))
  const by = new Map<string, number[]>()
  for (const r of rows) {
    const b = blockOf.get(r.week)
    if (b === undefined) continue
    const v = by.get(r.page) ?? [0, 0, 0, 0]
    v[b] += r.clicks
    by.set(r.page, v)
  }
  const out: Decay[] = []
  for (const [page, b] of by) {
    if (b[0] < minClicks) continue
    if (!(b[0] > b[1] && b[1] > b[2] && b[2] > b[3])) continue
    const drop = 1 - b[3] / b[0]
    if (drop >= 0.3) out.push({ page, blocks: b, drop: Math.round(drop * 100) / 100 })
  }
  return out.sort((a, b) => (b.blocks[0] - b.blocks[3]) - (a.blocks[0] - a.blocks[3]))
}

export type BuyerSearch = { market: string; query: string; country: string | null }
export type BuyerPos = BuyerSearch & { pos: number | null; impr: number }

/**
 * Where each money search sits: the best page's impression-weighted position
 * over the given weeks, in its own country when one is named.
 */
export function buyerPositions(list: BuyerSearch[], rows: (WeekRow & { query: string; page: string; country: string })[]): BuyerPos[] {
  const byQ = new Map<string, typeof rows>()
  for (const r of rows) {
    const k = r.query.toLowerCase()
    const v = byQ.get(k) ?? []
    v.push(r)
    byQ.set(k, v)
  }
  return list.map(b => {
    const mine = (byQ.get(b.query.toLowerCase()) ?? []).filter(r => !b.country || r.country === b.country)
    const pages = new Map<string, WeekRow[]>()
    for (const r of mine) pages.set(r.page, [...(pages.get(r.page) ?? []), r])
    let best: Agg | null = null
    for (const rs of pages.values()) { const a = agg(rs); if (a.pos !== null && (!best || a.pos < best.pos!)) best = a }
    return { ...b, pos: best?.pos ?? null, impr: mine.reduce((t, r) => t + r.impr, 0) }
  })
}

/** Per market: how many money searches rank at all, and how many in the top 10. */
export function topTen(ps: BuyerPos[]): Map<string, { total: number; ranked: number; top10: number }> {
  const out = new Map<string, { total: number; ranked: number; top10: number }>()
  for (const p of ps) {
    const v = out.get(p.market) ?? { total: 0, ranked: 0, top10: 0 }
    v.total++
    if (p.pos !== null) v.ranked++
    if (p.pos !== null && p.pos <= 10) v.top10++
    out.set(p.market, v)
  }
  return out
}
