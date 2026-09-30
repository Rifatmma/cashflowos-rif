import 'server-only'
// 👉 Reading the per-market SEO evidence back out for the dashboard.
//
// Everything on the SEO tab used to be one hand-written snapshot of India and
// Malaysia. This reads mw_market_seo, which the pull writes one row per
// country per cycle, and rolls it up to the ten markets — so every section
// can be shown for whichever market the reader picks (owner, 29 Sep 2026).

import { supabase, supabaseConfigured } from './supabase'
import { MARKETS, isBrand, isRelevant, type Market } from './mw-markets'
import { healthBand, type PageHealth } from './mw-pagehealth'

export type MarketKeyword = {
  q: string; pos: number; prev: number; vol: number; cpc: number
  url: string; traffic: number; kd: number
}

export type CountrySeo = {
  cycle: string
  country: string
  market: string
  db: string | null
  rank: number | null
  keywordsTotal: number
  traffic: number
  cost: number
  brandPct: number | null
  nonBrandPct: number | null
  keywords: MarketKeyword[]
  competitors: { domain: string; common: number; keywords: number; traffic: number }[]
  health: PageHealth | null
  /** Score at the monthly plan run, for spotting a page that has since got worse. */
  healthBaseline: number | null
  ga4Sessions: number
  ga4Leads: number
}

export type MarketSeo = {
  market: Market
  countries: CountrySeo[]
  /** Semrush's own keyword count, which is bigger than what we pull per page. */
  keywordsTotal: number
  traffic: number
  cost: number
  sessions: number
  leads: number
  /** Leads per hundred sessions. Null when there is no traffic to judge it on. */
  cvr: number | null
  brandPct: number
  nonBrandPct: number
  brandTraffic: number
  nonBrandTraffic: number
  keywords: MarketKeyword[]
  /** Ranking 4-30 with real volume: the list worth working on. */
  opportunities: MarketKeyword[]
  /** Searches we rank for that have nothing to do with the business. */
  offTopic: { count: number; visits: number; vol: number; sample: string[] }
  /** Moved up or down since the previous pull. */
  movers: { up: MarketKeyword[]; down: MarketKeyword[]; fresh: MarketKeyword[]; unknown: boolean }
  /** Non-brand searches we already rank well for. The ground to hold. */
  winning: MarketKeyword[]
  competitors: { domain: string; common: number; keywords: number; traffic: number }[]
  health: { url: string; score: number; band: 'good' | 'warn' | 'bad'; faults: number; top: string | null; was: number | null; worse: boolean }[]
  worstHealth: number | null
}

const numOr = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

function rowToCountry(r: any): CountrySeo {
  return {
    cycle: String(r.cycle), country: String(r.country), market: String(r.market),
    db: r.db ?? null, rank: r.rank ?? null,
    keywordsTotal: numOr(r.keywords_total), traffic: numOr(r.traffic), cost: Number(r.cost ?? 0),
    brandPct: r.brand_pct === null ? null : Number(r.brand_pct),
    nonBrandPct: r.nonbrand_pct === null ? null : Number(r.nonbrand_pct),
    keywords: Array.isArray(r.keywords) ? r.keywords.map((k: any) => ({
      q: String(k.q ?? ''), pos: numOr(k.pos), prev: numOr(k.prev), vol: numOr(k.vol),
      cpc: Number(k.cpc ?? 0), url: String(k.url ?? ''), traffic: numOr(k.traffic), kd: numOr(k.kd),
    })) : [],
    competitors: Array.isArray(r.competitors) ? r.competitors : [],
    health: (r.health ?? null) as PageHealth | null,
    healthBaseline: r.health_baseline === null || r.health_baseline === undefined ? null : Number(r.health_baseline),
    ga4Sessions: numOr(r.ga4_sessions), ga4Leads: numOr(r.ga4_leads),
  }
}

/** The most recent cycle that has any evidence in it. */
export async function latestCycle(): Promise<string | null> {
  if (!supabaseConfigured) return null
  const { data } = await supabase.from('mw_market_seo')
    .select('cycle').order('cycle', { ascending: false }).limit(1).maybeSingle()
  return data?.cycle ?? null
}

/** The cycle stored before this one, or null on the first ever pull. */
export async function previousCycle(before: string): Promise<string | null> {
  if (!supabaseConfigured) return null
  const { data } = await supabase.from('mw_market_seo')
    .select('cycle').lt('cycle', before).order('cycle', { ascending: false }).limit(1).maybeSingle()
  return data?.cycle ?? null
}

