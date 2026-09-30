import 'server-only'
// 👉 Gathering the evidence for the market plan, and writing the tasks.
//
// Three sources, each degrading on its own rather than taking the others down:
//   sitemap.xml   — which pages exist. Public, always available, and enough on
//                   its own to prove "there is no Nigeria page".
//   GA4           — sessions and leads by country. Already connected.
//   Search Console— the queries, their positions and the page Google shows.
//                   The only source that can name a keyword; needs the Google
//                   account to be granted access to the movingwalls.com
//                   property, which is a person's job, not a robot's.
//
// Whatever comes back, lib/mw-plan.ts turns into tasks and this file upserts
// them into mw_actions. Ids are deterministic, so a re-run updates a task and
// leaves the team's decision on it untouched.
import { supabase, supabaseConfigured } from './supabase'
import { runTool, runWorkbench } from './composio-mcp'
import {
  withOwners, withSpecialists, OWNER_SEED, SPECIALIST_SEED, dbOf, COUNTRIES,
  type Market, type Specialists, type Country,
} from './mw-markets'
import { fetchDbRanks, fetchKeywords, fetchCompetitors, brandSplit, type SemrushKeyword } from './mw-semrush'
import { auditPage, type PageHealth } from './mw-pagehealth'
import { getGaps } from './mw-gap-run'
import { worthWriting, type GapCluster } from './mw-gap'
import { buildPlan, type MarketRow, type Ga4Country, type PlanInput, type PlanTask } from './mw-plan'

const SITE = 'https://www.movingwalls.com'
const SITE_DOMAIN = 'movingwalls.com'
const GSC_PROPERTY = (process.env.GSC_PROPERTY || 'sc-domain:movingwalls.com').trim()
const GA4 = (() => {
  const raw = (process.env.GA4_PROPERTY_ID || '342007847').trim()
  return raw.startsWith('properties/') ? raw : `properties/${raw}`
})()

/**
 * The cycle a plan is filed under, e.g. "2026-10".
 *
 * MONTHLY, not weekly, and the reason is in the data: when the previous
 * position was pulled for every market, Semrush returned prev exactly equal
 * to pos everywhere -- their regional databases refresh about monthly, so a
 * weekly pull re-reads identical numbers and bills for it. SEO does not move
 * faster either: a rewritten page takes four to eight weeks. Pulling monthly
 * means the next pull IS the measurement of the last one, and the team is not
 * handed a reshuffled plan before they have started the old one
 * (owner, 29 Sep 2026).
 */
