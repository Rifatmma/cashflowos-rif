// 👉 Two of our pages in ONE country's results for one search.
//
// The first version of this asked the wrong question. It grouped by market and
// raised a task when pages in different markets ranked for the same phrase —
// and the owner stopped it on the first one he read:
//
//   "each market is a whole different country and if it needs to share the
//    search traffic for that particular country I think it can be the same
//    keyword so I don't think I have to decide which country owns which
//    keywords right?"                                 (owner, 14 Oct 2026)
//
// He is right, and the data he was looking at proves it. For "billboard
// advertising":
//
//   /locations/indonesia      #9   in INDONESIA
//   /locations/philippines    #23  in the PHILIPPINES
//   /locations/uae/dubai      #24  in the UAE
//
// Three countries, three pages, each serving its own searchers. That is
// correct geo-targeting, and the task was telling the pages specialist to
// dismantle it. The country dimension was in the Search Console data all
// along; the grouping simply ignored it.
//
// Competition means appearing in the SAME country's results. In that same pull
// the real ones were there to be found: /locations/indonesia/jakarta at #18 in
// the PHILIPPINES, above /locations/philippines at #23 — a Jakarta page
// serving Filipino searchers.
//
// Pure: rows in, findings out.

/** A row as Search Console reports it: one query, one page, one country. */
export type GeoRow = {
  query: string
  page: string
  /** ISO-3 as Search Console gives it, any case. */
  country: string
  position: number
  impressions: number
}

export type Clash = {
  q: string
  /** The country whose results both pages appear in. */
  country: string
  impressions: number
  pages: { url: string; pos: number; impressions: number }[]
  /** The better-placed page: the one that should keep the search. */
  owner: string
  /** A page under another, e.g. a city page beneath its own country page. */
  nested: boolean
}

const path = (u: string) => String(u || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0].replace(/\/$/, '') || '/'

/** Is one page inside the other, like /locations/india and /locations/india/delhi? */
export const isNested = (a: string, b: string) =>
  a !== b && (a.startsWith(b + '/') || b.startsWith(a + '/'))

export const MIN_IMPRESSIONS = 10

/**
 * Searches where more than one of our pages appears in one country.
 *
 * `minImpressions` is on the COUNTRY total, not the row: a search shown twice
 * is not evidence of anything, and acting on it costs more than ignoring it.
 */
export function clashes(rows: GeoRow[], opts: { minImpressions?: number; maxPosition?: number } = {}): Clash[] {
  const { minImpressions = MIN_IMPRESSIONS, maxPosition = 30 } = opts
  // query -> country -> page -> best row
  const by = new Map<string, Map<string, Map<string, { pos: number; impressions: number }>>>()

  for (const r of rows) {
    const q = String(r.query || '').toLowerCase().trim()
    const c = String(r.country || '').toUpperCase()
    const p = path(r.page)
    if (!q || !c || !p) continue
    if (!(r.position >= 1 && r.position <= maxPosition)) continue
    const inQ = by.get(q) ?? new Map()
    const inC = inQ.get(c) ?? new Map()
    const seen = inC.get(p)
    if (!seen) inC.set(p, { pos: r.position, impressions: r.impressions })
    else {
      if (r.position < seen.pos) seen.pos = r.position
      seen.impressions += r.impressions
    }
    inQ.set(c, inC); by.set(q, inQ)
  }

  const out: Clash[] = []
  for (const [q, byCountry] of by) {
    for (const [country, pages] of byCountry) {
      if (pages.size < 2) continue
      const list = [...pages.entries()]
        .map(([url, v]) => ({ url, pos: v.pos, impressions: v.impressions }))
        .sort((a, b) => a.pos - b.pos)
      const impressions = list.reduce((t, p) => t + p.impressions, 0)
      if (impressions < minImpressions) continue
      // A page and the page beneath it are a hierarchy, not rivals. Reported,
      // because a city page outranking its own country page can still be
      // wrong, but never with the same wording — "pick one and kill the other"
      // is bad advice for a parent and its child.
      const nested = list.every((p, i) => i === 0 || isNested(p.url, list[0].url))
      out.push({ q, country, impressions, pages: list, owner: list[0].url, nested })
    }
  }
  return out.sort((a, b) => b.impressions - a.impressions)
}

const COUNTRY_NAME: Record<string, string> = {
  IND: 'India', IDN: 'Indonesia', PHL: 'the Philippines', MYS: 'Malaysia', SGP: 'Singapore',
  ARE: 'the UAE', SAU: 'Saudi Arabia', QAT: 'Qatar', AUS: 'Australia', NZL: 'New Zealand',
  GBR: 'the UK', DEU: 'Germany', USA: 'the United States', JPN: 'Japan', KOR: 'South Korea',
  CHN: 'China', HKG: 'Hong Kong', THA: 'Thailand', VNM: 'Vietnam', ZAF: 'South Africa',
  KEN: 'Kenya', NGA: 'Nigeria', LKA: 'Sri Lanka',
}
export const countryName = (iso: string) => COUNTRY_NAME[iso.toUpperCase()] ?? iso.toUpperCase()

export function clashTitle(c: Clash): string {
  return c.nested
    ? `${c.pages[0].url} is outranking ${c.pages[1].url} for "${c.q}" in ${countryName(c.country)}`
    : `Two of our pages compete for "${c.q}" in ${countryName(c.country)}`
}

export function clashWhy(c: Clash): string {
  const where = countryName(c.country)
  const lines = c.pages.map(p => `${p.url} #${Math.round(p.pos)}`).join(' and ')
  return c.nested
    ? `In ${where}, ${lines} both appear for "${c.q}" (${c.impressions} impressions). They are the same branch of the ` +
      `site, so this is not two pages fighting — it is Google unsure which level answers the search.`
    : `In ${where}, ${lines} both appear for "${c.q}" (${c.impressions} impressions). These are different parts of ` +
      `the site shown to the same searchers, so the signal is split. This is not about which market owns the phrase — ` +
      `other countries ranking for it separately is correct and is left alone.`
}

export function clashSteps(c: Clash): string[] {
  const where = countryName(c.country)
  const other = c.pages.slice(1).map(p => p.url).join(' and ')
  if (c.nested) {
    return [
      `Decide which level should answer this in ${where}. A city page answering a city search is right; a city page ` +
      `answering a whole-country search usually is not.`,
      `If the country page should own it, give it the phrase in a heading and an answer under it, and have ${other} ` +
      `link up using the phrase.`,
      `If the city page should own it, leave it alone — it is already winning — and make sure the country page links ` +
      `down to it with that wording.`,
      `Change nothing on either page's title until you have decided which one you want shown.`,
      'Re-check in four weeks.',
    ]
  }
  return [
    `Decide which page should serve ${where} for this. On the evidence it is ${c.owner}, at #${Math.round(c.pages[0].pos)}.`,
    `On ${other}, take the phrase out of the title and headings — it is being shown to ${where} searchers who are ` +
    `not its audience.`,
    `Check why ${other} ranks in ${where} at all: usually a paragraph naming the wrong place, or a link from a page ` +
    `that does.`,
    `Leave every other country alone. Pages ranking for this phrase elsewhere are serving their own searchers and ` +
    `are not part of this.`,
    'Re-check in four weeks.',
  ]
}
