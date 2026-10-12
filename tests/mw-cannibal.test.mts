// One search, several of our pages, in different markets.
//   npx -y tsx --conditions=react-server tests/mw-cannibal.test.mts
//
// The per-country pass could not see this, and the internal-link task fell
// straight into it: /blog/ooh-advertising-masterclass-7-billboard-campaigns
// was offered to UAE, the Philippines and Australia for the same anchor text,
// because all three rank 23-29 for "billboard advertising". Three leads would
// have added three links pointing three ways (13 Oct 2026).

import { buildPlan, contestedTerms, type PlanInput, type MarketRow } from '../lib/mw-plan'
import { MARKETS } from '../lib/mw-markets'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const marketOf = (url: string): string | null => {
  const m = url.match(/^\/locations\/([^/?#]+)/)
  if (!m) return null
  for (const mk of MARKETS) if (mk.countries.some(c => c.key === m[1])) return mk.key
  return null
}
const base: PlanInput = { cycle: '2026-10', markets: MARKETS, ga4: [], rows: [], pages: [] }
const ranked = (o: Record<string, { q: string; pos: number; vol: number }[]>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map(x => ({ ...x, visits: 0 }))]))

// ── the real case ──────────────────────────────────────────────────────────
const real = ranked({
  '/locations/uae/dubai': [{ q: 'billboard advertising', pos: 23, vol: 720 }],
  '/locations/philippines': [{ q: 'billboard advertising', pos: 26, vol: 720 }],
  '/locations/australia': [{ q: 'billboard advertising', pos: 29, vol: 720 }],
})
{
  const c = contestedTerms({ ...base, ranked: real }, marketOf)
  is(c.size === 1, 'three pages in three markets on one search is one finding, not three')
  const t = c.get('billboard advertising')!
  is(t.pages.length === 3, 'all three pages are named')
  is(t.owner === '/locations/uae/dubai', 'and the best-placed one is proposed as the owner')
  is(t.pages[0].pos === 23 && t.pages[2].pos === 29, 'sorted by position, best first')
}

// ── what must NOT trigger it ───────────────────────────────────────────────
{
  const c = contestedTerms({ ...base, ranked: ranked({
    '/locations/india': [{ q: 'ooh advertising india', pos: 12, vol: 500 }],
    '/locations/india/mumbai': [{ q: 'ooh advertising india', pos: 19, vol: 500 }],
  }) }, marketOf)
  is(c.size === 0, 'two pages inside ONE market is the per-country task\'s job, not this one')
}
{
  const c = contestedTerms({ ...base, ranked: ranked({
    '/locations/india': [{ q: 'billboard advertising', pos: 12, vol: 720 }],
    '/locations/australia': [{ q: 'billboard advertising', pos: 44, vol: 720 }],
  }) }, marketOf)
  is(c.size === 0, 'a page outside the top thirty is not competing, it is absent')
}
{
  const c = contestedTerms({ ...base, ranked: ranked({
    '/locations/india': [{ q: 'tiny search', pos: 4, vol: 10 }],
    '/locations/australia': [{ q: 'tiny search', pos: 9, vol: 10 }],
  }) }, marketOf)
  is(c.size === 0, 'ten searches a month is not worth two leads coordinating over')
}
{
  const c = contestedTerms({ ...base, ranked: ranked({
    '/locations/india': [{ q: 'moving walls india private limited', pos: 4, vol: 590 }],
    '/locations/australia': [{ q: 'moving walls india private limited', pos: 9, vol: 590 }],
  }) }, marketOf)
  is(c.size === 0, 'our own name is not a search to fight over')
}

// ── and the collision it exists to prevent ─────────────────────────────────
{
  const posts = [{
    url: '/blog/billboard-masterclass', title: 'Billboard advertising masterclass', words: 1200,
    text: 'Billboard advertising works across the UAE, the Philippines and Australia.', links: [], impressions: 400,
  }]
  const rows: MarketRow[] = Object.entries(real).flatMap(([url, ks]) => ks.map(k => ({
    query: k.q, page: url, country: '', volume: k.vol, visits: 0, ctr: 0, position: k.pos,
  })))
  const tasks = buildPlan({ ...base, rows, ranked: real, posts, pages: Object.keys(real) }, 30)

  const links = tasks.filter(t => t.kind === 'links')
  is(!links.some(t => t.steps.join(' ').includes('billboard advertising')),
     'no market is told to add links for a search three markets are competing for')

  const cross = tasks.filter(t => t.id.startsWith('xm-cannibal'))
  is(cross.length === 1, 'it is raised once instead')
  const steps = cross[0].steps.join(' ')
  is(/\/locations\/uae\/dubai/.test(cross[0].title) === false && /3 markets are competing/.test(cross[0].title),
     'titled by the problem, not by one of the pages')
  is(/Tell .* before changing their pages/.test(steps),
     'and it says to tell the other leads first — their markets, their pages')
  is(/until the decision is made/.test(steps),
     'and explains why nobody has it as a linking task')
  is(cross[0].owner !== null, 'somebody owns the decision')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
