// 👉 Facebook Ads → Leads and money.
//
// Does the ad pay, and where do the conversations die? The ad optimises for
// WhatsApp chats, so Meta never knows who ate. Two honest answers:
//   • the BREAK-EVEN -- how many chats must become a set to cover ad spend --
//     works from ad numbers alone, so it leads the page;
//   • ACTUAL sets sold come from the POS import (cash_in rows, meta.kind
//     'daily_sales', meta.sets_sold). Until those arrive, the page says so.
//     And it says the catch: walk-ins order the set too, so "sets ÷ chats" is
//     the BEST case for the ad, never proof of it.
import { getAds } from '@/lib/ads-data'
import { getRecords } from '@/lib/records'
import { SNAPSHOT as S } from '@/lib/ads-snapshot'
import { rangeLabel } from '@/lib/ads-model'
import { costPerEngaged } from '@/lib/ads-verdict'
import { isSalesRow, salesDayOf } from '@/lib/sales'
import { AdsHeader, Fresh, Card, BarList, Fold, money, plain, pct, per } from '../_ui'

export const dynamic = 'force-dynamic'

// Food cost target agreed for Cash Out; the margin a set actually leaves.
const FOOD_COST_TARGET = 0.35

export default async function LeadsMoney() {
  const [{ n: d, lastError }, records] = await Promise.all([getAds(), getRecords()])
  const t = d.totals
  const cur = d.runs.at(-1)!
  const price = S.offer.price
  const costPerChat = per(t.spend, t.convos) ?? 0
  const breakEven = (costPerChat / price) * 100
  const margin = price * (1 - FOOD_COST_TARGET)
  const breakEvenAfterFood = (costPerChat / margin) * 100
  const die = t.convos ? 1 - t.depth2 / t.convos : 0

  // Sets actually sold during this run, if the POS import has started.
  const sales = records.filter(r => isSalesRow(r) && salesDayOf(r) >= cur.since && salesDayOf(r) <= cur.until)
  const setsSold = sales.reduce((a, r) => a + (Number(r.meta?.sets_sold) || 0), 0)
  const haveSets = sales.some(r => typeof r.meta?.sets_sold === 'number')

  const scenarios = [10, 20, 30, 40].map(rate => {
    const sets = t.convos * (rate / 100)
    const profit = sets * margin - t.spend
    return { rate, sets, revenue: sets * price, profit }
  })

  const steps = [
    { label: 'Opened a chat', v: t.convos },
    { label: 'Sent a 2nd message', v: t.depth2 },
    { label: 'Sent a 3rd', v: t.depth3 },
    { label: 'Sent a 5th', v: t.depth5 },
  ]

  // The quality trap, found in the data: the run with the cheapest chats vs its
  // cost once only engaged chats are counted.
  const cheapestChats = [...d.runs].sort((a, b) => a.spend / a.convos - b.spend / b.convos)[0]

  return (
    <div className="co ad">
      <AdsHeader title="Leads and money" here="/ads/funnel" right={<Fresh at={d.pulledAt} error={lastError} />} />

      {/* ── break-even ─────────────────────────────────────────── */}
      <Card eyebrow="To cover the ad spend">
        <div className="co-big num">{pct(breakEven, 1)}</div>
        <p className="ad-sentence">
          of chats must become a {money(price)} set, at {money(costPerChat)} a chat.
          After a {Math.round(FOOD_COST_TARGET * 100)}% food cost it&rsquo;s <b>{pct(breakEvenAfterFood, 1)}</b>.
        </p>
        <p className="co-meta">Run {cur.id}, {rangeLabel(cur.since, cur.until)}.</p>
      </Card>

      <Card eyebrow="What actually sold">
        {haveSets ? (
          <>
            <div className="co-row"><span>Sets sold during run {cur.id}</span><span className="num">{setsSold}</span></div>
            <div className="co-row"><span>Ad chats in the same days</span><span className="num">{t.convos}</span></div>
            <div className="co-row"><span>Best case for the ad</span><span className="num">{pct((setsSold / Math.max(t.convos, 1)) * 100, 1)}</span></div>
            <p className="co-meta">
              Best case, because walk-ins order the set too. Compare it with the {pct(breakEvenAfterFood, 1)} break-even:
              if even the best case is under it, the ad isn&rsquo;t paying for itself.
            </p>
          </>
        ) : (
          <p className="co-sub">
            Waiting on your POS sales. Once the daily report is coming in, this counts how many sets actually sold
            while the ad ran and sets it against the break-even above.
          </p>
        )}
      </Card>

      {/* ── the funnel ────────────────────────────────────────── */}
      <Card eyebrow="Where the chats die">
        <div className="ad-funnel">
          {steps.map((s, i) => (
            <div key={s.label} className="ad-funnel-step">
              <div className="co-row"><span>{s.label}</span><span className="num">{s.v} <span className="co-dim">{pct(t.convos ? (s.v / t.convos) * 100 : 0, 0)}</span></span></div>
              <div className="co-track" aria-hidden="true">
                <div className="co-fill" style={{ width: `${Math.max(2, t.convos ? (s.v / t.convos) * 100 : 0)}%`, background: i === 0 ? 'var(--info-fill)' : 'var(--green)' }} />
              </div>
            </div>
          ))}
        </div>
        <p className="ad-alert" style={{ marginTop: 10 }}>
          <b>{pct(die * 100, 0)} never send a second message.</b> The biggest loss in the account, and it happens after
          the ad has done its job — no amount of new creative fixes it. The WhatsApp opening message does.
        </p>
      </Card>

      {/* ── scenarios ──────────────────────────────────────────── */}
      <Card eyebrow="If this many chats book a set">
        <div className="ad-cmp">
          <div className="ad-cmp-row ad-cmp-head eyebrow"><span>Book</span><span>Sets</span><span>Profit after ads</span></div>
          {scenarios.map(s => (
            <div key={s.rate} className="ad-cmp-row">
              <span className="num">{s.rate}%</span>
              <span className="num">{s.sets.toFixed(0)}</span>
              {/* Whole ringgit: these are what-ifs, and sen made the column wrap on a phone. */}
              <span className={`num ${s.profit >= 0 ? 'ad-good' : 'ad-bad'}`}>{s.profit >= 0 ? '' : '−'}RM {Math.round(Math.abs(s.profit)).toLocaleString('en-MY')}</span>
            </div>
          ))}
        </div>
        <p className="co-meta">
          Profit = sets × {money(margin)} (the set after a {Math.round(FOOD_COST_TARGET * 100)}% food cost) minus
          {' '}{money(t.spend)} of ads. Only {pct((1 - die) * 100, 0)} got past one message, so rates above that are optimistic.
        </p>
      </Card>

      {/* ── quality across runs ─────────────────────────────────── */}
      <Card eyebrow="Reaching message 2, run by run">
        <BarList rows={d.runs.map(r => ({
          label: `${r.id} · ${r.label}`,
          value: r.convos ? (r.depth2 / r.convos) * 100 : 0,
          display: pct(r.convos ? (r.depth2 / r.convos) * 100 : 0, 0),
          sub: `${plain(r.spend / Math.max(r.convos, 1))}/chat`,
          tone: r.current ? 'good' : 'neutral',
        }))} max={100} />
        {cheapestChats && costPerEngaged(cheapestChats) !== null && (
          <p className="co-meta">
            Run {cheapestChats.id} had the cheapest chats ever at {money(cheapestChats.spend / cheapestChats.convos)} —
            and at {money(costPerEngaged(cheapestChats)!)} per engaged chat it was
            {' '}{costPerEngaged(cheapestChats)! > (costPerEngaged(cur) ?? 0) ? 'far dearer than now' : 'still cheaper than now'}.
            Cheap chats and good chats aren&rsquo;t the same thing.
          </p>
        )}
      </Card>

      <Fold title="Two traps in Meta's numbers">
        <p className="ad-body">
          <b>&ldquo;New messaging connections&rdquo; ({t.newConnections})</b> counts people who&rsquo;d never messaged you before.
          It isn&rsquo;t replies from either side, and says nothing about your auto-reply.
        </p>
        <p className="ad-body">
          <b>Areas</b> use total connections ({t.totalConnections}) rather than chats started ({t.convos}), because Meta
          doesn&rsquo;t split chats by region. Close, but not the same — don&rsquo;t add them to the age or gender figures.
        </p>
      </Fold>

      <p className="ad-source mono">Who responds — age, gender, area — is on the Performance tab.</p>
    </div>
  )
}
