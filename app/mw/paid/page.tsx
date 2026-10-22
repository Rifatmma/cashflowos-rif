import { currentGuest } from '@/lib/guest'
import { getMwData, getMwMonths, getTargets, money, money0, num } from '@/lib/mw-data'
import { MwHero, Tiles, Section } from '../_ui'
import { getActions } from '@/lib/mw-actions'

import { Targets, PaceChart, Scoreboard } from '../_sections'
import { MonthPicker } from '../_month-picker'
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
  // The rows are still read, but only to say how many are waiting. The
  // answering happens in the plan.
  const open = rows.filter(r => r.status !== 'done' && r.status !== 'moot'
    && r.decision?.choice !== 'done' && r.decision?.choice !== 'reject').length
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


  const d = snap.data
  const k = d.sem.kpi

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

      {/* SLIMMED 21 Oct 2026. The tab had fifteen sections and three of them led
          to an action. Kept: the campaigns, what to change, the keyword worklist,
          the pages losing clicks, and one pacing chart with the target. Gone:
          month-over-month (the tiles carry the deltas), day-by-day (the pacing
          chart shows the same days), "Concentration beats coverage" (a one-off
          analysis from September), and the 709-row table, now behind a fold. The
          paid tasks themselves are in the one list on Today. */}
      <p className="lede" style={{ margin: '0 0 14px' }}>
        <a href="/mw?ch=Paid#next">The paid tasks, ranked with everything else, are on Today →</a>
      </p>

      {d.sem.campaigns?.length ? (
        <Section title="Campaigns" sub="What is running, and what it costs per lead (Google Ads count).">
          <Scoreboard rows={d.sem.campaigns} />
        </Section>
      ) : null}

      {/* ALWAYS RENDERED. A section that explains why it is empty is
          information; one that vanishes is a bug (owner, 5 Oct 2026). */}
      <Section title="What to change, campaign by campaign"
        sub="Every impression we missed had one of two causes — budget or rank — and they need opposite responses.">
        {verdicts.length > 0 ? (
          <>
            <AuctionBand s={auction} />
            <div style={{ marginTop: 14 }}><AuctionActions rows={verdicts} /></div>
            <details style={{ marginTop: 12 }}>
              <summary className="mw-planner-lab">The full auction table</summary>
              <div style={{ marginTop: 10 }}><AuctionTable rows={verdicts} /></div>
            </details>
          </>
        ) : (
          <p className="lede">No impression share was stored for {d.meta.monthLabel}.</p>
        )}
      </Section>

      <Section title="Keywords to act on" sub="Most money at stake first. Under a fair test of clicks, nothing is concluded.">
        <KeywordBand s={kwSummary} />
        <div style={{ marginTop: 14 }}><KeywordActions rows={kwVerdicts} /></div>
        <details style={{ marginTop: 12 }}>
          <summary className="mw-planner-lab">All {kwVerdicts.length} keywords ({FAIR_TEST_CLICKS}+ clicks is a fair test)</summary>
          <div style={{ marginTop: 10 }}><KeywordTable rows={kwVerdicts} /></div>
        </details>
      </Section>

      {groups.length > 0 && (
        <Section title="The pages losing the clicks"
          sub="Grouped by page, because the fix is a page rather than a keyword — and the section that fixes it is written out for you.">
          <PageFixes groups={groups} sections={sections} audits={audits} />
        </Section>
      )}

      <Section title="Targets and pacing"
        sub={targets.leads > 0
          ? `Leads so far against a goal of ${targets.leads}. The dashed line is where you would need to be.`
          : 'Set a monthly lead goal and the pace line appears.'}>
        <Targets t={targets} spend={k.spend} cpl={k.cpl} leads={k.leads}
          daysDone={d.meta.daysDone} daysMonth={d.meta.daysMonth} />
        <div style={{ marginTop: 14 }}>
          <PaceChart labels={d.sem.daily.labels} cum={d.sem.daily.cum} goal={targets.leads} daysMonth={d.meta.daysMonth} />
        </div>
      </Section>
    </div>
  )
}
