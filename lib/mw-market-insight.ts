// 👉 What kind of market is this, read off its own search data.
//
// The content gap page showed rivals and a list of topics, and nothing that
// told a market lead what they were looking at. The Americas is the case that
// prompted this: asked how to split it — United States, North, South — the
// honest answer turned out to be that it should not be split by geography at
// all, because the demand there is not geographic.
//
//   /blog/programmatic-dooh-explained     13,153 impressions
//   /locations/americas                      101
//
// Nobody in the United States searches "billboard advertising new york" and
// finds us. They search `dooh ssp` and `best ooh audience measurement tool`.
// That is a product market wearing a location market's clothes, and the only
// reason anybody knew was that a human went and looked.
//
//   "All those insights you give me can you write for every market on the
//    country gap page itself"                           (owner, 14 Oct 2026)
//
// So it is computed, for every market, from what is already stored. Nothing
// here is written by hand per country — if the Philippines turns out to be a
// product market too, the page will say so without anybody noticing first.
//
// PURE. Rows in, findings out.

import { isBrand, isRelevant, type Country } from './mw-markets'

export type InsightKeyword = {
  q: string
  pos: number
  impr?: number
  clicks?: number
  url?: string
}

/** What a search is really about. */
export type Kind = 'place' | 'product' | 'trade'

/**
 * Product and technology language: what we SELL, as opposed to where.
 *
 * These are the searches of somebody choosing a platform — an SSP, a
 * measurement tool, a CMS — not somebody buying a billboard on a particular
 * road.
 */
const PRODUCT = /\b(?:ssp|dsp|programmatic|pdooh|platform|software|saas|api|cms|content management|measurement|measuring|analytics|attribution|audience|data|impressions?|roi|roas|automation|ad server|adserver|exchange|supply side|demand side|real.?time|dashboard|report(?:ing)?|planning tool|verification)\b/i

/** Trade language: the industry, without a place or a product in it. */
const TRADE = /\b(?:billboard|hoarding|ooh|dooh|out.?of.?home|outdoor advert|signage|unipole|bus shelter|transit)\b/i

/**
 * Is this search about a place?
 *
 * Built per country from its own name and cities, plus the words people
 * actually attach to a location — "near me", a road, a mall, a station. A
 * generic place list would be wrong market to market: "jalan" means a street
 * in Malaysia and nothing in Brazil.
 */
export function placeTest(country: Country): RegExp {
  const names = [country.label, ...country.cities]
    .flatMap(n => n.toLowerCase().split(/\s+/))
    .filter(w => w.length > 3)
  const extra = [
    'near me', 'highway', 'expressway', 'toll', 'street', 'road', 'avenue',
    'mall', 'station', 'airport', 'metro', 'subway', 'city', 'downtown',
  ]
  const parts = [...new Set([...names, ...extra])].map(w => w.replace(/[^a-z0-9 ]/g, ''))
  return new RegExp('\\b(?:' + parts.join('|') + ')\\b', 'i')
}

export function kindOf(q: string, place: RegExp): Kind {
  if (PRODUCT.test(q)) return 'product'
  if (place.test(q)) return 'place'
  return 'trade'
}

export type Split = { kind: Kind; impressions: number; queries: number; share: number; sample: string[] }

/**
 * The headline: what is this market actually asking us for.
 *
 * Weighted by impressions rather than by how many distinct phrases exist,
 * because one search shown 13,000 times matters more than forty shown once,
 * and a count of phrases would say the opposite.
 */
export function marketKinds(keywords: InsightKeyword[], country: Country): Split[] {
  const place = placeTest(country)
  const acc = new Map<Kind, { impressions: number; queries: number; sample: { q: string; n: number }[] }>()
  let total = 0

  for (const k of keywords) {
    if (!k.q || isBrand(k.q) || !isRelevant(k.q)) continue
    const n = k.impr ?? 0
    const kind = kindOf(k.q, place)
    const at = acc.get(kind) ?? { impressions: 0, queries: 0, sample: [] }
    at.impressions += n
    at.queries += 1
    at.sample.push({ q: k.q, n })
    acc.set(kind, at)
    total += n
  }

  return (['product', 'trade', 'place'] as Kind[])
    .map(kind => {
      const a = acc.get(kind)
      return {
        kind,
        impressions: a?.impressions ?? 0,
        queries: a?.queries ?? 0,
        share: total > 0 ? (a?.impressions ?? 0) / total : 0,
        sample: (a?.sample ?? []).sort((x, y) => y.n - x.n).slice(0, 3).map(s => s.q),
      }
    })
    .sort((a, b) => b.impressions - a.impressions)
}

export const KIND_LABEL: Record<Kind, string> = {
  product: 'Product and measurement',
  trade: 'The trade in general',
  place: 'A place',
}

