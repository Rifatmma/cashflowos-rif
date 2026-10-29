import 'server-only'

// 👉 The weekly Search Console store, read for the pages (owner, 28 Oct 2026):
// what each finished change did, which pages are decaying, and how many money
// searches each market has in the top 10. The rules are in lib/mw-gsc-trend.ts.

import { supabase, supabaseConfigured } from './supabase'
import { isoWeek, type WeekTask } from './mw-week'
import { pathOf } from './mw-gsc-week'
import { slugOfPath } from './mw-cliq'
import {
  addWeeks, beforeAfter, resultLine, decaying, buyerPositions, topTen,
  type BeforeAfter, type Decay, type BuyerSearch, type BuyerPos,
} from './mw-gsc-trend'

/** The newest week Search Console has been pulled for. */
export async function latestGscWeek(): Promise<string | null> {
  if (!supabaseConfigured) return null
  const { data } = await supabase.from('mw_gsc_pweek').select('week').order('week', { ascending: false }).limit(1).maybeSingle()
  return data?.week ? String(data.week) : null
}

/** The live page a finished card changed, or null when it changed none. */
export function pageOfCard(t: WeekTask): string | null {
  const p = t.payload ?? {}
  const url = String(p.url ?? p.page ?? t.links.find(l => /movingwalls\.com/i.test(l.url) && /live/i.test(l.label))?.url ?? '')
  return /movingwalls\.com/i.test(url) ? pathOf(url) : null
}

export type Enq = { all: number; buyers: number }
export type CardResult = { task: WeekTask; page: string; changeWeek: string; result: BeforeAfter; line: string; enquiries: { before: Enq; after: Enq } | null }

/**
 * Enquiries sent from each page (its slug) in the four weeks before a change and
 * the four after, from the #Website Leads posts in Zoho Cliq (mw_cliq_leads).
 * The change week counts for neither, as with Search Console.
 */
async function enquiriesAround(items: { page: string; changeWeek: string }[]): Promise<Map<string, { before: Enq; after: Enq }>> {
  const out = new Map<string, { before: Enq; after: Enq }>()
  const slugs = [...new Set(items.map(i => slugOfPath(i.page)).filter((s): s is string => !!s))]
  if (!slugs.length) return out
  const { data, error } = await supabase.from('mw_cliq_leads').select('at, page, is_buyer').in('page', slugs)
  if (error || !data?.length) return out
  // Weeks in Malaysia time, as the rest of /mw counts them.
  const rows = (data as any[]).map(r => ({ page: String(r.page), week: isoWeek(new Date(Date.parse(r.at) + 8 * 3600_000).toISOString().slice(0, 10)), buyer: !!r.is_buyer }))
  for (const i of items) {
    const slug = slugOfPath(i.page)
    const before = new Set([1, 2, 3, 4].map(k => addWeeks(i.changeWeek, -k)))
    const after = new Set([1, 2, 3, 4].map(k => addWeeks(i.changeWeek, k)))
    const of = (ws: Set<string>) => { const r = rows.filter(x => x.page === slug && ws.has(x.week)); return { all: r.length, buyers: r.filter(x => x.buyer).length } }
    out.set(`${i.page}|${i.changeWeek}`, { before: of(before), after: of(after) })
  }
  return out
}

/**
 * Every finished card that changed a live page — Dinesh's publishes and
 * website fixes — with four weeks before against four after.
 */
export async function cardResults(tasks: WeekTask[]): Promise<CardResult[]> {
  const latest = await latestGscWeek()
  const done = tasks
    .filter(t => t.state === 'done' && (t.kind === 'publish' || t.kind === 'tech') && t.updatedAt)
    .map(t => ({ t, page: pageOfCard(t) }))
    .filter((x): x is { t: WeekTask; page: string } => !!x.page)
  if (!latest || !done.length || !supabaseConfigured) return []
  const pages = [...new Set(done.map(x => x.page))]
  const { data } = await supabase.from('mw_gsc_pweek').select('week, page, clicks, impr, pos').in('page', pages)
  const rows = ((data ?? []) as any[]).map(r => ({ week: String(r.week), page: String(r.page), clicks: Number(r.clicks), impr: Number(r.impr), pos: Number(r.pos) }))
  const withWeek = done.map(({ t, page }) => ({ t, page, changeWeek: isoWeek(String(t.updatedAt).slice(0, 10)) }))
  const enq = await enquiriesAround(withWeek)
  return withWeek.map(({ t, page, changeWeek }) => {
    const result = beforeAfter(rows.filter(r => r.page === page), changeWeek, latest)
    return { task: t, page, changeWeek, result, line: resultLine(result), enquiries: enq.get(`${page}|${changeWeek}`) ?? null }
  }).sort((a, b) => b.changeWeek.localeCompare(a.changeWeek))
}

