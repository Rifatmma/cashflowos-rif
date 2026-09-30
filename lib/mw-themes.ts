// 👉 The chain: an SEO action on top, the market tasks that deliver it below.
//
// Rif's words: "SEO action will sit on top of the chain and branch out to the
// market plan... based on your analysis Rukshana, Sumaiya, and other market
// lead have how many actions to take until this task is closed."
//
// So a theme is not another task. It is the STRATEGY — why this matters, what
// the evidence says, and which markets have to move — and it closes itself
// when the work underneath is finished. Nothing here is hand-maintained: the
// children are found by matching a generated task's kind, so a task can never
// exist outside the chain and a theme can never claim work that isn't there.
//
// Pure module: no server imports, so the rollup is testable.

export type TaskKind =
  | 'strike' | 'no-page' | 'page-build' | 'no-clicks' | 'city' | 'city-build'
  | 'orphan' | 'health' | 'gap' | 'convert' | 'cannibal' | 'blind'

export type Theme = {
  key: string
  title: string
  /** The strategy, in the manager's voice. Why this is the lever. */
  why: string
  /** What closing it buys us. */
  outcome: string
  /** Task kinds that roll up here. */
  kinds: TaskKind[]
  doneWhen: string
  sort: number
}

export const THEMES: Theme[] = [
  {
    key: 'coverage',
    title: 'Close the country coverage gap',
    why: 'People in these countries are already searching for us and finding no page of ours to land on — so Google sends them to a generic page, or to a competitor. This is the cheapest traffic on the list: the demand exists and is measured, only the page is missing. A country page is two jobs, and both are in the plan: the market lead writes what is true in that country, then the page is built with its meta tags, schema and links.',
    outcome: 'Every country with real search demand has its own page at /locations/<country>, written by the person who knows that market.',
    kinds: ['no-page', 'page-build'],
    doneWhen: 'Every country page in this cycle is live, linked from /locations and submitted in Search Console.',
    sort: 1,
  },
  {
    key: 'depth',
    title: 'Close the keyword coverage gap',
    why: 'Our authority is already the strongest in the set — the expensive half of SEO is done. What we lack is pages. Competitors rank for several times the keywords we do, not because they are better linked but because they have written more. Every keyword below is one we already rank for somewhere between 4th and 20th: we are on the board and not on the first screen. Depth on the page we already have moves those without a single new backlink.',
    outcome: 'The searches we nearly rank for are answered properly on the page Google already shows, and move into the top five.',
    kinds: ['strike', 'gap'],
    doneWhen: 'Every page in this cycle has been rewritten to answer its named searches, and positions are re-checked in four weeks.',
    sort: 2,
  },
  {
    key: 'clicks',
    title: 'Turn the rankings we already have into clicks',
    why: 'These pages rank well enough to be seen thousands of times and are barely clicked. That is not a ranking problem and no amount of new content fixes it — the listing is doing the losing. A title and a meta description are an hour of work and the cheapest win on this board.',
    outcome: 'Pages with high impressions and almost no clicks earn a normal click-through rate for their position.',
    kinds: ['no-clicks'],
    doneWhen: 'Every title and description in this cycle is rewritten and live, and clicks are compared in four weeks.',
    sort: 3,
  },
  {
    key: 'cities',
    title: 'Own the cities we actually sell in',
    why: 'City searches convert better than country searches because the buyer has already decided where they want to advertise. India proves it — the city pages rank 4th and 5th for the terms the country page cannot reach. Where a city is searched for and has no page, we are handing that buyer to whoever wrote one.',
    outcome: 'Each city with measured demand has its own page, linked from its country page and its siblings.',
    kinds: ['city', 'city-build'],
    doneWhen: 'Every city page in this cycle is live and linked from its country page.',
    sort: 4,
  },
  {
    key: 'health',
    title: 'Bring every live page up to standard',
    why: 'Before adding pages, the ones we have should do their job. This is measured by reading the pages themselves — title length, meta description, a single H1, structured data, canonical, internal links, and enough words to compete. None of it needs new content or new approval, and a truncated title is costing clicks on traffic we have already paid for.',
    outcome: 'Every live location page passes the on-page checks, so new content lands on a site that is technically sound.',
    kinds: ['health'],
    doneWhen: 'Every page flagged this cycle scores above 80 on a re-audit.',
    sort: 5,
  },
  {
    key: 'convert',
    title: 'Make the markets that get traffic produce enquiries',
    why: 'Some markets bring in real sessions and not one enquiry. Traffic that never asks a question is a cost, not an asset, and more of it will not help. The fix is on the page — a contact route that suits that market, proof that we operate there, and a call to action in the buyer’s language — and it belongs to the person who knows the market.',
    outcome: 'Markets with meaningful organic traffic convert at a rate their traffic justifies, instead of zero.',
    kinds: ['convert'],
    doneWhen: 'Every flagged market page has a working contact route and local proof, and leads are re-counted in four weeks.',
    sort: 6,
  },
  {
    key: 'cannibal',
    title: 'Stop our own pages competing with each other',
    why: 'For some searches Google is choosing between a dozen of our own pages instead of ranking one of them strongly. Every page that half-answers a search splits the signal, and the result is that none of them wins. Nothing needs writing here \u2014 it is choosing the page that should own the search, and pointing the rest at it. This is the highest-value hour on the board because the ranking is already earned, just scattered.',
    outcome: 'One page owns each search, and the rest link to it instead of competing with it.',
    kinds: ['cannibal'],
    doneWhen: 'Each flagged search has one canonical page; the others are de-optimised or linked to it, and the position is re-checked in four weeks.',
    sort: 3,
  },
  {
    key: 'links',
    title: 'Connect the content we already paid for',
    why: 'Articles that already earn attention sit with nothing to hand the reader on to. Linking them to the market page they belong with costs nothing, needs no writing, and passes both the reader and the ranking signal somewhere that converts.',
    outcome: 'Every article that earns market traffic links to that market’s page, and is listed on it.',
    kinds: ['orphan'],
    doneWhen: 'Both links are live on every pair in this cycle.',
    sort: 7,
  },
]

