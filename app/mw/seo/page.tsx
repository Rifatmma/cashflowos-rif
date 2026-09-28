import { currentGuest } from '@/lib/guest'
import { getMwData, num } from '@/lib/mw-data'
import { MwHero, Tiles, Section, Bars, OrganicTrend } from '../_ui'
import { getActions } from '@/lib/mw-actions'
import { ActionList } from '../_actions-ui'
import { BrandSplit, Opportunities, Cards, Markets, CompetitorTable } from '../_sections'

// 👉 Moving Walls → SEO & organic. GA4 organic traffic plus Semrush position.

export const dynamic = 'force-dynamic'

export default async function MwSeo() {
  await currentGuest()
  const [snap, rows] = await Promise.all([getMwData(), getActions('seo')])
  if (!snap) return <div className="mw-wrap"><MwHero tab="seo" pulled="—" stale={false} headline="SEO & organic" /><p className="lede">No snapshot yet.</p></div>

  const d = snap.data
  const k = d.seo.kpi
  const comp = [...d.seo.competitors].sort((a, b) => b.tr - a.tr)
  const me = d.seo.competitors.find(c => c.me)
  const maxTr = Math.max(...comp.map(c => c.tr), 1)
  const maxKw = Math.max(...comp.map(c => c.kw), 1)
  const ahead = comp.filter(c => !c.me && c.kw > (me?.kw ?? 0)).length

  return (
    <div className="mw-wrap">
      <MwHero tab="seo" pulled={d.meta.pulled} stale={snap.stale}
        headline={`${k.leads} organic leads, and the strongest links in your set`}>
        <p>Organic brings <b>{num(k.sessions)} sessions</b> a month at no media cost, and authority {k.authority} with {num(k.refDomains)} referring domains — the expensive half of SEO is already done.</p>
      </MwHero>

      <Tiles items={[
        { k: 'Organic sessions', v: num(k.sessions), d: String(k.dSessions ?? ''), tone: 'up' },
        { k: 'Organic users', v: num(k.users) },
        { k: 'Organic leads', v: String(k.leads), d: String(k.dLeads ?? ''), tone: 'up' },
        { k: 'Share of all leads', v: String(k.shareOfLeads) },
        { k: 'Conv. rate', v: `${k.cvr}%` },
        { k: 'Authority score', v: String(k.authority), d: `${num(k.refDomains)} ref. domains`, tone: 'up' },
      ]} />

      <Section
        title="Organic traffic"
        sub="Sessions per day. Green dots mark days that produced leads — the bigger the dot, the more leads."
      >
        <OrganicTrend start={d.seo.daily.start} sessions={d.seo.daily.sessions} leads={d.seo.daily.leads} />
      </Section>

      {d.seo.brand?.length ? (
        <Section title="Brand versus non-brand"
          sub="Traffic share from keywords containing your company name, against everything else. Non-brand is the only part that grows the business — brand searches would find you anyway.">
          <BrandSplit rows={d.seo.brand} />
        </Section>
      ) : null}

      <Section
        title={`Competitive position — ${d.seo.market} organic`}
        sub={`Monthly organic traffic, and how many keywords earns it. Semrush data, last refreshed ${d.meta.semrush}.`}
      >
        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          <div>
            <p className="eyebrow" style={{ margin: '0 0 8px' }}>Monthly organic traffic</p>
            <Bars max={maxTr} rows={comp.slice(0, 8).map(c => ({
              label: c.n.replace(/\.(com|in|co\.in)$/, ''), value: c.tr, display: num(c.tr), tone: c.me ? 'good' : 'dim',
            }))} />
          </div>
          <div>
            <p className="eyebrow" style={{ margin: '0 0 8px' }}>Keywords ranked</p>
            <Bars max={maxKw} rows={comp.slice(0, 8).map(c => ({
              label: c.n.replace(/\.(com|in|co\.in)$/, ''), value: c.kw, display: String(c.kw), tone: c.me ? 'bad' : 'dim',
            }))} />
          </div>
        </div>
        {me && (
          <p className="lede" style={{ marginTop: 14 }}>
            <strong>The gap is content, not authority.</strong> movingwalls.com ranks for {me.kw} keywords
            and earns {num(me.tr)} monthly visits, while {ahead} competitor{ahead === 1 ? '' : 's'} rank for
            more. Your link profile is the strongest in the set at authority {k.authority} with{' '}
            {num(k.refDomains)} referring domains — the expensive half of SEO is already done.
          </p>
        )}
        <div style={{ marginTop: 16 }}>
          <CompetitorTable rows={comp} authority={k.authority} refDomains={k.refDomains} />
        </div>
      </Section>

      {d.seo.opportunities?.length ? (
        <Section title="The opportunity list"
          sub="Already ranking, just not high enough to earn clicks. Moving any of these into the top 5 is cheaper than bidding on it.">
          <Opportunities rows={d.seo.opportunities} />
          {d.seo.winning && <p className="lede" style={{ marginTop: 14 }}><strong>Already winning, don&rsquo;t pay for these.</strong> {d.seo.winning}</p>}
        </Section>
      ) : null}

      {d.seo.collide?.length ? (
        <Section title="Where paid and organic collide"
          sub="Four things the two channels should be doing for each other.">
          <Cards rows={d.seo.collide} />
        </Section>
      ) : null}

      {d.seo.markets?.length ? (
        <Section title="Organic by market" sub="India converts, everywhere else visits.">
          <Markets rows={d.seo.markets} />
          {d.seo.marketNote && <p className="lede" style={{ marginTop: 14 }}><strong>Two mismatches worth noticing.</strong> {d.seo.marketNote}</p>}
        </Section>
      ) : null}

      <Section title="SEO actions"
        sub="Content and site-structure changes, judged from Semrush and GA4 rather than an account log. Your call is yours to set.">
        <ActionList rows={rows} />
      </Section>
    </div>
  )
}
