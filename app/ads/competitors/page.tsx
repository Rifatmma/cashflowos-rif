// 👉 Facebook Ads → Competitors.
//
// Who else is advertising in the niche and what they lead with. This part can't
// refresh itself -- the Meta Ad Library isn't part of the ads connection -- so it
// is stamped "checked 20 Sep" and goes red after 30 days. The "you vs the
// category" figures DO come from the daily pull, so they stay current.
import { getAds } from '@/lib/ads-data'
import { SNAPSHOT as S, COMPETITORS, POSITIONING } from '@/lib/ads-snapshot'
import { AdsHeader, Fresh, Card, CompareRows, Fold, Written, money, pct, per, type Cmp } from '../_ui'

export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<string, string> = { 'Active ads': 'good', 'Via platform': 'mid', 'No ads': 'mid' }
const THREAT: Record<string, string> = { Direct: 'Direct rival', Indirect: 'Indirect', 'Model to copy': 'Copy this' }

export default async function Competitors() {
  const { n: d } = await getAds()
  const t = d.totals
  const b = S.benchmarks
  const cpc = per(t.spend, t.convos) ?? 0
  const advertising = COMPETITORS.filter(c => c.status === 'Active ads').length

  // Where you sit in the Malaysian click-to-WhatsApp band: 0% cheap, 100% dear.
  const band = Math.min(100, Math.max(0, ((cpc - b.costPerConvoMYR.low) / (b.costPerConvoMYR.high - b.costPerConvoMYR.low)) * 100))
  const third = band < 33 ? 'lower third' : band < 66 ? 'middle' : 'upper third'
  const catCpc = b.cpcUsdFnb * b.usdMyr
  const catCpm = [b.cpmUsdFnb.low * b.usdMyr, b.cpmUsdFnb.high * b.usdMyr]

  const vsCategory: Cmp[] = [
    { k: 'Cost per chat', now: money(cpc), was: `RM ${b.costPerConvoMYR.low}–${b.costPerConvoMYR.high}`, good: band < 50 },
    { k: 'CTR', now: pct(t.ctr, 2), was: `${b.ctrRestaurant.low}–${b.ctrRestaurant.high}%`, good: t.ctr > b.ctrRestaurant.high },
    { k: 'CPC', now: money(t.cpc), was: `≈ ${money(catCpc)}`, good: t.cpc < catCpc },
    { k: 'CPM', now: money(t.cpm), was: `≈ RM ${Math.round(catCpm[0])}–${Math.round(catCpm[1])}`, good: t.cpm <= catCpm[1] ? null : false },
  ]

  return (
    <div className="co ad">
      <AdsHeader title="Competitors" here="/ads/competitors"
        right={<Fresh at={S.pulledAt + 'T09:00:00+08:00'} verb="checked" staleAfter={30} />} />

      <Card eyebrow="Where you stand">
        <p className="ad-lead">{POSITIONING.headline}</p>
        <div className="ad-chips">
          <span className="ad-chip"><b className="num">{COMPETITORS.length}</b> checked</span>
          <span className="ad-chip"><b className="num">{advertising}</b> advertising</span>
          <span className="ad-chip"><b className="num">{COMPETITORS.length - advertising}</b> not advertising</span>
          <span className="ad-chip ad-chip-hot">Only you lead on price</span>
        </div>
      </Card>

      <p className="ad-section">The set</p>
      {COMPETITORS.map(c => (
        <details key={c.name} className="co-card ad-comp">
          <summary>
            <span className="ad-comp-main">
              <span className="co-rx-name">{c.name}</span>
              <span className="co-rx-sub">{c.where}</span>
            </span>
            <span className={`ad-pill ad-pill-${c.threat === 'Direct' ? 'bad' : c.threat === 'Model to copy' ? 'good' : 'mid'}`}>
              {THREAT[c.threat]}
            </span>
            <span className="ad-chev" aria-hidden="true">›</span>
          </summary>
          <div className="ad-comp-grid">
            <span className="eyebrow">Ads</span>
            <span><span className={`ad-dot ad-dot-${STATUS_TONE[c.status]}`} aria-hidden="true" /> {c.status} · {c.adCount}</span>
            <span className="eyebrow">Leads with</span><span>{c.leadsWith}</span>
            <span className="eyebrow">Asks you to</span><span>{c.cta}</span>
          </div>
          <p className="ad-comp-note">{c.note}</p>
        </details>
      ))}
      <p className="co-meta" style={{ marginTop: 6 }}>Tap one to see what they&rsquo;re doing and why it matters.</p>

      <Card eyebrow="You vs the category">
        <CompareRows rows={vsCategory} nowLabel="You" wasLabel="Category" />
        <div className="ad-band" aria-hidden="true">
          <span className="ad-band-mark" style={{ left: `${band}%` }} />
        </div>
        <div className="co-row co-dim"><span>RM {b.costPerConvoMYR.low}</span><span>you: {money(cpc)} · {third}</span><span>RM {b.costPerConvoMYR.high}</span></div>
        <p className="co-meta">
          The cost-per-chat band is Malaysian small-business click-to-WhatsApp data — the comparison worth trusting.
          CPC and CPM are mostly US figures converted to ringgit, so treat them loosely.
        </p>
      </Card>

      <Fold title="The positioning argument">
        <Written on={S.pulledAt} />
        <p className="ad-body">{POSITIONING.body}</p>
      </Fold>

      <Fold title="What the Ad Library can and can't tell you">
        <p className="ad-body">
          It shows what a competitor is running — the creative, copy, call to action and how long each ad has been
          live. It never shows their spend, click rate or cost per result: that&rsquo;s private to every account and no
          tool can reach it. How long an ad has run is the one public signal worth reading, because nobody keeps
          paying for an ad that doesn&rsquo;t work.
        </p>
      </Fold>

      <p className="ad-source mono">Competitors from the public Meta Ad Library, checked by hand · names supplied by you</p>
    </div>
  )
}
