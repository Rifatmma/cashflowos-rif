import 'server-only'
// 👉 Everything one market lead owns, in one object.
//
// The plan was a single page carrying every market: 32,000 pixels, 274
// buttons, 59 accordions. Filtering to the India lead still left her 16 city
// cards and 22 page changes belonging to other people, because two of the
// three work sections ignored the filter entirely.
//
//   "I want each market lead to be in charge of whatever is going on in the
//    market as a top level... the city pages section should be filtered by who
//    runs the market not just showing everything"      (owner, 12 Oct 2026)
//
// So the market becomes the top-level object and /mw/plan becomes an index.
// Nobody loads 36 screens, because nobody loads everything.
//
// ONE PLACE DECIDES WHAT BELONGS TO A MARKET. Tasks carry a market key, city
// pages carry a country slug, and page proposals carry only a URL — three
// different shapes that all have to resolve to the same ten buckets. Doing
// that in each component is how a card ends up on two leads' pages or none.

import { MARKETS, type Market } from './mw-markets'
import { getActions, type ActionRow } from './mw-actions'
import { cityRows, type CityRow } from './mw-board'
import { openProposals, proposalUrl, spendOf, clicksOf, bestPos, type ProposalRow } from './mw-proposals'
import { stageOfAction, stageOfCity, stageOfProposal, rollup, type Stage, type Rollup } from './mw-status'

/** Country slug -> market key, built once from the market definitions. */
const MARKET_OF_COUNTRY = new Map<string, string>()
for (const m of MARKETS) for (const c of m.countries) MARKET_OF_COUNTRY.set(c.key, m.key)

