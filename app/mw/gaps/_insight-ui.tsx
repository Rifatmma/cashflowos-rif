// 👉 What kind of market this is, above the list of things to write.
//
// The page used to open with a rival editor and then a list of topics, which
// assumed the lead already knew what they were looking at. They did not, and
// neither did I until I went and read the Americas by hand: 96% of its demand
// is the United States, and it lands on blog posts rather than location pages
// because nobody there searches for a place at all.
//
// So the answer comes first and the list second. Everything here is computed
// from the market's own Search Console rows (lib/mw-market-insight.ts), so a
// market that quietly changes shape says so without anybody noticing first.
//
// Server-rendered, no client JavaScript — same reason as the rest of /mw: it
// is read on a phone, and on the guest tier we ship as little as possible.

import {
  marketKinds, verdictOf, landings, bands, flags, KIND_LABEL,
  type InsightKeyword,
} from '@/lib/mw-market-insight'
import { isBrand, type Country } from '@/lib/mw-markets'

const n = (x: number) => Math.round(x).toLocaleString('en-US')
// Under one percent, a whole number rounds to "0%", which reads as "none" when
// it means "one in twelve hundred". Those are different facts.
const pct = (x: number) => {
  const v = x * 100
  if (v > 0 && v < 1) return `${v.toFixed(2)}%`
  return `${Math.round(v)}%`
}

/** A bar sized against the biggest row, never against the total. */
function Bar({ value, max, tone }: { value: number; max: number; tone?: string }) {
  const w = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0
  return (
    <span className="mw-ibar" aria-hidden="true">
      <i style={{ width: `${w}%` }} data-tone={tone} />
    </span>
  )
}

export function MarketInsight({
  country, keywords, pages, gap,
}: {
  country: Country
  keywords: InsightKeyword[]
  pages: string[]
  gap?: { raw: number; kept: number; topics: number } | null
}) {
  if (!keywords.length) {
    return (
      <p className="lede">
        Nothing is stored yet for {country.label}, so there is nothing to read about it. It fills
        in on the next Search Console pull.
      </p>
    )
  }

  const splits = marketKinds(keywords, country)
  const v = verdictOf(splits, country)
  const land = landings(keywords)
  const bs = bands(keywords)
  const fl = flags({ country, keywords, splits, landing: land, pages, gap })

  // NON-BRAND, like every table below it. The first version counted brand in
  // the headline and excluded it from the bands, so the United States read
  // "14 clicks" above three tables that each said zero — all fourteen were
  // people searching our own name.
  const nonBrand = keywords.filter(k => !isBrand(k.q))
  const impressions = nonBrand.reduce((t, k) => t + (k.impr ?? 0), 0)
  const clicks = nonBrand.reduce((t, k) => t + (k.clicks ?? 0), 0)
  const kMax = Math.max(...splits.map(s => s.impressions), 1)
  const lMax = Math.max(...land.map(l => l.impressions), 1)
  const bMax = Math.max(...bs.map(b => b.impressions), 1)

  return (
    <div className="mw-insight">
      <div className="mw-insight-verdict">
        <h3>{v.headline}</h3>
        <p>{v.says}</p>
      </div>

      <div className="mw-insight-nums">
        <div><b>{n(impressions)}</b><span>times shown a month, non-brand</span></div>
        <div><b>{n(clicks)}</b><span>clicks</span></div>
        <div><b>{pct(impressions > 0 ? clicks / impressions : 0)}</b><span>of what we are shown is clicked</span></div>
        <div><b>{n(nonBrand.filter(k => (k.impr ?? 0) > 0).length)}</b><span>non-brand searches we appear for</span></div>
      </div>

      {/* WHAT THIS IS COUNTED FROM, said plainly.
          mw_market_seo keeps the 200 most-shown searches per country, so a
          click on the long tail is not in here. Without this line the United
          States reads "0 clicks" when the honest statement is "none among the
          192 searches we are shown for most" — a weaker claim, and the true
          one. */}
      <p className="mw-insight-basis">
        From the {n(nonBrand.length)} most-shown non-brand {nonBrand.length === 1 ? 'search' : 'searches'} stored
        for {country.label}. Clicks on rarer searches are not counted here.
      </p>

      <div className="mw-insight-grid">
        <section>
          <h4>What this market asks for</h4>
          {/* Weighted by impressions, not by how many phrases exist: one search
              shown 13,000 times matters more than forty shown once. */}
          <table className="mw-ib">
            <tbody>
              {splits.map(s => (
                <tr key={s.kind}>
                  <th scope="row">{KIND_LABEL[s.kind]}</th>
                  <td className="w"><Bar value={s.impressions} max={kMax} tone={s.kind} /></td>
                  <td className="num">{pct(s.share)}</td>
                  <td className="eg">{s.sample[0] ? `“${s.sample[0]}”` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h4>Where that demand lands</h4>
          <table className="mw-ib">
            <tbody>
              {land.slice(0, 5).map(l => (
                <tr key={l.section}>
                  <th scope="row">{l.section}</th>
                  <td className="w"><Bar value={l.impressions} max={lMax} /></td>
                  <td className="num">{pct(l.share)}</td>
                  <td className="eg">{n(l.impressions)} shown · {n(l.clicks)} clicked</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h4>Where we sit</h4>
          {/* Banded, not averaged. An average of #18 can mean everything sits
              at 18, or half on page one and half on page four — opposite
              problems with opposite fixes. */}
          <table className="mw-ib">
            <tbody>
              {bs.map(b => (
                <tr key={b.label}>
                  <th scope="row">{b.label}</th>
                  <td className="w"><Bar value={b.impressions} max={bMax} tone={b.from <= 10 ? 'good' : b.from >= 31 ? 'bad' : undefined} /></td>
                  <td className="num">{n(b.impressions)}</td>
                  <td className="eg">{b.queries} {b.queries === 1 ? 'search' : 'searches'} · {n(b.clicks)} clicked</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {fl.length > 0 && (
        <ul className="mw-insight-flags">
          {fl.map((f, i) => (
            <li key={i} data-level={f.level}>{f.says}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
