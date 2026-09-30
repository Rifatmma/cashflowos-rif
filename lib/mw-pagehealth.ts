// 👉 On-page audit of a live page, by reading the page.
//
// This needs no API, no key and nobody's permission — it is the one evidence
// source that can never break on us. It grades the things Dinesh owns: title,
// meta description, a single H1, schema, canonical, internal links and enough
// words to rank. Every check returns the ACTUAL value, not a verdict, so a
// task can say "the title is 74 characters" instead of "the title is wrong".

export type PageHealth = {
  url: string
  ok: boolean
  status: number
  title: string | null
  titleLen: number
  metaDesc: string | null
  metaLen: number
  h1: string[]
  words: number
  schema: string[]
  canonical: string | null
  ogImage: boolean
  /** Links from this page to other /locations pages. */
  internalOut: number
  /** Named problems, worst first. Empty means the page is in good shape. */
  faults: PageFault[]
  score: number
}

export type PageFault = {
  key: string
  /** What is wrong, with the real number in it. */
  says: string
  /** What to do about it. */
  fix: string
  weight: number
}

const TITLE_MIN = 25, TITLE_MAX = 60
const DESC_MIN = 70, DESC_MAX = 155
const WORDS_MIN = 300

const ENTITY: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
}

/**
 * Entities have to be decoded before anything is measured. A title reading
 * "Plan, Activate &amp; Measure" is 58 characters raw but 54 real ones, and
 * grading the raw string would report a length Google never sees.
 */
const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, name) => ENTITY[String(name).toLowerCase()] ?? m)

const text = (html: string) => decode(html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim()

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag)
  return m ? decode((m[2] ?? m[3] ?? '')).trim() : null
}

/**
 * Fetch one page and grade it. Never throws — a dead page is a finding.
 *
 * `isLocation` tightens the schema rule: a country or city page is a place,
 * so Organization alone is not enough, it needs LocalBusiness. Today not one
 * location page on the site has it.
 */
