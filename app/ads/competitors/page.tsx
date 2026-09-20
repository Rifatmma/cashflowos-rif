// 👉 Facebook Ads → Competitors. Who else in the niche is advertising, what
// they say, and how your numbers sit against published category benchmarks.
import { SNAPSHOT as S, COMPETITORS, POSITIONING, CURRENT } from '@/lib/ads-snapshot'
import { SubNav, Note, money, pct } from '../_ui'

export const dynamic = 'force-dynamic'

export default async function Competitors() {
  const t = S.totals
  const b = S.benchmarks
  const costPerConvo = t.spend / t.convos
  // Where you sit in the Malaysian click-to-WhatsApp band: 0% cheap, 100% dear.
  const bandPos = Math.min(100, Math.max(0,
    ((costPerConvo - b.costPerConvoMYR.low) / (b.costPerConvoMYR.high - b.costPerConvoMYR.low)) * 100))

  const advertising = COMPETITORS.filter(c => c.status === 'Active ads').length
  const notAdvertising = COMPETITORS.filter(c => c.status === 'No ads').length

  return (
    <>
      <h1 className="ph">Facebook Ads — Competitors 🔍</h1>
      <p className="cap">Who is advertising in your niche, what they lead with, and how your costs compare.</p>
      <SubNav here="/ads/competitors" />

      <div className="banner info">
        <strong>What the Ad Library can and cannot tell you.</strong> It shows what a competitor is
        <em> running</em> — creative, copy, CTA, and how long each ad has been live. It does not show spend,
        CTR or cost per result: that is private to every account and no tool can reach it.
        <strong> Ad longevity is the one public signal worth reading</strong> — nobody keeps paying for an
        ad that does not work.
      </div>

      <div className="grid">
        <Stat2 label="Competitors checked" value={COMPETITORS.length} />
        <Stat2 label="Actually advertising" value={advertising} />
        <Stat2 label="Running no ads at all" value={notAdvertising} />
        <Stat2 label="Leading with a discount" value="Only you" />
      </div>

      <p className="rowlabel" style={{ marginTop: 26 }}>The set</p>
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
          <tr style={{ background: 'var(--clay-tint)' }}>
            <td data-label="Who"><strong>{S.account.name} (you)</strong></td>
            <td data-label="Where">{S.offer.venue}</td>
            <td data-label="Advertising?">
              <span className="pill active">Active ads</span>
              <br /><span style={{ fontSize: 12, color: 'var(--dim)' }}>{money(t.spend)} this run</span>
            </td>
            <td data-label="Leads with">Price — {money(S.offer.price)} + free {S.offer.freeItem}</td>
            <td data-label="CTA">Click-to-WhatsApp</td>
          </tr>
        </tbody>
      </table>

      <p className="rowlabel" style={{ marginTop: 20 }}>What each one is actually doing</p>
      <div className="cols">
        <div className="col">
          {COMPETITORS.slice(0, 3).map(c => (
            <div className="kc" key={c.name}>
              <p className="t"><strong>{c.name}</strong> <span style={{ fontSize: 12, color: 'var(--dim)' }}>{c.where}</span></p>
              <p className="s">{c.note}</p>
            </div>
          ))}
        </div>
        <div className="col">
          {COMPETITORS.slice(3).map(c => (
            <div className="kc" key={c.name}>
              <p className="t"><strong>{c.name}</strong> <span style={{ fontSize: 12, color: 'var(--dim)' }}>{c.where}</span></p>
              <p className="s">{c.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="banner warn" style={{ marginTop: 14 }}>
        <strong>{POSITIONING.headline}</strong> {POSITIONING.body}
      </div>

      {/* ── Benchmarks ───────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>How your numbers compare to the category</p>
      <Note>
        No rival&rsquo;s cost per result is obtainable, so this is you against published category averages —
        the honest version of the same question.
      </Note>

      <table className="tbl" style={{ marginTop: 10 }}>
        <thead><tr><th>Metric</th><th>You (run {CURRENT.id})</th><th>Category</th><th>Read</th></tr></thead>
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
            <td data-label="Read"><span className="pill pending">At the top end</span></td>
          </tr>
        </tbody>
      </table>

      <div className="kc" style={{ marginTop: 12 }}>
        <p className="t"><strong>Malaysian click-to-WhatsApp band</strong></p>
        <div style={{
          position: 'relative', height: 8, borderRadius: 999, margin: '12px 0 6px',
          background: 'linear-gradient(90deg, rgba(75,122,90,.35), rgba(182,128,42,.35), rgba(169,83,63,.35))',
        }}>
          <div aria-hidden="true" style={{
            position: 'absolute', top: -4, left: `calc(${bandPos}% - 8px)`,
            width: 16, height: 16, borderRadius: 999, background: 'var(--clay)', border: '2px solid var(--card)',
          }} />
        </div>
        <p className="s">
          RM {b.costPerConvoMYR.low} ← you are at {money(costPerConvo)} → RM {b.costPerConvoMYR.high}.
          Source: {b.costPerConvoMYR.source}.
        </p>
      </div>

      <Note>
        CPC and CPM benchmarks are USD figures from largely US accounts, converted at ~{b.usdMyr}. Malaysian media
        is structurally cheaper, so part of that gap is the market, not your skill — and it makes your CPM sitting
        at the top of the range more concerning, not less. The click-to-WhatsApp band is Malaysian SME data and is
        the comparison worth trusting.
      </Note>

      <p className="hint" style={{ marginTop: 22 }}>
        Competitor data from the public Meta Ad Library, checked {S.pulledAt}. Names supplied by you.
      </p>
    </>
  )
}

// Small local stat card — the shared Stat component is fine but this page only
// needs plain label/value pairs and no link or alert state.
function Stat2({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <p className="l">{label}</p>
      <p className="v">{value}</p>
    </div>
  )
}
