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
import { effortOf, type GapCluster } from './mw-gap'

// ---------------------------------------------------------------- the inputs
/** One Search Console row: query x page x country, last 28 days. */
/**
 * One ranking row for one country.
 *
 * The numbers come from Semrush, not Search Console, and the names say so.
 * `volume` is how many people search that phrase in that country each month --
 * total market demand, not how often we were shown. `visits` is Semrush's
 * estimate of what our position earns us from it. Calling these "impressions"
 * and "clicks" would be the same shape and a different fact, and the team
 * would end up quoting them at clients (owner, 29 Sep 2026).
 */
export type MarketRow = {
  query: string; page: string; country: string
  visits: number; volume: number; ctr: number; position: number
  /** Semrush keyword difficulty, 0-100. Higher means more work to move. */
  kd?: number
  /** Position at the previous pull, 0 when it is new. */
  prev?: number
}

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
  | 'orphan' | 'health' | 'convert' | 'cannibal' | 'gap' | 'blind'
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
  Math.max(0, r.volume * (ctrAt(3) - Math.max(r.ctr, ctrAt(r.position))))

const slug = (s: string) =>
  String(s || '').toLowerCase().replace(/^https?:\/\/[^/]+/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'site'
const pathOf = (url: string) => String(url || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0].replace(/\/$/, '') || '/'
// Numbers land in sentences a person reads aloud, so 12198 is written 12,198.
const round = (n: number) => Math.round(n).toLocaleString('en-US')
const list = (ks: PlanKeyword[], n = 6) =>
  ks.slice(0, n).map(k => `"${k.q}" (#${k.pos.toFixed(0)}, ${round(k.vol)} searches a month)`).join(', ')

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
    const impr = rows.reduce((t, r) => t + r.volume, 0)
    const sessions = ga4?.sessions ?? 0
    if (impr >= 50 || sessions >= 25) {
      const top = [...rows].sort((a, b) => b.volume - a.volume).slice(0, 8)
        .map(r => ({ q: r.query, pos: r.position, vol: r.volume, visits: r.visits, kd: r.kd, prev: r.prev }))
      const why = impr >= 50
        ? `${co.label} runs ${round(impr)} searches a month that we already show up for, and there is no ${co.label} page — Google is sending them to whatever page it can find.`
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
  const holdsOn = (onPage: string, exclude: Iterable<string> = []): PlanKeyword[] => {
    const skip = new Set([...exclude].map(q => q.toLowerCase()))
    return earned
    .filter(r => pathOf(r.page) === onPage && r.position >= 1 && r.position <= 10 && !skip.has(r.query.toLowerCase()))
    .sort((a, b) => b.visits - a.visits || b.volume - a.volume)
    .slice(0, 8)
    .map(r => ({ q: r.query, pos: r.position, vol: r.volume, visits: r.visits, kd: r.kd, prev: r.prev }))
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
    out.push({
      ...base, id: `mkt-${co.key}-gap-${slug(g.head)}`, kind: 'gap', holds: defend,
      title: `Write the ${co.label} page for “${g.head}”`,
      why: `${rivals} rank for ${g.keywords.length === 1 ? 'this search' : `these ${g.keywords.length} searches`}, worth ${round(g.vol)} a month in ${co.label}, and ${g.keywords.length === 1 ? 'we do not rank for it at all' : 'we rank for none of them'} — ${e.says}.${g.cpc > 0 ? ` Buying that traffic costs $${g.cpc.toFixed(2)} a click.` : ''}`,
      steps: [
        `Write ONE page answering all of these, not a page per search — they are the same question asked different ways: ${g.keywords.slice(0, 8).map(k => `"${k.q}" (${round(k.vol)}/mo)`).join(', ')}.`,
        `Lead with "${g.head}" in the title and the H1; give each of the others its own H2.`,
        `Read how ${g.rivals[0] ?? 'the competitor'} answers it, then answer it better with something they cannot copy — our inventory, our measurement, a named local campaign.`,
        `Link it from ${page} and from the related blog posts, and tell ${builder} to build it once the copy is ready.`,
        defend.length
          ? `While you are in there: ${page} already ranks top ten for ${list(defend, 6)}. Do not lose those — this is a new page, so link to it rather than moving that content onto it.`
          : 'This is new ground, so nothing on the site is at risk from writing it.',
      ],
      keywords: g.keywords.slice(0, 8).map(k => ({ q: k.q, pos: 0, vol: k.vol, visits: 0, kd: k.kd })),
      url: page, size: e.size,
      doneWhen: `A page answering “${g.head}” is live and linked, and its positions are checked in eight weeks.`,
      score: g.vol * 0.02,
    })
  }

  if (!rows.length) return out

  // Queries naming a city with no page of its own belong to that city's task,
  // not to the country page as well — otherwise the same keyword is handed to
  // two people.
  const citiesWanted = co.cities.filter(city =>
    !has(cityPageFor(co, city)) &&
    earned.some(r => r.query.toLowerCase().includes(city.toLowerCase()) && r.volume >= MIN_VOL))
  const claimedByCity = (q: string) => citiesWanted.some(city => q.toLowerCase().includes(city.toLowerCase()))

  // ── striking distance, grouped by the page Google already shows ─────────
  const near = earned.filter(r =>
    r.position >= STRIKE_FROM && r.position <= STRIKE_TO && r.volume >= MIN_VOL && !claimedByCity(r.query))
  const byPage = new Map<string, GscRow[]>()
  for (const r of near) byPage.set(pathOf(r.page), [...(byPage.get(pathOf(r.page)) ?? []), r])

  for (const [onPage, group] of byPage) {
    const kws = [...group].sort((a, b) => upside(b) - upside(a))
      .map(r => ({ q: r.query, pos: r.position, vol: r.volume, visits: r.visits, kd: r.kd, prev: r.prev }))
    const gain = group.reduce((t, r) => t + upside(r), 0)
    // One small keyword is not a project. Either several searches point at the
    // page, or the single one that does is big enough to matter on its own.
    const groupVol = group.reduce((t, r) => t + r.volume, 0)
    if (group.length < 2 && groupVol < 200) continue
    if (gain < 3) continue
    const holds = holdsOn(onPage, kws.map(k => k.q))
    out.push({
      ...base, holds, id: `mkt-${co.key}-strike-${slug(onPage)}`, kind: 'strike',
      title: `Push ${onPage} onto page one for ${kws.length} ${co.label} ${kws.length === 1 ? 'search' : 'searches'}`,
      why: `${kws.length} ${co.label} ${kws.length === 1 ? 'search ranks' : 'searches rank'} between #${Math.min(...kws.map(k => k.pos)).toFixed(0)} and #${Math.max(...kws.map(k => k.pos)).toFixed(0)} on ${onPage}. They are searched ${round(group.reduce((t, r) => t + r.volume, 0))} times a month between them and bring us about ${round(group.reduce((t, r) => t + r.visits, 0))} visits — on the board, off the first screen. Reaching the top three is worth roughly ${round(gain)} more visits a month.`,
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
          ? `DO NOT LOSE WHAT THIS PAGE ALREADY WINS. It ranks in the top ten for ${list(holds, 8)}. Keep the wording that earns those — the existing H1, the headings and the paragraphs that answer them — and add the new sections around them rather than rewriting over the top. If the title has to change, keep the phrase from the best of them in it.`
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
    at.vol += r.volume; at.visits += r.visits; at.pos += r.position; at.n++
    totals.set(p, at)
  }
  for (const [onPage, t] of totals) {
    const ctr = t.vol > 0 ? t.visits / t.vol : 0
    const avgPos = t.n ? t.pos / t.n : 99
    if (t.vol < 400 || ctr >= 0.01 || avgPos > 20) continue
    const kws = earned.filter(r => pathOf(r.page) === onPage).sort((a, b) => b.volume - a.volume).slice(0, 6)
      .map(r => ({ q: r.query, pos: r.position, vol: r.volume, visits: r.visits, kd: r.kd, prev: r.prev }))
    const ctrHolds = holdsOn(onPage, kws.map(k => k.q))
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
          ? [`Keep the wording that already wins: this page also ranks top ten for ${list(ctrHolds, 6)}. A new title that drops those phrases can cost more than the clicks it buys.`]
          : []),
      ],
      keywords: kws, url: onPage, size: 'S',
      doneWhen: 'Title and description are live; compare clicks on this page in four weeks.',
      score: t.vol * Math.max(0, ctrAt(avgPos) - ctr),
    })
  }

  // ── a city people search for, with nowhere to send them ─────────────────
  for (const city of citiesWanted) {
    const hits = earned.filter(r => r.query.toLowerCase().includes(city.toLowerCase()) && r.volume >= MIN_VOL)
    const kws = [...hits].sort((a, b) => b.volume - a.volume).slice(0, 6)
      .map(r => ({ q: r.query, pos: r.position, vol: r.volume, visits: r.visits, kd: r.kd, prev: r.prev }))
    const url = cityPageFor(co, city)
    const cwhy = `${city} ${hits.length === 1 ? 'is searched for' : 'searches are run'} ${round(hits.reduce((t, r) => t + r.volume, 0))} times a month across ${hits.length} ${hits.length === 1 ? 'phrase' : 'phrases'}, and we have no ${city} page — the best we manage is #${Math.min(...hits.map(h => h.position)).toFixed(0)} on a general page.`
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
      const kws = earned.filter(r => pathOf(r.page) === onPage).sort((a, b) => b.volume - a.volume).slice(0, 4)
        .map(r => ({ q: r.query, pos: r.position, vol: r.volume, visits: r.visits, kd: r.kd, prev: r.prev }))
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
  const perQuery = new Map<string, MarketRow[]>()
  for (const r of rows) {
    const q = r.query.toLowerCase()
    perQuery.set(q, [...(perQuery.get(q) ?? []), r])
  }
  for (const [q, hits] of perQuery) {
    const pages = [...new Set(hits.map(h => pathOf(h.page)))]
    if (pages.length < 3) continue
    const vol = Math.max(...hits.map(h => h.volume))
    if (vol < MIN_VOL) continue
    const best = [...hits].sort((a, b) => a.position - b.position)[0]
    const bestPage = pathOf(best.page)
    out.push({
      ...base, owner: builder, id: `mkt-${co.key}-cannibal-${slug(q)}`, kind: 'cannibal',
      title: `Pick one page to own “${q}” — ${pages.length} of ours are competing`,
      why: `“${q}” is searched ${round(vol)} times a month in ${co.label}, and ${pages.length} different pages of ours turn up for it, the best at #${best.position.toFixed(0)}. Google is choosing between them rather than ranking one properly, so the signal we have earned is being split ${pages.length} ways.`,
      steps: [
        `Decide which page should own this search. On the evidence it is ${bestPage}, which already ranks highest.`,
        `Make that page unambiguously about it: the phrase in the title, the H1 and the opening paragraph.`,
        `On the other ${pages.length - 1} page${pages.length === 2 ? '' : 's'}, remove the phrase from titles and headings and link to ${bestPage} using it as the anchor text instead. The pages to change: ${pages.filter(x => x !== bestPage).slice(0, 8).join(', ')}.`,
        `Check none of them carries a canonical pointing anywhere unexpected.`,
        'Re-check the position in four weeks — consolidation usually shows within two.',
      ],
      keywords: [...hits].sort((a, b) => a.position - b.position).slice(0, 8)
        .map(h => ({ q: h.query, pos: h.position, vol: h.volume, visits: h.visits, kd: h.kd, prev: h.prev, url: pathOf(h.page) })),
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
  // The theme is stamped here, once, from the kind. A task cannot be created
  // outside the chain and a theme cannot claim work that does not exist.
  return input.markets
    .flatMap(m => pick(tasksFor(m, input), perMarket))
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
