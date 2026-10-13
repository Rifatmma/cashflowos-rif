// 👉 Turning search data into work someone can actually do.
//
// The old suggestions stopped at the diagnosis — "you rank for 117 keywords in
// India, a competitor ranks for 754, a content problem" — which tells a market
// lead nothing about Monday morning. Every task here names the queries, their
// positions, the page Google already shows, what to write, and when it is done
// (owner, 29 Sep 2026).
//
// It works COUNTRY by country, because the site does: /locations/india,
// /locations/uae, /locations/india/bengaluru. The market only decides whose
// name goes on the task.
//
// Pure functions: no network, no server imports, so tests/mw-plan.test.mts can
// run the whole generator against a fixture.
import type { Country, Market, Specialists } from './mw-markets'
import { cityPageFor, isBrand, isRelevant, marketOfCountry, marketOfGa4, pageFor, withSpecialists } from './mw-markets'
import { themeOf } from './mw-themes'
import type { PageHealth } from './mw-pagehealth'
import { rankLinkers, linkStep, type BlogPost } from './mw-linkers'
import { targetsFor, linkJobs, linkTaskSteps, editCount } from './mw-internal-links'
import { clashes, clashTitle, clashWhy, clashSteps, countryName, type Clash } from './mw-contested'
import { effortOf, type GapCluster } from './mw-gap'
import { sizeOf, sizeShort, demandOf } from './mw-gsc-market'

// ---------------------------------------------------------------- the inputs
/** One Search Console row: query x page x country, last 28 days. */
/**
 * One ranking row for one country, from either source.
 *
 * The field names say which fact each number is, because the same shape
 * carrying a different fact is how a team ends up quoting the wrong one at a
 * client (owner, 29 Sep 2026):
 *
 *   volume  Semrush. How many people search that phrase in that country each
 *           month — total market demand, not how often we were shown.
 *   impr    Search Console. How often WE were shown. Counted, not modelled.
 *   visits  clicks where Search Console saw them, otherwise Semrush's estimate
 *           of what our position earns.
 *
 * `volume` and `impr` are never written into one another. Use `weigh()` to
 * compare rows and `sizeOf()` to put one in a sentence.
 */
export type MarketRow = {
  query: string; page: string; country: string
  visits: number; volume: number; ctr: number; position: number
  /** Semrush keyword difficulty, 0-100. Higher means more work to move. */
  kd?: number
  /** Position at the previous pull, 0 when it is new. */
  prev?: number
  /**
   * Search Console impressions. Separate from `volume`, which is Semrush's
   * estimate of total searches — we were shown this many times, which is not
   * the same fact and must not be written into the same field.
   */
  impr?: number
  src?: 'gsc' | 'semrush' | 'both'
}

/**
 * How much a row is worth, in whichever unit its source measured.
 *
 * Impressions and volume cannot be added, so this picks rather than sums, and
 * prefers the counted figure. Used for every threshold and sort, so that a
 * market Semrush has never heard of is weighed on the same scale as one it has.
 */
export const weigh = (r: { volume: number; impr?: number }) => (r.impr ?? 0) || r.volume

/** @deprecated the old Search Console shape; kept so existing callers compile. */
export type GscRow = MarketRow
export type Ga4Country = { country: string; sessions: number; users: number; leads: number }

export type PlanInput = {
  rows: MarketRow[]
  ga4: Ga4Country[]
  /** Every path on the site, from sitemap.xml. */
  pages: string[]
  /** On-page audit of the live location pages, keyed by path. */
  health?: Record<string, PageHealth>
  /** Content gap topics per country key, from the quarterly pull. */
  gaps?: Record<string, GapCluster[]>
  /**
   * Semrush positions keyed by path. Search Console knows what WE were clicked
   * for; Semrush knows what the page ranks for whether or not anyone clicked.
   * A page can hold a top-ten position that earns almost nothing and still be
   * worth protecting, and GSC alone will not show it.
   */
  ranked?: Record<string, PlanKeyword[]>
  /** The indexed blog, so a task can NAME the posts worth linking from. */
  posts?: BlogPost[]
  /**
   * Searches already handled by a clash task, so a link task does not also
   * push them. Lower-cased queries only — a clash is per country, but the
   * link suppression is not worth splitting that finely.
   */
  contested?: Set<string>
  markets: Market[]
  /** Cross-market people. `pages` builds pages and owns on-page SEO on them. */
  specialists?: Partial<Specialists>
  /** The week this was generated, e.g. "2026-W40". */
  cycle: string
}

// --------------------------------------------------------------- the output
export type PlanKeyword = {
  q: string; pos: number; vol: number; visits: number; kd?: number; prev?: number
  /** The page that holds this position. Only set where the page is the point. */
  url?: string
  /**
   * Search Console's two counted figures. Kept apart from `vol` on purpose:
   * `vol` is Semrush's estimate of how often a phrase is searched anywhere,
   * `impr` is how often WE were shown. Writing one into the other would make
   * every task quote a number that means something else — see sizeOf() in
   * lib/mw-gsc-market.ts, which is how copy asks for the right units.
   */
  impr?: number
  clicks?: number
  /** Which source this row came from. `both` is the strongest evidence. */
  src?: 'gsc' | 'semrush' | 'both'
}
export type PlanTask = {
  id: string
  cycle: string
  market: string
  marketLabel: string
  country: string
  countryLabel: string
  owner: string | null
  /**
   * Findings that take two people are split into two real tasks, one each,
   * sharing a group id so they stay together when the market is trimmed to its
   * top few. A missing country page is the case: the market DRI writes the
   * copy, the pages specialist builds the page (owner, 29 Sep 2026).
   */
  group: string | null
  /** The task that has to land first. The second task says whose it is. */
  blockedBy: { id: string; owner: string | null; title: string } | null
  lead: string | null
  kind: 'strike' | 'no-page' | 'page-build' | 'no-clicks' | 'city' | 'city-build'
  | 'orphan' | 'health' | 'convert' | 'cannibal' | 'gap' | 'links' | 'blind'
  title: string
  /** One line, with the numbers that justify it. */
  why: string
  /** Numbered and concrete. This is what the old suggestions were missing. */
  steps: string[]
  keywords: PlanKeyword[]
  /**
   * Searches this page ALREADY ranks in the top ten for.
   *
   * Rif's point, and he is right: a lead told to add five new keywords to a
   * page will happily rewrite away the three it already wins. The rankings we
   * hold are listed on the task so they are protected on purpose rather than
   * lost by accident (owner, 29 Sep 2026).
   */
  holds: PlanKeyword[]
  url: string
  size: 'S' | 'M' | 'L'
  doneWhen: string
  /** The SEO action this rolls up to. Derived from kind, never hand-set. */
  theme: string | null
  /** Extra monthly visits on the table if this works — used to rank. */
  score: number
}

