// 👉 /mw/seo in one look: is each part of SEO working, and if not, how badly.
//
//   "can you give me a clear cut summary with visual presentation so I can
//    directly see in one go without reading too much words"  (owner, 20 Oct 2026)
//
// Six signals, each a number, a colour and three or four words. Every
// threshold is written here, in one place, so a red can always be explained.
// Pure: market data in, signals out.

import type { MarketSeo } from './mw-market-data'

export type Tone = 'good' | 'warn' | 'bad'
export type Signal = { key: string; label: string; value: string; note: string; tone: Tone; /** 0–1, for the bar. */ fill: number; href: string }

const pct = (n: number) => `${Math.round(n)}%`

export function glanceOf(markets: MarketSeo[]): Signal[] {
  const live = markets.filter(m => m.keywords.length || m.sessions)

  // Non-brand share of organic clicks, across every market.
  const nb = live.reduce((t, m) => t + m.nonBrandTraffic, 0)
  const br = live.reduce((t, m) => t + m.brandTraffic, 0)
  const nbShare = nb + br ? (nb / (nb + br)) * 100 : 0

  // Near misses: non-brand searches at 4–20 with real impressions.
  const near = live.flatMap(m => m.opportunities).filter(k => k.pos >= 4 && k.pos <= 20)

  // Funnel: markets with traffic worth judging and under half the site's rate.
  const judged = live.filter(m => m.sessions >= 25)
  const leaking = judged.filter(m => (m.leads / m.sessions) * 100 < 0.86)

  // Page standards: location pages graded bad.
  const pages = live.flatMap(m => m.health)
  const badPages = pages.filter(p => p.band === 'bad').length
  const warnPages = pages.filter(p => p.band === 'warn').length

  // Slips: page-one rankings that fell since the last pull.
  const slips = live.flatMap(m => m.movers.down).filter(k => k.prev > 0 && k.prev <= 10 && k.pos > k.prev)

  // Blind spots: markets with no monthly volume or no named rivals.
  const noVol = live.filter(m => !m.keywords.some(k => k.vol > 0)).length
  const noRivals = live.filter(m => !m.competitors.length).length
  const blind = Math.max(noVol, noRivals)

  return [
    {
      key: 'nonbrand', label: 'Non-brand', value: pct(nbShare),
      note: nbShare >= 40 ? 'healthy mix' : nbShare >= 15 ? 'mostly brand' : 'almost all brand',
      tone: nbShare >= 40 ? 'good' : nbShare >= 15 ? 'warn' : 'bad', fill: Math.min(1, nbShare / 100), href: '#brand',
    },
    {
      key: 'leaks', label: 'Leaking', value: `${leaking.length} of ${judged.length}`,
      note: leaking.length ? 'visits, no enquiries' : 'all converting',
      tone: leaking.length >= 3 ? 'bad' : leaking.length ? 'warn' : 'good', fill: judged.length ? leaking.length / judged.length : 0, href: '#leaks',
    },
    {
      key: 'near', label: 'Near misses', value: String(near.length),
      note: 'ranking 4–20', tone: near.length ? 'warn' : 'good', fill: Math.min(1, near.length / 40), href: '#opp',
    },
    {
      key: 'slips', label: 'Slips', value: String(slips.length),
      note: slips.length ? 'page-one rankings fell' : 'none this month',
      tone: slips.length >= 3 ? 'bad' : slips.length ? 'warn' : 'good', fill: Math.min(1, slips.length / 10), href: '#move',
    },
    {
      key: 'pages', label: 'Weak pages', value: `${badPages + warnPages} of ${pages.length}`,
      note: badPages ? `${badPages} failing` : 'none failing',
      tone: badPages ? 'bad' : warnPages ? 'warn' : 'good', fill: pages.length ? (badPages + warnPages) / pages.length : 0, href: '#health',
    },
    {
      key: 'blind', label: 'Blind spots', value: `${blind} of ${live.length}`,
      note: noVol >= noRivals ? 'no search volume' : 'no rivals named',
      tone: blind >= live.length / 2 ? 'bad' : blind ? 'warn' : 'good', fill: live.length ? blind / live.length : 0, href: '#planner',
    },
  ]
}
