// 👉 What is missing from a page, measured rather than guessed.
//
// The Malaysia proposal was written by hand from four SQL queries. Doing that
// eighteen more times by eye is how a template gets mistaken for analysis, so
// the reading part is here, pure and testable, and only the WORDS are written
// by a person afterwards.
//
// Everything below answers one question: of the searches this page is paid for
// or ranks for, which ones does the page not actually address? That is the gap
// the proposal exists to close.

export type PaidTerm = { q: string; cost: number; clicks: number; conv: number; quality?: string | null }
export type OrganicTerm = { q: string; pos: number; vol: number }

export type PageFacts = {
  url: string
  title: string | null
  metaDescription: string | null
  h1: string[]
  h2: string[]
  /** Visible body text, markup stripped. */
  copy: string
}

const flat = (s: string) =>
  ' ' + (s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '
export const mentions = (hay: string, term: string) => {
  const t = flat(term).trim()
  return t.length > 0 && flat(hay).includes(' ' + t + ' ')
}

/** Words that mean the searcher wants a number. */
const PRICE = /\b(price|prices|pricing|cost|costs|rate|rates|rental|rent|hire|harga|sewa|biaya|tarif|how much|budget|quote)\b/i

/**
 * Does the PAGE actually talk about what things cost?
 *
 * A different question from the one above, and the loose test is wrong for it.
 * Asking whether the word "rate" appears anywhere marked /locations/malaysia
 * as having pricing content, on the strength of "the urbanization rate in
 * Malaysia is about 76%" — a demographic statistic. Seven pages were flagged
 * that way and had their pricing section silently suppressed.
 *
 * So this wants a real commercial signal: an actual money figure, a price word
 * bound to something being sold, or a non-English price word, which is almost
 * never incidental in otherwise English prose.
 */
// The alphabetic codes need a word boundary. Without one, /RM\s?\d/i matched
// "platfo(rm 2)024" and declared the page priced.
const MONEY = /(?:\b(?:RM|Rp|AED|SAR|QAR|USD|IDR|INR|MYR|SGD|PHP)|₹|S\$|US\$|HK\$|A\$|NZ\$|£|€|¥|₱|₩)\s?\d[\d,.]*/
const PRICE_CONTEXT = [
  /\brate card\b/i,
  /\b(price|pricing|cost|rate|rates|rental)\s+(card|list|guide|range|ranges|per|from)\b/i,
  /\b(advertising|billboard|hoarding|ooh|dooh|media|campaign|screen|signage)\s+(price|prices|pricing|cost|costs|rate|rates|rental)\b/i,
  /\b(price|prices|cost|costs|rate|rates|rental)s?\s+(start|starts|starting|begin|begins)\b/i,
  /\bstarting (from|at)\s/i,
  /\bhow much (does|do|is|are|to|will)\b/i,
  /\b(harga|sewa|biaya|tarif)\b/i,
]
export function hasPricing(copy: string): boolean {
  return MONEY.test(copy) || PRICE_CONTEXT.some(re => re.test(copy))
}
/** Words that mean they want to know where the sites are. */
const PLACE = /\b(near me|location|locations|site|sites|where|city|cities)\b/i

export type Gap = {
  kind: 'price' | 'format' | 'place' | 'language' | 'generic'
  /** The searches behind it. */
  paid: PaidTerm[]
  organic: OrganicTerm[]
  cost: number
  clicks: number
  conv: number
}

/** Non-English terms we pay for. Latin-script languages we serve in SEA/MENA. */
const NON_ENGLISH = /\b(sewa|papan|iklan|harga|biaya|reklame|baliho|billboard di|publicidad|werbung|valla|panneau|affichage|لوحات|إعلان)\b/i

/**
 * Words that appear in almost every OOH search and tell you nothing about
 * whether a page answers it. "billboard advertising mumbai" is answered by a
 * page that says Mumbai; it is not unanswered because that exact four-word
 * string is absent.
 */
const GENERIC = new Set([
  'billboard', 'billboards', 'hoarding', 'hoardings', 'advertising', 'advertisement',
  'advertise', 'ads', 'ad', 'ooh', 'dooh', 'outdoor', 'media', 'agency', 'agencies',
  'company', 'companies', 'digital', 'led', 'screen', 'screens', 'display', 'displays',
  'marketing', 'in', 'the', 'of', 'for', 'a', 'an', 'and', 'to', 'on', 'near', 'me',
  'best', 'top', 'cost', 'costs', 'price', 'prices', 'pricing', 'rate', 'rates',
  'rent', 'rental', 'hire', 'board', 'boards', 'out', 'home',
])

/** The words in a search that actually distinguish it: places, formats, brands. */
export function distinctive(term: string): string[] {
  return flat(term).trim().split(' ').filter(w => w.length > 2 && !GENERIC.has(w))
}

/**
 * Searches the page is paid for but does not answer.
 *
 * The first version of this asked whether the whole phrase was on the page,
 * which marked nearly everything unanswered — keyword strings are not prose,
 * and "advertising agency ooh mumbai" will never appear verbatim anywhere. It
 * reported S$169 of unanswered city searches on /locations/india, a page that
 * names eleven Indian cities and links a dedicated page to each. Caught before
 * it shipped, by reading the page instead of trusting the measure.
 *
 * So the test is now on the DISTINCTIVE words only: strip the OOH vocabulary
 * every one of these searches contains, and ask whether what is left — the
 * city, the format, the language — is on the page. A term with nothing
 * distinctive left is treated as answered, because there is nothing to look
 * for and guessing would reintroduce the same false positive.
 */
export function unanswered(paid: PaidTerm[], facts: PageFacts): PaidTerm[] {
  return paid.filter(p => {
    if (p.clicks <= 0) return false
    if (mentions(facts.copy, p.q)) return false
    const words = distinctive(p.q)
    if (!words.length) return false
    return words.some(w => !mentions(facts.copy, w))
  })
}

/** Group what is missing into the handful of gaps worth writing a section for. */
export function gapsOf(paid: PaidTerm[], organic: OrganicTerm[], facts: PageFacts): Gap[] {
  const open = unanswered(paid, facts)
  const pageHasPrice = hasPricing(facts.copy)

  const bucket = (kind: Gap['kind'], ps: PaidTerm[], os: OrganicTerm[]): Gap | null => {
    if (!ps.length && !os.length) return null
    return {
      kind, paid: ps, organic: os,
      cost: ps.reduce((s, p) => s + p.cost, 0),
      clicks: ps.reduce((s, p) => s + p.clicks, 0),
      conv: ps.reduce((s, p) => s + p.conv, 0),
    }
  }

  const out: (Gap | null)[] = []
  // Price is its own gap even when the terms ARE on the page, if no price word
  // is: ranking for "billboard price" while printing no number is the single
  // most common fault across these pages.
  const pricePaid = paid.filter(p => p.clicks > 0 && PRICE.test(p.q))
  const priceOrganic = organic.filter(o => PRICE.test(o.q) && o.pos <= 30)
  if (!pageHasPrice) out.push(bucket('price', pricePaid, priceOrganic))

  out.push(bucket('language', open.filter(p => NON_ENGLISH.test(p.q)), []))
  out.push(bucket('place', open.filter(p => PLACE.test(p.q) && !PRICE.test(p.q)), []))
  out.push(bucket('format', open.filter(p => !PRICE.test(p.q) && !PLACE.test(p.q) && !NON_ENGLISH.test(p.q)), []))

  return (out.filter(Boolean) as Gap[]).sort((a, b) => b.cost - a.cost || b.clicks - a.clicks)
}

/** Headings that name a slide in a deck rather than anything a reader wants. */
const VAGUE = [
  'market landscape', 'overview', 'introduction', 'our offering', 'what we do',
  'why choose us', 'key highlights', 'the opportunity', 'about', 'our solutions',
  'media types available', 'market insights', 'why us', 'our approach', 'benefits',
]
export function vagueHeadings(h2: string[]): string[] {
  return h2.filter(h => VAGUE.includes(h.trim().toLowerCase().replace(/[?:.]+$/, '')))
}

/**
 * The part of a title that is doing no work.
 *
 * Titles here are almost always "<real subject>: <marketing tail>". The tail is
 * what can be spent; the head usually carries the ranking phrase and must not
 * be touched. Returns null when there is no obvious tail, because inventing a
 * split and cutting the wrong half is exactly the damage this is avoiding.
 */
export function titleTail(title: string | null): { head: string; tail: string } | null {
  if (!title) return null
  const m = title.match(/^(.{10,70}?)\s*[:—–|-]\s*(.{6,})$/)
  if (!m) return null
  return { head: m[1].trim(), tail: m[2].trim() }
}

export type PageVerdict = {
  url: string
  gaps: Gap[]
  vague: string[]
  tail: { head: string; tail: string } | null
  hasPrice: boolean
  hasFaq: boolean
  spend: number
  clicks: number
  conv: number
  belowAverage: number
}

export function readPage(facts: PageFacts, paid: PaidTerm[], organic: OrganicTerm[]): PageVerdict {
  return {
    url: facts.url,
    gaps: gapsOf(paid, organic, facts),
    vague: vagueHeadings(facts.h2),
    tail: titleTail(facts.title),
    hasPrice: hasPricing(facts.copy),
    hasFaq: facts.h2.some(h => /frequently asked|faq/i.test(h)),
    spend: paid.reduce((s, p) => s + p.cost, 0),
    clicks: paid.reduce((s, p) => s + p.clicks, 0),
    conv: paid.reduce((s, p) => s + p.conv, 0),
    belowAverage: paid.filter(p => p.quality === 'BELOW_AVERAGE').length,
  }
}
