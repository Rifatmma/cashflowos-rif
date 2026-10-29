import 'server-only'

// 👉 Search Console one ISO week at a time (owner, 28 Oct 2026: "weekly Search
// Console"). The monthly refresh keeps a 28-day picture per market; this keeps
// every week separately, so the To do page can say what a change did (four
// weeks before against four weeks after), the decay watch can see a page
// losing clicks three months running, and the buyer-search list can count how
// many money searches sit in the top 10 each week.
//
// Two pulls a week:
//   mw_gsc_qweek  query x page x country — positions of named searches
//   mw_gsc_pweek  page                    — a page's own totals. Summing the
//                 query rows undercounts: Search Console hides rare queries.
//
// Search Console lags two to three days, so a Monday run re-pulls the week
// before last as well as last week; the second pull completes the first.

import { supabase, supabaseConfigured } from './supabase'
import { gscQuery } from './mw-gsc'
import { findGscProperty } from './mw-plan-run'
import { mondayOf } from './mw-week'

export const pathOf = (url: string) => url.replace(/^https?:\/\/(www\.)?movingwalls\.com/i, '').replace(/[?#].*$/, '') || '/'

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

async function upsertAll(table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 1000), { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

/** Pull one ISO week into both tables. Replaces whatever that week held. */
export async function pullGscWeek(week: string): Promise<{ week: string; queries: number; pages: number }> {
  if (!supabaseConfigured) throw new Error('Supabase is not configured')
  const notes: string[] = []
  const property = await findGscProperty(notes)
  if (!property) throw new Error(notes[0] ?? 'Search Console: no readable property')
  const start = mondayOf(week), end = addDays(start, 6)

  const [q, p] = await Promise.all([
    gscQuery({ property, start, end, dimensions: ['query', 'page', 'country'], rowLimit: 25_000, minImpressions: 1 }),
    gscQuery({ property, start, end, dimensions: ['page'], rowLimit: 5_000 }),
  ])

  // Several URLs (with and without www, with a query string) can fold into one
  // path; add them up rather than letting the last one win.
  const qs = new Map<string, { week: string; country: string; query: string; page: string; clicks: number; impr: number; posW: number }>()
  for (const r of q) {
    const [query, url, country] = r.keys
    if (!query || !url || !country) continue
    const page = pathOf(url), c = country.toLowerCase(), k = `${c}\u0000${query}\u0000${page}`
    const e = qs.get(k) ?? { week, country: c, query, page, clicks: 0, impr: 0, posW: 0 }
    e.clicks += r.clicks; e.impr += r.impressions; e.posW += r.position * r.impressions
    qs.set(k, e)
  }
  const ps = new Map<string, { week: string; page: string; clicks: number; impr: number; posW: number }>()
  for (const r of p) {
    const page = pathOf(r.keys[0] ?? '')
    const e = ps.get(page) ?? { week, page, clicks: 0, impr: 0, posW: 0 }
    e.clicks += r.clicks; e.impr += r.impressions; e.posW += r.position * r.impressions
    ps.set(page, e)
  }
  const pos = (e: { impr: number; posW: number }) => (e.impr ? Math.round((e.posW / e.impr) * 100) / 100 : 0)

  await supabase.from('mw_gsc_qweek').delete().eq('week', week)
  await supabase.from('mw_gsc_pweek').delete().eq('week', week)
  await upsertAll('mw_gsc_qweek', [...qs.values()].map(({ posW, ...e }) => ({ ...e, pos: pos({ impr: e.impr, posW }) })), 'week,country,query,page')
  await upsertAll('mw_gsc_pweek', [...ps.values()].map(({ posW, ...e }) => ({ ...e, pos: pos({ impr: e.impr, posW }) })), 'week,page')
  return { week, queries: qs.size, pages: ps.size }
}
