// 👉 The Ads tab. Unlike the other tabs this one does NOT read `records` — it
// renders a point-in-time Meta Ads analysis from lib/ads-snapshot.ts. See the
// header comment in that file for why, and for how to refresh it.
import Stat from '@/app/_components/Stat'
import { rm } from '@/lib/records'
import {
  SNAPSHOT as S, HIGHLIGHTS, LOWLIGHTS, ACTIONS,
  AUDIENCES, ABTESTS, CREATIVE, POSTING,
  COMPETITORS, POSITIONING, type Row,
} from '@/lib/ads-snapshot'

export const dynamic = 'force-dynamic'

// rm() rounds to whole ringgit, which is right for cash tabs but hides the
// difference between RM 3.79 and RM 11.87 per conversation. Cents matter here.
const money = (n: number) => 'RM ' + n.toFixed(2)
const pct = (n: number) => n.toFixed(1) + '%'
// Cost per conversation. Returns null (rendered as —) when a row got no results,
// because "RM 8.14 ÷ 0" is not infinity, it's "we don't know yet".
const cpa = (r: { spend: number; convos: number }) => (r.convos > 0 ? r.spend / r.convos : null)
const showCpa = (r: { spend: number; convos: number }) => {
  const v = cpa(r)
  return v === null ? '—' : money(v)
}

// Sort a breakdown cheapest-first, rows with no results last.
const byEfficiency = (rows: Row[]) =>
  [...rows].sort((a, b) => (cpa(a) ?? Infinity) - (cpa(b) ?? Infinity))

