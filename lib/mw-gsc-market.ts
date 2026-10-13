// 👉 Search Console as the keyword feed, with Semrush as the supplement.
//
// WHY THIS EXISTS. Every per-keyword task in the planner — strike,
// cannibalisation, internal links, the protection list — reads
// `mw_market_seo.keywords`, and that column was fed by Semrush alone. Measured
// on the live database, 13 Oct 2026:
//
//   22 of 35 country rows had `db: null` and ZERO keywords. Indonesia, Hong
//   Kong, Japan, South Africa, Thailand, Vietnam, Saudi, Qatar, every European
//   country except the UK, every country in the Americas except the US, and
//   all of Africa. Not quiet markets — markets nothing had ever looked at.
//
// Search Console had them all along:
//
//   Australia   Semrush 23 keywords   Search Console 820 non-brand queries
//   UAE         Semrush  6            Search Console 193
//   Indonesia   Semrush  0            Search Console 319
//   Hong Kong   Semrush  0            Search Console  86
//
// And where Semrush does answer it misses the biggest terms. Its Australia
// list holds "sydney billboard" at volume 70. It does not contain "billboard
// advertising sydney", which earns 605 impressions at #19, nor "billboard
// advertising melbourne" (412, #28), nor "outdoor advertising australia"
// (377, #14). The three searches most worth having were invisible.
//
//   "Search Console is the ranking source" (owner, 13 Oct 2026)
//
// THE UNITS DO NOT MIX, AND THAT IS THE WHOLE CARE IN THIS FILE. Semrush
// reports `vol`, a modelled estimate of how often a phrase is searched
// anywhere. Search Console reports `impressions`, a count of how often WE were
// actually shown. They are different measurements of different things, and
// quietly writing impressions into the `vol` field would make every task say
// "605 searches a month" about a number that means nothing of the kind. So
// they live in separate fields, each row says which source it came from, and
// the copy asks `sizeOf()` rather than assuming.
//
// PURE. No network — rows in, evidence out — so the merge rules can be tested
// without a Composio sandbox. The fetch lives in lib/mw-plan-run.ts beside the
// Semrush one.

import { marketOfCountry, type Country } from './mw-markets'
import type { PlanKeyword } from './mw-plan'

/** One row of a Search Console query × page × country pull. */
export type GscTriple = {
  query: string
  page: string
  /** As Search Console reports it: lowercase iso3, e.g. `aus`. */
  country: string
  clicks: number
  impressions: number
  position: number
}

export type GscMarket = {
  country: Country
  market: string
  keywords: PlanKeyword[]
  impressions: number
  clicks: number
}

const pathOf = (url: string) =>
  String(url || '').replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/'

const keyOf = (q: string, path: string) => `${q.toLowerCase().trim()}\u0000${path}`

/**
 * Search Console rows, grouped into the markets we actually run.
 *
 * A country we have no market for is dropped rather than invented: the plan is
 * organised around people who own places, and a row nobody owns is a row
 * nobody will action.
 *
 * Within a country the same query can appear against several pages — that is
 * cannibalisation, and it is a finding, not a duplicate. So each (query, page)
 * pair survives; it is the clash detector downstream that decides whether two
 * pages competing is a problem.
 */
export function groupByCountry(rows: GscTriple[]): GscMarket[] {
  const out = new Map<string, GscMarket>()

  for (const r of rows) {
    if (!r.query || !(r.position > 0)) continue
    const m = marketOfCountry(String(r.country || ''))
    if (!m) continue

    const bucket = out.get(m.country.key) ?? {
      country: m.country, market: m.market.key, keywords: [], impressions: 0, clicks: 0,
    }
    out.set(m.country.key, bucket)
    bucket.impressions += r.impressions
    bucket.clicks += r.clicks

    const path = pathOf(r.page)
    const seen = bucket.keywords.find(k => keyOf(k.q, k.url ?? '') === keyOf(r.query, path))
    if (seen) {
      // The same pair twice means the pull was split across date ranges. Add
      // the counts and keep the better position — never average them, because
      // an average of two positions nobody held is a number about nothing.
      seen.impr = (seen.impr ?? 0) + r.impressions
      seen.clicks = (seen.clicks ?? 0) + r.clicks
      seen.visits = seen.clicks
      if (r.position < seen.pos) seen.pos = r.position
      continue
    }

    bucket.keywords.push({
      q: r.query,
      pos: r.position,
      // Not known from Search Console, and not guessable from impressions.
      vol: 0,
      // Clicks are counted, where Semrush's `traffic` is modelled. When both
      // exist the counted one wins in mergeKeywords below.
      visits: r.clicks,
      impr: r.impressions,
      clicks: r.clicks,
      url: path,
      src: 'gsc',
    })
  }

  for (const b of out.values()) {
    b.keywords.sort((a, z) => (z.impr ?? 0) - (a.impr ?? 0) || a.pos - z.pos)
  }
  return [...out.values()]
}

