// 👉 Facebook Ads → Performance.
//
// Answers ONE question first, on a phone, in a few seconds: is my ad working
// right now? Everything else sits below it in order of how often it drives a
// decision. Numbers come from getAds() -- the newest daily pull from Meta, or the
// hand-pulled snapshot if no pull has succeeded -- and every sentence that quotes
// a number calculates it here. Writing that does NOT update (the 20 Sep analysis)
// is folded at the bottom and stamped with its date.
import { getAds } from '@/lib/ads-data'
import { SNAPSHOT as S, HIGHLIGHTS, LOWLIGHTS, ACTIONS } from '@/lib/ads-snapshot'
import { rangeLabel, type Row } from '@/lib/ads-model'
import { verdict, alerts, costPerEngaged } from '@/lib/ads-verdict'
import {
  AdsHeader, Fresh, Card, Mini, BarList, CompareRows, Fold, Written, Spark, Columns,
  money, plain, num, pct, per, type Bar, type Cmp,
} from './_ui'

export const dynamic = 'force-dynamic'

// Fewer chats than this and a cost is luck, not a result: one chat at RM 1.45
// would otherwise rank "FB Search" as the best placement in the account.
const MIN_CHATS = 3

// Bars for "cost per chat": shorter is better, so the bar length is the cost.
// Judged rows first, cheapest first; too-small samples after, in grey; crumbs
// (under RM 1 with no chats) dropped as noise.
function costBars(rows: Row[], avg: number): Bar[] {
  const kept = rows.filter(r => r.convos > 0 || r.spend >= 1)
  const judged = kept.filter(r => r.convos >= MIN_CHATS)
    .sort((a, b) => a.spend / a.convos - b.spend / b.convos)
  const small = kept.filter(r => r.convos < MIN_CHATS)
    .sort((a, b) => b.spend - a.spend)
  return [
    ...judged.map(r => {
      const c = r.spend / r.convos
      return {
        label: r.label, value: c, display: plain(c),
        sub: `${r.convos} chats`,
        tone: (c > avg * 2 ? 'bad' : c <= avg ? 'good' : 'neutral') as Bar['tone'],
      }
    }),
    ...small.map(r => ({
      label: r.label,
      value: r.convos ? r.spend / r.convos : r.spend,
      display: r.convos ? plain(r.spend / r.convos) : 'no chats',
      sub: r.convos ? `${r.convos} chat${r.convos === 1 ? '' : 's'} · too few to judge` : `${plain(r.spend)} spent`,
      // Spent real money for nothing: that one IS worth flagging.
      tone: (r.convos === 0 && r.spend >= 5 ? 'bad' : 'neutral') as Bar['tone'],
    })),
  ]
}