export default async function Ads() {
  const t = S.totals
  const p = S.prior
  const b = S.benchmarks

  const costPerConvo = t.spend / t.convos
  const priorCostPerConvo = p.spend / p.convos
  const depth2Rate = (t.depth2 / t.convos) * 100

  // Where the benchmark band puts you: 0% = cheap end, 100% = expensive end.
  const bandPos = Math.min(100, Math.max(0,
    ((costPerConvo - b.costPerConvoMYR.low) / (b.costPerConvoMYR.high - b.costPerConvoMYR.low)) * 100))

  // Platform split, derived rather than typed in, so a refreshed snapshot can
  // never leave these sentences quoting last fortnight's numbers.
  const fb = S.platforms.find(x => x.label === 'Facebook')!
  const ig = S.platforms.find(x => x.label === 'Instagram')!
  const fbDepth2Rate = ((fb.depth2 ?? 0) / fb.convos) * 100
  const igDepth2Rate = ((ig.depth2 ?? 0) / ig.convos) * 100
  const fbCpa = fb.spend / fb.convos
  const igCpa = ig.spend / ig.convos

  const evening = S.hours.filter(h => h.h >= 17 && h.h <= 20)
  const eveningSpend = evening.reduce((s, h) => s + h.spend, 0)
  const eveningConvos = evening.reduce((s, h) => s + h.convos, 0)
  const midday = S.hours.filter(h => h.h === 11 || h.h === 12)
  const middaySpend = midday.reduce((s, h) => s + h.spend, 0)
  const middayConvos = midday.reduce((s, h) => s + h.convos, 0)
  const maxHourSpend = Math.max(...S.hours.map(h => h.spend))

  // Break-even: how many of the 81 chats must become a paid set to cover spend.
  const breakEvenRate = (costPerConvo / S.offer.price) * 100
  const roasRows = [10, 20, 30, 40, 50].map(rate => {
    const sets = t.convos * (rate / 100)
    const revenue = sets * S.offer.price
    return { rate, sets, revenue, roas: revenue / t.spend }
  })

  return (
    <>
      <h1 className="ph">Ads 📊</h1>
      <p className="cap">
        {S.campaign.name} — {S.account.name} · {S.period.since} to {S.period.until} · pulled {S.pulledAt}
      </p>

      {/* ── The headline row ─────────────────────────────── */}
      <div className="grid">
        <Stat label="Spend" value={rm(t.spend)} />
        <Stat label="Conversations" value={t.convos} />
        <Stat label="Cost / Conversation" value={money(costPerConvo)} />
        <Stat label="CTR" value={pct(t.ctr)} />
        <Stat label="Reached msg 2" value={pct(depth2Rate)} yes={depth2Rate < 50} />
      </div>

      {/* ── 1. The niche: who is advertising, and what they say ── */}
      <p className="rowlabel">1 · Your niche — who is advertising and what they say</p>
      <div className="banner info">
        <strong>What the Ad Library can and cannot tell you.</strong> It shows what a competitor is
        <em> running</em> — creative, copy, CTA, and how long each ad has been live. It does not show
        spend, CTR or cost per result: that is private to every account and no tool can reach it.
        <strong> Ad longevity is the one public signal worth reading</strong> — nobody keeps paying for
        an ad that does not work.
      </div>

      <table className="tbl">
        <thead>
          <tr><th>Who</th><th>Where</th><th>Advertising?</th><th>Leads with</th><th>CTA</th></tr>
        </thead>
        <tbody>
          {COMPETITORS.map(c => (
            <tr key={c.name}>
              <td data-label="Who">
                <strong>{c.name}</strong>
                {c.threat === 'Direct' && <> <span className="pill overdue">Direct</span></>}
                {c.threat === 'Model to copy' && <> <span className="pill won">Copy this</span></>}
              </td>
              <td data-label="Where">{c.where}</td>
              <td data-label="Advertising?">
                <span className={`pill ${c.status === 'Active ads' ? 'active' : c.status === 'Via platform' ? 'pending' : 'nurture'}`}>
                  {c.status}
                </span>
                <br /><span style={{ fontSize: 12, color: 'var(--dim)' }}>{c.adCount}</span>
              </td>
              <td data-label="Leads with">{c.leadsWith}</td>
              <td data-label="CTA">{c.cta}</td>
            </tr>
          ))}
          <tr>
            <td data-label="Who"><strong>{S.account.name} (you)</strong></td>
            <td data-label="Where">{S.offer.venue}</td>
            <td data-label="Advertising?">
              <span className="pill active">Active ads</span>
              <br /><span style={{ fontSize: 12, color: 'var(--dim)' }}>{rm(t.spend)} this fortnight</span>
            </td>
            <td data-label="Leads with">Price — {money(S.offer.price)} + free {S.offer.freeItem}</td>
            <td data-label="CTA">Click-to-WhatsApp</td>
          </tr>
        </tbody>
      </table>

      <div className="cols" style={{ marginTop: 12 }}>
        {COMPETITORS.filter(c => c.status !== 'No ads' || c.threat === 'Model to copy').slice(0, 4).map(c => (
          <div className="col" key={c.name}>
            <div className="kc">
              <p className="t"><strong>{c.name}</strong></p>
              <p className="s">{c.note}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="banner warn" style={{ marginTop: 14 }}>
        <strong>{POSITIONING.headline}</strong> {POSITIONING.body}
      </div>

      {/* ── 1b. Benchmarks ───────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 22 }}>…and how your numbers compare to the category</p>
      <p style={{ fontSize: 12, color: 'var(--dim)', margin: '0 0 10px', lineHeight: 1.6 }}>
        Since no rival&rsquo;s cost per result is obtainable, this is you against published category
        averages — the honest version of the same question.
      </p>

      <table className="tbl">
        <thead>
          <tr><th>Metric</th><th>You</th><th>Category</th><th>Read</th></tr>
        </thead>
        <tbody>
          <tr>
            <td data-label="Metric">Cost per conversation</td>
            <td data-label="You"><strong>{money(costPerConvo)}</strong></td>
            <td data-label="Category">RM {b.costPerConvoMYR.low}–{b.costPerConvoMYR.high}</td>
            <td data-label="Read"><span className="pill won">Lower third</span></td>
          </tr>
          <tr>
            <td data-label="Metric">CTR</td>
            <td data-label="You"><strong>{pct(t.ctr)}</strong></td>
            <td data-label="Category">{b.ctrRestaurant.low}–{b.ctrRestaurant.high}% restaurants</td>
            <td data-label="Read"><span className="pill won">~2–4× above</span></td>
          </tr>
          <tr>
            <td data-label="Metric">CPC</td>
            <td data-label="You"><strong>{money(t.cpc)}</strong></td>
            <td data-label="Category">≈ {money(b.cpcUsdFnb * b.usdMyr)}</td>
            <td data-label="Read"><span className="pill won">Far below</span></td>
          </tr>
          <tr>
            <td data-label="Metric">CPM</td>
            <td data-label="You"><strong>{money(t.cpm)}</strong></td>
            <td data-label="Category">≈ {money(b.cpmUsdFnb.low * b.usdMyr)}–{money(b.cpmUsdFnb.high * b.usdMyr)}</td>
            <td data-label="Read"><span className="pill closed">Slightly below</span></td>
          </tr>
        </tbody>
      </table>

      {/* Where you sit in the Malaysian click-to-WhatsApp band */}
      <div className="kc" style={{ marginTop: 12 }}>
        <p className="t"><strong>Malaysian click-to-WhatsApp band</strong></p>
        <div style={{ position: 'relative', height: 8, borderRadius: 999, margin: '12px 0 6px',
          background: 'linear-gradient(90deg, rgba(75,122,90,.35), rgba(182,128,42,.35), rgba(169,83,63,.35))' }}>
          <div aria-hidden="true" style={{ position: 'absolute', top: -4, left: `calc(${bandPos}% - 8px)`,
            width: 16, height: 16, borderRadius: 999, background: 'var(--clay)', border: '2px solid var(--card)' }} />
        </div>
        <p className="s">
          RM {b.costPerConvoMYR.low} ← you are at {money(costPerConvo)} → RM {b.costPerConvoMYR.high}.
          Source: {b.costPerConvoMYR.source}.
        </p>
      </div>

      <p className="s" style={{ fontSize: 12, color: 'var(--dim)', margin: '10px 0 0', lineHeight: 1.6 }}>
        CPC and CPM benchmarks are USD figures from largely US accounts, converted at ~{b.usdMyr}.
        Malaysian media is structurally cheaper, so part of that gap is the market, not your skill.
        The click-to-WhatsApp band is Malaysian SME data and is the comparison worth trusting.
      </p>

      {/* ── 2. Highlights & lowlights ────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>2 · Highlights &amp; lowlights</p>
      <div className="cols">
        <div className="col">
          <h3>What is working</h3>
          {HIGHLIGHTS.map(h => (
            <div className="kc" key={h.t}>
              <p className="t"><strong>{h.t}</strong></p>
              <p className="s">{h.s}</p>
            </div>
          ))}
        </div>
        <div className="col">
          <h3>What is not</h3>
          {LOWLIGHTS.map(l => (
            <div className="kc" key={l.t}>
              <p className="t"><strong>{l.t}</strong></p>
              <p className="s">{l.s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Action plan ──────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Action plan — ranked by what it is worth</p>
      <table className="tbl">
        <thead>
          <tr><th>When</th><th>Do this</th><th>Why / how</th><th>Impact</th></tr>
        </thead>
        <tbody>
          {ACTIONS.map(a => (
            <tr key={a.t}>
              <td data-label="When"><span className={`pill ${a.p === 'Now' ? 'overdue' : a.p === 'This week' ? 'pending' : 'nurture'}`}>{a.p}</span></td>
              <td data-label="Do this"><strong>{a.t}</strong></td>
              <td data-label="Why / how">{a.s}</td>
              <td data-label="Impact">{a.impact}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── ROAS ─────────────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>What it takes to make this pay</p>
      <div className="banner warn">
        Your campaign optimises for WhatsApp conversations, so Meta has no idea whether anyone ate.
        True ROAS is not computable from ad data. What <em>is</em> computable is the break-even:
        at {money(costPerConvo)} per conversation and {money(S.offer.price)} per set,
        <strong> {pct(breakEvenRate)} of conversations must become a paid set</strong> just to cover the ad spend —
        before food cost. Label your chats for two weeks and you will know your real number.
      </div>
      <table className="tbl">
        <thead>
          <tr><th>If this many convert</th><th>Sets sold</th><th>Revenue</th><th>ROAS</th></tr>
        </thead>
        <tbody>
          {roasRows.map(r => (
            <tr key={r.rate}>
              <td data-label="If this many convert">{r.rate}%</td>
              <td data-label="Sets sold">{r.sets.toFixed(1)}</td>
              <td data-label="Revenue">{rm(Math.round(r.revenue))}</td>
              <td data-label="ROAS">
                <span className={`pill ${r.roas >= 2 ? 'won' : r.roas >= 1 ? 'pending' : 'overdue'}`}>
                  {r.roas.toFixed(2)}×
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: 'var(--dim)', margin: '8px 0 0', lineHeight: 1.6 }}>
        Revenue, not profit. Only {t.depth2} of {t.convos} conversations got past the first message,
        so anything above roughly {pct((t.depth2 / t.convos) * 100)} conversion is optimistic on current behaviour.
      </p>

      {/* ── 6. Chat depth ────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>6 · Chat depth — where the money leaks</p>
      <div className="grid">
        <Stat label="Opened a chat" value={t.convos} />
        <Stat label="Sent msg 2" value={t.depth2} />
        <Stat label="Sent msg 3" value={t.depth3} />
        <Stat label="Sent msg 5" value={t.depth5} />
      </div>
      <div className="kc" style={{ marginTop: 12 }}>
        <p className="t">
          <strong>{pct(100 - depth2Rate)} of people never send a second message.</strong>
        </p>
        <p className="s">
          The drop-off rate is nearly identical on both platforms — {pct(fbDepth2Rate)} of Facebook
          chats reach message two versus {pct(igDepth2Rate)} of Instagram ones. That matters: Instagram
          is not sending you worse people, it is just {(igCpa / fbCpa).toFixed(1)}× more expensive to
          reach them. So the {pct(100 - depth2Rate)} loss is a chat problem, not an ad problem, and no
          amount of creative testing will fix it.
        </p>
      </div>
      <p style={{ fontSize: 12, color: 'var(--dim)', margin: '10px 0 0', lineHeight: 1.6 }}>
        One naming trap: Meta&rsquo;s <code>messaging_first_reply</code> ({t.newConnections}) is
        &ldquo;New messaging connections&rdquo; — people who had never messaged you before. It counts
        first-time contacts, not replies from either side. It says nothing about your auto-reply.
      </p>

      {/* ── 3. Audience ──────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>3 · Who is actually responding</p>
      <div className="cols">
        <div className="col">
          <h3>By age</h3>
          <table className="tbl">
            <thead><tr><th>Age</th><th>Spend</th><th>Convos</th><th>Cost each</th></tr></thead>
            <tbody>
              {S.ages.map(r => (
                <tr key={r.label}>
                  <td data-label="Age">{r.label}</td>
                  <td data-label="Spend">{money(r.spend)}</td>
                  <td data-label="Convos">{r.convos}</td>
                  <td data-label="Cost each"><strong>{showCpa(r)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="col">
          <h3>By gender</h3>
          <table className="tbl">
            <thead><tr><th>Who</th><th>Spend</th><th>Convos</th><th>Cost each</th></tr></thead>
            <tbody>
              {S.genders.map(r => (
                <tr key={r.label}>
                  <td data-label="Who">{r.label}</td>
                  <td data-label="Spend">{money(r.spend)}</td>
                  <td data-label="Convos">{r.convos}</td>
                  <td data-label="Cost each"><strong>{showCpa(r)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ marginTop: 14 }}>By area</h3>
          <table className="tbl">
            <thead><tr><th>Region</th><th>Spend</th><th>Connections</th><th>Cost each</th></tr></thead>
            <tbody>
              {S.regions.map(r => (
                <tr key={r.label}>
                  <td data-label="Region">{r.label}</td>
                  <td data-label="Spend">{money(r.spend)}</td>
                  <td data-label="Connections">{r.convos}</td>
                  <td data-label="Cost each"><strong>{showCpa(r)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="rowlabel" style={{ marginTop: 20 }}>Audiences worth testing next</p>
      <div className="cols">
        <div className="col">
          <h3>From your own data</h3>
          {AUDIENCES.filter(a => a.why === 'From your data').map(a => (
            <div className="kc" key={a.t}>
              <p className="t"><strong>{a.t}</strong></p>
              <p className="s">{a.s}</p>
            </div>
          ))}
        </div>
        <div className="col">
          <h3>New bets</h3>
          {AUDIENCES.filter(a => a.why === 'New test').map(a => (
            <div className="kc" key={a.t}>
              <p className="t"><strong>{a.t}</strong></p>
              <p className="s">{a.s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Placements ───────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Placements — cheapest first</p>
      <table className="tbl">
        <thead><tr><th>Placement</th><th>Spend</th><th>CTR</th><th>Convos</th><th>Cost each</th></tr></thead>
        <tbody>
          {byEfficiency(S.placements).map(r => {
            const v = cpa(r)
            const tone = v === null ? 'nurture' : v < 7 ? 'won' : v < 15 ? 'pending' : 'overdue'
            return (
              <tr key={r.label}>
                <td data-label="Placement">{r.label}</td>
                <td data-label="Spend">{money(r.spend)}</td>
                <td data-label="CTR">{pct(r.ctr ?? 0)}</td>
                <td data-label="Convos">{r.convos}</td>
                <td data-label="Cost each"><span className={`pill ${tone}`}>{showCpa(r)}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* ── Hour of day ──────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Hour of day — spend vs results</p>
      <div className="kc">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
          {S.hours.map(h => {
            const v = h.convos > 0 ? h.spend / h.convos : null
            const tone = v === null ? 'rgba(33,28,22,.14)' : v < 8 ? 'rgba(75,122,90,.55)'
              : v < 14 ? 'rgba(182,128,42,.55)' : 'rgba(169,83,63,.55)'
            return (
              <div key={h.h} style={{ flex: 1, textAlign: 'center' }}
                title={`${String(h.h).padStart(2, '0')}:00 — ${money(h.spend)}, ${h.convos} convos`}>
                <div style={{ height: Math.round((h.spend / maxHourSpend) * 74), background: tone, borderRadius: 3 }} />
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>00:00</span>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>12:00</span>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>23:00</span>
        </div>
        <p className="s" style={{ marginTop: 10 }}>
          Green = under RM 8 per conversation, amber = RM 8–14, rust = over RM 14, grey = no results.
          Evening 17:00–20:00 returns {money(eveningSpend / eveningConvos)} per conversation
          ({eveningConvos} of {t.convos} results on {pct((eveningSpend / t.spend) * 100)} of spend).
          11:00–12:00 returns {money(middaySpend / middayConvos)} — {pct((middaySpend / t.spend) * 100)} of
          budget for {pct((middayConvos / t.convos) * 100)} of results. Moving that block into the evening
          is worth roughly {Math.round(middaySpend / (eveningSpend / eveningConvos)) - middayConvos} extra
          conversations at no extra cost.
        </p>
      </div>

      {/* ── 4. A/B tests ─────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>4 · A/B tests, in priority order</p>
      <table className="tbl">
        <thead><tr><th>Test</th><th>A (now)</th><th>B (try)</th><th>Measure</th></tr></thead>
        <tbody>
          {ABTESTS.map(x => (
            <tr key={x.t}>
              <td data-label="Test"><strong>{x.t}</strong><br /><span style={{ fontSize: 12, color: 'var(--dim)' }}>{x.why}</span></td>
              <td data-label="A (now)">{x.a}</td>
              <td data-label="B (try)">{x.b}</td>
              <td data-label="Measure">{x.m}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── 5. Creative ──────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>5 · Creative to shoot</p>
      <div className="cols">
        <div className="col">
          <h3>Shot list</h3>
          {CREATIVE.map(c => (
            <div className="kc" key={c.t}>
              <p className="t"><strong>{c.t}</strong> <span className="tag live">{c.fmt}</span></p>
              <p className="s">{c.s}</p>
            </div>
          ))}
        </div>
        <div className="col">
          <h3>How to post it</h3>
          {POSTING.map(c => (
            <div className="kc" key={c.t}>
              <p className="t"><strong>{c.t}</strong></p>
              <p className="s">{c.s}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── What is live right now ───────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>What is live right now</p>
      <div className="cols">
        <div className="col">
          <h3>The ad</h3>
          <div className="kc">
            <p className="t"><strong>{S.liveCreative.hook}</strong></p>
            <p className="s">
              {S.liveCreative.format} · {S.liveCreative.cta} · created {S.liveCreative.created}
            </p>
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
        RM {S.offer.priceInAd.toFixed(2)}, but your normal price is RM {S.offer.normalPrice.toFixed(2)} —
        and RM {S.offer.normalPrice.toFixed(2)} minus RM {S.offer.price.toFixed(2)} is a
        RM {(S.offer.normalPrice - S.offer.price).toFixed(2)} saving, not the RM {S.offer.freeItemValue.toFixed(2)} the
        free tomyam is worth. Pricing the set at RM 79 makes every number agree. Separately,
        the free {S.offer.freeItem} — your strongest hook — is buried as a line item rather than leading the ad.
      </div>

      {/* ── Period over period ───────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Versus the fortnight before</p>
      <table className="tbl">
        <thead><tr><th>Metric</th><th>{S.priorPeriod.since} → {S.priorPeriod.until}</th><th>{S.period.since} → {S.period.until}</th></tr></thead>
        <tbody>
          <tr><td data-label="Metric">Spend</td><td data-label="Prior">{money(p.spend)}</td><td data-label="Now">{money(t.spend)}</td></tr>
          <tr><td data-label="Metric">Conversations</td><td data-label="Prior">{p.convos}</td><td data-label="Now">{t.convos}</td></tr>
          <tr><td data-label="Metric">Cost each</td><td data-label="Prior">{money(priorCostPerConvo)}</td><td data-label="Now">{money(costPerConvo)}</td></tr>
          <tr><td data-label="Metric">CTR</td><td data-label="Prior">{pct(p.ctr)}</td><td data-label="Now">{pct(t.ctr)}</td></tr>
          <tr><td data-label="Metric">CPC</td><td data-label="Prior">{money(p.cpc)}</td><td data-label="Now">{money(t.cpc)}</td></tr>
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: 'var(--dim)', margin: '8px 0 0', lineHeight: 1.6 }}>
        The prior fortnight spent only {money(p.spend)}, so its {money(priorCostPerConvo)} is a thin sample.
        Treat it as a direction, not a target you have lost.
      </p>

      <p className="hint" style={{ marginTop: 22 }}>
        Source: Meta Marketing API via Composio, account {S.account.id}, pulled {S.pulledAt}.
        Numbers are a snapshot — ask Claude to “refresh the ads snapshot” for current figures.
        Benchmarks are published category averages, not competitor data.
      </p>
    </>
  )
}