/**
 * One keyword list per page, from both sources.
 *
 * Which source wins which field, and why:
 *
 *   position  Search Console. It is where we were actually shown, averaged
 *             over real impressions. Semrush's is a sample of a crawl.
 *   impr      Search Console only. Semrush has no equivalent.
 *   vol       Semrush only. Search Console has no equivalent.
 *   visits    clicks when Search Console saw the row, else Semrush's estimate.
 *   kd, cpc   Semrush only — they are competitor and auction facts, nothing to
 *             do with our own performance.
 *
 * A row present in both is marked `both`, which is the strongest evidence
 * there is: a modelled phrase that we can also prove we were shown for.
 */
export function mergeKeywords(semrush: PlanKeyword[], gsc: PlanKeyword[]): PlanKeyword[] {
  const out = new Map<string, PlanKeyword>()

  for (const k of semrush) {
    if (!k.q || !(k.pos > 0)) continue
    out.set(keyOf(k.q, k.url ?? ''), { ...k, src: k.src ?? 'semrush' })
  }

  for (const g of gsc) {
    const id = keyOf(g.q, g.url ?? '')
    const s = out.get(id)
    if (!s) { out.set(id, g); continue }
    out.set(id, {
      ...s,
      pos: g.pos,
      impr: g.impr,
      clicks: g.clicks,
      visits: (g.clicks ?? 0) > 0 ? (g.clicks as number) : s.visits,
      src: 'both',
    })
  }

  return [...out.values()].sort(
    (a, z) => (z.impr ?? 0) - (a.impr ?? 0) || z.vol - a.vol || a.pos - z.pos,
  )
}

/**
 * How big a search is, in the units its source actually measured.
 *
 * The planner used to write `${vol} searches a month` everywhere. Once Search
 * Console rows arrive that sentence is false for most of them — we know how
 * often we were SHOWN, not how often anyone searched. Saying the wrong one
 * would not be a rounding error; it would be a number a market lead plans
 * around that means something else entirely.
 */
export function sizeOf(k: PlanKeyword): string {
  if (k.vol > 0) return `${round(k.vol)} searches a month`
  if ((k.impr ?? 0) > 0) return `${round(k.impr as number)} impressions a month`
  return 'no volume recorded'
}

/** The same thing, short, for inside a list of keywords. */
export function sizeShort(k: PlanKeyword): string {
  if (k.vol > 0) return `${round(k.vol)}/mo`
  if ((k.impr ?? 0) > 0) return `${round(k.impr as number)} impr`
  return '—'
}

/**
 * A set of rows described in whichever units they were measured in.
 *
 * A market whose rows all came from Search Console is described in
 * impressions; one Semrush answered for is described in searches. A set
 * holding both says both rather than adding them, because the sum of an
 * estimate of total demand and a count of our own appearances is not a
 * quantity of anything.
 */
export function demandOf(rows: { volume: number; impr?: number }[]): string {
  const impr = rows.reduce((t, r) => t + (r.impr ?? 0), 0)
  const vol = rows.reduce((t, r) => t + ((r.impr ?? 0) > 0 ? 0 : r.volume), 0)
  if (impr > 0 && vol > 0) {
    return `${round(impr)} impressions a month, and ${round(vol)} searches a month ` +
      `on phrases Search Console has not recorded`
  }
  if (impr > 0) return `${round(impr)} impressions a month`
  return `${round(vol)} searches a month`
}

/**
 * What a market is worth ranking better for, as one number.
 *
 * Volume and impressions cannot be added together, so this does not try.
 * Impressions are the honest measure of a market we already appear in, and
 * every Search Console market has them; volume is only there for the handful
 * Semrush still answers for.
 */
export const weightOf = (k: PlanKeyword) => (k.impr ?? 0) || k.vol

const round = (n: number) =>
  Math.round(Number(n) || 0).toLocaleString('en-US')