export const THEME = Object.fromEntries(THEMES.map(t => [t.key, t])) as Record<string, Theme>

/** Which theme a task rolls up to, from its kind alone. */
export function themeOf(kind: string): string | null {
  return THEMES.find(t => t.kinds.includes(kind as TaskKind))?.key ?? null
}

// ------------------------------------------------------------------ rollup
export type ThemeChild = {
  id: string
  title: string
  market: string
  marketLabel: string
  owner: string | null
  /** 'done' | 'accept' | 'reject' | null */
  choice: string | null
  status: string
  declineReason?: string | null
}

export type OwnerLoad = { owner: string; total: number; done: number; open: number; declined: number }

export type ThemeRoll = {
  theme: Theme
  children: ThemeChild[]
  markets: string[]
  owners: OwnerLoad[]
  total: number
  done: number
  declined: number
  unanswered: number
  /** 0–100, by children finished. */
  pct: number
  /**
   * done    — everything underneath is finished.
   * blocked — somebody declined, so it cannot finish without a decision.
   * open    — still in flight.
   * empty   — no evidence for this theme this cycle.
   */
  state: 'done' | 'blocked' | 'open' | 'empty'
}

const isDone = (c: ThemeChild) => c.choice === 'done' || c.status === 'done'
const isDeclined = (c: ThemeChild) => c.choice === 'reject'

/**
 * Roll the children up into the parent.
 *
 * CLOSING RULE, as he chose: a theme stays open until the work is ACTUALLY
 * done. A "Won't do" does not count as finished — it holds the theme in
 * `blocked` and names who declined and why, so it lands on his desk instead
 * of quietly disappearing (owner, 29 Sep 2026).
 */
export function rollUp(theme: Theme, children: ThemeChild[]): ThemeRoll {
  const done = children.filter(isDone).length
  const declined = children.filter(isDeclined).length
  const unanswered = children.filter(c => !c.choice && !isDone(c)).length

  const byOwner = new Map<string, OwnerLoad>()
  for (const c of children) {
    const k = c.owner ?? 'Unassigned'
    const at = byOwner.get(k) ?? { owner: k, total: 0, done: 0, open: 0, declined: 0 }
    at.total++
    if (isDone(c)) at.done++
    else if (isDeclined(c)) at.declined++
    else at.open++
    byOwner.set(k, at)
  }

  const total = children.length
  const state: ThemeRoll['state'] =
    total === 0 ? 'empty'
      : done === total ? 'done'
        : declined > 0 ? 'blocked'
          : 'open'

  return {
    theme, children, total, done, declined, unanswered,
    markets: [...new Set(children.map(c => c.marketLabel))],
    owners: [...byOwner.values()].sort((a, b) => b.total - a.total),
    pct: total ? Math.round((done / total) * 100) : 0,
    state,
  }
}

/** One line a manager can read without opening anything. */
export function rollSummary(r: ThemeRoll): string {
  if (r.state === 'empty') return 'Nothing to do here this cycle.'
  if (r.state === 'done') return `Closed — all ${r.total} tasks across ${r.markets.length} market${r.markets.length === 1 ? '' : 's'} are done.`
  const who = r.owners.filter(o => o.open > 0)
    .map(o => `${o.owner} ${o.open}`).join(', ')
  const head = `${r.done} of ${r.total} done`
  if (r.state === 'blocked') {
    const no = r.owners.filter(o => o.declined > 0).map(o => o.owner).join(', ')
    return `${head}. Held up: ${no} declined${who ? `, and ${who} still to go` : ''}.`
  }
  return `${head}. Left to do: ${who || 'nothing'}.`
}

export function rollAll(children: ThemeChild[], kindOf: (id: string) => string): ThemeRoll[] {
  return [...THEMES]
    .sort((a, b) => a.sort - b.sort)
    .map(t => rollUp(t, children.filter(c => themeOf(kindOf(c.id)) === t.key)))
}