export default async function Performance() {
  const { n: d, lastError } = await getAds()
  const t = d.totals
  const cur = d.runs.at(-1)!
  const prev = d.runs.at(-2)
  const v = verdict(d)
  const watch = alerts(d, { offer: S.offer, creative: S.liveCreative })
  const avg = per(t.spend, t.convos) ?? 0
  const engagedRate = t.convos ? (t.depth2 / t.convos) * 100 : 0
  const reachChange = prev && prev.reach ? ((cur.reach - prev.reach) / prev.reach) * 100 : null

  const rate = (r: { depth2: number; convos: number }) => (r.convos ? (r.depth2 / r.convos) * 100 : 0)
  // One row: format both numbers, say which way it moved, and -- separately --
  // whether that direction is good. higherBetter=null means "neither".
  const row = (k: string, now: number | null, was: number | null, fmt: (x: number) => string, higherBetter: boolean | null): Cmp => {
    if (now === null || was === null) return { k, now: now === null ? '—' : fmt(now), was: was === null ? '—' : fmt(was) }
    if (Math.abs(now - was) < 1e-9) return { k, now: fmt(now), was: fmt(was) }
    const up = now > was
    return { k, now: fmt(now), was: fmt(was), up, good: higherBetter === null ? null : up === higherBetter }
  }
  const all: Cmp[] = prev ? [
    row('Cost per engaged chat', costPerEngaged(cur), costPerEngaged(prev), plain, false),
    row('Cost per chat', per(cur.spend, cur.convos), per(prev.spend, prev.convos), plain, false),
    row('Reached message 2', rate(cur), rate(prev), x => pct(x), true),
    row('CTR', cur.ctr, prev.ctr, x => pct(x, 2), true),
    row('Reach', cur.reach, prev.reach, num, true),
    // --- behind "show more" ---
    row('Spend', cur.spend, prev.spend, plain, null),
    { k: 'Days delivering', now: `${t.deliveryDays} of ${t.calendarDays}`, was: String(prev.days) },
    row('Spend per day', cur.spend / Math.max(t.deliveryDays, 1), prev.spend / Math.max(prev.days, 1), plain, null),
    row('Chats', cur.convos, prev.convos, num, true),
    row('Reached message 3', cur.depth3, prev.depth3, num, true),
    row('Reached message 5', cur.depth5, prev.depth5, num, true),
    row('Impressions', cur.impressions, prev.impressions, num, true),
    row('Frequency', cur.frequency, prev.frequency, x => x.toFixed(2), false),
    row('Cost per 1,000 views', cur.cpm, prev.cpm, plain, false),
    row('Cost per click', cur.cpc, prev.cpc, plain, false),
    row('Clicks', cur.clicks, prev.clicks, num, true),
    { k: 'New contacts', now: String(t.newConnections), was: '—' },
    { k: 'Video views', now: num(t.videoViews), was: '—' },
  ] : []
  const SHOWN = 5

  // Day by day, coloured by cost per chat against the run average.
  const tone = (spend: number, convos: number): 'good' | 'mid' | 'bad' | 'none' => {
    if (spend === 0) return 'none'
    const c = per(spend, convos)
    return c === null || c > avg * 2 ? 'bad' : c <= avg ? 'good' : 'mid'
  }
  const dayCols = d.days.map(x => ({
    key: x.date, value: x.spend, tone: tone(x.spend, x.convos),
    title: `${rangeLabel(x.date, x.date)} — ${money(x.spend)}, ${x.convos} chats`,
  }))
  const zeroDays = d.days.filter(x => x.spend === 0)

  // Hour of day: the best and worst blocks, worked out -- never typed in.
  const hourCols = d.hours.map(h => ({
    key: String(h.h), value: h.spend, tone: tone(h.spend, h.convos),
    title: `${String(h.h).padStart(2, '0')}:00 — ${money(h.spend)}, ${h.convos} chats`,
  }))
  const block = (from: number, to: number) => {
    const hs = d.hours.filter(h => h.h >= from && h.h <= to)
    const s = hs.reduce((a, h) => a + h.spend, 0), c = hs.reduce((a, h) => a + h.convos, 0)
    return { s, c, cost: per(s, c) }
  }
  const evening = block(17, 20), night = block(1, 5)

  const fb = d.platforms.find(p => p.label === 'Facebook')
  const ig = d.platforms.find(p => p.label === 'Instagram')
  const reachMax = Math.max(...d.runs.map(r => r.reach), 1)
  const cpmMax = Math.max(...d.runs.map(r => r.cpm), 1)

  const pill = { working: 'good', watch: 'mid', 'not-working': 'bad', paused: 'mid' }[v.status]

  return (
    <div className="co ad">
      <AdsHeader title="Performance" here="/ads" right={<Fresh at={d.pulledAt} error={lastError} />} />

      {lastError && (
        <p className="ad-refresh-err">
          Today&rsquo;s refresh from Meta didn&rsquo;t work ({lastError}). Showing the last numbers that did.
        </p>
      )}

      {/* ── the verdict ───────────────────────────────────────────── */}
      <Card eyebrow="Is it working?" right={<span className={`ad-pill ad-pill-${pill}`}>{v.label}</span>} className="ad-verdict">
        <div className="co-big num">{v.headline !== null ? money(v.headline) : '—'}</div>
        <p className="co-sub" style={{ marginTop: 4 }}>
          per engaged chat · run {cur.id}, {rangeLabel(cur.since, cur.until)}
        </p>
        <p className="ad-sentence">{v.sentence}</p>
        <Spark values={v.trend} tone={v.status === 'not-working' ? 'bad' : 'good'} />
        <p className="co-meta">
          Cost per engaged chat, run by run since {rangeLabel(d.runs[0].since, d.runs[0].since)}.{' '}
          {v.basis === 'trend' && 'Your target appears here once POS sales are coming in.'}
        </p>
      </Card>

      <div className="ad-minis">
        <Mini label="Spend" value={plain(t.spend)} sub={`${t.deliveryDays} days delivering`} />
        <Mini label="Chats" value={num(t.convos)} sub={`${plain(avg)} each`} />
        <Mini label="Engaged" value={<>{t.depth2} <small>{pct(engagedRate, 0)}</small></>} sub="sent a 2nd message" />
        <Mini label="Reach" value={num(t.reach)}
          sub={reachChange === null ? undefined : `${reachChange < 0 ? '▼' : '▲'} ${Math.abs(reachChange).toFixed(0)}% on run ${prev!.id}`}
          subTone={reachChange === null ? undefined : reachChange < 0 ? 'bad' : 'good'} />
      </div>

      {/* ── fix this / watch out ──────────────────────────────────── */}
      {/* Grouped, not one card each: five stacked cards pushed every number off
          the first screen of a phone. Legal problems stay in their own red card. */}
      {watch.filter(a => a.level === 'bad').map(a => (
        <Card key={a.key} eyebrow="Fix this" tone="bad"><p className="ad-alert">{a.text}</p></Card>
      ))}
      {watch.some(a => a.level === 'warn') && (
        <Card eyebrow="Watch out" tone="warn">
          <ul className="ad-watch">
            {watch.filter(a => a.level === 'warn').map(a => <li key={a.key}>{a.text}</li>)}
          </ul>
        </Card>
      )}

      {/* ── this run vs the last ──────────────────────────────────── */}
      {prev && (
        <Card eyebrow={`Run ${cur.id} vs run ${prev.id}`}>
          <CompareRows rows={all.slice(0, SHOWN)} nowLabel={`Run ${cur.id}`} wasLabel={`Run ${prev.id}`} />
          <details className="co-more">
            <summary>Show {all.length - SHOWN} more</summary>
            <CompareRows rows={all.slice(SHOWN)} nowLabel={`Run ${cur.id}`} wasLabel={`Run ${prev.id}`} />
          </details>
          <p className="co-meta">
            Whole runs, never calendar weeks: run {prev.id} ({prev.label}) delivered {rangeLabel(prev.since, prev.until)}
            {prev.gapAfter ? `, then nothing for ${prev.gapAfter} days` : ''}.
          </p>
        </Card>
      )}

      {/* ── breakdowns: the four the owner uses ───────────────────── */}
      <Card eyebrow="Placements · RM per chat">
        <BarList rows={costBars(d.placements, avg)} />
        <p className="co-meta">Shorter is cheaper. Green is at or under your average of {plain(avg)}; red is over twice it or no chats at all.</p>
      </Card>

      <Card eyebrow="Hour of day · spend">
        <Columns cols={hourCols} ticks={['00:00', '12:00', '23:00']} />
        <p className="co-meta">
          {evening.cost !== null && <>17:00–20:00 costs {money(evening.cost)} a chat ({evening.c} chats). </>}
          {night.s > 0 && <>01:00–05:00 spent {money(night.s)} for {night.c} chat{night.c === 1 ? '' : 's'}.</>}
        </p>
      </Card>

      <div className="co-pair">
        <Card eyebrow="Age · RM per chat">
          <BarList rows={costBars(d.ages, avg)} />
        </Card>
        <Card eyebrow="Gender and area · RM per chat">
          <BarList rows={[...costBars(d.genders, avg), ...costBars(d.regions, avg)]} />
          <p className="co-meta">Areas use Meta&rsquo;s total connections — it doesn&rsquo;t split chats by region.</p>
        </Card>
      </div>

      <Card eyebrow="Facebook vs Instagram, and devices · RM per chat">
        <BarList rows={[...costBars(d.platforms, avg), ...costBars(d.devices, avg)]} />
        {fb && ig && fb.convos > 0 && ig.convos > 0 && (
          <p className="co-meta">
            Instagram costs {pct(((ig.spend / ig.convos) / (fb.spend / fb.convos) - 1) * 100, 0)}{' '}
            {ig.spend / ig.convos > fb.spend / fb.convos ? 'more' : 'less'} per chat than Facebook.
          </p>
        )}
      </Card>

      {/* ── the run, day by day ───────────────────────────────────── */}
      <Card eyebrow={`Run ${cur.id}, day by day · spend`}>
        <Columns cols={dayCols}
          ticks={[rangeLabel(d.days[0].date, d.days[0].date), '', rangeLabel(d.days.at(-1)!.date, d.days.at(-1)!.date)]} />
        <div className="co-legend">
          <span><i className="ad-key ad-col-good" /> cheap</span>
          <span><i className="ad-key ad-col-mid" /> average</span>
          <span><i className="ad-key ad-col-bad" /> dear</span>
          <span><i className="ad-key ad-col-none" /> nothing delivered</span>
        </div>
        {zeroDays.length > 0 && (
          <p className="co-meta">
            Nothing delivered on {zeroDays.map(z => rangeLabel(z.date, z.date)).join(', ')}.
          </p>
        )}
      </Card>

      {/* ── all runs ──────────────────────────────────────────────── */}
      <Card eyebrow="Every run · RM per engaged chat">
        <BarList rows={d.runs.map(r => {
          const c = costPerEngaged(r)
          return {
            label: `${r.id} · ${r.label}`,
            value: c ?? 0,
            display: c === null ? '—' : plain(c),
            sub: rangeLabel(r.since, r.until),
            tone: r.current ? 'good' : 'neutral',
          }
        })} />
        <div className="ad-pairbars" aria-hidden="true">
          {d.runs.map(r => (
            <div key={r.id} className="ad-pairbar" title={`Run ${r.id}: reach ${num(r.reach)}, CPM ${money(r.cpm)}`}>
              <div className="ad-pairbar-cols">
                <span style={{ height: `${Math.max(3, (r.reach / reachMax) * 100)}%`, background: 'var(--info-fill)' }} />
                <span style={{ height: `${Math.max(3, (r.cpm / cpmMax) * 100)}%`, background: 'var(--bad)' }} />
              </div>
              <span className="mono">{r.id}</span>
            </div>
          ))}
        </div>
        <p className="co-meta">
          Grey is reach, red is the cost per 1,000 views. Reach went from {num(d.runs[0].reach)} (run {d.runs[0].id}) to{' '}
          {num(cur.reach)} while that cost went from {money(d.runs[0].cpm)} to {money(cur.cpm)}.
        </p>
      </Card>

      {/* ── the written analysis: dated, folded ────────────────────── */}
      <Fold title="What's working and what isn't" meta={`${HIGHLIGHTS.length + LOWLIGHTS.length} notes`}>
        <Written on={S.pulledAt} />
        <p className="ad-h">Working</p>
        {HIGHLIGHTS.map(h => <div key={h.t} className="ad-note"><strong>{h.t}</strong><p>{h.s}</p></div>)}
        <p className="ad-h">Not working</p>
        {LOWLIGHTS.map(h => <div key={h.t} className="ad-note"><strong>{h.t}</strong><p>{h.s}</p></div>)}
      </Fold>

      <Fold title="Action plan" meta={`${ACTIONS.length} actions`}>
        <Written on={S.pulledAt} />
        {ACTIONS.map(a => (
          <div key={a.t} className="ad-note">
            <strong>{a.t}</strong> <span className="co-dim mono">· {a.p} · {a.impact}</span>
            <p>{a.s}</p>
          </div>
        ))}
        <p className="co-meta">These are tracked, with dates and status, in the Playbook tab.</p>
      </Fold>

      <Fold title="What's live: the ad and its targeting">
        <Written on={S.pulledAt} />
        <div className="ad-note">
          <strong>{S.liveCreative.hook}</strong>
          <p>{S.liveCreative.format} · {S.liveCreative.cta.replace(/_/g, ' ').toLowerCase()} · created {rangeLabel(S.liveCreative.created, S.liveCreative.created)}</p>
          <ul className="ad-list">{S.liveCreative.claims.map(c => (
            <li key={c} className={/halal/i.test(c) ? 'ad-bad' : undefined}>{c}{/halal/i.test(c) && ' — remove (see Fix this above)'}</li>
          ))}</ul>
        </div>
        <div className="ad-note">
          <strong>Targeting</strong>
          <p>
            Ages {S.targeting.ages} · {S.targeting.genders} · {S.targeting.devices}<br />
            Areas: {S.targeting.cities.join(', ')}<br />
            Interests: {S.targeting.interests.join(', ')}<br />
            Advantage Audience {S.targeting.advantageAudience ? 'on' : 'off'} · goal: {S.targeting.optimisation}
          </p>
        </div>
      </Fold>

      <p className="ad-source mono">
        {d.source === 'live' ? 'Daily pull' : 'Hand-pulled snapshot'} from Meta via Composio · account {d.accountId}
      </p>
    </div>
  )
}
