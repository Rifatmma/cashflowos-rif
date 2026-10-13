// 👉 Competitors found in the search results, for one country.
//
// WHY THIS REPLACES THE OLD WAY. Semrush's "organic competitors" report ranks
// domains by how many keywords they SHARE WITH US. That is circular: it can
// only find competitors in proportion to how much we already rank, so the
// weaker our presence in a market, the worse the competitor list — exactly
// backwards from what is useful.
//
// Measured on the live account, 13 Oct 2026. In Malaysia we hold 32 keywords,
// and the shared-keyword report offered outofhome.com.my. Working from that
// one domain, the content gap came back empty and the market looked finished.
// The actual search results for "billboard advertising malaysia" say:
//
//    1 skyboard.com.my      2 advertising.com.my/billboard-advertising
//    3 ledscreenads.com     4 bigtree.com.my        ...     12 outofhome.com.my
//
// The domain we had been comparing against was TWELFTH, and the real leader --
// advertising.com.my, 1,279 keywords to our 32 -- never appeared, because we
// share almost nothing with it. In UAE and the UK the same report returns
// plastics companies and adtech vendors with one shared keyword each.
//
//   "can you make sure that the competitors you find are based on SERP result
//    instead? But you'll need to make sure that the SERP result are coming
//    from that particular market."                     (owner, 13 Oct 2026)
//
// So: take the searches that matter in that country, read who actually ranks
// for them there, and count. A domain that appears high across many of our
// own commercial searches is a competitor whether or not we overlap with it.
//
// PURE. Rows in, rivals out. The SERP fetching lives in the script.

export type SerpRow = { pos: number; domain: string; url: string }
export type Serp = { query: string; rows: SerpRow[] }

export type Rival = {
  domain: string
  /** How many of the searches they appear in. */
  appearances: number
  /** Their best position across those searches. */
  best: number
  /** Their typical position — median, so one #1 does not hide nine #90s. */
  median: number
  /** Appearances weighted by position. The ordering number. */
  score: number
  /** The pages doing the ranking, best first. Deduplicated. */
  pages: string[]
  /** The searches they beat us on, for the task copy. */
  queries: string[]
}

/**
 * Not competitors, however often they appear.
 *
 * Social networks, video, encyclopaedias and job boards rank for everything
 * and sell nothing we sell. A marketplace like billboardsin.com is NOT in this
 * list on purpose — it competes with us for the same buyer, and excluding it
 * because it is not a media owner would be flattering ourselves.
 */
const NOT_A_RIVAL = new RegExp([
  'facebook\\.', 'instagram\\.', 'linkedin\\.', 'twitter\\.', 'x\\.com',
  'youtube\\.', 'tiktok\\.', 'pinterest\\.', 'reddit\\.',
  'wikipedia\\.', 'wikiwand\\.', 'quora\\.',
  'indeed\\.', 'glassdoor\\.', 'jobstreet\\.',
  'google\\.', 'blogspot\\.', 'wordpress\\.com', 'medium\\.com',
  'amazon\\.', 'alibaba\\.', 'shopee\\.', 'lazada\\.',
].join('|'), 'i')

/** Us, under every spelling we have been seen under. */
const OURS = /movingwalls\.com|moving-walls\.com|locationmediaxchange|lmx\./i

export const isRival = (domain: string) =>
  !!domain && !NOT_A_RIVAL.test(domain) && !OURS.test(domain)

const clean = (d: string) => String(d || '').replace(/^www\./i, '').toLowerCase().trim()

const median = (ns: number[]) => {
  if (!ns.length) return 0
  const s = [...ns].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Position weight.
 *
 * Page one is where the clicks are, so a #1 counts for a lot more than a #9,
 * and anything past the first page counts for very little — it is presence,
 * not competition. Linear would call a #10 half a #5, which is far too
 * generous: the click-through difference is more like eight times.
 */
const weightAt = (pos: number) => (pos >= 1 && pos <= 100 ? 1 / Math.log2(pos + 1) : 0)

/**
 * Who competes with us for these searches, in this country.
 *
 * `minAppearances` guards against a domain that ranks #1 for one niche phrase
 * and nothing else looking like a market leader. Two is enough to separate a
 * competitor from a coincidence without silencing small specialists.
 */
export function rankRivals(serps: Serp[], opts: { minAppearances?: number; top?: number } = {}): Rival[] {
  const { minAppearances = 2, top = 100 } = opts
  const acc = new Map<string, { pos: number[]; pages: Map<string, number>; queries: string[]; score: number }>()

  for (const s of serps) {
    // One domain can hold several results for one search. It is one competitor
    // on that search, not three, so only its best position counts here.
    const bestPerDomain = new Map<string, SerpRow>()
    for (const r of s.rows) {
      const d = clean(r.domain)
      if (!isRival(d) || !(r.pos >= 1 && r.pos <= top)) continue
      const had = bestPerDomain.get(d)
      if (!had || r.pos < had.pos) bestPerDomain.set(d, { ...r, domain: d })
    }
    for (const [d, r] of bestPerDomain) {
      const at = acc.get(d) ?? { pos: [] as number[], pages: new Map<string, number>(), queries: [] as string[], score: 0 }
      at.pos.push(r.pos)
      at.queries.push(s.query)
      at.score += weightAt(r.pos)
      if (r.url) at.pages.set(r.url, Math.min(at.pages.get(r.url) ?? 999, r.pos))
      acc.set(d, at)
    }
  }

  return [...acc.entries()]
    .filter(([, a]) => a.pos.length >= minAppearances)
    .map(([domain, a]) => ({
      domain,
      appearances: a.pos.length,
      best: Math.min(...a.pos),
      median: median(a.pos),
      score: Math.round(a.score * 100) / 100,
      pages: [...a.pages.entries()].sort((x, y) => x[1] - y[1]).map(([u]) => u).slice(0, 5),
      queries: a.queries.slice(0, 8),
    }))
    .sort((a, b) => b.score - a.score || a.median - b.median)
}

/**
 * Where WE came in, on the same searches.
 *
 * `depth` is how far down that search was actually read, and it is reported
 * because without it absence is unreadable. A first version printed "not in
 * the top 100" for six Malaysian searches when only the top 8 to 12 had been
 * fetched and we in fact sat at #11 to #14 -- turning "I did not look" into
 * "they are nowhere", which is the more alarming of the two and was false.
 */
export function ourPlaces(serps: Serp[]): { query: string; pos: number; url: string; depth: number }[] {
  const out: { query: string; pos: number; url: string; depth: number }[] = []
  for (const s of serps) {
    const mine = s.rows.filter(r => OURS.test(r.domain)).sort((a, b) => a.pos - b.pos)[0]
    const depth = s.rows.reduce((m, r) => Math.max(m, r.pos), 0)
    out.push({ query: s.query, pos: mine?.pos ?? 0, url: mine?.url ?? '', depth })
  }
  return out.sort((a, b) => (a.pos || 9999) - (b.pos || 9999))
}