/** Every finished change card from any week (the To do page shows their results). */
export async function finishedChanges(): Promise<WeekTask[]> {
  if (!supabaseConfigured) return []
  const { rowToTask } = await import('./mw-week-store')
  const { data } = await supabase.from('mw_week_tasks')
    .select('id, week, owner, kind, market, title, why, steps, links, done_when, due, value, state, reason, payload, source_id, carried, finding_id, updated_at, updated_by')
    .eq('state', 'done').in('kind', ['publish', 'tech']).order('updated_at', { ascending: false }).limit(40)
  return ((data ?? []) as any[]).map(rowToTask)
}

/** Pages losing clicks three 4-week blocks running. */
export async function decayWatch(): Promise<{ latest: string | null; pages: Decay[] }> {
  const latest = await latestGscWeek()
  if (!latest || !supabaseConfigured) return { latest, pages: [] }
  const from = addWeeks(latest, -15)
  const rows: any[] = []
  for (let off = 0; ; off += 1000) {
    const { data } = await supabase.from('mw_gsc_pweek').select('week, page, clicks, impr, pos').gte('week', from).range(off, off + 999)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const weeks = new Set(rows.map(r => String(r.week)))
  // Four full blocks or no verdict: a half-filled history would read as decay.
  if (weeks.size < 16) return { latest, pages: [] }
  return { latest, pages: decaying(rows.map(r => ({ week: String(r.week), page: String(r.page), clicks: Number(r.clicks), impr: Number(r.impr), pos: Number(r.pos) })), latest) }
}

export type BuyerSummary = {
  latest: string | null
  list: BuyerPos[]
  byMarket: { market: string; total: number; ranked: number; top10: number; top10Before: number }[]
}

/** The money searches per market: positions over the last 4 weeks, and the 4 weeks before for the trend. */
export async function buyerSummary(): Promise<BuyerSummary> {
  const latest = await latestGscWeek()
  if (!latest || !supabaseConfigured) return { latest, list: [], byMarket: [] }
  const { data: bl } = await supabase.from('mw_buyer_searches').select('market, query, country')
  const list: BuyerSearch[] = ((bl ?? []) as any[]).map(r => ({ market: String(r.market), query: String(r.query), country: r.country ? String(r.country) : null }))
  if (!list.length) return { latest, list: [], byMarket: [] }

  const from = addWeeks(latest, -7)
  const queries = [...new Set(list.map(b => b.query.toLowerCase()))]
  const rows: any[] = []
  // Small batches: the searches travel in the URL, and 150 of them in Japanese,
  // Chinese or Arabic made the request too long — it failed and read as "not ranking".
  for (let i = 0; i < queries.length; i += 30) {
    const { data, error } = await supabase.from('mw_gsc_qweek').select('week, country, query, page, clicks, impr, pos')
      .gte('week', from).in('query', queries.slice(i, i + 30))
    if (error) throw new Error(`mw_gsc_qweek: ${error.message}`)
    rows.push(...(data ?? []))
  }
  const norm = rows.map(r => ({ week: String(r.week), country: String(r.country), query: String(r.query), page: String(r.page), clicks: Number(r.clicks), impr: Number(r.impr), pos: Number(r.pos) }))
  const cut = addWeeks(latest, -3)
  const now = buyerPositions(list, norm.filter(r => r.week >= cut))
  const before = topTen(buyerPositions(list, norm.filter(r => r.week < cut)))
  const byMarket = [...topTen(now)].map(([market, v]) => ({ market, ...v, top10Before: before.get(market)?.top10 ?? 0 }))
  return { latest, list: now, byMarket }
}
