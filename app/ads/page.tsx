// 👉 Facebook Ads → Performance. Unlike the other tabs this does NOT read
// `records` — it renders the Meta Ads snapshot from lib/ads-snapshot.ts.
import Stat from '@/app/_components/Stat'
import {
  SNAPSHOT as S, RUNS, CURRENT, HIGHLIGHTS, LOWLIGHTS, ACTIONS,
} from '@/lib/ads-snapshot'
import {
  SubNav, Breakdown, CostBars, CardCols, Note,
  money, pct, num, cpa, byEfficiency,
} from './_ui'

export const dynamic = 'force-dynamic'

export default async function Performance() {
  const t = S.totals
  const prev = RUNS[RUNS.length - 2] // the run before this one
  const costPerConvo = t.spend / t.convos
  const depth2Rate = (t.depth2 / t.convos) * 100
  const costPerEngaged = t.spend / t.depth2

  // Cost per ENGAGED conversation is the honest quality-adjusted number: a run
  // that buys chats nobody continues is not cheap, whatever the headline says.
  const runsRanked = [...RUNS].sort((a, b) => a.spend / a.depth2 - b.spend / b.depth2)
  const bestRun = runsRanked[0]
  const worstRun = runsRanked[runsRanked.length - 1]

  const evening = S.hours.filter(h => h.h >= 17 && h.h <= 20)
  const evSpend = evening.reduce((s, h) => s + h.spend, 0)
  const evConvos = evening.reduce((s, h) => s + h.convos, 0)
  const night = S.hours.filter(h => h.h >= 1 && h.h <= 5)
  const nightSpend = night.reduce((s, h) => s + h.spend, 0)
  const nightConvos = night.reduce((s, h) => s + h.convos, 0)

  const fb = S.platforms.find(x => x.label === 'Facebook')!
  const ig = S.platforms.find(x => x.label === 'Instagram')!

  // Every headline metric, this run against the one before.
  const metrics: { k: string; now: string; was: string; better?: boolean | null }[] = [
    { k: 'Spend', now: money(t.spend), was: money(prev.spend), better: null },
    { k: 'Days delivering', now: `${t.deliveryDays} of ${t.calendarDays}`, was: String(prev.days), better: null },
    { k: 'Spend per day', now: money(t.spend / t.deliveryDays), was: money(prev.spend / prev.days), better: null },
    { k: 'Impressions', now: num(t.impressions), was: num(prev.impressions), better: t.impressions > prev.impressions },
    { k: 'Reach', now: num(t.reach), was: num(prev.reach), better: t.reach > prev.reach },
    { k: 'Frequency', now: t.frequency.toFixed(2), was: prev.frequency.toFixed(2), better: t.frequency < prev.frequency },
    { k: 'Clicks', now: num(t.clicks), was: num(prev.clicks), better: null },
    { k: 'Link clicks', now: num(t.linkClicks), was: '—', better: null },
    { k: 'CTR', now: pct(t.ctr), was: pct(prev.ctr), better: t.ctr > prev.ctr },
    { k: 'CPC', now: money(t.cpc), was: money(prev.cpc), better: t.cpc < prev.cpc },
    { k: 'CPM', now: money(t.cpm), was: money(prev.cpm), better: t.cpm < prev.cpm },
    { k: 'Conversations', now: String(t.convos), was: String(prev.convos), better: null },
    { k: 'Cost per conversation', now: money(costPerConvo), was: money(prev.spend / prev.convos), better: costPerConvo < prev.spend / prev.convos },
    { k: 'New contacts', now: String(t.newConnections), was: '—', better: null },
    { k: 'Reached msg 2', now: `${t.depth2} (${pct(depth2Rate)})`, was: `${prev.depth2} (${pct((prev.depth2 / prev.convos) * 100)})`, better: depth2Rate > (prev.depth2 / prev.convos) * 100 },
    { k: 'Reached msg 3', now: String(t.depth3), was: String(prev.depth3), better: null },
    { k: 'Reached msg 5', now: String(t.depth5), was: String(prev.depth5), better: null },
    { k: 'Cost per engaged chat', now: money(costPerEngaged), was: money(prev.spend / prev.depth2), better: costPerEngaged < prev.spend / prev.depth2 },
    { k: 'Video views', now: num(t.videoViews), was: '—', better: null },
    { k: 'Saves / comments / reactions', now: `${t.postSaves} / ${t.comments} / ${t.reactions}`, was: '—', better: null },
  ]

  return (
    <>
      <h1 className="ph">Facebook Ads — Performance 📊</h1>
      <p className="cap">
        {S.campaign.name} · {S.account.name} · run {CURRENT.id}, {S.period.since} to {S.period.until} · pulled {S.pulledAt}
      </p>
      <SubNav here="/ads" />

      <div className="grid">
        <Stat label="Spend" value={money(t.spend)} />
        <Stat label="Conversations" value={t.convos} />
        <Stat label="Cost / conversation" value={money(costPerConvo)} />
        <Stat label="Cost / engaged chat" value={money(costPerEngaged)} />
        <Stat label="CTR" value={pct(t.ctr)} />
        <Stat label="Reach" value={num(t.reach)} yes={t.reach < prev.reach} />
      </div>

      {/* ── Every number ─────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Every metric, this run vs the one before</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Run {CURRENT.id} — now</th>
            <th>Run {prev.id} — {prev.label}</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(m => (
            <tr key={m.k}>
              <td data-label="Metric">{m.k}</td>
              <td data-label="Now">
                <strong>{m.now}</strong>
                {m.better === true && <span className="pill won" style={{ marginLeft: 6 }}>better</span>}
                {m.better === false && <span className="pill overdue" style={{ marginLeft: 6 }}>worse</span>}
              </td>
              <td data-label="Before">{m.was}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Note>
        Run {prev.id} ran {prev.days} days to {prev.until}, then nothing delivered for {prev.gapAfter} days.
        Comparing calendar fortnights would have mixed live days with dead ones, so both columns are whole runs.
      </Note>

      {/* ── Run history ──────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Six runs since March</p>
      <div className="banner info">
        <strong>Raw cost per conversation is a trap.</strong> Run {worstRun.id} bought {worstRun.convos} conversations
        at {money(worstRun.spend / worstRun.convos)} each — the cheapest ever — and only{' '}
        {pct((worstRun.depth2 / worstRun.convos) * 100)} of them sent a second message. Ranked on cost per chat that
        actually engaged, this run is your <strong>best of the six</strong> at {money(costPerEngaged)}.
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Run</th><th>Dates</th><th>Days</th><th>Spend</th><th>Reach</th>
            <th>CTR</th><th>CPM</th><th>Convos</th><th>Cost each</th><th>Msg 2</th><th>Cost / engaged</th>
          </tr>
        </thead>
        <tbody>
          {RUNS.map(r => {
            const eng = r.spend / r.depth2
            return (
              <tr key={r.id} style={r.current ? { background: 'var(--clay-tint)' } : undefined}>
                <td data-label="Run"><strong>{r.id}</strong> {r.current && <span className="pill active">now</span>}</td>
                <td data-label="Dates">{r.since.slice(5)} → {r.until.slice(5)}</td>
                <td data-label="Days">{r.days}</td>
                <td data-label="Spend">{money(r.spend)}</td>
                <td data-label="Reach">{num(r.reach)}</td>
                <td data-label="CTR">{pct(r.ctr)}</td>
                <td data-label="CPM">{money(r.cpm)}</td>
                <td data-label="Convos">{r.convos}</td>
                <td data-label="Cost each">{money(r.spend / r.convos)}</td>
                <td data-label="Msg 2">{pct((r.depth2 / r.convos) * 100)}</td>
                <td data-label="Cost / engaged">
                  <span className={`pill ${eng < 25 ? 'won' : eng < 80 ? 'pending' : 'overdue'}`}>{money(eng)}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Note>
        Gaps between runs: {RUNS.filter(r => r.gapAfter).map(r => `${r.id}→ ${r.gapAfter}d`).join(' · ')}.
        Five pauses in six months, the longest {Math.max(...RUNS.map(r => r.gapAfter ?? 0))} days. Every restart
        re-enters the learning phase.
      </Note>

      {/* Reach + CPM trend — the thing that actually threatens you */}
      <p className="rowlabel" style={{ marginTop: 20 }}>Reach is collapsing while CPM climbs</p>
      <div className="kc">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 100 }}>
          {RUNS.map(r => {
            const maxReach = Math.max(...RUNS.map(x => x.reach))
            const maxCpm = Math.max(...RUNS.map(x => x.cpm))
            return (
              <div key={r.id} style={{ flex: 1, textAlign: 'center' }}
                title={`Run ${r.id}: reach ${num(r.reach)}, CPM ${money(r.cpm)}`}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, justifyContent: 'center' }}>
                  <div style={{ width: '42%', height: Math.max(2, Math.round((r.reach / maxReach) * 78)), background: 'rgba(90,140,190,.55)', borderRadius: 3 }} />
                  <div style={{ width: '42%', height: Math.max(2, Math.round((r.cpm / maxCpm) * 78)), background: 'rgba(169,83,63,.55)', borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>{r.id}</div>
              </div>
            )
          })}
        </div>
        <p className="s" style={{ marginTop: 8 }}>
          <span style={{ color: '#2C5E8A', fontWeight: 600 }}>▉ Reach</span>{' · '}
          <span style={{ color: '#8A3E2D', fontWeight: 600 }}>▉ CPM</span>{' — '}
          reach fell from {num(RUNS[0].reach)} to {num(CURRENT.reach)} ({pct((1 - CURRENT.reach / RUNS[0].reach) * 100)} down)
          while CPM rose from {money(RUNS[0].cpm)} to {money(CURRENT.cpm)}, a {(CURRENT.cpm / RUNS[0].cpm).toFixed(1)}× increase.
          You are paying much more to reach a much smaller pool. This is the real long-term threat.
        </p>
      </div>

      {/* ── Daily ────────────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Day by day</p>
      <CostBars
        data={S.days.map(d => ({
          spend: d.spend, convos: d.convos, key: d.d,
          title: `${d.d} — ${money(d.spend)}, ${d.convos} convos, CTR ${pct(d.ctr)}`,
        }))}
        tickLeft="03 Sep" tickMid="11 Sep" tickRight="19 Sep"
        caption={<>
          Green under RM 7 per conversation, amber RM 7–14, rust above, grey no results.
          The two grey columns are 17–18 Sep, when nothing delivered at all — about RM 110 of
          expected spend and roughly 14 conversations lost. 19 Sep then spent {money(S.days[S.days.length - 1].spend)} catching up.
        </>}
      />

      {/* ── Placements ───────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Placements — cheapest first</p>
      <Breakdown rows={byEfficiency(S.placements)} head="Placement" showCtr showDepth />
      <Note>
        FB Stories at {money(62.41 / 18)} is your cheapest result on 7% of budget, while FB Feed takes 43% at{' '}
        {money(386.12 / 41)}. FB Reels carries your deepest conversations — 6 of {t.depth5} depth-5 chats.
        IG Feed spent {money(67.06)} for 3 conversations at 0.85% CTR.
      </Note>

      <p className="rowlabel" style={{ marginTop: 20 }}>Facebook vs Instagram</p>
      <Breakdown rows={S.platforms} head="Platform" showDepth />
      <Note>
        Instagram costs {pct(((ig.spend / ig.convos) / (fb.spend / fb.convos) - 1) * 100)} more per conversation
        and converts worse once they arrive — {pct(((ig.depth2 ?? 0) / ig.convos) * 100)} of IG chats reach message two
        against {pct(((fb.depth2 ?? 0) / fb.convos) * 100)} on Facebook.
      </Note>

      {/* ── Hour of day ──────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Hour of day</p>
      <CostBars
        data={S.hours.map(h => ({
          spend: h.spend, convos: h.convos, key: String(h.h),
          title: `${String(h.h).padStart(2, '0')}:00 — ${money(h.spend)}, ${h.convos} convos`,
        }))}
        tickLeft="00:00" tickMid="12:00" tickRight="23:00"
        caption={<>
          Evening 17:00–20:00 returns {money(evSpend / evConvos)} per conversation — {evConvos} of {t.convos} results
          on {pct((evSpend / t.spend) * 100)} of spend. Overnight 01:00–05:00 spent {money(nightSpend)} for{' '}
          {nightConvos} conversation. 09:00 alone burned {money(48.90)} for 2.
          Running 10:00–21:00 and stopping overnight is free money.
        </>}
      />

      {/* ── Devices ──────────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Devices</p>
      <Breakdown rows={S.devices} head="Device" showCtr showDepth />
      <Note>
        Android and iPhone cost within two sen of each other, so there is no device play here —
        worth knowing so you don&rsquo;t go looking for one.
      </Note>

      {/* ── Highlights / lowlights ───────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Highlights &amp; lowlights</p>
      <CardCols left="What is working" right="What is not" leftItems={HIGHLIGHTS} rightItems={LOWLIGHTS} />

      {/* ── Action plan ──────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Action plan — ranked by what it is worth</p>
      <table className="tbl">
        <thead><tr><th>When</th><th>Do this</th><th>Why / how</th><th>Impact</th></tr></thead>
        <tbody>
          {ACTIONS.map(a => (
            <tr key={a.t}>
              <td data-label="When">
                <span className={`pill ${a.p === 'Now' ? 'overdue' : a.p === 'This week' ? 'pending' : 'nurture'}`}>{a.p}</span>
              </td>
              <td data-label="Do this"><strong>{a.t}</strong></td>
              <td data-label="Why / how">{a.s}</td>
              <td data-label="Impact">{a.impact}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── What is live ─────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>What is live right now</p>
      <div className="cols">
        <div className="col">
          <h3>The ad</h3>
          <div className="kc">
            <p className="t"><strong>{S.liveCreative.hook}</strong></p>
            <p className="s">{S.liveCreative.format} · {S.liveCreative.cta} · created {S.liveCreative.created}</p>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--dim)', lineHeight: 1.7 }}>
              {S.liveCreative.claims.map(c => <li key={c}>{c}</li>)}
            </ul>
          </div>
        </div>
        <div className="col">
          <h3>The targeting</h3>
          <div className="kc">
            <p className="s" style={{ lineHeight: 1.8 }}>
              <strong>Ages</strong> {S.targeting.ages} · <strong>Gender</strong> {S.targeting.genders}<br />
              <strong>Devices</strong> {S.targeting.devices}<br />
              <strong>Areas</strong> {S.targeting.cities.join(', ')}<br />
              <strong>Interests</strong> {S.targeting.interests.join(', ')}<br />
              <strong>Behaviours</strong> {S.targeting.behaviors.join(', ')} · {S.targeting.family.join(', ')}<br />
              <strong>Advantage Audience</strong> {S.targeting.advantageAudience ? 'ON' : 'off'}<br />
              <strong>Goal</strong> {S.targeting.optimisation}
            </p>
          </div>
        </div>
      </div>

      <div className="banner">
        <strong>Two things to fix in the live ad.</strong> It quotes the normal price as
        RM {S.offer.priceInAd.toFixed(2)}, but your normal price is RM {S.offer.normalPrice.toFixed(2)} — and
        RM {S.offer.normalPrice.toFixed(2)} minus RM {S.offer.price.toFixed(2)} is a
        RM {(S.offer.normalPrice - S.offer.price).toFixed(2)} saving, not the RM {S.offer.freeItemValue.toFixed(2)} the
        free tomyam is worth. Pricing the set at RM 79 makes every number agree. Separately, the free{' '}
        {S.offer.freeItem} — your strongest hook — is buried as a line item rather than leading the ad.
      </div>

      <p className="hint" style={{ marginTop: 22 }}>
        Source: Meta Marketing API via Composio, account {S.account.id}, pulled {S.pulledAt}.
        A snapshot — ask Claude to “refresh the ads snapshot” for current figures.
      </p>
    </>
  )
}