export async function auditPage(url: string, isLocation = /\/locations\//.test(url)): Promise<PageHealth> {
  const base: PageHealth = {
    url, ok: false, status: 0, title: null, titleLen: 0, metaDesc: null, metaLen: 0,
    h1: [], words: 0, schema: [], canonical: null, ogImage: false, internalOut: 0,
    faults: [], score: 0,
  }
  let html = ''
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'CashflowOS/1.0 (site audit; +movingwalls.com)' },
      signal: AbortSignal.timeout(20_000),
    })
    base.status = res.status
    base.ok = res.ok
    if (!res.ok) {
      base.faults = [{ key: 'dead', says: `The page returns HTTP ${res.status}.`, fix: 'Fix or redirect it before anything else — no other SEO work on this page counts while it is broken.', weight: 100 }]
      return base
    }
    html = await res.text()
  } catch (e: any) {
    base.faults = [{ key: 'unreachable', says: `The page could not be fetched: ${String(e?.message ?? e).slice(0, 80)}.`, fix: 'Check the URL is live and reachable from outside the network.', weight: 100 }]
    return base
  }

  const head = html.slice(0, Math.max(html.indexOf('</head>'), 0) || html.length)

  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  base.title = t ? text(t[1]) : null
  base.titleLen = base.title?.length ?? 0

  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]
    const nameAttr = (attr(tag, 'name') ?? attr(tag, 'property') ?? '').toLowerCase()
    if (nameAttr === 'description') { base.metaDesc = attr(tag, 'content'); base.metaLen = base.metaDesc?.length ?? 0 }
    if (nameAttr === 'og:image') base.ogImage = true
  }
  const can = /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(head)
  if (can) base.canonical = attr(can[0], 'href')

  base.h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => text(m[1])).filter(Boolean)
  base.words = text(html.replace(/<(header|nav|footer)[\s\S]*?<\/\1>/gi, ' ')).split(' ').filter(Boolean).length

  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim())
      const walk = (x: any): void => {
        if (Array.isArray(x)) return x.forEach(walk)
        if (x && typeof x === 'object') {
          if (typeof x['@type'] === 'string') base.schema.push(x['@type'])
          else if (Array.isArray(x['@type'])) base.schema.push(...x['@type'].filter((v: unknown) => typeof v === 'string'))
          if (Array.isArray(x['@graph'])) x['@graph'].forEach(walk)
        }
      }
      walk(parsed)
    } catch { /* malformed blocks are caught below */ }
  }

  base.internalOut = new Set(
    [...html.matchAll(/href\s*=\s*["']([^"']*\/locations\/[^"'#?]*)/gi)]
      .map(m => m[1].replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, ''))
      .filter(h => h && h !== new URL(url).pathname.replace(/\/$/, ''))
  ).size

  base.faults = gradeFaults(base, isLocation)
  base.score = Math.max(0, 100 - base.faults.reduce((t, f) => t + f.weight, 0))
  return base
}

function gradeFaults(p: PageHealth, isLocation: boolean): PageFault[] {
  const f: PageFault[] = []
  const push = (key: string, says: string, fix: string, weight: number) => f.push({ key, says, fix, weight })

  if (!p.title) push('title-missing', 'The page has no title tag at all.', 'Write a title of 25–60 characters that names what the page offers and the country.', 25)
  else if (p.titleLen > TITLE_MAX) push('title-long', `The title is ${p.titleLen} characters, so Google cuts it off at about ${TITLE_MAX}.`, `Rewrite it to under ${TITLE_MAX} characters, leading with the words people search.`, 12)
  else if (p.titleLen < TITLE_MIN) push('title-short', `The title is only ${p.titleLen} characters — most of the space is unused.`, `Extend it toward ${TITLE_MAX} characters with the search wording and the country name.`, 8)

  if (!p.metaDesc) push('desc-missing', 'There is no meta description, so Google writes its own snippet.', `Write one of ${DESC_MIN}–${DESC_MAX} characters: a promise with a number in it, not a company description.`, 18)
  else if (p.metaLen > DESC_MAX) push('desc-long', `The meta description is ${p.metaLen} characters and gets truncated at about ${DESC_MAX}.`, `Trim it under ${DESC_MAX} characters, keeping the offer in the first 120.`, 8)
  else if (p.metaLen < DESC_MIN) push('desc-short', `The meta description is only ${p.metaLen} characters.`, `Extend it toward ${DESC_MAX} characters so it fills the snippet.`, 5)

  if (p.h1.length === 0) push('h1-missing', 'The page has no H1.', 'Add exactly one H1 that states what the page is, using the main search phrase.', 15)
  else if (p.h1.length > 1) push('h1-many', `The page has ${p.h1.length} H1 headings: “${p.h1.slice(0, 3).join('”, “')}”.`, 'Keep one H1 and demote the rest to H2.', 10)

  const hasPlace = p.schema.some(s => /LocalBusiness|Place|PostalAddress/i.test(s))
  if (p.schema.length === 0) push('schema-missing', 'There is no structured data on the page.', 'Add Organization schema, plus LocalBusiness for a location page and BreadcrumbList for anything nested.', 12)
  else if (isLocation && !hasPlace) push('schema-no-place', `This is a location page but its only structured data is ${p.schema.join(', ')} — nothing tells Google it is about a place.`, 'Add LocalBusiness schema with the country or city, the area served and the contact route, alongside the existing Organization block.', 10)
  else if (!isLocation && !p.schema.some(s => /Organization|Article|Product|FAQPage/i.test(s))) push('schema-thin', `The only structured data is ${p.schema.join(', ')}.`, 'Add the schema type that matches what this page is.', 6)

  if (isLocation && !p.schema.some(s => /BreadcrumbList/i.test(s)) && (p.url.match(/\//g)?.length ?? 0) > 4) {
    push('no-breadcrumb', 'A city page with no BreadcrumbList schema, so Google shows the bare URL instead of the country path.', 'Add BreadcrumbList schema: Locations → country → city.', 4)
  }

  if (!p.canonical) push('canonical-missing', 'No canonical link, so duplicates of this URL can compete with it.', 'Add a self-referencing canonical link in the head.', 6)
  if (!p.ogImage) push('og-missing', 'No og:image, so shares of this page render without a picture.', 'Add an og:image to the page head.', 3)

  if (p.words < WORDS_MIN) push('thin', `The page body is about ${p.words} words — too thin to rank against a competitor's full page.`, `Take it past ${WORDS_MIN} words: what we offer there, the formats, a local example, and a contact route.`, 20)

  if (p.internalOut < 3) push('few-links', `The page links to only ${p.internalOut} other location page${p.internalOut === 1 ? '' : 's'}.`, 'Link to the cities in this country and to the neighbouring markets, using the search wording as anchor text.', 8)

  return f.sort((a, b) => b.weight - a.weight)
}

/** Green, amber or red, for a board a person reads at a glance. */
export const healthBand = (score: number): 'good' | 'warn' | 'bad' =>
  score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad'
