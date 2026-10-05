import { currentGuest } from '@/lib/guest'
import { getMwData, getMwMonths, getTargets, money, money0, num } from '@/lib/mw-data'
import { MwHero, Tiles, Section, Bars, SpendLeadChart } from '../_ui'
import { getActions } from '@/lib/mw-actions'
import { ActionList } from '../_actions-ui'
import { Targets, PaceChart, Scoreboard, Benchmark, Cards } from '../_sections'
import { MonthPicker, MonthOverMonth } from '../_month-picker'
import { auctionReport, summarise as summariseAuction, type ShareRow } from '@/lib/mw-auction'
import { AuctionBand, AuctionTable, AuctionActions } from '../_auction-ui'
import { analyseKeywords, summariseKeywords, pagesToFix, FAIR_TEST_CLICKS, type KeywordRow } from '@/lib/mw-keywords'
import { buildSection, type GeneratedSection } from '@/lib/mw-page-content'
import { auditPage } from '@/lib/mw-pagehealth'
import { KeywordBand, KeywordTable, KeywordActions, PageFixes } from '../_keyword-ui'

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

  // The auction. Google reports our own impression share and splits every
  // missed auction into budget and rank, which need opposite responses.
  const shareRows: ShareRow[] = ((d.sem as any).ishare ?? []).map((r: any) => ({
    name: String(r.n), status: r.st, impressions: Number(r.impr) || 0, clicks: Number(r.clicks) || 0,
    is: r.is ?? null, lostBudget: r.lostBudget ?? null, lostRank: r.lostRank ?? null,
    top: r.top ?? null, absTop: r.absTop ?? null, exact: r.exact ?? null,
  }))
  const sharePrev = ((d.sem as any).isharePrev ?? []).map((r: any) => ({
    name: String(r.n), is: r.is ?? null, lostBudget: r.lostBudget ?? null, lostRank: r.lostRank ?? null,
  }))
  const verdicts = auctionReport(shareRows, sharePrev)

  // Keywords, judged on quality score as well as conversions.
  const urlOf = new Map<string, string>()
  for (const a of ((d.sem as any).adUrls ?? [])) if (a?.ag && a?.u) urlOf.set(String(a.ag), String(a.u))

  const kwRows: KeywordRow[] = ((d.sem as any).keywords ?? [])
    .filter((r: any) => r?.k)
    .map((r: any) => ({
      text: String(r.k), matchType: r.mt ?? null,
      campaign: String(r.c ?? ''), adGroup: String(r.ag ?? ''),
      cost: Number(r.cost) || 0, clicks: Number(r.clicks) || 0,
      conversions: Number(r.conv) || 0, impressions: Number(r.impr) || 0,
      ctr: Number(r.ctr) || 0,
      qs: r.qs ?? null, adRelevance: r.qAd ?? null, landingPage: r.qPage ?? null, expectedCtr: r.qCtr ?? null,
      landingUrl: r.agid ? urlOf.get(String(r.agid)) ?? null : null,
    }))

  const kwVerdicts = analyseKeywords(kwRows)
  const kwSummary = summariseKeywords(kwVerdicts)
  const groups = pagesToFix(kwVerdicts).slice(0, 4)

  // Read the real pages. A failure is reported as "could not read", never as
  // a page with no faults -- the difference has caught me out all week.
  const audits: Record<string, any> = {}
  const sections: Record<string, GeneratedSection> = {}
  await Promise.all(groups.map(async g => {
    let a: any = null
    try {
      if (/^https?:\/\//.test(g.url)) {
        const h = await auditPage(g.url)
        a = h.ok ? { score: h.score, title: h.title, words: h.words, faults: h.faults.slice(0, 6) } : null
      }
    } catch { a = null }
    audits[g.url] = a
    sections[g.url] = buildSection({
      url: g.url, keywords: g.mustAnswer, cost: g.cost, clicks: g.clicks,
      faults: a?.faults, title: a?.title, words: a?.words,
    })
  }))
  const auction = summariseAuction(shareRows)

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

      {/* Only when there is a month to compare with. A card explaining that it
          has nothing to say is just noise on the oldest month (owner, 5 Oct 2026). */}
      {prevSnap && prevSnap.data.meta.daysDone > 0 && (
        <Section title={`${d.meta.monthLabel} against ${prevSnap.data.meta.monthLabel}`}
          sub="Month over month, measured per delivery day so a part-month is not read as a collapse.">
          <MonthOverMonth
            nowLabel={d.meta.monthLabel}
            prevLabel={prevSnap.data.meta.monthLabel}
            now={{ spend: k.spend, leads: k.leads, clicks: k.clicks, days: d.meta.daysDone }}
            prev={{
              spend: prevSnap.data.sem.kpi.spend,
              leads: prevSnap.data.sem.kpi.leads,
              clicks: prevSnap.data.sem.kpi.clicks,
              days: prevSnap.data.meta.daysDone,
            }}
          />
        </Section>
      )}

      {/* ALWAYS RENDERED. Hiding it on a month with no data made the tab look
          broken when the owner switched to September: "the section is gone, it
          should always be there." A section that explains why it is empty is
          information; one that vanishes is a bug (owner, 5 Oct 2026). */}
      <Section title="The auction: where we show and where we don't"
        sub="Every impression we missed had one of two causes, and they need opposite responses.">
        {verdicts.length > 0 ? (
          <>
            <AuctionBand s={auction} />
            <div style={{ marginTop: 16 }}>
              <AuctionTable rows={verdicts} />
            </div>
          </>
        ) : (
          <p className="lede">
            No impression share was stored for {d.meta.monthLabel}. Google reports it only from the
            day we started asking for it, so months pulled before then cannot show it — the
            figures are not missing from the account, they were simply never saved here.
          </p>
        )}
      </Section>

      <Section title="What to change"
        sub="Worst first. Open one for the numbers behind it.">
        {verdicts.length > 0
          ? <AuctionActions rows={verdicts} />
          : <p className="lede">Nothing to act on until a month with impression share is selected.</p>}
        <p className="lede" style={{ marginTop: 14 }}>
          <b>On competitors by name.</b> Google's own Auction Insights report — which rivals you
          overlap with, and how often they outrank you — exists only in the Google Ads interface.
          It is not in the API: asking for <code>auction_insight_domain</code> returns "unrecognized
          field". Everything above is our own side of the same auctions, which is where the levers
          are. If you export Auction Insights to CSV, it can be imported and shown here beside this.
        </p>
      </Section>

      <Section title="Keywords: what to fix before what to cut"
        sub="Conversions decide first. Where there are none, the quality score decides whether the fault is the keyword's or ours.">
        <KeywordBand s={kwSummary} />
        <div style={{ marginTop: 18 }}>
          {/* EVERY keyword, not a top-25. The first version capped the table and
              hid the "too early" rows, so an account with 233 keywords showed
              seven and looked broken (owner, 5 Oct 2026). */}
          <KeywordTable rows={kwVerdicts} />
        </div>
      </Section>

      <Section title="The keyword worklist"
        sub="Most money at stake first. Open one to see why it is judged that way.">
        <KeywordActions rows={kwVerdicts} />
        <p className="lede" style={{ marginTop: 14 }}>
          Showing every keyword that needs a decision. The ones marked{' '}
          <b>too early</b> are in the table above but not here — under{' '}
          {FAIR_TEST_CLICKS} clicks, nothing about them can honestly be concluded yet.
        </p>
      </Section>

      {groups.length > 0 && (
        <Section title="The pages losing the clicks"
          sub="Grouped by page, because the fix is a page rather than a keyword \u2014 and the section that fixes it is written out for you.">
          <PageFixes groups={groups} sections={sections} audits={audits} />
        </Section>
      )}

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
