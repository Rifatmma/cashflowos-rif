import { currentGuest } from '@/lib/guest'
import { getMwData, getMwMonths, getTargets, money, money0, num } from '@/lib/mw-data'
import { MwHero, Tiles, Section, Bars, SpendLeadChart } from '../_ui'
import { getActions } from '@/lib/mw-actions'
import { ActionList } from '../_actions-ui'
import { Targets, PaceChart, Scoreboard, Benchmark, Cards } from '../_sections'
import { MonthPicker, MonthOverMonth } from '../_month-picker'

// 👉 Moving Walls → Paid search. Google Ads: what it cost and what it returned.

export const dynamic = 'force-dynamic'

export default async function MwPaid({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await currentGuest()
  const { month } = await searchParams
  const [snap, rows, targets, months] = await Promise.all([
    getMwData(month), getActions('paid'), getTargets(), getMwMonths(),
  ])
  if (!snap) {
    return (
      <div className="mw-wrap">
        <MwHero tab="paid" pulled="—" stale={false} headline="Paid search" />
        <MonthPicker months={months} month={month} base="/mw/paid" />
        <p className="lede">
          {month
            ? `No Google Ads snapshot was stored for ${month}. The history starts at the first daily pull, so months before that cannot be shown.`
            : 'No snapshot yet.'}
        </p>
      </div>
    )
  }

  // The month before the one being shown, for the comparison below. Fetched
  // only when there is one, so a first month costs nothing extra.
  const shownKey = month ?? months.find(m => m.current)?.key ?? months[0]?.key
  const prevKey = months[months.findIndex(m => m.key === shownKey) + 1]?.key
  const prevSnap = prevKey ? await getMwData(prevKey) : null

  const d = snap.data
  const k = d.sem.kpi
  const conc = [...d.sem.concentration].sort((a, b) => b.bpk - a.bpk)
  const maxBpk = Math.max(...conc.map(c => c.bpk), 0.1)
  const maxCvr = Math.max(...conc.map(c => c.cvr), 0.1)
  const perDay = d.meta.daysDone ? k.spend / d.meta.daysDone : 0

  return (
    <div className="mw-wrap">
      <MwHero tab="paid" pulled={d.meta.pulled} stale={snap.stale}
        headline={`${money0(k.spend)} bought ${k.leads} leads in ${d.meta.monthLabel}`}>
        <p>
          That is <b>{money(k.cpl)} a lead</b>, against {String(k.dCpl ?? '')}. These are Google Ads
          conversions, counted for up to <b>60 days after the click</b> and across whatever channel the
          visit finally came back through — which is why GA4, which credits only the last click, shows
          fewer. Neither number is wrong; they answer different questions.
        </p>
      </MwHero>

      <MonthPicker months={months} month={month} base="/mw/paid" />

      <Tiles items={[
        { k: 'Spend', v: money0(k.spend), d: String(k.dSpend ?? '') },
        { k: 'Leads', v: String(k.leads), d: String(k.dLeads ?? '') },
        { k: 'Cost per lead', v: money(k.cpl), d: String(k.dCpl ?? '') },
        { k: 'Clicks', v: num(k.clicks), d: String(k.dClicks ?? ''), tone: 'up' },
        { k: 'Avg. CPC', v: money(k.cpc, 3), d: String(k.dCpc ?? ''), tone: 'up' },
        { k: 'Conv. rate', v: `${k.cvr}%`, d: String(k.dCvr ?? ''), tone: 'dn' },
      ]} />

      <Section title={`${d.meta.monthLabel} against ${prevSnap?.data.meta.monthLabel ?? 'the month before'}`}
        sub="Month over month, measured per delivery day so a part-month is not read as a collapse.">
        <MonthOverMonth
          nowLabel={d.meta.monthLabel}
          prevLabel={prevSnap?.data.meta.monthLabel ?? '—'}
          now={{ spend: k.spend, leads: k.leads, clicks: k.clicks, days: d.meta.daysDone }}
          prev={prevSnap ? {
            spend: prevSnap.data.sem.kpi.spend,
            leads: prevSnap.data.sem.kpi.leads,
            clicks: prevSnap.data.sem.kpi.clicks,
            days: prevSnap.data.meta.daysDone,
          } : null}
        />
      </Section>

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
