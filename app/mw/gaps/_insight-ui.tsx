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
  englishVsLocal, EXPECTED_LANGUAGE, moneyLine, trend,
  type InsightKeyword, type Money, type Point,
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

/** A line, or a plain statement that there is not enough to draw one. */
function Spark({ label, t }: { label: string; t: { points: { cycle: string; value: number }[]; enough: boolean } }) {
  if (!t.enough) {
    return (
      <p className="mw-spark-none">
        <b>{label}</b> — {t.points.length === 1
          ? `first cycle stored (${n(t.points[0].value)}). A line appears next month.`
          : 'nothing stored yet.'}
      </p>
    )
  }
  const vals = t.points.map(p => p.value)
  const max = Math.max(...vals, 1)
  const last = vals[vals.length - 1]
  const first = vals[0]
  const w = 100, h = 22
  const d = t.points.map((p, i) => {
    const x = (i / (t.points.length - 1)) * w
    const y = h - (p.value / max) * h
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <p className="mw-spark">
      <b>{label}</b>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img"
        aria-label={`${label}: ${t.points.map(p => `${p.cycle} ${n(p.value)}`).join(', ')}`}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <span data-dir={last >= first ? 'up' : 'down'}>
        {n(first)} → {n(last)}
      </span>
    </p>
  )
}

export function MarketInsight({
  country, keywords, pages, gap, money, history = [],
}: {
  country: Country
  keywords: InsightKeyword[]
  pages: string[]
  gap?: { raw: number; kept: number; topics: number } | null
  money?: Money | null
  history?: Point[]
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
  const ev = englishVsLocal(keywords)
  const expected = EXPECTED_LANGUAGE[country.key] ?? null
  const evMax = Math.max(ev.english.impressions, ...ev.local.map(l => l.impressions), 1)
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
        Counted from searches <b>we are shown for</b>, not from everything the market searches.{' '}
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
              {/* THE BARE NUMBER WAS UNREADABLE. It showed "32" beside
                  "2 searches · 0 clicked", and nothing said 32 was impressions
                  — so it looked like a count that contradicted the 2. Every
                  figure is now named where it sits. */}
              {bs.map(b => (
                <tr key={b.label}>
                  <th scope="row">{b.label}</th>
                  <td className="w"><Bar value={b.impressions} max={bMax} tone={b.from <= 10 ? 'good' : b.from >= 31 ? 'bad' : undefined} /></td>
                  <td className="eg">
                    <b>{n(b.impressions)}</b> times shown · {b.queries} {b.queries === 1 ? 'search' : 'searches'} · {n(b.clicks)} clicked
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="mw-insight-grid">
        <section>
          <h4>English, or the local language</h4>
          {/* NOT WHAT THE MARKET SEARCHES. WHAT WE ARE FOUND FOR.
              Built from our own Search Console rows, which only contain
              searches we ALREADY appear for — our site is in English, so they
              are English. Japan read 100% English here, and when it was pulled
              against Japanese-language competitors 9,163 keywords came back.
              A low local share means we are invisible in that language, not
              that nobody searches it. */}
          <table className="mw-ib">
            <tbody>
              <tr>
                <th scope="row">English</th>
                <td className="w"><Bar value={ev.english.impressions} max={evMax} /></td>
                <td className="num">{pct(ev.english.share)}</td>
                <td className="eg">{n(ev.english.impressions)} shown</td>
              </tr>
              {ev.local.map(l => (
                <tr key={l.language}>
                  <th scope="row">{l.language}</th>
                  <td className="w"><Bar value={l.impressions} max={evMax} tone="place" /></td>
                  <td className="num">{pct(l.share)}</td>
                  <td className="eg">{l.sample[0] ? `“${l.sample[0]}”` : `${n(l.impressions)} shown`}</td>
                </tr>
              ))}
              {ev.local.length === 0 && expected && (
                <tr>
                  <th scope="row">{expected}</th>
                  <td className="w"><Bar value={0} max={evMax} tone="place" /></td>
                  <td className="num">0%</td>
                  <td className="eg">we are found for none of it</td>
                </tr>
              )}
            </tbody>
          </table>
          {expected && ev.localShare < 0.1 && (
            <p className="mw-insight-money">
              We are found almost entirely in English here, while this market also searches
              in {expected}. That is a blind spot in our own data, not proof the demand is absent —
              the gap has to be pulled against {expected}-language competitors to see it.
            </p>
          )}
        </section>

        <section>
          <h4>What it turns into</h4>
          {money ? (
            <>
              <p className="mw-insight-money">{moneyLine(money, country)}</p>
              <table className="mw-ib">
                <tbody>
                  <tr>
                    <th scope="row">Sessions</th>
                    <td className="num">{n(money.sessions)}</td>
                    <td className="eg">{money.prevSessions !== null ? `was ${n(money.prevSessions)}` : 'first cycle'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Enquiries</th>
                    <td className="num">{n(money.leads)}</td>
                    <td className="eg">{money.prevLeads !== null ? `was ${n(money.prevLeads)}` : 'first cycle'}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <p className="eg">No analytics stored for {country.label} this cycle.</p>
          )}
        </section>

        <section>
          <h4>Over time</h4>
          {/* Two points is the minimum that means anything. Search Console has
              been stored for one cycle, so drawing impressions today would be
              a single dot pretending to be a line. */}
          <Spark label="Sessions" t={trend(history, 'sessions')} />
          <Spark label="Enquiries" t={trend(history, 'leads')} />
          <Spark label="Times shown" t={trend(history, 'impressions')} />
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
