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
const PRODUCT = new RegExp([
  /\b(?:ssp|dsp|programmatic|pdooh|platform|software|saas|api|cms|content management|measurement|measuring|analytics|attribution|audience|data|impressions?|roi|roas|automation|ad server|adserver|exchange|supply side|demand side|real.?time|dashboard|report(?:ing)?|planning tool|verification)\b/,
  // The same vocabulary in the languages the gap can now read. Without these
  // every Japanese and Chinese product search fell through to "the trade in
  // general", which is how a market gets described as something it is not.
  /プログラマティック|効果測定|広告配信|アドサーバー|データ分析|運用型/,
  /程序化|數據分析|数据分析|效果監測|效果监测|廣告投放|广告投放/,
  /프로그래매틱|광고플랫폼/,
].map(r => r.source).join('|'), 'i')

/** Trade language: the industry, without a place or a product in it. */
const TRADE = /\b(?:billboard|hoarding|ooh|dooh|out.?of.?home|outdoor advert|signage|unipole|bus shelter|transit)\b/i

/**
 * Place language that is not written in Latin script.
 *
 * Country.cities holds English names — Tokyo, Osaka — so a Japanese search for
 * 東京 matched nothing and was filed under "the trade in general". The generic
 * markers matter more than the city list: 駅 (station), 空港 (airport), 区
 * (ward), 路 (road) mark a search as being about somewhere without needing
 * every place name in every country.
 */
const LOCAL_PLACES = new RegExp([
  /駅|空港|市内|県|丁目|高速道路/,                            // Japanese
  /東京|大阪|名古屋|福岡|渋谷|新宿|銀座|横浜/,
  /機場|机场|車站|车站|地鐵|地铁|街道|大道/,                   // Chinese
  /香港|九龍|旺角|銅鑼灣|中環|尖沙咀|北京|上海|深圳|廣州|广州/,
  /역세권|공항|지하철|서울|부산|인천/,                         // Korean
  /สนามบิน|สถานี|กรุงเทพ|เชียงใหม่/,                           // Thai
  /مطار|شارع|طريق|دبي|أبوظبي|الشارقة|الرياض|جدة/,             // Arabic
].map(r => r.source).join('|'))

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
  // Latin names need word boundaries; the local-script ones must NOT have them,
  // because CJK writes without spaces and \b would never fire there.
  return new RegExp('\\b(?:' + parts.join('|') + ')\\b|' + LOCAL_PLACES.source, 'i')
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

// ------------------------------------------------------------- language
//
// Indonesia is why this is here. Google Ads spends on `sewa billboard` and
// `harga sewa billboard` and sends the clicks to /locations/indonesia, which
// is written entirely in English — so we buy the Bahasa demand because we earn
// none of it. Four Bahasa searches reach us organically, worth 20 impressions
// out of 1,152.
//
// The opposite case is just as useful: /locations/americas-es exists, and the
// Americas records ZERO Spanish or Portuguese searches. A market lead should
// be able to see both without anybody running a query by hand.

const SCRIPTS: [string, RegExp][] = [
  ['Arabic', /[\u0600-\u06FF]/],
  ['Chinese', /[\u4E00-\u9FFF]/],
  ['Japanese', /[\u3040-\u30FF]/],
  ['Korean', /[\uAC00-\uD7AF]/],
  ['Thai', /[\u0E00-\u0E7F]/],
  ['Hindi', /[\u0900-\u097F]/],
  ['Cyrillic', /[\u0400-\u04FF]/],
  ['Greek', /[\u0370-\u03FF]/],
  ['Hebrew', /[\u0590-\u05FF]/],
]

/**
 * Latin-script languages, by words that only appear in them.
 *
 * Only the ones our markets actually speak, and only words with no English
 * meaning — "media" and "digital" are the same in five of these and would
 * mark every English search as Spanish.
 */
const LATIN: [string, RegExp][] = [
  ['Malay or Indonesian', /\b(?:sewa|harga|iklan|papan|periklanan|reklame|luar ruang|biaya|jasa|pasang|perusahaan|tempat)\b/i],
  ['Spanish', /\b(?:publicidad|vallas|anuncios|espectacular|cuanto|cuesta|empresa|precios?|exterior)\b/i],
  ['Portuguese', /\b(?:publicidade|midia|outdoor em|quanto custa|empresa de|preco|precos)\b/i],
  ['German', /\b(?:werbung|aussenwerbung|plakat|kosten|preise|anbieter)\b/i],
  ['French', /\b(?:publicite|affichage|panneau|prix|tarif|exterieure)\b/i],
  ['Dutch', /\b(?:reclame|buitenreclame|billboardreclame|kosten|prijzen)\b/i],
  ['Vietnamese', /\b(?:quang cao|bang hieu|gia|ngoai troi)\b|[\u1EA0-\u1EF9]/i],
  ['Turkish', /\b(?:reklam|bilboard|fiyat|aciklama)\b/i],
]

export function languageOf(q: string): string {
  for (const [name, rx] of SCRIPTS) if (rx.test(q)) return name
  for (const [name, rx] of LATIN) if (rx.test(q)) return name
  return 'English'
}

export type LangSplit = { language: string; impressions: number; queries: number; share: number; sample: string[] }

