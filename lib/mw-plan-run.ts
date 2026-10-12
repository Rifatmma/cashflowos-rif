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
import { buildPlan, type MarketRow, type Ga4Country, type PlanInput, type PlanTask, type PlanKeyword } from './mw-plan'
import type { BlogPost } from './mw-linkers'
import { gscQuery } from './mw-gsc'

const SITE = 'https://www.movingwalls.com'
const SITE_DOMAIN = 'movingwalls.com'
/**
 * Which Search Console property to read.
 *
 * DO NOT HARDCODE ONE. This was pinned to `sc-domain:movingwalls.com` and
 * every call 403'd for a week, which we read as "nobody has granted us
 * access". The account had full access the whole time -- to the URL-prefix
 * property `https://www.movingwalls.com/`. Two properties exist, we asked
 * for the wrong one, and the error was indistinguishable from a permission
 * problem.
 *
 * So the property is discovered: ask Search Console what this account can
 * actually read and take the best one. GSC_PROPERTY still overrides, for
 * when there are several and the right one is not obvious
 * (owner, 30 Sep 2026).
 */
const GSC_OVERRIDE = (process.env.GSC_PROPERTY || '').trim()

/** Permission levels that can read search analytics, best first. */
const READABLE = ['siteOwner', 'siteFullUser', 'siteRestrictedUser']

let gscProperty: string | null = null

export async function findGscProperty(notes?: string[]): Promise<string | null> {
  if (GSC_OVERRIDE) return GSC_OVERRIDE
  if (gscProperty) return gscProperty
  try {
    const out = await runTool('GOOGLE_SEARCH_CONSOLE_LIST_SITES', undefined, {})
    const sites: { siteUrl?: string; permissionLevel?: string }[] = out?.siteEntry ?? []
    const usable = sites
      .filter(x => x.siteUrl && READABLE.includes(String(x.permissionLevel)))
      .sort((a, b) => READABLE.indexOf(String(a.permissionLevel)) - READABLE.indexOf(String(b.permissionLevel)))
    if (!usable.length) {
      notes?.push(`Search Console: the connected account can see ${sites.length} properties but can read none of them`)
      return null
    }
    gscProperty = usable[0].siteUrl!
    if (sites.length > 1) {
      notes?.push(`Search Console: using ${gscProperty} (${usable[0].permissionLevel}) of ${sites.length} properties`)
    }
    return gscProperty
  } catch (e: any) {
    notes?.push(`Search Console: could not list properties — ${String(e?.message ?? e).slice(0, 90)}`)
    return null
  }
}
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
export async function fetchGsc(notes?: string[]): Promise<{ rows: MarketRow[]; note: string }> {
  const property = await findGscProperty(notes)
  if (!property) return { rows: [], note: 'Search Console: no readable property for the connected account' }
  const end = new Date(Date.now() - 3 * 86_400_000)      // GSC lags two to three days
  const start = new Date(end.getTime() - 28 * 86_400_000)
  try {
    // Through the sandbox: a direct call for this comes back "response too
    // large (parked in Composio's sandbox)" and the rows never arrive.
    const got = await gscQuery({
      property, start: ymd(start), end: ymd(end),
      dimensions: ['query', 'page', 'country'], rowLimit: 5000,
      // Filtered in the sandbox: it is the difference between 78k and 30k of
      // payload, and a query seen twice in a month is noise in every
      // calculation downstream.
      minImpressions: 3,
    })
    const rows: MarketRow[] = got.map(r => ({
      query: String(r.keys[0] ?? ''),
      page: String(r.keys[1] ?? ''),
      country: String(r.keys[2] ?? '').toUpperCase(),
      visits: r.clicks,
      volume: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })).filter(r => r.query && r.country)
    return { rows, note: rows.length ? `Search Console: ${rows.length} rows` : 'Search Console returned no rows' }
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    const denied = /permission|403|forbidden/i.test(msg)
    return {
      rows: [],
      note: denied
        ? `Search Console: no access to ${property} — the connected Google account must be added as a user on that property`
        : `Search Console: ${msg.slice(0, 140)}`,
    }
  }
}

