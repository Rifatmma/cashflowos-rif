import Link from 'next/link'
import { currentGuest } from '@/lib/guest'
import { getMwData, num } from '@/lib/mw-data'
import { MwHero, Tiles, Section, OrganicTrend } from '../_ui'
import { getActions } from '@/lib/mw-actions'
import { getMarketSeo, withData, type MarketSeo } from '@/lib/mw-market-data'
import { getGaps } from '@/lib/mw-gap-run'
import { worthWriting } from '@/lib/mw-gap'
import { COUNTRIES } from '@/lib/mw-markets'
import { THEMES, themeOf, rollUp, type ThemeChild } from '@/lib/mw-themes'
import { MARKET } from '@/lib/mw-markets'
import {
  MarketTabs, BrandByMarket, OpportunitiesByMarket, CompetitorsByMarket,
  PageHealthBoard, FunnelLeaks, Momentum, WinningByMarket, ThemeChain, GapSummary,
} from './_market-ui'

// 👉 Moving Walls → SEO & organic.
//
// Rebuilt around two things Rif asked for (29 Sep 2026):
//
//  1. THE CHAIN. The SEO action sits on top and branches out to the market
//     plan. Each action explains the strategy, then names every market task
//     under it and who still owes what. It closes when the work is actually
//     done — a decline holds it open and says so, because he wants to see the
//     gap rather than have it quietly disappear.
//
//  2. BY MARKET, EVERYWHERE. The old sections were a single hand-written
//     snapshot of India and Malaysia. Brand split, competitive position and
//     the opportunity list are now tabbed by market and read from Semrush,
//     which covers all ten. "Where paid and organic collide" is gone: he runs
//     the paid side himself and did not want the two mixed. In its place are
//     the page health board, the funnel leaks and momentum.

export const dynamic = 'force-dynamic'

type Q = { brand?: string; opp?: string; comp?: string; move?: string; win?: string }

const pickMarket = (all: MarketSeo[], want?: string) =>
  all.find(m => m.market.key === want) ?? all[0]