export function languages(keywords: InsightKeyword[]): LangSplit[] {
  const acc = new Map<string, { impressions: number; queries: number; sample: { q: string; n: number }[] }>()
  let total = 0
  for (const k of keywords) {
    if (!k.q || isBrand(k.q)) continue
    const lang = languageOf(k.q)
    const at = acc.get(lang) ?? { impressions: 0, queries: 0, sample: [] }
    at.impressions += k.impr ?? 0
    at.queries += 1
    at.sample.push({ q: k.q, n: k.impr ?? 0 })
    acc.set(lang, at)
    total += k.impr ?? 0
  }
  return [...acc.entries()]
    .map(([language, a]) => ({
      language, impressions: a.impressions, queries: a.queries,
      share: total > 0 ? a.impressions / total : 0,
      sample: a.sample.sort((x, y) => y.n - x.n).slice(0, 2).map(s => s.q),
    }))
    .sort((a, b) => b.impressions - a.impressions)
}

// ---------------------------------------------------------------- money
export type Money = {
  sessions: number
  leads: number
  prevSessions: number | null
  prevLeads: number | null
}

/**
 * Traffic against outcome, in a sentence.
 *
 * Impressions and sessions are not the same funnel step and must not be
 * divided into one another — Search Console counts being shown, GA4 counts
 * arriving, and a page can be arrived at from anywhere. So they sit beside
 * each other and the sentence says which is which.
 */
export function moneyLine(m: Money, country: Country): string {
  if (!m.sessions) return `GA4 recorded no sessions from ${country.label} this cycle.`
  const cvr = m.sessions > 0 ? m.leads / m.sessions : 0
  const move = m.prevSessions !== null && m.prevSessions > 0
    ? ` Sessions ${m.sessions >= m.prevSessions ? 'up' : 'down'} from ${Math.round(m.prevSessions).toLocaleString('en-US')} last cycle.`
    : ''
  if (!m.leads) {
    return `${Math.round(m.sessions).toLocaleString('en-US')} sessions and no enquiries. ` +
      `The traffic is arriving and nothing is being asked of it.${move}`
  }
  return `${Math.round(m.sessions).toLocaleString('en-US')} sessions, ${m.leads} ${m.leads === 1 ? 'enquiry' : 'enquiries'} ` +
    `(${(cvr * 100).toFixed(1)}%).${move}`
}

// ---------------------------------------------------------------- trend
export type Point = { cycle: string; impressions: number | null; sessions: number | null; leads: number | null }

/**
 * Enough history to draw, or an honest refusal.
 *
 * Search Console has been stored for one cycle only, so a sparkline of
 * impressions today is a single dot pretending to be a line. Two points is
 * the minimum that means anything, and below it the panel says so rather than
 * drawing something.
 */
export function trend(points: Point[], key: 'impressions' | 'sessions' | 'leads'): { points: { cycle: string; value: number }[]; enough: boolean } {
  const got = points
    .filter(p => p[key] !== null && p[key] !== undefined)
    .map(p => ({ cycle: p.cycle, value: Number(p[key]) || 0 }))
    .sort((a, b) => a.cycle.localeCompare(b.cycle))
  return { points: got, enough: got.length >= 2 }
}

// ------------------------------------------------- English against the rest
//
// The language table listed every language it found, which buries the only
// question worth asking: are we found in the language this market actually
// uses, or only in English? One row each, and the local one named.
export type LangSplit2 = {
  english: { impressions: number; queries: number; share: number }
  local: { language: string; impressions: number; queries: number; share: number; sample: string[] }[]
  localShare: number
}

export function englishVsLocal(keywords: InsightKeyword[]): LangSplit2 {
  const all = languages(keywords)
  const en = all.find(l => l.language === 'English')
  const rest = all.filter(l => l.language !== 'English')
  const total = all.reduce((t, l) => t + l.impressions, 0)
  return {
    english: {
      impressions: en?.impressions ?? 0,
      queries: en?.queries ?? 0,
      share: total > 0 ? (en?.impressions ?? 0) / total : 0,
    },
    local: rest.map(l => ({ language: l.language, impressions: l.impressions, queries: l.queries, share: l.share, sample: l.sample })),
    localShare: total > 0 ? rest.reduce((t, l) => t + l.impressions, 0) / total : 0,
  }
}

/**
 * The language a market is expected to search in, so the panel can name it
 * even when we are found in none of it.
 *
 * "0% Japanese" is a far more useful line than "100% English", and only this
 * makes it sayable — otherwise a language we have no rows for cannot be
 * mentioned, which is exactly the blind spot that hid Japan.
 */
export const EXPECTED_LANGUAGE: Record<string, string> = {
  japan: 'Japanese', 'hong-kong': 'Chinese', china: 'Chinese', taiwan: 'Chinese',
  'south-korea': 'Korean', thailand: 'Thai', vietnam: 'Vietnamese',
  indonesia: 'Malay or Indonesian', malaysia: 'Malay or Indonesian',
  uae: 'Arabic', 'saudi-arabia': 'Arabic', qatar: 'Arabic', kuwait: 'Arabic', oman: 'Arabic',
  germany: 'German', france: 'French', netherlands: 'Dutch', switzerland: 'German',
  brazil: 'Portuguese', mexico: 'Spanish', americas: 'Spanish',
  'czech-republic': 'Czech', japan_regional: 'Japanese',
}