/**
 * Per-page Search Console numbers, refreshed daily into mw_gsc_pages.
 *
 * Separate from fetchGsc() above, which pulls query x page x country for the
 * monthly plan. This is one cheap call for the page-level view, and it runs
 * every day because it answers a question nothing else can:
 *
 *   Semrush recorded nothing at all for /locations/india/chennai,
 *   /locations/india/kolkata and /locations/india/hyderabad. Google shows all
 *   three a thousand times a month at an average position inside the top ten.
 *   Without this the city board called 29 pages "quiet" and had no way to tell
 *   a page nobody searches for from one that ranks and is simply not clicked.
 *
 * Fails soft: the rest of the refresh is still worth running.
 */
/**
 * Re-crawl the blog so a task can name the posts worth linking from.
 *
 * NOT CALLED FROM A REQUEST. 289 page fetches cannot finish inside a
 * 60-second function — putting this on the plan day took the whole refresh
 * down with a FUNCTION_INVOCATION_TIMEOUT before anything was written
 * (13 Oct 2026). It is run by scripts/blog-index.mts in a session, the same
 * arrangement as the SEO protection doc and the city audit, and for the same
 * reason. A stale index costs a few link suggestions; a timeout costs the
 * whole refresh.
 *
 * NAV LINKS ARE NOT EDITORIAL LINKS. Six /locations pages sit in the menu of
 * every post; counting those as "already links there" would tell every task
 * there was nothing to add. Found by frequency rather than by parsing the nav:
 * anything on more than half the posts is chrome, whatever markup it is in.
 */
export async function indexBlog(): Promise<{ ok: boolean; message: string; posts: number }> {
  if (!supabaseConfigured) return { ok: false, message: 'blog index: Supabase not configured', posts: 0 }
  const clean = (x: string) => x
    // No backreference: `\1` written through a shell heredoc arrived here as
    // the byte 0x01, so this matched nothing and the crawl indexed JSON-LD
    // instead of article text. Spelled out, it cannot be mangled again.
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
  try {
    const sm = await (await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(30_000) })).text()
    const blogs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/\/$/, '')).filter(u => /\/blog\//.test(u))
    if (!blogs.length) return { ok: false, message: 'blog index: no posts in the sitemap', posts: 0 }

    const rows: any[] = []
    for (let i = 0; i < blogs.length; i += 8) {
      await Promise.all(blogs.slice(i, i + 8).map(async u => {
        try {
          const r = await fetch(u + '/', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; CashflowOS)' }, signal: AbortSignal.timeout(20_000) })
          if (!r.ok) return
          const h = await r.text()
          const body = clean(h)
          rows.push({
            url: u.replace(SITE, ''),
            title: clean((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '') || null,
            words: body.split(' ').length,
            text: body.slice(0, 3000),
            links: [...new Set([...h.matchAll(/href="([^"]*\/locations\/[^"#?]*)"/gi)]
              .map(m => m[1].replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '')))],
            crawled_at: new Date().toISOString(),
          })
        } catch { /* one post failing is not the crawl failing */ }
      }))
    }
    if (!rows.length) return { ok: false, message: 'blog index: nothing could be fetched', posts: 0 }

    const freq = new Map<string, number>()
    for (const r of rows) for (const l of r.links) freq.set(l, (freq.get(l) ?? 0) + 1)
    const nav = new Set([...freq.entries()].filter(([, n]) => n > rows.length / 2).map(([l]) => l))
    for (const r of rows) r.links = r.links.filter((l: string) => !nav.has(l))

    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from('mw_blog_index').upsert(rows.slice(i, i + 100), { onConflict: 'url' })
      if (error) return { ok: false, message: `blog index: ${error.message.slice(0, 120)}`, posts: 0 }
    }
    return { ok: true, message: `blog index: ${rows.length} posts, ${nav.size} nav links ignored`, posts: rows.length }
  } catch (e: any) {
    return { ok: false, message: `blog index: ${String(e?.message ?? e).slice(0, 140)}`, posts: 0 }
  }
}