export function cycleOf(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

// ------------------------------------------------------------------ sources
/** Every path on the site. Public file, no credentials. */
export async function fetchPages(): Promise<string[]> {
  const res = await fetch(`${SITE}/sitemap.xml`, {
    headers: { 'user-agent': 'CashflowOS/1.0 (market plan)' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`sitemap ${res.status}`)
  const xml = await res.text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(m => m[1].replace(/^https?:\/\/[^/]+/, '').split('?')[0].replace(/\/$/, '') || '/')
}

/** Sessions, users and key events by country, last 28 days. */
export async function fetchGa4Countries(): Promise<Ga4Country[]> {
  const end = new Date()
  const start = new Date(end.getTime() - 28 * 86_400_000)
  const out = await runTool('GOOGLE_ANALYTICS_BATCH_RUN_REPORTS', undefined, {
    property: GA4,
    requests: [{
      dateRanges: [{ startDate: ymd(start), endDate: ymd(end) }],
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'keyEvents' }],
      // ORGANIC ONLY. Without this the plan counts paid, direct, referral and
      // social too, and an SEO task ends up justified by traffic SEO never
      // earned -- the United States read 12,198 sessions all-channel against
      // about 172 organic, a seventy-fold overstatement that would have sent
      // a market lead chasing the wrong thing (owner, 29 Sep 2026).
      dimensionFilter: {
        filter: {
          fieldName: 'sessionDefaultChannelGroup',
          stringFilter: { matchType: 'EXACT', value: 'Organic Search' },
        },
      },
      limit: 300,
    }],
  })
  const rep = (out?.reports ?? out?.batchReports ?? [])[0]
  return (rep?.rows ?? []).map((r: any) => ({
    country: String(r.dimensionValues?.[0]?.value ?? ''),
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
    users: Number(r.metricValues?.[1]?.value ?? 0),
    leads: Number(r.metricValues?.[2]?.value ?? 0),
  })).filter((r: Ga4Country) => r.country)
}

/**
 * Query x page x country from Search Console, last 28 days.
 *
 * Returns [] with a reason rather than throwing: the rest of the plan is still
 * worth producing when this is not yet authorised.
 */
export async function fetchGsc(): Promise<{ rows: MarketRow[]; note: string }> {
  const end = new Date(Date.now() - 3 * 86_400_000)      // GSC lags two to three days
  const start = new Date(end.getTime() - 28 * 86_400_000)
  try {
    const out = await runTool('GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY', undefined, {
      site_url: GSC_PROPERTY,
      start_date: ymd(start),
      end_date: ymd(end),
      dimensions: ['query', 'page', 'country'],
      row_limit: 5000,
    })
    const rows: MarketRow[] = (out?.rows ?? []).map((r: any) => ({
      query: String(r.keys?.[0] ?? ''),
      page: String(r.keys?.[1] ?? ''),
      country: String(r.keys?.[2] ?? '').toUpperCase(),
      visits: Number(r.clicks ?? 0),
      volume: Number(r.impressions ?? 0),
      ctr: Number(r.ctr ?? 0),
      position: Number(r.position ?? 0),
    })).filter((r: MarketRow) => r.query && r.country)
    return { rows, note: rows.length ? `Search Console: ${rows.length} rows` : 'Search Console returned no rows' }
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    const denied = /permission|403|forbidden/i.test(msg)
    return {
      rows: [],
      note: denied
        ? `Search Console: no access to ${GSC_PROPERTY} yet — the connected Google account must be added as a user on the property`
        : `Search Console: ${msg.slice(0, 140)}`,
    }
  }
}

// ------------------------------------------------------------------- owners
export async function getOwners(): Promise<Market[]> {
  if (!supabaseConfigured) return withOwners()
  const { data } = await supabase.from('mw_settings').select('value').eq('key', 'market_owners').maybeSingle()
  if (!data?.value) {
    await supabase.from('mw_settings').upsert({ key: 'market_owners', value: OWNER_SEED }, { onConflict: 'key' })
    return withOwners()
  }
  return withOwners(data.value as any)
}

/** The cross-market people, seeded on first run and editable in settings. */
export async function getSpecialists(): Promise<Specialists> {
  if (!supabaseConfigured) return withSpecialists()
  const { data } = await supabase.from('mw_settings').select('value').eq('key', 'seo_specialists').maybeSingle()
  if (!data?.value) {
    await supabase.from('mw_settings').upsert({ key: 'seo_specialists', value: SPECIALIST_SEED }, { onConflict: 'key' })
    return withSpecialists()
  }
  return withSpecialists(data.value as any)
}

// ------------------------------------------------------------- semrush
export type MarketEvidence = {
  country: Country
  market: string
  db: string
  rank: number
  keywordsTotal: number
  traffic: number
  cost: number
  keywords: SemrushKeyword[]
  competitors: { domain: string; common: number; keywords: number; traffic: number }[]
  brandPct: number
  nonBrandPct: number
}

/** A database is worth a keyword pull only if it has keywords. Units cost money. */
const WORTH_PULLING = 3

/**
 * Semrush for every market that has anything.
 *
 * One cheap call lists every regional database we appear in; only the ones
 * with real presence then get the expensive per-market pulls. That keeps a
 * weekly run in the low thousands of API units instead of pulling 38
 * databases where we rank for nothing.
 */
export async function fetchSemrush(
  notes: string[],
  opts: { competitors?: boolean; perMarket?: number } = {},
): Promise<MarketEvidence[]> {
  const ranks = await fetchDbRanks(SITE_DOMAIN)
  const byDb = new Map(ranks.map(r => [r.db, r]))
  notes.push(`Semrush: present in ${ranks.length} regional databases`)

  const targets = COUNTRIES
    .map(({ country, market }) => ({ country, market, db: dbOf(country) }))
    .filter((t): t is { country: Country; market: Market; db: string } => !!t.db)
    .map(t => ({ ...t, rank: byDb.get(t.db) }))
    .filter(t => (t.rank?.keywords ?? 0) >= WORTH_PULLING)
    .sort((a, b) => (b.rank?.traffic ?? 0) - (a.rank?.traffic ?? 0))

  const skipped = COUNTRIES.length - targets.length
  notes.push(`Semrush: pulling keywords for ${targets.length} countries, skipping ${skipped} with no presence`)

  const out: MarketEvidence[] = []
  for (const t of targets) {
    try {
      const keywords = await fetchKeywords(SITE_DOMAIN, t.db, opts.perMarket ?? 120)
      const competitors = opts.competitors === false ? [] : await fetchCompetitors(SITE_DOMAIN, t.db, 8).catch(() => [])
      const split = brandSplit(keywords)
      out.push({
        country: t.country, market: t.market.key, db: t.db,
        rank: t.rank?.rank ?? 0,
        keywordsTotal: t.rank?.keywords ?? keywords.length,
        traffic: t.rank?.traffic ?? 0,
        cost: t.rank?.cost ?? 0,
        keywords, competitors,
        brandPct: split.brand, nonBrandPct: split.nonBrand,
      })
    } catch (e: any) {
      notes.push(`Semrush ${t.db} failed: ${String(e?.message ?? e).slice(0, 80)}`)
    }
  }
  return out
}

/** Semrush keywords, reshaped into the rows the planner reasons over. */
export function toMarketRows(ev: MarketEvidence[]): MarketRow[] {
  return ev.flatMap(e => e.keywords.map(k => ({
    query: k.q,
    page: k.url,
    country: e.country.iso3,
    volume: k.vol,
    visits: k.traffic,
    ctr: k.vol > 0 ? k.traffic / k.vol : 0,
    position: k.pos,
    kd: k.kd,
    prev: k.prev,
  })))
}

// --------------------------------------------------------------- page audit
/**
 * Audit the live location pages. No API, no key: this is the one source that
 * cannot be taken away from us, so it runs even when everything else fails.
 */
export async function auditLocations(pages: string[], notes: string[]): Promise<Record<string, PageHealth>> {
  const wanted = pages.filter(p => /^\/locations\/[^/]+$/.test(p)).slice(0, 40)
  const out: Record<string, PageHealth> = {}
  // Sequential on purpose: this is somebody's live site, not a load test.
  for (const path of wanted) {
    try {
      const h = await auditPage(`${SITE}${path}`)
      out[path] = h
    } catch { /* auditPage already turns failure into a finding */ }
  }
  const bad = Object.values(out).filter(h => h.faults.length).length
  notes.push(`Page audit: ${Object.keys(out).length} location pages read, ${bad} with something to fix`)
  return out
}

// -------------------------------------------------------------------- write
/**
 * Upsert the plan into mw_actions. Same id next week means the task is updated
 * and whatever the lead decided about it stays attached; a task whose reason
 * has gone is retired with active=false rather than deleted, so the history of
 * what was asked for survives.
 */
export async function saveTasks(
  tasks: PlanTask[],
  cycle: string,
  /**
   * Kinds this run was actually able to look for. A kind left out is one
   * whose SOURCE FAILED, and its existing tasks are left alone.
   *
   * This exists because of a real incident: Semrush returned WRONG KEY while
   * GA4 answered fine, so the run rebuilt the plan from what it had and
   * retired twenty tasks -- every striking-distance, city, gap and
   * cannibalisation task on the board -- because they were "no longer
   * generated". They were still true; we had simply gone blind to them.
   * Absence of evidence is not evidence the work is done (owner, 30 Sep 2026).
   */
  canRetire?: Set<string>,
): Promise<{ written: number; retired: number }> {
  if (!supabaseConfigured || !tasks.length) return { written: 0, retired: 0 }
  const rows = tasks.map((t, i) => ({
    id: t.id,
    channel: 'seo' as const,
    status: 'not' as const,
    title: t.title,
    sub: t.why,
    evidence: t.keywords.length
      ? t.keywords.map(k => `#${k.pos.toFixed(0)} · ${Math.round(k.vol)} searches/mo · ${k.visits} visits · ${k.q}`).join('\n')
      : null,
    impact: t.score > 50 ? 'highest' : t.score > 15 ? 'high' : 'medium',
    cross_channel: false,
    sort: 100 + i,
    active: true,
    market: t.market,
    owner: t.owner,
    size: t.size,
    how: { steps: t.steps, keywords: t.keywords, url: t.url, doneWhen: t.doneWhen, kind: t.kind, country: t.countryLabel, score: t.score, blockedBy: t.blockedBy, group: t.group, holds: t.holds },
    source: 'generated',
    theme: t.theme,
    cycle,
  }))
  const { error } = await supabase.from('mw_actions').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(`saving tasks: ${error.message}`)

  // Anything generated before and not in this cycle no longer has a reason.
  // Only real work earns the right to retire real work: a run that produced
  // nothing but "no data" notes is an outage, not an empty week, and must
  // leave last cycle's tasks where the team can still see them.
  if (!tasks.some(t => t.kind !== 'blind')) return { written: rows.length, retired: 0 }
  const keep = new Set(rows.map(r => r.id))
  const { data: old } = await supabase.from('mw_actions').select('id, how')
    .eq('source', 'generated').eq('active', true)
  const gone = (old ?? [])
    .filter((r: any) => !keep.has(r.id as string))
    .filter((r: any) => !canRetire || canRetire.has(String(r.how?.kind ?? '')))
    .map((r: any) => r.id as string)
  if (gone.length) await supabase.from('mw_actions').update({ active: false }).in('id', gone)
  return { written: rows.length, retired: gone.length }
}

// --------------------------------------------------------------------- run
export type PlanRun = {
  ok: boolean
  message: string
  cycle: string
  tasks: PlanTask[]
  notes: string[]
}

/** The whole thing: gather, plan, save. Never throws. */
export async function refreshPlan(opts: { save?: boolean; competitors?: boolean } = {}): Promise<PlanRun> {
  const cycle = cycleOf()
  const notes: string[] = []
  try {
    const [markets, specialists] = await Promise.all([getOwners(), getSpecialists()])

    // Four sources, each failing on its own. Semrush is the ranking source
    // now -- it covers all ten markets without anybody granting access, which
    // Search Console has not done. GSC is still asked for and still merged in
    // if it ever starts answering; it is simply no longer the thing we wait
    // on (owner, 29 Sep 2026).
    const [pages, ga4, gsc, semrush] = await Promise.all([
      fetchPages().catch(e => { notes.push(`sitemap failed: ${String(e?.message ?? e).slice(0, 120)}`); return [] as string[] }),
      fetchGa4Countries().catch(e => { notes.push(`GA4 failed: ${String(e?.message ?? e).slice(0, 120)}`); return [] as Ga4Country[] }),
      fetchGsc(),
      fetchSemrush(notes, { competitors: opts.competitors }).catch(e => {
        notes.push(`Semrush failed: ${String(e?.message ?? e).slice(0, 120)}`)
        return [] as MarketEvidence[]
      }),
    ])
    notes.push(`sitemap: ${pages.length} pages`, `GA4: ${ga4.length} countries`, gsc.note)

    const health = await auditLocations(pages, notes).catch(() => ({} as Record<string, PageHealth>))

    // The gap is pulled quarterly and read here every month, so a content
    // brief stays on the board across the plans between gap pulls.
    const gapRows = await getGaps().catch(() => [])
    const gaps: Record<string, GapCluster[]> = {}
    for (const g of gapRows) gaps[g.country] = g.clusters.filter(worthWriting)
    if (gapRows.length) notes.push(`content gap: ${gapRows.length} countries carried in from ${gapRows[0].quarter}`)

    // Semrush first, Search Console after: if GSC ever comes back it adds the
    // queries Semrush cannot see, and the planner treats both the same way.
    const rows = [...toMarketRows(semrush), ...gsc.rows]

    // With no ranking data and no analytics there is nothing to reason from,
    // and a run that produced only "no data" notes must not retire real work.
    if (!rows.length && !ga4.length && !Object.keys(health).length) {
      return {
        ok: false, cycle, tasks: [], notes,
        message: `plan ${cycle}: no data from Semrush, GA4 or Search Console — kept the previous plan`,
      }
    }

    const input: PlanInput = { rows, ga4, pages, markets, specialists, health, gaps, cycle }
    const tasks = buildPlan(input)
    const real = tasks.filter(t => t.kind !== 'blind')

    // Which sources actually answered. Only kinds a working source can
    // produce are eligible for retirement.
    const KINDS_BY_SOURCE = {
      ranking: ['strike', 'no-clicks', 'city', 'city-build', 'orphan', 'cannibal'],
      analytics: ['no-page', 'page-build', 'convert'],
      audit: ['health'],
      gap: ['gap'],
    } as const
    const canRetire = new Set<string>(['blind'])
    if (rows.length) KINDS_BY_SOURCE.ranking.forEach(k => canRetire.add(k))
    if (ga4.length) KINDS_BY_SOURCE.analytics.forEach(k => canRetire.add(k))
    if (Object.keys(health).length) KINDS_BY_SOURCE.audit.forEach(k => canRetire.add(k))
    if (gapRows.length) KINDS_BY_SOURCE.gap.forEach(k => canRetire.add(k))

    const blind = (['ranking', 'analytics', 'audit', 'gap'] as const)
      .filter(src => !KINDS_BY_SOURCE[src].some(k => canRetire.has(k)))
    if (blind.length) notes.push(`held back: ${blind.join(', ')} did not answer, so their tasks were left alone`)

    const saved = opts.save === false ? { written: 0, retired: 0 } : await saveTasks(tasks, cycle, canRetire)
    if (opts.save !== false) await saveMarketSeo(semrush, ga4, health, cycle).catch(e =>
      notes.push(`market evidence not saved: ${String(e?.message ?? e).slice(0, 80)}`))

    return {
      ok: true, cycle, tasks, notes,
      message: `plan ${cycle}: ${real.length} tasks across ${new Set(real.map(t => t.market)).size} markets` +
        (saved.written ? ` \u00b7 ${saved.written} saved, ${saved.retired} retired` : ' \u00b7 not saved (dry run)'),
    }
  } catch (e: any) {
    return { ok: false, cycle, tasks: [], notes, message: `plan failed: ${String(e?.message ?? e).slice(0, 200)}` }
  }
}

/**
 * The evidence behind the plan, kept per market so the SEO page can show each
 * market its own numbers instead of India's.
 */
export async function saveMarketSeo(
  ev: MarketEvidence[],
  ga4: Ga4Country[],
  health: Record<string, PageHealth>,
  cycle: string,
): Promise<number> {
  if (!supabaseConfigured) return 0
  const rows = COUNTRIES.map(({ country, market }) => {
    const e = ev.find(x => x.country.key === country.key)
    const g = ga4.find(x => x.country.toLowerCase() === country.ga4.toLowerCase())
    const h = health[`/locations/${country.key}`] ?? null
    if (!e && !g && !h) return null
    return {
      cycle, country: country.key, market: market.key,
      db: e?.db ?? null,
      rank: e?.rank ?? null,
      keywords_total: e?.keywordsTotal ?? 0,
      traffic: e?.traffic ?? 0,
      cost: e?.cost ?? 0,
      brand_pct: e?.brandPct ?? null,
      nonbrand_pct: e?.nonBrandPct ?? null,
      keywords: e?.keywords ?? [],
      competitors: e?.competitors ?? [],
      gap: [],
      health: h,
      health_baseline: h?.score ?? null,
      ga4_sessions: g?.sessions ?? 0,
      ga4_leads: g?.leads ?? 0,
      pulled_at: new Date().toISOString(),
    }
  }).filter(Boolean)
  if (!rows.length) return 0
  const { error } = await supabase.from('mw_market_seo').upsert(rows as any[], { onConflict: 'cycle,country' })
  if (error) throw new Error(`saving market evidence: ${error.message}`)
  return rows.length
}


// ------------------------------------------------------- the daily watch
/**
 * Re-read the live pages and nothing else.
 *
 * This runs every day while the plan runs monthly, because it is a smoke
 * alarm rather than a planning signal: a page that starts returning 404, a
 * title truncated by a deploy, a dropped canonical. It needs no API and no
 * key, so it cannot be taken away from us and costs nothing to run.
 *
 * It deliberately DOES NOT touch the plan -- no tasks created, none retired,
 * nobody's work reshuffled. It only refreshes the health column on the
 * current cycle's rows, leaving `health_baseline` as the monthly run left it
 * so the board can show what has got worse since (owner, 29 Sep 2026).
 */
export async function refreshHealth(): Promise<{ ok: boolean; message: string; broken: string[] }> {
  const notes: string[] = []
  try {
    if (!supabaseConfigured) return { ok: false, message: 'supabase not configured', broken: [] }
    const cycle = cycleOf()
    const pages = await fetchPages()
    const health = await auditLocations(pages, notes)

    const { data: rows } = await supabase.from('mw_market_seo')
      .select('country, health_baseline').eq('cycle', cycle)
    if (!rows?.length) {
      return { ok: true, message: `no plan for ${cycle} yet — health not stored`, broken: [] }
    }

    const broken: string[] = []
    const updates = rows.map((r: any) => {
      const h = health[`/locations/${r.country}`]
      if (!h) return null
      if (!h.ok) broken.push(`/locations/${r.country} (HTTP ${h.status})`)
      else if (r.health_baseline != null && h.score < Number(r.health_baseline) - 10) {
        broken.push(`/locations/${r.country} (${r.health_baseline} → ${h.score})`)
      }
      return { cycle, country: r.country, health: h }
    }).filter(Boolean)

    for (const u of updates as any[]) {
      await supabase.from('mw_market_seo')
        .update({ health: u.health }).eq('cycle', cycle).eq('country', u.country)
    }

    return {
      ok: true,
      broken,
      message: `health: ${updates.length} pages re-read${broken.length ? ` · ${broken.length} worse or broken: ${broken.join(', ')}` : ' · nothing broke'}`,
    }
  } catch (e: any) {
    return { ok: false, message: `health watch failed: ${String(e?.message ?? e).slice(0, 160)}`, broken: [] }
  }
}