// How often a result at each position gets clicked. Rough industry figures,
// used only to rank one opportunity against another, never shown as a promise.
const CTR_AT: [number, number][] = [
  [1, 0.28], [2, 0.15], [3, 0.10], [4, 0.08], [5, 0.06],
  [7, 0.04], [10, 0.03], [15, 0.015], [20, 0.01], [100, 0.004],
]
export function ctrAt(pos: number): number {
  for (const [p, c] of CTR_AT) if (pos <= p) return c
  return 0.004
}

/** Clicks a query would gain if it reached the top three, from where it is now. */
export const upside = (r: { volume: number; position: number; ctr: number }) =>
  Math.max(0, weigh(r) * (ctrAt(3) - Math.max(r.ctr, ctrAt(r.position))))

const slug = (s: string) =>
  String(s || '').toLowerCase().replace(/^https?:\/\/[^/]+/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'site'
const pathOf = (url: string) => String(url || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0].replace(/\/$/, '') || '/'
// Numbers land in sentences a person reads aloud, so 12198 is written 12,198.
const round = (n: number) => Math.round(n).toLocaleString('en-US')
const list = (ks: PlanKeyword[], n = 6) =>
  ks.slice(0, n).map(k => `"${k.q}" (#${k.pos.toFixed(0)}, ${sizeOf(k)})`).join(', ')

/**
 * A row, as the keyword shape tasks carry.
 *
 * This was written out by hand in eight places. Once rows gained `impr` and
 * `src` that became eight chances to drop them, and a task whose keywords
 * silently lost their impressions would quote "no volume recorded" for a
 * market with thousands. One helper, so there is one place to be wrong.
 */
const kwOf = (r: MarketRow): PlanKeyword => ({
  q: r.query, pos: r.position, vol: r.volume, visits: r.visits,
  kd: r.kd, prev: r.prev, impr: r.impr, src: r.src,
})

const MIN_VOL = 20         // below this a search is noise, not an opportunity
const STRIKE_FROM = 4      // already top three? nothing to win here
const STRIKE_TO = 20       // past page two it is a new-content job, not a tweak

// ---------------------------------------------------------------- the rules
/** Every candidate task for one country. `pick()` keeps the best per market. */
export function tasksForCountry(m: Market, co: Country, input: PlanInput): PlanTask[] {
  const rows = input.rows.filter(r => String(r.country || '').toUpperCase() === co.iso3)
  const ga4 = input.ga4.find(g => g.country.toLowerCase() === co.ga4.toLowerCase())
  const has = (p: string) => input.pages.some(x => pathOf(x).toLowerCase() === pathOf(p).toLowerCase())
  const page = pageFor(co)
  const out: PlanTask[] = []
  const base = {
    cycle: input.cycle, market: m.key, marketLabel: m.label,
    country: co.key, countryLabel: co.label, owner: m.owner,
    group: null, blockedBy: null, lead: m.lead, theme: null, holds: [] as PlanKeyword[],
  }

  // Writing a page and building it are two jobs. The market DRI knows the
  // market, the pages specialist knows the markup; each gets their own task
  // rather than one of them being a footnote on the other's.
  const builder = withSpecialists(input.specialists).pages ?? m.owner

  // ── the country page that does not exist ────────────────────────────────
  // True today from the sitemap alone, so this works before Search Console is
  // connected. Nigeria, Kenya and South Africa are the live example: the
  // September plan says their pages are done, and the sitemap has only
  // /locations/africa.
  if (!has(page)) {
    const impr = rows.reduce((t, r) => t + weigh(r), 0)
    const sessions = ga4?.sessions ?? 0
    if (impr >= 50 || sessions >= 25) {
      const top = [...rows].sort((a, b) => weigh(b) - weigh(a)).slice(0, 8)
        .map(r => (kwOf(r)))
      const why = impr >= 50
        ? `${co.label} is worth ${demandOf(rows)} that we already show up for, and there is no ${co.label} page — Google is sending them to whatever page it can find.`
        : `GA4 recorded ${round(sessions)} sessions from ${co.label} this month and there is no ${co.label} page for them to land on.`
      const group = `mkt-${co.key}-page`
      const score = impr * 0.02 + sessions * 0.05
      const copy = `${group}-copy`

      // 1 of 2 — the market DRI. Nobody else can say what is true in ${co.label}.
      out.push({
        ...base, id: copy, kind: 'no-page', group,
        title: `Write the copy for the ${co.label} page`,
        why,
        steps: [
          `Write the page copy for ${page} in a doc and hand it to ${builder}. Use /locations/india as the model for what sections it needs.`,
          top.length
            ? `Answer these searches in the copy, in their own sections: ${list(top)}.`
            : `Cover: what Moving Walls offers in ${co.label}, the formats and inventory available, and the media owners or partners we work with there.`,
          `Include one local proof point — a campaign we ran, a partner, or a named site in ${co.label}.`,
          `Give the contact route for ${co.label}: who a buyer reaches and how.`,
          `Suggest the page title and a one-line description in the words your market actually uses — ${builder} will trim them to length.`,
        ],
        keywords: top, url: page, size: 'M',
        doneWhen: `The copy is written and handed to ${builder}.`,
        score,
      })

      // 2 of 2 — the build. Templated, so it is an hour once the copy arrives.
      out.push({
        ...base, id: `${group}-build`, kind: 'page-build', group,
        owner: builder,
        blockedBy: { id: copy, owner: m.owner, title: `Write the copy for the ${co.label} page` },
        title: `Build the ${co.label} page at ${page}`,
        why: `${why} The copy comes from ${m.owner ?? 'the market lead'}; this is the build and the on-page SEO on top of it.`,
        steps: [
          `Create ${page} from the /locations/india template and put ${m.owner ?? 'the market lead'}'s copy on it.`,
          `Page title under 60 characters with ${co.label} in it; meta description under 155; exactly one H1.`,
          `Add Organization and LocalBusiness schema with the ${co.label} entity, and hreflang if the copy is localised.`,
          `Link it from /locations and from any ${co.label} blog already published, and add it to the sitemap.`,
          'Check it on a phone, then submit the URL in Search Console.',
        ],
        keywords: top, url: page, size: 'S',
        doneWhen: `${page} is live with its meta tags and schema in place, linked from /locations, and submitted in Search Console.`,
        score: score - 0.001,
      })
    }
  }

  // ── the page exists but is not built to standard ───────────────────────
  // Read from the page itself, so this works with no API at all. It is the
  // one rule that can still produce work when every data source is down.
  const audit = input.health?.[pathOf(page)]
  if (audit && audit.faults.length) {
    const heavy = audit.faults.filter(f => f.weight >= 8)
    if (heavy.length) {
      out.push({
        ...base, owner: builder, id: `mkt-${co.key}-health`, kind: 'health',
        title: `Fix the on-page SEO on ${page}`,
        why: `${page} scores ${audit.score} out of 100 on the on-page checks, with ${heavy.length} ${heavy.length === 1 ? 'problem' : 'problems'} worth fixing. None of this needs new content or anybody's approval — it is markup on a page that is already live and already earning traffic.`,
        steps: [
          ...heavy.map(f => `${f.says} ${f.fix}`),
          'Re-run the page through the audit afterwards and confirm it scores above 80.',
        ],
        keywords: [], url: page, size: heavy.length > 3 ? 'M' : 'S',
        doneWhen: `${page} passes the on-page checks with a score above 80.`,
        score: (100 - audit.score) * 0.4 + (ga4?.sessions ?? 0) * 0.01,
      })
    }
  }

  // ── traffic arrives and nobody asks us anything ────────────────────────
  // Sessions without a single lead is not a ranking problem and more traffic
  // will not fix it. It belongs to whoever knows what a buyer there expects.
  const sess = ga4?.sessions ?? 0
  if (has(page) && sess >= 120 && (ga4?.leads ?? 0) === 0) {
    out.push({
      ...base, id: `mkt-${co.key}-convert`, kind: 'convert',
      title: `Give ${co.label} a reason to get in touch`,
      why: `${co.label} sent ${round(sess)} sessions to the site this month and produced no enquiries at all. The traffic is already paid for; the page is not converting it.`,
      steps: [
        `Open ${page} and find the contact route. Say who in ${co.label} a buyer reaches, and how they prefer to be reached — a form alone is not enough in every market.`,
        `Add proof we operate in ${co.label}: a campaign, a partner, a named site, or the inventory count.`,
        'Put a call to action above the fold and repeat it at the end, in the words a buyer there would use.',
        `Check the page on a phone — most of this traffic is mobile.`,
        'If the market genuinely has no inventory yet, decline this task and say so; that is the useful answer.',
      ],
      keywords: [], url: page, size: 'M',
      doneWhen: `${page} has a working local contact route and local proof, and leads are re-counted in four weeks.`,
      score: sess * 0.03,
    })
  }

  // We rank #1 for our own name in every market, so a brand search scores like
  // a huge opportunity and is worth nothing -- there is no position left to
  // win. Everything hunting for a ranking to improve reads `earned`, and it
  // also has to be a search for something we sell: "Moving Walls" picks up
  // wall-decorating and pest-control traffic that scores like gold and is
  // worth nothing. Cannibalisation is the deliberate exception -- a dozen
  // pages fighting over our own company name is a real problem.
  const earned = rows.filter(r => !isBrand(r.query) && isRelevant(r.query))

  // What each page already ranks in the top ten for, so a rewrite defends it.
  // `exclude` drops the searches the same task is already asking them to push
  // up: listing one keyword as both "work this in" and "do not lose this"
  // reads as a contradiction and makes the whole block easy to ignore.
  /**
   * Pages ANYWHERE on the site already ranking for this family of searches.
   *
   * holdsOn() asks "what does this one page hold in the top ten", which is the
   * wrong question before writing a NEW page. A gap task for "advertising
   * boards" told Sukrithi "this is new ground, so nothing on the site is at
   * risk" while /locations/india/bengaluru sat at #14 for "advertising boards
   * near me" and #15 for "billboards near me" — the best city page on the
   * site, two places off the first screen. A fifth page for the same family
   * splits the signal with it (owner asked what the task meant, 12 Oct 2026).
   *
   * Matched loosely in both directions, because "advertising boards" and
   * "advertising boards near me" are the same territory and an exact match
   * would have missed exactly the case that caused this.
   */
  const rankingElsewhere = (queries: string[], notOn: string): { url: string; q: string; pos: number; vol: number }[] => {
    const want = queries.map(q => q.toLowerCase().trim()).filter(Boolean)
    const out: { url: string; q: string; pos: number; vol: number }[] = []
    const add = (url: string, q: string, pos: number, vol: number) => {
      if (!(pos >= 1 && pos <= 30) || pathOf(url) === notOn) return
      const lower = q.toLowerCase()
      if (!want.some(w => lower.includes(w) || w.includes(lower))) return
      const seen = out.find(x => x.url === pathOf(url) && x.q.toLowerCase() === lower)
      if (!seen) out.push({ url: pathOf(url), q, pos, vol })
      else if (pos < seen.pos) seen.pos = pos
    }
    for (const r of earned) add(r.page, r.query, r.position, weigh(r))
    for (const [url, ks] of Object.entries(input.ranked ?? {})) for (const k of ks) add(url, k.q, k.pos, k.vol)
    return out.sort((a, b) => a.pos - b.pos).slice(0, 5)
  }

  /**
   * Says, in one sentence, which keywords are on BOTH lists.
   *
   * 4-10 is simultaneously striking distance and top ten, so the overlap is
   * normal and naming it is the whole safeguard: these are the phrases you
   * most want to improve and least want to break.
   */
  const bothNote = (holds: PlanKeyword[], targets: PlanKeyword[]): string => {
    const both = holds.filter(h => targets.some(k => k.q.toLowerCase() === h.q.toLowerCase()))
    if (!both.length) return ''
    const it = both.length === 1 ? 'it' : 'them'
    return ` Note ${list(both, 4)} ${both.length === 1 ? 'is' : 'are'} on both lists — already top ten AND worth pushing higher. ` +
      `Improve the section around ${it}; do not replace the wording that got ${it} there.`
  }

  /**
   * Everything this page already ranks in the top ten for — the list a rewrite
   * must not break.
   *
   * TWO BUGS FIXED HERE AT ONCE, both found on /locations/malaysia (12 Oct 2026).
   *
   * It used to take an `exclude` list and was called with the task's own strike
   * keywords. But striking distance is #4-20, so a term at #8 is BOTH worth
   * pushing and worth protecting. Excluding it emptied the list, and the task
   * then printed "Nothing on this page ranks in the top ten yet, so there is
   * nothing to protect — write it the way it should have been written" on a
   * card whose own table showed `out of home media malaysia` at #8. Anyone
   * following that instruction could rewrite over a top-ten ranking. Nothing
   * is excluded now: a term appearing in both lists is the point, not a
   * duplicate to be tidied away.
   *
   * It also read Search Console only. Semrush is merged in, because a position
   * that earns few clicks is still a position, and losing it is still a loss.
   */
  const holdsOn = (onPage: string): PlanKeyword[] => {
    const best = new Map<string, PlanKeyword>()
    const add = (k: PlanKeyword) => {
      const key = k.q.toLowerCase()
      const seen = best.get(key)
      // Keep the better-placed reading when the two sources disagree: that is
      // the one with more to lose.
      if (!seen || (k.pos > 0 && k.pos < seen.pos)) best.set(key, { ...seen, ...k })
    }
    for (const r of earned) {
      if (pathOf(r.page) !== onPage || !(r.position >= 1 && r.position <= 10)) continue
      add(kwOf(r))
    }
    for (const k of input.ranked?.[onPage] ?? []) {
      if (!(k.pos >= 1 && k.pos <= 10)) continue
      add(k)
    }
    return [...best.values()].sort((a, b) => (b.visits - a.visits) || (b.vol - a.vol)).slice(0, 10)
  }

  // ── a page our competitors have and we do not ──────────────────────────
  // The gap is pulled quarterly; only the strongest topic becomes a task, or
  // one market would swamp the board with eight content briefs at once. The
  // rest stay on /mw/gaps for the lead to pick up when they have capacity.
  const topics = (input.gaps?.[co.key] ?? []).slice(0, 1)
  for (const g of topics) {
    const e = effortOf(g)
    const rivals = g.rivals.length ? g.rivals.join(' and ') : 'a competitor'
    const defend = holdsOn(page)

    // WHICH PAGE WE ALREADY HAVE SHOULD OWN THIS SEARCH.
    //
    // This task used to say "write a new page". The owner stopped it:
    //
    //   "adding a new page is not realistic solution for me... you shouldn't
    //    ask us to create a new page just to cover for a keyword. If you want
    //    a particular keyword to rank well there are a bunch of ways."
    //                                                (owner, 12 Oct 2026)
    //
    // He is right, and the numbers agree: one person owns 22 of the 37 tasks
    // on the board, so a plan that answers every keyword with "build
    // something" is a plan that does not happen. The site is /locations/
    // country and /locations/country/city and that is the shape we work in.
    //
    // So the task picks the page that should own the search — the one already
    // ranking for that family if there is one, otherwise the country page —
    // and asks for a section on it. Which is work that already has a review
    // path: it becomes a change on that page, with the render beside it.
    // THE HOST MUST BE THIS COUNTRY'S OWN PAGE.
    //
    // rankingElsewhere looks across the whole site, and for Australia's
    // "billboards" gap the best-ranking page anywhere was
    // /locations/singapore -- so the task read "Make /locations/singapore
    // rank for billboards" and landed on the ANZ lead, who does not own that
    // page and could not act on it if they did. Optimising Singapore's page
    // for Australian demand would also be the cannibalisation this plan
    // raises tasks about elsewhere.
    //
    // So a country's gap may only be hosted on that country's page or
    // something beneath it. If nothing of ours ranks there yet, the country
    // page takes it, which is the honest answer anyway.
    const mine = pathOf(page)
    const near = rankingElsewhere(g.keywords.map(k => k.q).concat(g.head), '')
      .filter(n => n.url === mine || n.url.startsWith(mine + '/'))
    const host = near[0]?.url ?? mine
    const hostWhy = near[0]
      ? `${host} already ranks #${Math.round(near[0].pos)} for “${near[0].q}”, so it is the page Google already associates with this`
      : `${host} is the page for this market and has the most authority to lend`

    out.push({
      ...base, id: `mkt-${co.key}-gap-${slug(g.head)}`, kind: 'gap', holds: defend,
      title: `Make ${host} rank for “${g.head}”`,
      why: `${rivals} rank for ${g.keywords.length === 1 ? 'this search' : `these ${g.keywords.length} searches`}, worth ${round(g.vol)} a month in ${co.label}, and ${g.keywords.length === 1 ? 'we do not rank for it at all' : 'we rank for none of them'} — ${e.says}.${g.cpc > 0 ? ` Buying that traffic costs $${g.cpc.toFixed(2)} a click.` : ''}`,
      steps: [
        `NO NEW PAGE. ${host} should own this search: ${hostWhy}.`,
        g.keywords.length > 1
          ? `Add one section to ${host} answering all of these together — they are the same question asked different ways: ${g.keywords.slice(0, 8).map(k => `"${k.q}" (${round(k.vol)}/mo)`).join(', ')}. One H2, two or three real paragraphs under it.`
          : `Add one section to ${host} answering "${g.keywords[0]?.q ?? g.head}" (${round(g.keywords[0]?.vol ?? g.vol)} searches a month): an H2 using those words, and two or three real paragraphs under it that answer the question.`,
        `Read how ${g.rivals[0] ?? 'the competitor'} answers it, then answer it better with something they cannot copy — our inventory, our measurement, a named local campaign.`,
        // NAMED, not described. "Link from two or three pages that already
        // mention the topic" sounded actionable and was not: none of the 289
        // posts uses the phrase "advertising boards", so the lead would have
        // gone looking and found nothing (owner asked, 12 Oct 2026).
        linkStep(
          rankLinkers({
            posts: input.posts ?? [], topic: g.head, target: host,
            places: [co.label, ...(co.cities ?? []).slice(0, 3)],
          }),
          g.head, host,
        ) ?? `Link to ${host} from the related blog posts, using "${g.head}" as the anchor text.`,
        `If ${host} is within a few places of page one for it, the title and meta description are worth rewriting to lead with "${g.head}" too. If it is not ranking at all yet, leave the title alone until the section has had eight weeks.`,
        ...(near.length > 1
          ? [`Keep it on one page. ${near.slice(1).map(n => `${n.url} is #${Math.round(n.pos)} for "${n.q}"`).join(', ')} — do not add the same section there as well, or they compete with each other.`]
          : []),
        ...(defend.length
          ? [`Do not lose what ${host} already wins: it ranks top ten for ${list(defend, 6)}. Add the new section around that wording rather than over it.`]
          : []),
      ],
      keywords: g.keywords.slice(0, 8).map(k => ({ q: k.q, pos: 0, vol: k.vol, visits: 0, kd: k.kd })),
      url: host, size: e.size,
      doneWhen: `${host} has a section answering “${g.head}”, is linked to with that wording, and its position is checked in eight weeks.`,
      score: g.vol * 0.02,
    })
  }

  if (!rows.length) return out

  // Queries naming a city with no page of its own belong to that city's task,
  // not to the country page as well — otherwise the same keyword is handed to
  // two people.
  const citiesWanted = co.cities.filter(city =>
    !has(cityPageFor(co, city)) &&
    earned.some(r => r.query.toLowerCase().includes(city.toLowerCase()) && weigh(r) >= MIN_VOL))
  const claimedByCity = (q: string) => citiesWanted.some(city => q.toLowerCase().includes(city.toLowerCase()))

  // ── striking distance, grouped by the page Google already shows ─────────
  const near = earned.filter(r =>
    r.position >= STRIKE_FROM && r.position <= STRIKE_TO && weigh(r) >= MIN_VOL && !claimedByCity(r.query))
  const byPage = new Map<string, GscRow[]>()
  for (const r of near) byPage.set(pathOf(r.page), [...(byPage.get(pathOf(r.page)) ?? []), r])

  for (const [onPage, group] of byPage) {
    const kws = [...group].sort((a, b) => upside(b) - upside(a))
      .map(r => (kwOf(r)))
    const gain = group.reduce((t, r) => t + upside(r), 0)
    // One small keyword is not a project. Either several searches point at the
    // page, or the single one that does is big enough to matter on its own.
    const groupVol = group.reduce((t, r) => t + weigh(r), 0)
    if (group.length < 2 && groupVol < 200) continue
    if (gain < 3) continue
    const holds = holdsOn(onPage)
    out.push({
      ...base, holds, id: `mkt-${co.key}-strike-${slug(onPage)}`, kind: 'strike',
      title: `Push ${onPage} onto page one for ${kws.length} ${co.label} ${kws.length === 1 ? 'search' : 'searches'}`,
      why: `${kws.length} ${co.label} ${kws.length === 1 ? 'search ranks' : 'searches rank'} between #${Math.min(...kws.map(k => k.pos)).toFixed(0)} and #${Math.max(...kws.map(k => k.pos)).toFixed(0)} on ${onPage}. They are worth ${demandOf(group)} between them and bring us about ${round(group.reduce((t, r) => t + r.visits, 0))} visits — on the board, off the first screen. Reaching the top three is worth roughly ${round(gain)} more visits a month.`,
      steps: [
        `Open ${onPage} and work these into it, biggest opportunity first: ${list(kws)}.`,
        'Put the strongest in the H1 and the page title; give each of the others its own H2 with two or three real paragraphs underneath — an answer, not a keyword drop.',
        kws.length > 2
          ? `Add an FAQ block answering the question form of the weakest three: "${kws.slice(-3).map(k => k.q).join('", "')}".`
          : 'Add an FAQ block answering the question form of each of these.',
        has(page) && pathOf(page) !== onPage
          ? `Link to ${onPage} from ${page}, using the query wording as the anchor text.`
          : `Link to ${onPage} from two related blog posts, using the query wording as the anchor text.`,
        holds.length
          ? `DO NOT LOSE WHAT THIS PAGE ALREADY WINS. It ranks in the top ten for ${list(holds, 8)}. Keep the wording that earns those — the existing H1, the headings and the paragraphs that answer them — and add the new sections around them rather than rewriting over the top. If the title has to change, keep the phrase from the best of them in it.${bothNote(holds, kws)}`
          : 'Nothing on this page ranks in the top ten yet, so there is nothing to protect — write it the way it should have been written.',
        'Resubmit the URL in Search Console when it is live.',
      ],
      keywords: kws, url: onPage, size: kws.length > 6 ? 'M' : 'S',
      doneWhen: holds.length
        ? `${onPage} is updated and live, the new searches have moved up in four weeks, and the ${holds.length === 1 ? 'one we already rank top ten for is' : `${holds.length} we already rank top ten for are`} still there.`
        : `${onPage} is updated and live; check these positions again in four weeks.`,
      score: gain,
    })
  }

  // ── seen often, clicked almost never: a listing problem, not a rank one ──
  const totals = new Map<string, { vol: number; visits: number; pos: number; n: number }>()
  for (const r of earned) {
    const p = pathOf(r.page)
    const at = totals.get(p) ?? { vol: 0, visits: 0, pos: 0, n: 0 }
    at.vol += weigh(r); at.visits += r.visits; at.pos += r.position; at.n++
    totals.set(p, at)
  }
  for (const [onPage, t] of totals) {
    const ctr = t.vol > 0 ? t.visits / t.vol : 0
    const avgPos = t.n ? t.pos / t.n : 99
    if (t.vol < 400 || ctr >= 0.01 || avgPos > 20) continue
    const kws = earned.filter(r => pathOf(r.page) === onPage).sort((a, b) => weigh(b) - weigh(a)).slice(0, 6)
      .map(r => (kwOf(r)))
    const ctrHolds = holdsOn(onPage)
    out.push({
      ...base, owner: builder, holds: ctrHolds, id: `mkt-${co.key}-ctr-${slug(onPage)}`, kind: 'no-clicks',
      title: `Rewrite the title and description on ${onPage}`,
      why: `In ${co.label}, ${onPage} ranks at an average of #${avgPos.toFixed(1)} for searches run ${round(t.vol)} times a month, and earns only about ${t.visits} visits from them — ${(ctr * 100).toFixed(2)}%. At that position the listing is what is losing, not the ranking.`,
      steps: [
        `Rewrite the page title to lead with the words people actually search: ${list(kws, 3)}.`,
        `Keep it under 60 characters and put ${co.label} in it.`,
        'Rewrite the meta description as a promise with a number in it — what the reader gets, not what the company is. Under 155 characters.',
        'Change nothing else. If clicks move, it was the listing; if they do not, the page needs the content work instead.',
        ...(ctrHolds.length
          ? [`Keep the wording that already wins: this page also ranks top ten for ${list(ctrHolds, 6)}. A new title that drops those phrases can cost more than the clicks it buys.${bothNote(ctrHolds, kws)}`]
          : []),
      ],
      keywords: kws, url: onPage, size: 'S',
      doneWhen: 'Title and description are live; compare clicks on this page in four weeks.',
      score: t.vol * Math.max(0, ctrAt(avgPos) - ctr),
    })
  }

  // ── links we already own and have not spent ─────────────────────────────
  //
  // Of 289 posts, 27 link to a location page outside the nav. The rest of that
  // equity sits unspent while leads are asked to write new things. This task
  // asks for edits to posts already published — no new pages, nobody waiting
  // on the pages specialist (owner, 13 Oct 2026).
  {
    // Every page in this country, with what it ranks for, from both sources.
    const underCountry = (u: string) => pathOf(u).startsWith(`/locations/${co.key}`)
    const termsOf = new Map<string, { q: string; pos: number; vol: number }[]>()
    const push = (url: string, q: string, pos: number, vol: number) => {
      const path = pathOf(url)
      if (!underCountry(path) || !(pos > 0) || isBrand(q)) return
      const list = termsOf.get(path) ?? []
      const seen = list.find(t => t.q.toLowerCase() === q.toLowerCase())
      if (!seen) list.push({ q, pos, vol })
      else if (pos < seen.pos) seen.pos = pos
      termsOf.set(path, list)
    }
    for (const r of earned) push(r.page, r.query, r.position, weigh(r))
    for (const [url, ks] of Object.entries(input.ranked ?? {})) for (const k of ks) push(url, k.q, k.pos, k.vol)

    const targets = targetsFor([...termsOf.entries()].map(([url, terms]) => ({ url, terms })))
      // A search several markets compete for is not a linking job for each of
      // them — it is one decision about which page owns it, raised below as a
      // single task. Without this, three leads were each told to point the same
      // blog post at a different page with the same anchor text.
      .filter(t => !input.contested?.has(t.term.toLowerCase().trim()))
    const jobs = linkJobs(targets, input.posts ?? [], [co.label, ...(co.cities ?? []).slice(0, 4)])
    const edits = editCount(jobs)
    if (jobs.length) {
      out.push({
        ...base, id: `mkt-${co.key}-links`, kind: 'links', holds: [],
        title: `Spend the links we already have on ${jobs.length} ${co.label} page${jobs.length === 1 ? '' : 's'}`,
        why: `${jobs.length} ${co.label} ${jobs.length === 1 ? 'page sits' : 'pages sit'} between ` +
          `#${Math.round(Math.min(...jobs.map(j => j.target.pos)))} and #${Math.round(Math.max(...jobs.map(j => j.target.pos)))} ` +
          `for searches worth ${round(jobs.reduce((t, j) => t + j.target.vol, 0))} a month, and posts we have already ` +
          `published cover those topics without linking to them. ${edits} edit${edits === 1 ? '' : 's'}, no new pages.`,
        steps: linkTaskSteps(jobs, co.label),
        keywords: jobs.map(j => ({ q: j.target.term, pos: j.target.pos, vol: j.target.vol, visits: 0, url: j.target.url })),
        url: jobs[0].target.url, size: edits > 5 ? 'M' : 'S',
        doneWhen: `The ${edits} link${edits === 1 ? '' : 's'} are live, and the positions of the ` +
          `${jobs.length} page${jobs.length === 1 ? '' : 's'} are checked in six weeks.`,
        // Cheap and quick, so it should not sit under a month of writing.
        score: jobs.reduce((t, j) => t + j.target.vol, 0) * 0.01 + 5,
      })
    }
  }

  // ── a city people search for, with nowhere to send them ─────────────────
  for (const city of citiesWanted) {
    const hits = earned.filter(r => r.query.toLowerCase().includes(city.toLowerCase()) && weigh(r) >= MIN_VOL)
    const kws = [...hits].sort((a, b) => weigh(b) - weigh(a)).slice(0, 6)
      .map(r => (kwOf(r)))
    const url = cityPageFor(co, city)
    const cwhy = `${city} is worth ${demandOf(hits)} across ${hits.length} ${hits.length === 1 ? 'phrase' : 'phrases'}, and we have no ${city} page — the best we manage is #${Math.min(...hits.map(h => h.position)).toFixed(0)} on a general page.`
    const cgroup = `mkt-${co.key}-city-${slug(city)}`
    const cscore = hits.reduce((t, r) => t + upside(r), 0)
    const ccopy = `${cgroup}-copy`

    out.push({
      ...base, id: ccopy, kind: 'city', group: cgroup,
      title: `Write the copy for the ${city} page`,
      why: cwhy,
      steps: [
        `Write the copy for ${url} in a doc and hand it to ${builder}, following the other ${co.label} city pages.`,
        `Answer these directly: ${list(kws)}.`,
        `Include what is specific to ${city}: the formats available there, notable sites or malls by name, and one local example.`,
        `Suggest the page title and one-line description in the wording buyers in ${city} use.`,
      ],
      keywords: kws, url, size: 'M',
      doneWhen: `The copy is written and handed to ${builder}.`,
      score: cscore,
    })

    out.push({
      ...base, id: `${cgroup}-build`, kind: 'city-build', group: cgroup,
      owner: builder,
      blockedBy: { id: ccopy, owner: m.owner, title: `Write the copy for the ${city} page` },
      title: `Build the ${city} page at ${url}`,
      why: `${cwhy} The copy comes from ${m.owner ?? 'the market lead'}; this is the build and the on-page SEO on top of it.`,
      steps: [
        `Create ${url} from the sibling city-page template and put ${m.owner ?? 'the market lead'}'s copy on it.`,
        `Page title and meta description naming ${city}; exactly one H1.`,
        `Add LocalBusiness schema with the ${city} area, and breadcrumb schema back to ${page}.`,
        `Link it from ${page} and from the sibling city pages, and add it to the sitemap.`,
        'Submit the URL in Search Console.',
      ],
      keywords: kws, url, size: 'S',
      doneWhen: `${url} is live with its meta tags and schema, linked from ${page}, and submitted.`,
      score: cscore - 0.001,
    })
  }

  // ── an article earning attention with nothing to hand it on to ──────────
  if (has(page)) {
    for (const [onPage, t] of totals) {
      if (!/\/(blog|insights|resources|press-news)\//.test(onPage) || t.vol < 200) continue
      const kws = earned.filter(r => pathOf(r.page) === onPage).sort((a, b) => weigh(b) - weigh(a)).slice(0, 4)
        .map(r => (kwOf(r)))
      out.push({
        ...base, id: `mkt-${co.key}-orphan-${slug(onPage)}`, kind: 'orphan',
        title: `Link ${onPage} to ${page}`,
        why: `${onPage} already draws about ${round(t.visits)} visits a month from ${co.label} on its own, from searches run ${round(t.vol)} times. Connecting it to the country page passes that interest somewhere that converts.`,
        steps: [
          `Check whether ${onPage} links to ${page}. If not, add the link in the first third of the article.`,
          `Add the link the other way: list this article on ${page} under a resources or "read more" block.`,
          `Use the search wording as the anchor text, never "click here": ${list(kws, 2)}.`,
        ],
        keywords: kws, url: onPage, size: 'S',
        doneWhen: 'Both links are live.',
        score: t.vol * 0.01,
      })
    }
  }

  // ── one search, many of our own pages ─────────────────────────────
  // Google will not rank twelve pages of ours for one phrase; it picks one and
  // usually picks badly. The ranking is already earned, only scattered, so
  // consolidating is the cheapest position gain available anywhere.
  // `earned`, not `rows`: the latter still carries brand searches, and this
  // task was raising five of them — "pick one page to own moving walls india".
  // Nothing is going to outrank us for our own name (owner, 14 Oct 2026).
  const perQuery = new Map<string, MarketRow[]>()
  for (const r of earned) {
    const q = r.query.toLowerCase()
    perQuery.set(q, [...(perQuery.get(q) ?? []), r])
  }
  for (const [q, hits] of perQuery) {
    const pages = [...new Set(hits.map(h => pathOf(h.page)))]
    if (pages.length < 3) continue
    const vol = Math.max(...hits.map(weigh))
    if (vol < MIN_VOL) continue
    const best = [...hits].sort((a, b) => a.position - b.position)[0]
    const bestPage = pathOf(best.page)
    out.push({
      ...base, owner: builder, id: `mkt-${co.key}-cannibal-${slug(q)}`, kind: 'cannibal',
      title: `Pick one page to own “${q}” — ${pages.length} of ours are competing`,
      why: `“${q}” is worth ${demandOf(hits)} in ${co.label}, and ${pages.length} different pages of ours turn up for it, the best at #${best.position.toFixed(0)}. Google is choosing between them rather than ranking one properly, so the signal we have earned is being split ${pages.length} ways.`,
      steps: [
        `Decide which page should own this search. On the evidence it is ${bestPage}, which already ranks highest.`,
        `Make that page unambiguously about it: the phrase in the title, the H1 and the opening paragraph.`,
        `On the other ${pages.length - 1} page${pages.length === 2 ? '' : 's'}, remove the phrase from titles and headings and link to ${bestPage} using it as the anchor text instead. The pages to change: ${pages.filter(x => x !== bestPage).slice(0, 8).join(', ')}.`,
        `Check none of them carries a canonical pointing anywhere unexpected.`,
        'Re-check the position in four weeks — consolidation usually shows within two.',
      ],
      keywords: [...hits].sort((a, b) => a.position - b.position).slice(0, 8)
        .map(h => (({ ...kwOf(h), url: pathOf(h.page) }))),
      url: bestPage, size: pages.length > 6 ? 'M' : 'S',
      doneWhen: `One page owns “${q}” and the others link to it instead of competing.`,
      score: vol * 0.03 * Math.min(pages.length, 10),
    })
  }

  return out
}

/** Every candidate for a market, across all its countries. */
export function tasksFor(m: Market, input: PlanInput): PlanTask[] {
  const out = m.countries.flatMap(co => tasksForCountry(m, co, input))
  if (out.length) return out

  // Nothing to say — said plainly, rather than invented.
  const seen = input.rows.some(r => m.countries.some(co => co.iso3 === String(r.country).toUpperCase()))
  const sessions = input.ga4
    .filter(g => marketOfGa4(g.country)?.market.key === m.key)
    .reduce((t, g) => t + g.sessions, 0)
  return [{
    cycle: input.cycle, market: m.key, marketLabel: m.label, country: '', countryLabel: '',
    owner: m.owner, group: null, blockedBy: null, lead: m.lead, kind: 'blind' as const, theme: null, holds: [],
    id: `mkt-${m.key}-blind`,
    title: `${m.label}: nothing to act on yet`,
    why: seen
      ? `${m.label} has search data but nothing above the thresholds worth a task this cycle.`
      : sessions > 0
        ? `GA4 saw ${round(sessions)} sessions from ${m.label} this month, but Search Console returned no rows for it.`
        : `No search or analytics data came back for ${m.label} this month.`,
    steps: [
      seen ? 'No action needed this cycle — the data is being watched.'
        : 'Confirm Search Console is connected and movingwalls.com is verified for this account.',
      `Country pages checked: ${m.countries.map(co => pageFor(co)).join(', ')}.`,
    ],
    keywords: [], url: pageFor(m.countries[0]), size: 'S',
    doneWhen: 'Data appears for this market on a later pull.',
    score: 0,
  }]
}

/** The best `n` for a market, strongest first. */
/**
 * The top `n` FINDINGS for a market, not the top n tasks. A finding that split
 * into a copy task and a build task counts once and travels as a pair -- trim
 * by task and you can keep a page build whose copy was cut, which is a task
 * nobody can start.
 */
export function pick(tasks: PlanTask[], n = 3): PlanTask[] {
  const groups = new Map<string, PlanTask[]>()
  for (const t of tasks) {
    const k = t.group ?? t.id
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  return [...groups.values()]
    .sort((a, b) => Math.max(...b.map(t => t.score)) - Math.max(...a.map(t => t.score)))
    .slice(0, n)
    .flatMap(g => [...g].sort((a, b) => b.score - a.score))
}

/** The whole plan: every market, top few each. */
export function buildPlan(input: PlanInput, perMarket = 3): PlanTask[] {
  // WORKED OUT ONCE, ACROSS EVERYTHING. A search two markets compete for is
  // invisible to a per-country pass, because each country sees only its own
  // rows.
  //
  // COMPETITION MEANS THE SAME COUNTRY'S RESULTS. The first version grouped by
  // market and raised a task whenever pages in different markets ranked for one
  // phrase. The owner stopped it on the first one he read: Indonesia #9 in
  // Indonesia, the Philippines #23 in the Philippines, Dubai #24 in the UAE is
  // three pages each serving their own searchers, and the task was telling the
  // pages specialist to dismantle it. The country was in the data all along.
  //
  // OUR OWN NAME IS NOT A SEARCH TO FIGHT OVER. The rewrite dropped the brand
  // filter the old version had, and the first run produced eight findings, all
  // of them "moving walls", "moving walls india", "moving walls sdn bhd".
  // Several of our pages ranking for our own company name is what is supposed
  // to happen (14 Oct 2026).
  const geo = input.rows
    .filter(r => !isBrand(r.query))
    .map(r => ({
      query: r.query, page: r.page, country: String(r.country || ''),
      position: r.position, impressions: weigh(r),
    }))
  const found = clashes(geo).slice(0, 8)
  // Only the phrases actually being consolidated are held back from the link
  // tasks; everything else stays available to push.
  const contested = new Set(found.map(c => c.q))
  const withContested: PlanInput = { ...input, contested }

  const perMarketTasks = input.markets.flatMap(m => pick(tasksFor(m, withContested), perMarket))

  // Owned by whoever owns the markup: this is a decision about which page is
  // about what, not a writing job.
  const builder = withSpecialists(input.specialists).pages
  const marketOfUrl = (url: string) => {
    const m = url.match(/^\/locations\/([^/?#]+)/)
    if (!m) return null
    return input.markets.find(mk => mk.countries.some(c => c.key === m[1])) ?? null
  }
  const cross: PlanTask[] = found.map((c: Clash) => {
    const home = marketOfUrl(c.owner)
    return {
      cycle: input.cycle, market: home?.key ?? '', marketLabel: home?.label ?? '',
      country: '', countryLabel: '', owner: builder ?? home?.owner ?? null,
      group: null, blockedBy: null, lead: home?.lead ?? null, theme: null, holds: [],
      id: `clash-${slug(c.country)}-${slug(c.q)}`, kind: 'cannibal' as const,
      title: clashTitle(c),
      why: clashWhy(c),
      steps: clashSteps(c),
      keywords: c.pages.map(pg => ({ q: c.q, pos: pg.pos, vol: pg.impressions, visits: 0, url: pg.url })),
      url: c.owner, size: 'S' as const,
      doneWhen: `One page answers "${c.q}" in ${countryName(c.country)}; the others are not shown there.`,
      score: c.impressions * 0.05,
    }
  })

  // The theme is stamped here, once, from the kind. A task cannot be created
  // outside the chain and a theme cannot claim work that does not exist.
  return [...perMarketTasks, ...cross]
    .map(t => ({ ...t, theme: t.theme ?? themeOf(t.kind) }))
}

/** How much work each person is holding, so nobody is quietly given nine tasks. */
export function loadByOwner(tasks: PlanTask[]) {
  const weight = { S: 1, M: 2, L: 3 } as const
  const by = new Map<string, { owner: string; tasks: number; weight: number; markets: Set<string> }>()
  for (const t of tasks) {
    if (t.kind === 'blind') continue
    const key = t.owner ?? 'Unassigned'
    const at = by.get(key) ?? { owner: key, tasks: 0, weight: 0, markets: new Set<string>() }
    at.tasks++
    at.weight += weight[t.size]
    at.markets.add(t.marketLabel)
    by.set(key, at)
  }
  return [...by.values()].map(x => ({ ...x, markets: [...x.markets] })).sort((a, b) => b.weight - a.weight)
}

export { marketOfCountry }
