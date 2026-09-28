import { currentGuest } from '@/lib/guest'
import { getMwData, getTargets, money, money0, num } from '@/lib/mw-data'
import { MwHero, Tiles, Section, Bars, SpendLeadChart } from '../_ui'
import { getActions } from '@/lib/mw-actions'
import { ActionList } from '../_actions-ui'
import { Targets, PaceChart, Scoreboard, Benchmark, Cards } from '../_sections'

// 👉 Moving Walls → Paid search. Google Ads: what it cost and what it returned.

export const dynamic = 'force-dynamic'

export default async function MwPaid() {
  await currentGuest()
  const [snap, rows, targets] = await Promise.all([getMwData(), getActions('paid'), getTargets()])
  if (!snap) return <div className="mw-wrap"><MwHero tab="paid" pulled="—" stale={false} headline="Paid search" /><p className="lede">No snapshot yet.</p></div>

  const d = snap.data
  const k = d.sem.kpi
  const conc = [...d.sem.concentration].sort((a, b) => b.bpk - a.bpk)
  const maxBpk = Math.max(...conc.map(c => c.bpk), 0.1)
  const maxCvr = Math.max(...conc.map(c => c.cvr), 0.1)
  const perDay = d.meta.daysDone ? k.spend / d.meta.daysDone : 0

  return (
    <div className="mw-wrap">
      <MwHero tab="paid" pulled={d.meta.pulled} stale={snap.stale}
        headline={`${money0(k.spend)} bought ${k.leads} leads this month`}>
        <p>That is <b>{money(k.cpl)} a lead</b>, against {String(k.dCpl ?? '')}. Clicks are up and cheaper; the traffic simply converts less.</p>
      </MwHero>

      <Tiles items={[
        { k: 'Spend', v: money0(k.spend), d: String(k.dSpend ?? ''), tone: 'dn' },
        { k: 'Leads', v: String(k.leads), d: String(k.dLeads ?? ''), tone: 'dn' },
        { k: 'Cost per lead', v: money(k.cpl), d: String(k.dCpl ?? ''), tone: 'dn' },
        { k: 'Clicks', v: num(k.clicks), d: String(k.dClicks ?? ''), tone: 'up' },
        { k: 'Avg. CPC', v: money(k.cpc, 3), d: String(k.dCpc ?? ''), tone: 'up' },
        { k: 'Conv. rate', v: `${k.cvr}%`, d: String(k.dCvr ?? ''), tone: 'dn' },
      ]} />

      <Section title="Targets & pacing"
        sub="Set your numbers once — the gauges here and the pace line below work off them. The daily refresh never overwrites these.">
        <Targets t={targets} spend={k.spend} cpl={k.cpl} leads={k.leads}
          daysDone={d.meta.daysDone} daysMonth={d.meta.daysMonth} />
      </Section>

      <Section
        title={`${d.meta.monthLabel}, day by day`}
        sub={`Blue is spend, green is leads that day. ${d.meta.daysDone} delivery days so far — weekends are absent because no campaign runs Saturday or Sunday. Averaging ${money(perDay)} a day.`}
      >
        <SpendLeadChart labels={d.sem.daily.labels} cost={d.sem.daily.cost} leads={d.sem.daily.leads} />
      </Section>

      <Section title="Lead pacing"
        sub={targets.leads > 0
          ? `Cumulative leads against a goal of ${targets.leads}. The dashed line is where you would need to be.`
          : 'Cumulative leads. Set a monthly lead goal above and the pace line appears.'}>
        <PaceChart labels={d.sem.daily.labels} cum={d.sem.daily.cum} goal={targets.leads} daysMonth={d.meta.daysMonth} />
      </Section>

      {d.sem.campaigns?.length ? (
        <Section title="Campaign scoreboard" sub="What is running, and what it costs per lead.">
          <Scoreboard rows={d.sem.campaigns} />
        </Section>
      ) : null}

      {d.sem.benchmark?.length ? (
        <Section title="Beaten by our own past campaigns"
          sub="Where a paused campaign still outperforms what is live — and what it did differently.">
          <Benchmark blocks={d.sem.benchmark} />
        </Section>
      ) : null}

      <Section
        title="Concentration beats coverage"
        sub="Daily budget divided by live keywords, against conversion rate. The more thinly a campaign spreads its budget, the worse it converts — the clearest pattern in this account."
      >
        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          <div>
            <p className="eyebrow" style={{ margin: '0 0 8px' }}>Budget per keyword, per day</p>
            <Bars max={maxBpk} rows={conc.map(c => ({
              label: c.c + (c.live ? ' (live)' : ''), value: c.bpk, display: money(c.bpk), tone: c.live ? 'good' : 'dim',
            }))} />
          </div>
          <div>
            <p className="eyebrow" style={{ margin: '0 0 8px' }}>Conversion rate</p>
            <Bars max={maxCvr} rows={conc.map(c => ({
              label: c.c + (c.broad ? ' · broad match' : ''), value: c.cvr, display: `${c.cvr}%`,
              tone: c.broad ? 'bad' : c.live ? 'good' : 'dim',
            }))} />
          </div>
        </div>
        <p className="lede" style={{ marginTop: 14 }}>
          Read the two columns in the same order. The campaigns at the top of the left column are
          near the top of the right one too. <strong>The exception proves it:</strong> the broad-match
          campaign sits high on budget per keyword and converted nothing — concentration only pays
          when the keywords are tight.
        </p>
      </Section>

      {d.sem.leaks?.length ? (
        <Section title="Where the money leaks" sub="Four fixable drains.">
          <Cards rows={d.sem.leaks} />
        </Section>
      ) : null}

      <Section title="Paid search actions"
        sub="Status is read from the Google Ads account each morning. Your call is yours to set — and a reason for declining is saved so it isn't suggested again.">
        <ActionList rows={rows} />
      </Section>
    </div>
  )
}
