// 👉 Facebook Ads → Leads & Money. Does this pay, where does it leak, and who
// is actually responding.
import Stat from '@/app/_components/Stat'
import { rm } from '@/lib/records'
import { SNAPSHOT as S, RUNS, CURRENT } from '@/lib/ads-snapshot'
import { SubNav, Breakdown, Note, money, pct, num } from '../_ui'

export const dynamic = 'force-dynamic'

export default async function LeadsMoney() {
  const t = S.totals
  const costPerConvo = t.spend / t.convos
  const depth2Rate = (t.depth2 / t.convos) * 100
  const costPerEngaged = t.spend / t.depth2

  // Break-even: what share of chats must become a paid set to cover ad spend.
  const breakEvenRate = (costPerConvo / S.offer.price) * 100
  const roasRows = [10, 20, 30, 40, 50].map(rate => {
    const sets = t.convos * (rate / 100)
    const revenue = sets * S.offer.price
    return { rate, sets, revenue, roas: revenue / t.spend }
  })

  const fb = S.platforms.find(x => x.label === 'Facebook')!
  const ig = S.platforms.find(x => x.label === 'Instagram')!
  const men = S.genders.find(g => g.label === 'Men')!
  const women = S.genders.find(g => g.label === 'Women')!
  const best = [...S.ages].sort((a, b) => a.spend / a.convos - b.spend / b.convos)[0]

  return (
    <>
      <h1 className="ph">Facebook Ads — Leads &amp; Money 💬</h1>
      <p className="cap">
        Whether it pays, where the conversations die, and who is actually replying. Run {CURRENT.id}, {S.period.since} to {S.period.until}.
      </p>
      <SubNav here="/ads/funnel" />

      {/* ── Does it pay ──────────────────────────────────── */}
      <p className="rowlabel">What it takes to make this pay</p>
      <div className="banner warn">
        Your campaign optimises for WhatsApp conversations, so Meta has no idea whether anyone ate.
        True ROAS is not computable from ad data. What <em>is</em> computable is the break-even:
        at {money(costPerConvo)} per conversation and {money(S.offer.price)} per set,
        <strong> {pct(breakEvenRate)} of conversations must become a paid set</strong> just to cover the ad
        spend — before food cost. Label your chats for two weeks and you will know your real number.
      </div>
      <table className="tbl">
        <thead><tr><th>If this many convert</th><th>Sets sold</th><th>Revenue</th><th>ROAS</th></tr></thead>
        <tbody>
          {roasRows.map(r => (
            <tr key={r.rate}>
              <td data-label="Convert">{r.rate}%</td>
              <td data-label="Sets">{r.sets.toFixed(1)}</td>
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
      <Note>
        Revenue, not profit. Only {t.depth2} of {t.convos} conversations got past the first message, so anything
        above roughly {pct(depth2Rate)} conversion is optimistic on current behaviour. At a typical
        restaurant gross margin the break-even climbs to roughly {pct(breakEvenRate / 0.65)}.
      </Note>

      {/* ── Chat depth ───────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Chat depth — where the money leaks</p>
      <div className="grid">
        <Stat label="Opened a chat" value={t.convos} />
        <Stat label="Sent msg 2" value={t.depth2} />
        <Stat label="Sent msg 3" value={t.depth3} />
        <Stat label="Sent msg 5" value={t.depth5} />
        <Stat label="Cost per engaged chat" value={money(costPerEngaged)} />
      </div>

      {/* Funnel bars */}
      <div className="kc" style={{ marginTop: 12 }}>
        {[
          { l: 'Opened a chat', v: t.convos },
          { l: 'Sent message 2', v: t.depth2 },
          { l: 'Sent message 3', v: t.depth3 },
          { l: 'Sent message 5', v: t.depth5 },
        ].map(s => (
          <div key={s.l} style={{ marginBottom: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span style={{ color: 'var(--ink)' }}>{s.l}</span>
              <span style={{ color: 'var(--dim)' }}>{s.v} · {pct((s.v / t.convos) * 100)}</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--paper-2)' }}>
              <div style={{
                height: 10, borderRadius: 5, background: 'var(--clay)',
                width: Math.max(1, Math.round((s.v / t.convos) * 100)) + '%',
              }} />
            </div>
          </div>
        ))}
        <p className="s" style={{ marginTop: 10 }}>
          <strong>{pct(100 - depth2Rate)} never send a second message.</strong> It is the largest single loss in
          the account and it happens after the ad has done its job — so no amount of creative testing fixes it.
        </p>
      </div>

      {/* Depth across runs — the quality story */}
      <p className="rowlabel" style={{ marginTop: 20 }}>Chat quality across all six runs</p>
      <table className="tbl">
        <thead>
          <tr><th>Run</th><th>Convos</th><th>Cost each</th><th>Reached msg 2</th><th>Cost per engaged chat</th></tr>
        </thead>
        <tbody>
          {RUNS.map(r => {
            const eng = r.spend / r.depth2
            const rate = (r.depth2 / r.convos) * 100
            return (
              <tr key={r.id} style={r.current ? { background: 'var(--clay-tint)' } : undefined}>
                <td data-label="Run">
                  <strong>{r.id}</strong> <span style={{ fontSize: 12, color: 'var(--dim)' }}>{r.label}</span>
                  {r.current && <> <span className="pill active">now</span></>}
                </td>
                <td data-label="Convos">{r.convos}</td>
                <td data-label="Cost each">{money(r.spend / r.convos)}</td>
                <td data-label="Msg 2">
                  {r.depth2} <span style={{ color: 'var(--dim)', fontSize: 12 }}>({pct(rate)})</span>
                  <div aria-hidden="true" style={{
                    height: 3, marginTop: 4, borderRadius: 2, background: 'var(--clay)',
                    width: Math.max(2, Math.round(rate)) + '%',
                  }} />
                </td>
                <td data-label="Cost / engaged">
                  <span className={`pill ${eng < 25 ? 'won' : eng < 80 ? 'pending' : 'overdue'}`}>{money(eng)}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Note>
        Run D bought {RUNS[3].convos} conversations at {money(RUNS[3].spend / RUNS[3].convos)} each — the cheapest
        ever — and {pct((RUNS[3].depth2 / RUNS[3].convos) * 100)} of them went anywhere, making it the most
        expensive run in the account at {money(RUNS[3].spend / RUNS[3].depth2)} per engaged chat. Cheap
        conversations are not the same as good ones.
      </Note>

      <Note>
        A naming trap worth knowing: Meta&rsquo;s <code>messaging_first_reply</code> ({t.newConnections}) is
        &ldquo;New messaging connections&rdquo; — people who had never messaged you before. It counts first-time
        contacts, not replies from either side, and says nothing about your auto-reply.
      </Note>

      {/* ── Who responds ─────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Who is actually responding</p>
      <div className="cols">
        <div className="col">
          <h3>By age</h3>
          <Breakdown rows={S.ages} head="Age" />
        </div>
        <div className="col">
          <h3>By gender</h3>
          <Breakdown rows={S.genders} head="Who" />
          <h3 style={{ marginTop: 14 }}>By area</h3>
          <Breakdown rows={S.regions} head="Region" unit="Connections" showDepth />
        </div>
      </div>

      <div className="cols" style={{ marginTop: 12 }}>
        <div className="col">
          <div className="kc">
            <p className="t"><strong>{best.label} is your money segment</strong></p>
            <p className="s">
              {best.convos} of {t.convos} conversations — {pct((best.convos / t.convos) * 100)} of all results —
              at {money(best.spend / best.convos)} each, the best of any age band. Meta&rsquo;s Advantage Audience
              found them; your interest targeting did not aim there.
            </p>
          </div>
        </div>
        <div className="col">
          <div className="kc">
            <p className="t"><strong>Men convert {pct((1 - (men.spend / men.convos) / (women.spend / women.convos)) * 100)} cheaper</strong></p>
            <p className="s">
              {money(men.spend / men.convos)} against {money(women.spend / women.convos)} for women — yet men take
              only {pct((men.spend / t.spend) * 100)} of the budget. Splitting them into their own ad set stops the
              algorithm under-bidding on them.
            </p>
          </div>
        </div>
      </div>

      <Note>
        Region rows use Meta&rsquo;s <code>total_messaging_connection</code> ({t.totalConnections}) rather than
        conversations-started ({t.convos}), because Meta does not return the latter split by region. Close, but
        not the same metric — do not add these to the age or gender tables.
      </Note>

      <p className="hint" style={{ marginTop: 22 }}>
        Source: Meta Marketing API via Composio, account {S.account.id}, pulled {S.pulledAt}.
        Reach this run: {num(t.reach)} people at {t.frequency.toFixed(2)} average frequency.
      </p>
    </>
  )
}