export default async function MwSeo({ searchParams }: { searchParams: Promise<Q> }) {
  await currentGuest()
  const q = await searchParams
  const [snap, rows, markets, gaps] = await Promise.all([getMwData(), getActions('seo'), getMarketSeo(), getGaps()])
  const live = withData(markets)

  if (!snap) {
    return <div className="mw-wrap"><MwHero tab="seo" pulled="—" stale={false} headline="SEO & organic" /><p className="lede">No snapshot yet.</p></div>
  }

  const d = snap.data
  const k = d.seo.kpi

  // ── the chain ────────────────────────────────────────────────────────────
  const generated = rows.filter(r => r.source === 'generated' && r.how?.kind !== 'blind')
  const kindById = new Map(generated.map(r => [r.id, String(r.how?.kind ?? '')]))
  const children: ThemeChild[] = generated.map(r => ({
    id: r.id,
    title: r.title,
    market: r.market ?? '',
    marketLabel: MARKET[r.market ?? '']?.label ?? r.market ?? '—',
    owner: r.owner,
    choice: r.decision?.choice ?? null,
    status: r.status,
    declineReason: r.decision?.reason ?? null,
  }))
  const rolls = [...THEMES].sort((a, b) => a.sort - b.sort)
    .map(t => rollUp(t, children.filter(c => themeOf(kindById.get(c.id) ?? '') === t.key)))

  const openThemes = rolls.filter(r => r.state === 'open' || r.state === 'blocked').length
  const blocked = rolls.filter(r => r.state === 'blocked').length

  const brandM = pickMarket(live, q.brand)
  const oppM = pickMarket(live, q.opp)
  const compM = pickMarket(live, q.comp)
  const moveM = pickMarket(live, q.move)
  const winM = pickMarket(live, q.win)

  return (
    <div className="mw-wrap">
      <MwHero tab="seo" pulled={d.meta.pulled} stale={snap.stale}
        headline={`${openThemes} SEO action${openThemes === 1 ? '' : 's'} open across ${live.length} markets`}>
        <p>
          Organic brings <b>{num(k.sessions)} sessions</b> a month at no media cost, and authority {k.authority}{' '}
          with {num(k.refDomains)} referring domains — the expensive half of SEO is already done. What is
          missing is pages, and every action below says which market has to write them.
          {blocked > 0 && <> <b>{blocked} action{blocked === 1 ? ' is' : 's are'} held up by a decline.</b></>}
        </p>
      </MwHero>

      <Tiles items={[
        { k: 'Organic sessions', v: num(k.sessions), d: String(k.dSessions ?? ''), tone: 'up' },
        { k: 'Organic leads', v: String(k.leads), d: String(k.dLeads ?? ''), tone: 'up' },
        { k: 'Share of all leads', v: String(k.shareOfLeads) },
        { k: 'Conv. rate', v: `${k.cvr}%` },
        { k: 'Markets with data', v: `${live.length} of ${markets.length}` },
        { k: 'Authority score', v: String(k.authority), d: `${num(k.refDomains)} ref. domains`, tone: 'up' },
      ]} />

      {/* ── 1. the chain, at the top, because everything else explains it ── */}
      <Section title="SEO actions — what we are doing and who is doing it"
        sub="Each action is the strategy; the tasks under it are the delivery, spread across the market leads. An action closes when its tasks are done, and stays open if somebody declines.">
        <ThemeChain rolls={rolls} />
      </Section>

      <Section title="Organic traffic"
        sub="Sessions per day. Green dots mark days that produced leads — the bigger the dot, the more leads.">
        <OrganicTrend start={d.seo.daily.start} sessions={d.seo.daily.sessions} leads={d.seo.daily.leads} />
      </Section>

      {live.length > 0 && (
        <>
          <Section id="brand" title="Brand versus non-brand, by market"
            sub="Traffic from people typing our name, against everyone else. Only non-brand grows the business — brand searches would have found us anyway.">
            <MarketTabs all={live} active={brandM.market.key} section="brand" />
            <BrandByMarket m={brandM} />
          </Section>

          <Section id="win" title="Where we already win, by market"
            sub="Non-brand searches already in the top ten. This is ground we hold — new content must add to it, not write over it.">
            <MarketTabs all={live} active={winM.market.key} section="win" />
            <WinningByMarket m={winM} />
          </Section>

          <Section id="opp" title="The opportunity list, by market"
            sub="Already ranking, not high enough to earn the click. Moving one of these into the top five is cheaper than bidding on it.">
            <MarketTabs all={live} active={oppM.market.key} section="opp" />
            <OpportunitiesByMarket m={oppM} />
          </Section>

          <Section id="comp" title="Competitive position, by market"
            sub="Who else ranks for the same searches in this market, and how much traffic it earns them.">
            <MarketTabs all={live} active={compM.market.key} section="comp" />
            <CompetitorsByMarket m={compM} />
          </Section>

          <Section title="Content gap — what rivals rank for and we do not"
            sub="Measured against competitors your team names, once a quarter. The full briefs are on the Content gap tab.">
            <GapSummary rows={gaps.map(g => {
              const hit = COUNTRIES.find(x => x.country.key === g.country)
              const topics = g.clusters.filter(worthWriting)
              return {
                country: g.country,
                label: hit?.country.label ?? g.country,
                owner: hit?.market.owner ?? null,
                topics: topics.length,
                vol: topics.reduce((t, c) => t + c.vol, 0),
                top: topics.slice(0, 2).map(c => c.head),
              }
            }).sort((a, b) => b.vol - a.vol)} />
          </Section>

          <Section title="Page health — every live location page, graded"
            sub="Title, meta description, one H1, structured data, canonical, internal links and body length. This is the website operator's board.">
            <PageHealthBoard all={live} />
          </Section>

          <Section title="Where the funnel leaks"
            sub="Traffic against enquiries, by market. A market with sessions and no leads has a page problem, not a ranking problem.">
            <FunnelLeaks all={live} />
          </Section>

          <Section id="move" title="What moved since the last pull"
            sub="Positions gained, lost and newly won, so the team can see whether last cycle's work paid off.">
            <MarketTabs all={live} active={moveM.market.key} section="move" />
            <Momentum m={moveM} />
          </Section>
        </>
      )}

      {d.seo.markets?.length ? (
        <Section title="Organic by market" sub="Sessions, leads and keywords side by side.">
          <MarketsTable live={live} />
        </Section>
      ) : null}

      <p className="lede" style={{ marginTop: 8 }}>
        <Link href="/mw/plan">Open the market plan</Link> for the full instructions behind every task above.
      </p>
    </div>
  )
}

/** The one section he said was already right — now fed from the live pull. */
function MarketsTable({ live }: { live: MarketSeo[] }) {
  return (
    <table className="mw-kw wide">
      <thead>
        <tr>
          <th>Market</th><th>Owner</th><th className="num">Sessions</th><th className="num">Leads</th>
          <th className="num">Keywords</th><th className="num">Est. traffic</th><th className="num">Non-brand</th>
        </tr>
      </thead>
      <tbody>
        {live.map(m => (
          <tr key={m.market.key}>
            <td><b>{m.market.label}</b></td>
            <td>{m.market.owner ?? '—'}</td>
            <td className="num">{num(m.sessions)}</td>
            <td className="num">{m.leads || <span className="mw-zero">0</span>}</td>
            <td className="num">{num(m.keywordsTotal)}</td>
            <td className="num">{num(m.traffic)}</td>
            <td className="num">{m.keywords.length ? `${m.nonBrandPct}%` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