export async function getMarketSeo(cycle?: string): Promise<MarketSeo[]> {
  if (!supabaseConfigured) return []
  const c = cycle ?? (await latestCycle())
  if (!c) return []

  // MOVEMENT COMES FROM OUR OWN HISTORY, not from Semrush's `previous position`.
  // That column only changes when Semrush refreshes its database, which is
  // monthly at best -- every market came back with prev exactly equal to pos,
  // so it can never answer "what moved since the last pull". Comparing our own
  // stored cycles does, and it moves at whatever pace we pull (owner, 29 Sep 2026).
  const prevC = await previousCycle(c)
  const [{ data }, prior] = await Promise.all([
    supabase.from('mw_market_seo').select('*').eq('cycle', c),
    prevC
      ? supabase.from('mw_market_seo').select('*').eq('cycle', prevC).then(r => (r.data ?? []).map(rowToCountry))
      : Promise.resolve([] as CountrySeo[]),
  ])
  const rows = (data ?? []).map(rowToCountry)

  // keyword + country -> where it ranked last time
  const before = new Map<string, number>()
  for (const cs of prior) for (const k of cs.keywords) {
    const key = `${cs.country}\u0000${k.q.toLowerCase()}`
    const at = before.get(key)
    if (at === undefined || k.pos < at) before.set(key, k.pos)
  }
  const hadHistory = prior.length > 0

  return MARKETS.map(market => {
    const countries = rows.filter(r => r.market === market.key)
    // Each keyword learns where it stood last cycle. -1 keeps meaning
    // "unknown", so a first pull is never reported as a page of new wins.
    const keywords = countries.flatMap(cs => cs.keywords.map(k => ({
      ...k,
      prev: hadHistory
        ? (before.get(`${cs.country}\u0000${k.q.toLowerCase()}`) ?? 0)
        : -1,
    })))

    let brandTraffic = 0, nonBrandTraffic = 0
    for (const k of keywords) (isBrand(k.q) ? (brandTraffic += k.traffic) : (nonBrandTraffic += k.traffic))
    const tot = brandTraffic + nonBrandTraffic

    const sessions = countries.reduce((t, c) => t + c.ga4Sessions, 0)
    const leads = countries.reduce((t, c) => t + c.ga4Leads, 0)

    // Worth working on: off the first page or the bottom of it, real demand,
    // and not our own name — there is no position left to win on that.
    // Our own searches: not our name, and about something we actually sell.
    const ours = keywords.filter(k => !isBrand(k.q) && isRelevant(k.q))

    const opportunities = keywords
      .filter(k => !isBrand(k.q) && isRelevant(k.q) && k.pos >= 4 && k.pos <= 30 && k.vol >= 30)
      .sort((a, b) => b.vol * (1 / Math.max(a.pos, 1)) - a.vol * (1 / Math.max(b.pos, 1)))
      .sort((a, b) => b.vol - a.vol)
      .slice(0, 12)

    // What we already win. Defending these matters as much as chasing new
    // ones -- a rewrite that adds keywords and loses these is a step back.
    const winning = ours
      .filter(k => k.pos >= 1 && k.pos <= 10)
      .sort((a, b) => b.traffic - a.traffic || b.vol - a.vol)
      .slice(0, 12)

    // Worth naming rather than silently dropping: the name earns us real
    // impressions for wall decorating and pest control, which inflates the
    // keyword count and teaches Google the wrong thing about the site.
    const junk = keywords.filter(k => !isBrand(k.q) && !isRelevant(k.q) && k.vol >= 50)
    const offTopic = {
      count: junk.length,
      visits: junk.reduce((t, k) => t + k.traffic, 0),
      vol: junk.reduce((t, k) => t + k.vol, 0),
      sample: [...junk].sort((a, b) => b.vol - a.vol).slice(0, 4).map(k => k.q),
    }

    // prev === -1 means the previous position was never fetched, so this market
    // has no history to compare -- that is not movement and it is not new.
    const known = ours.filter(k => k.prev >= 0)
    const moved = known.filter(k => k.prev > 0 && k.pos !== k.prev)
    const movers = {
      up: moved.filter(k => k.pos < k.prev).sort((a, b) => (b.prev - b.pos) - (a.prev - a.pos)).slice(0, 8),
      down: moved.filter(k => k.pos > k.prev).sort((a, b) => (b.pos - b.prev) - (a.pos - a.prev)).slice(0, 8),
      fresh: known.filter(k => k.prev === 0 && k.vol >= 30).slice(0, 8),
      /** True when there is nothing to compare against, rather than no change. */
      unknown: known.length === 0,
    }

    const health = countries
      .filter(c => c.health)
      .map(c => {
        const h = c.health as PageHealth
        const was = c.healthBaseline
        return {
          url: h.url.replace(/^https?:\/\/[^/]+/, ''),
          score: h.score, band: healthBand(h.score),
          faults: h.faults.length,
          top: h.faults[0]?.says ?? null,
          was,
          // Got materially worse since the plan was built, or stopped loading.
          worse: !h.ok || (was !== null && h.score < was - 5),
        }
      })
      .sort((a, b) => a.score - b.score)

    // One competitor list per market: the same rival often shows up in two
    // countries, and the reader wants the market view, not a duplicate.
    const comp = new Map<string, { domain: string; common: number; keywords: number; traffic: number }>()
    for (const c of countries) for (const x of c.competitors) {
      const at = comp.get(x.domain) ?? { domain: x.domain, common: 0, keywords: 0, traffic: 0 }
      at.common += x.common; at.keywords = Math.max(at.keywords, x.keywords); at.traffic += x.traffic
      comp.set(x.domain, at)
    }

    return {
      market, countries,
      keywordsTotal: countries.reduce((t, c) => t + c.keywordsTotal, 0),
      traffic: countries.reduce((t, c) => t + c.traffic, 0),
      cost: countries.reduce((t, c) => t + c.cost, 0),
      sessions, leads,
      cvr: sessions > 0 ? Math.round((leads / sessions) * 1000) / 10 : null,
      brandPct: tot ? Math.round((brandTraffic / tot) * 1000) / 10 : 0,
      nonBrandPct: tot ? Math.round((nonBrandTraffic / tot) * 1000) / 10 : 0,
      brandTraffic, nonBrandTraffic,
      keywords, opportunities, offTopic, movers, winning,
      competitors: [...comp.values()].sort((a, b) => b.traffic - a.traffic).slice(0, 8),
      health,
      worstHealth: health.length ? health[0].score : null,
    }
  })
}

/** Markets that actually have something to show, biggest first. */
export const withData = (all: MarketSeo[]) =>
  all.filter(m => m.keywords.length > 0 || m.sessions > 0 || m.health.length > 0)
    .sort((a, b) => b.traffic - a.traffic || b.sessions - a.sessions)