/** One sentence naming what this market is, and how sure that is. */
export function verdictOf(splits: Split[], country: Country): { headline: string; says: string } {
  const top = splits[0]
  if (!top || !top.impressions) {
    return {
      headline: `Too little to tell yet`,
      says: `Search Console has not recorded enough non-brand searches from ${country.label} to say what kind of market it is.`,
    }
  }
  const pct = Math.round(top.share * 100)
  const sample = top.sample.slice(0, 3).map(s => `“${s}”`).join(', ')

  if (top.kind === 'product') {
    return {
      headline: `${country.label} is a product and measurement market`,
      says: `${pct}% of what we are shown for here is platform and measurement language — ${sample} — not places. ` +
        `A location page is the wrong shape for this demand, and the competitors are adtech rather than media owners.`,
    }
  }
  if (top.kind === 'place') {
    return {
      headline: `${country.label} is a location market`,
      says: `${pct}% of what we are shown for names a place — ${sample}. ` +
        `This is the demand a country or city page is built for.`,
    }
  }
  return {
    headline: `${country.label} searches the trade, not places`,
    says: `${pct}% of what we are shown for is general industry language — ${sample} — ` +
      `neither tied to a place nor to a product. These are people learning the category, early in the buy.`,
  }
}

// ----------------------------------------------------------- where it lands
export type Landing = { section: string; impressions: number; clicks: number; share: number }

const sectionOf = (url: string) => {
  const p = String(url || '').replace(/^https?:\/\/[^/]+/, '')
  if (!p || p === '/') return 'Home page'
  const head = p.split('/').filter(Boolean)[0] ?? ''
  if (head === 'locations') return 'Location pages'
  if (head === 'blog') return 'Blog'
  if (head === 'press-news') return 'Press'
  return '/' + head
}

/** Which parts of the site this market's demand actually reaches. */
export function landings(keywords: InsightKeyword[]): Landing[] {
  const acc = new Map<string, { impressions: number; clicks: number }>()
  let total = 0
  for (const k of keywords) {
    if (!k.url || isBrand(k.q)) continue
    const s = sectionOf(k.url)
    const at = acc.get(s) ?? { impressions: 0, clicks: 0 }
    at.impressions += k.impr ?? 0
    at.clicks += k.clicks ?? 0
    acc.set(s, at)
    total += k.impr ?? 0
  }
  return [...acc.entries()]
    .map(([section, a]) => ({ section, ...a, share: total > 0 ? a.impressions / total : 0 }))
    .sort((a, b) => b.impressions - a.impressions)
}

// ------------------------------------------------------------- how we rank
export type Band = { label: string; from: number; to: number; impressions: number; clicks: number; queries: number }

/**
 * Where our rankings sit, weighted by how often they are seen.
 *
 * Banded rather than averaged: an average position of 18 can mean everything
 * sits at 18, or that half is on page one and half is on page four, and those
 * are opposite problems with opposite fixes.
 */
export function bands(keywords: InsightKeyword[]): Band[] {
  const defs: [string, number, number][] = [
    ['Page one', 1, 10],
    ['Page two', 11, 20],
    ['Page three', 21, 30],
    ['Deeper than page three', 31, 1000],
  ]
  return defs.map(([label, from, to]) => {
    const rows = keywords.filter(k => !isBrand(k.q) && k.pos >= from && k.pos <= to)
    return {
      label, from, to,
      impressions: rows.reduce((t, k) => t + (k.impr ?? 0), 0),
      clicks: rows.reduce((t, k) => t + (k.clicks ?? 0), 0),
      queries: rows.length,
    }
  })
}

// ------------------------------------------------------------------- flags
export type Flag = { level: 'warn' | 'note'; says: string }

/** The things a lead should see before the list of topics. */
export function flags(input: {
  country: Country
  keywords: InsightKeyword[]
  splits: Split[]
  landing: Landing[]
  pages: string[]
  gap?: { raw: number; kept: number; topics: number } | null
}): Flag[] {
  const { country, keywords, splits, landing, pages, gap } = input
  const out: Flag[] = []
  const own = `/locations/${country.key}`
  const total = landing.reduce((t, l) => t + l.impressions, 0)

  if (total > 300 && !pages.some(p => p === own || p === own + '/')) {
    out.push({
      level: 'warn',
      says: `There is no ${own} page, and this market is shown ${Math.round(total).toLocaleString('en-US')} times a month.`,
    })
  }

  const loc = landing.find(l => l.section === 'Location pages')
  if (total > 1000 && (!loc || loc.share < 0.1)) {
    out.push({
      level: 'warn',
      says: `Location pages take ${loc ? Math.round(loc.share * 100) : 0}% of this market's impressions — the demand is being answered somewhere else.`,
    })
  }

  const seen = keywords.reduce((t, k) => t + (k.impr ?? 0), 0)
  const clicked = keywords.reduce((t, k) => t + (k.clicks ?? 0), 0)
  if (seen > 1000 && clicked / seen < 0.005) {
    out.push({
      level: 'warn',
      says: `${Math.round(seen).toLocaleString('en-US')} impressions and ${clicked} clicks — under half a percent. We are being shown and not chosen.`,
    })
  }

  const product = splits.find(s => s.kind === 'product')
  if (product && product.share > 0.5) {
    out.push({
      level: 'note',
      says: `Compare this market against adtech platforms, not billboard owners — that is who ranks for ${product.sample[0] ? `“${product.sample[0]}”` : 'these searches'}.`,
    })
  }

  if (gap && gap.topics === 0 && gap.raw > 20) {
    out.push({
      level: 'note',
      says: `${gap.raw} searches came back from the rivals and none grouped into a page worth writing. That is usually a position problem, not a content one.`,
    })
  }

  return out
}