/** The indexed blog, for naming the posts a task should link from. */
export async function blogPosts(): Promise<BlogPost[]> {
  if (!supabaseConfigured) return []
  const [{ data: posts }, { data: gsc }] = await Promise.all([
    supabase.from('mw_blog_index').select('url, title, words, text, links'),
    supabase.from('mw_gsc_pages').select('url, impressions'),
  ])
  const reach = new Map((gsc ?? []).map((g: any) => [String(g.url), Number(g.impressions) || 0]))
  return (posts ?? []).map((p: any) => ({
    url: String(p.url), title: p.title ?? null, words: Number(p.words) || 0,
    text: String(p.text ?? ''), links: Array.isArray(p.links) ? p.links : [],
    impressions: reach.get(String(p.url)) ?? 0,
  }))
}

export async function refreshGscPages(): Promise<{ ok: boolean; message: string; pages: number }> {
  if (!supabaseConfigured) return { ok: false, message: 'Search Console pages: Supabase not configured', pages: 0 }
  const notes: string[] = []
  const property = await findGscProperty(notes)
  if (!property) return { ok: false, message: notes[0] ?? 'Search Console: no readable property', pages: 0 }

  const end = new Date(Date.now() - 3 * 86_400_000)       // GSC lags two to three days
  const start = new Date(end.getTime() - 28 * 86_400_000)
  const stamp = new Date().toISOString()
  try {
    const got = await gscQuery({ property, start: ymd(start), end: ymd(end), dimensions: ['page'], rowLimit: 1000 })

    // MERGED BY PATH, NOT JUST MAPPED. Google reports the same page under more
    // than one URL — with and without a trailing slash — and both normalise to
    // one path, which made the upsert fail outright: "ON CONFLICT DO UPDATE
    // command cannot affect row a second time". Summing them is also the
    // truthful answer: those are the same page's impressions.
    const merged = new Map<string, { url: string; impressions: number; clicks: number; posWeight: number }>()
    for (const r of got) {
      // Stored as a path: every other table in /mw is keyed that way, and the
      // trailing slash differs between Google and the sitemap.
      const url = String(r.keys[0] ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/'
      if (!url || !(r.impressions > 0)) continue
      const at = merged.get(url) ?? { url, impressions: 0, clicks: 0, posWeight: 0 }
      at.impressions += r.impressions
      at.clicks += r.clicks
      // Average position weighted by impressions: an average of averages would
      // let a page seen twice count as much as one seen two thousand times.
      at.posWeight += r.position * r.impressions
      merged.set(url, at)
    }
    const rows = [...merged.values()].map(m => ({
      url: m.url,
      impressions: Math.round(m.impressions),
      clicks: Math.round(m.clicks),
      ctr: m.impressions > 0 ? m.clicks / m.impressions : 0,
      position: m.impressions > 0 ? Math.round((m.posWeight / m.impressions) * 100) / 100 : 0,
      start_date: ymd(start), end_date: ymd(end), pulled_at: stamp,
    }))
    if (!rows.length) return { ok: true, message: 'Search Console pages: no rows', pages: 0 }

    const { error } = await supabase.from('mw_gsc_pages').upsert(rows, { onConflict: 'url' })
    if (error) return { ok: false, message: `Search Console pages: ${error.message.slice(0, 120)}`, pages: 0 }

    // A page that stopped appearing entirely should not sit there showing last
    // month's impressions for ever. Anything this pull did not touch is zeroed,
    // which reads as "Google showed it nothing" rather than silently going
    // stale.
    //
    // Matched on pulled_at rather than a NOT IN list: the pull can carry a
    // thousand URLs and sending all of them back as a filter is a request
    // large enough to fail on its own.
    await supabase.from('mw_gsc_pages')
      .update({ impressions: 0, clicks: 0, ctr: 0, position: null, start_date: ymd(start), end_date: ymd(end) })
      .lt('pulled_at', stamp)

    return { ok: true, message: `Search Console pages: ${rows.length} pages`, pages: rows.length }
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    return {
      ok: false, pages: 0,
      message: /permission|403|forbidden/i.test(msg)
        ? `Search Console: no access to ${property} — the connected account must be a user on that property`
        : `Search Console pages: ${msg.slice(0, 140)}`,
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
/**
 * Semrush positions keyed by path, for the protection list.
 *
 * Separate from toMarketRows because they answer different questions: the rows
 * feed the opportunity maths (and are filtered by country, brand and
 * relevance on the way in), while this is simply "what does this URL rank
 * for", unfiltered — a brand term at #3 is still a ranking a rewrite can
 * break.
 */
export function rankedByPage(ev: MarketEvidence[]): Record<string, PlanKeyword[]> {
  const out: Record<string, PlanKeyword[]> = {}
  for (const e of ev) {
    for (const k of e.keywords) {
      const path = String(k.url ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/'
      if (!k.q || !(k.pos > 0)) continue
      const list = out[path] ?? (out[path] = [])
      const seen = list.find(x => x.q.toLowerCase() === k.q.toLowerCase())
      if (seen) { if (k.pos < seen.pos) { seen.pos = k.pos; seen.vol = Math.max(seen.vol, k.vol) } continue }
      list.push({ q: k.q, pos: k.pos, vol: k.vol, visits: k.traffic, kd: k.kd, prev: k.prev, url: path })
    }
  }
  return out
}

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
    how: { steps: t.steps, keywords: t.keywords, url: t.url, doneWhen: t.doneWhen, kind: t.kind, country: t.countryLabel, countryKey: t.country, score: t.score, blockedBy: t.blockedBy, group: t.group, holds: t.holds },
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
      fetchGsc(notes),
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

    const ranked = rankedByPage(semrush)
    const posts = await blogPosts()
    if (posts.length) notes.push(`blog index: ${posts.length} posts available to link from`)
    const input: PlanInput = { rows, ga4, pages, markets, specialists, health, gaps, ranked, posts, cycle }
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

  // WHAT A FAILED SOURCE MUST NOT DO IS ERASE WHAT IT FOUND LAST TIME.
  //
  // This wrote every field unconditionally, so a run where Semrush returned
  // WRONG KEY stored `keywords: []`, `brand_pct: null`, `traffic: 0` for all
  // thirty-eight countries -- blanking every keyword table, brand split and
  // opportunity list on the SEO tab. GA4 and the page audit had answered
  // perfectly well; their columns were the only ones that should have moved.
  //
  // So each source now writes only its own columns, and only when it has
  // something (owner, 30 Sep 2026).
  const { data: existing } = await supabase.from('mw_market_seo')
    .select('*').eq('cycle', cycle)
  const before = new Map((existing ?? []).map((r: any) => [r.country as string, r]))

  const rows = COUNTRIES.map(({ country, market }) => {
    const e = ev.find(x => x.country.key === country.key)
    const g = ga4.find(x => x.country.toLowerCase() === country.ga4.toLowerCase())
    const h = health[`/locations/${country.key}`] ?? null
    const old = before.get(country.key)
    if (!e && !g && !h && !old) return null

    const row: Record<string, unknown> = {
      ...(old ?? {}),
      cycle, country: country.key, market: market.key,
      pulled_at: new Date().toISOString(),
    }

    // Semrush columns: only when Semrush actually answered for this country.
    if (e) {
      row.db = e.db
      row.rank = e.rank
      row.keywords_total = e.keywordsTotal
      row.traffic = e.traffic
      row.cost = e.cost
      row.brand_pct = e.brandPct
      row.nonbrand_pct = e.nonBrandPct
      row.keywords = e.keywords
      // An empty competitor list means "not pulled", not "no competitors".
      if (e.competitors.length) row.competitors = e.competitors
    }

    // Analytics columns.
    if (g) {
      row.ga4_sessions = g.sessions
      row.ga4_leads = g.leads
    }

    // Audit columns. The baseline is what the monthly run found; the daily
    // watch updates `health` alone and leaves the baseline to compare against.
    if (h) {
      row.health = h
      row.health_baseline = h.score
    }

    return row
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