/** '/locations/india/mumbai' or 'https://…/locations/india' -> 'india'. */
export function marketOfUrl(url: string): string | null {
  const m = url.replace(/^https?:\/\/[^/]+/, '').match(/^\/locations\/([^/?#]+)/)
  return m ? MARKET_OF_COUNTRY.get(m[1]) ?? null : null
}

export type MarketTask = {
  id: string
  kind: 'ads' | 'seo' | 'content' | 'page'
  title: string
  why: string
  stage: Stage
  size: string | null
  url: string | null
  /** A rendered proposal for this page, when one exists. */
  render?: string | null
  row: ActionRow
}

export type MarketView = {
  market: Market
  /** The paid-search board is cross-market and belongs to one person. */
  isCrossMarket: boolean
  tasks: MarketTask[]
  cities: CityRow[]
  proposals: { slug: string; url: string; href: string | null; items: ProposalRow[] }[]
  stages: Stage[]
  roll: Rollup
  /** Paid money a month riding on this market's open problems. */
  atRisk: number
}

/**
 * Money a month riding on what is still open, counting each SEARCH once.
 *
 * Summing spendOf() across changes double counts badly: one keyword is
 * evidence on several changes to the same page, so "billboard price malaysia"
 * is cited by both the title rewrite and the pricing section. The naive sum
 * put SEA at S$265.31 when the real figure is S$137.05 — a headline number
 * nearly twice the truth, which is worse than no headline number (12 Oct 2026).
 *
 * City findings are folded in the same way: a misrouted city and a page
 * proposal can cite the same term, and it is still one pot of money.
 */
export function atRiskOf(
  cities: { status: string; cost: number | string; terms: unknown; kind: string }[],
  proposals: { status: string; evidence: any }[],
): number {
  const per = new Map<string, number>()
  for (const p of proposals) {
    if (p.status !== 'open') continue
    for (const t of (p.evidence?.paid ?? [])) {
      const term = String(t?.term ?? '').toLowerCase().trim()
      const cost = Number(t?.cost) || 0
      if (!term) continue
      per.set(term, Math.max(per.get(term) ?? 0, cost))
    }
  }
  // A misrouted city's cost is already a sum over its own terms, and those
  // terms are named on the row. Keyed the same way so an overlap collapses.
  let cityOnly = 0
  for (const c of cities) {
    if (c.status === 'done' || c.kind !== 'misrouted') continue
    const named = (Array.isArray(c.terms) ? c.terms : []).map(x => String(x).toLowerCase().trim())
    const alreadyCounted = named.some(t => per.has(t))
    if (!alreadyCounted) cityOnly += Number(c.cost) || 0
  }
  return Math.round(([...per.values()].reduce((a, b) => a + b, 0) + cityOnly) * 100) / 100
}

const KIND_OF: Record<string, MarketTask['kind']> = {
  strike: 'seo', health: 'seo', 'no-clicks': 'seo', cannibal: 'seo', orphan: 'seo',
  gap: 'content', 'no-page': 'content', city: 'content',
  'page-build': 'page', 'city-build': 'page',
}

/**
 * Build every market's view in one pass.
 *
 * One pass, not one query per market: the index needs all ten and a market
 * page needs one, and reading the same three tables ten times over to build a
 * list of ten rows is the kind of thing that is fine until it is not.
 */
export async function marketViews(): Promise<MarketView[]> {
  const [actions, paid, cities, props] = await Promise.all([
    getActions('seo'), getActions('paid'), cityRows(), openProposals(),
  ])

  const renderFor = new Map<string, string | null>()
  const propsByMarket = new Map<string, ProposalRow[]>()
  for (const p of props) {
    const mk = marketOfUrl(p.url)
    if (!mk) continue
    propsByMarket.set(mk, [...(propsByMarket.get(mk) ?? []), p])
  }
  // One signed URL per page, not per change.
  await Promise.all([...new Set(props.map(p => p.html_path).filter(Boolean))].map(async path => {
    renderFor.set(path as string, await proposalUrl(path as string))
  }))

  const views: MarketView[] = []

  for (const m of MARKETS) {
    const mine = actions.filter(r => r.market === m.key && r.source === 'generated')
    const myCities = cities.filter(c => MARKET_OF_COUNTRY.get(c.market) === m.key || c.market === m.key)
    const myProps = propsByMarket.get(m.key) ?? []

    const byPage = new Map<string, ProposalRow[]>()
    for (const p of myProps) byPage.set(p.slug, [...(byPage.get(p.slug) ?? []), p])

    const tasks: MarketTask[] = mine.map(r => {
      const how: any = r.how ?? {}
      const url = how.url ? String(how.url).replace(/\/$/, '') : null
      const page = url ? myProps.find(p => p.url.replace(/\/$/, '').endsWith(url)) : null
      return {
        id: r.id, kind: KIND_OF[String(how.kind ?? '')] ?? 'seo',
        title: r.title ?? '', why: r.sub ?? how.why ?? '',
        stage: stageOfAction(r.status, r.decision?.choice),
        size: r.size ?? null, url,
        // Only for work ON an existing page: a "write the X page" task handed a
        // render of a different page tells the writer to edit what they were
        // asked to create.
        render: ['strike', 'health', 'no-clicks', 'cannibal'].includes(String(how.kind ?? '')) && page
          ? renderFor.get(page.html_path ?? '') ?? null : null,
        row: r,
      }
    })

    const stages = [
      ...tasks.map(t => t.stage),
      ...myCities.map(c => stageOfCity(c.status)),
      ...myProps.map(p => stageOfProposal(p.status)),
    ]

    views.push({
      market: m, isCrossMarket: false, tasks, cities: myCities,
      proposals: [...byPage.entries()].map(([slug, items]) => ({
        slug, url: items[0].url,
        href: renderFor.get(items[0].html_path ?? '') ?? null,
        items,
      })),
      stages, roll: rollup(stages),
      atRisk: atRiskOf(myCities, myProps),
    })
  }

  // The paid-search board: one owner, every market. Presented as an eleventh
  // row rather than split across ten, because that is how the work is done.
  const crossTasks: MarketTask[] = paid.filter(r => r.owner).map(r => ({
    id: r.id, kind: 'ads' as const, title: r.title ?? '', why: r.sub ?? '',
    stage: stageOfAction(r.status, r.decision?.choice),
    size: r.size ?? null, url: (r.how as any)?.url ?? null, render: null, row: r,
  }))
  if (crossTasks.length) {
    const misrouted = cities.filter(c => c.kind === 'misrouted' && c.status !== 'done')
    const stages = crossTasks.map(t => t.stage)
    views.unshift({
      market: {
        key: 'paid', label: 'Paid ads',
        owner: [...new Set(paid.map(r => r.owner).filter(Boolean))].join(', ') || null,
        lead: null, countries: [],
      },
      isCrossMarket: true, tasks: crossTasks, cities: [], proposals: [],
      stages, roll: rollup(stages),
      atRisk: misrouted.reduce((s, c) => s + Number(c.cost), 0),
    })
  }

  return views
}

export async function marketView(key: string): Promise<MarketView | null> {
  return (await marketViews()).find(v => v.market.key === key) ?? null
}

export { spendOf, clicksOf, bestPos }
