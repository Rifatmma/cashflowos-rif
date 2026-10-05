import type { Verdict, AuctionSummary } from '@/lib/mw-auction'

// The auction report. Server component, like the rest of /mw.

const CAUSE: Record<Verdict['cause'], { label: string; tone: string }> = {
  budget: { label: 'Capped by budget', tone: 'warn' },
  rank: { label: 'Losing on rank', tone: 'bad' },
  mixed: { label: 'Both', tone: 'warn' },
  winning: { label: 'Winning', tone: 'good' },
  unknown: { label: 'Not reported', tone: 'dim' },
}

const bar = (v: number | null) => `${Math.max(0, Math.min(100, v ?? 0))}%`

export function AuctionBand({ s }: { s: AuctionSummary }) {
  if (s.impressionShare === null) return null
  return (
    <>
      {/* One bar for the whole account: what we won, what money cost us, what
          competition cost us. Three numbers that sum to 100 are far easier to
          argue with than three separate percentages. */}
      <div className="mw-share">
        <span className="won" style={{ width: bar(s.impressionShare) }} title={`Won ${s.impressionShare}%`} />
        <span className="budget" style={{ width: bar(s.lostToBudget) }} title={`Lost to budget ${s.lostToBudget}%`} />
        <span className="rank" style={{ width: bar(s.lostToRank) }} title={`Lost to rank ${s.lostToRank}%`} />
      </div>
      <div className="mw-share-key">
        <span><i className="won" /> Won <b>{s.impressionShare}%</b></span>
        <span><i className="budget" /> Lost to budget <b>{s.lostToBudget}%</b></span>
        <span><i className="rank" /> Lost to rank <b>{s.lostToRank}%</b></span>
      </div>
      <p className="lede" style={{ marginTop: 12 }}>
        {s.headline} Roughly <b>{s.missed.toLocaleString('en-US')}</b> more impressions were
        available in the auctions we entered. Weighted by impressions, so a small campaign cannot
        swing the figure.
      </p>
    </>
  )
}

export function AuctionTable({ rows }: { rows: Verdict[] }) {
  if (!rows.length) return <p className="lede">No campaign reported impression share this month.</p>
  return (
    <div className="mw-scroll-x">
      <table className="mw-kw wide">
        <thead>
          <tr>
            <th>Campaign</th>
            <th className="num">Shown on</th>
            <th className="num">Lost: budget</th>
            <th className="num">Lost: rank</th>
            <th className="num">Top of page</th>
            <th className="num">vs last month</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(v => {
            const r = v.row
            const p = (x: number | null) => (x === null ? '—' : `${Math.round(x * 1000) / 10}%`)
            const c = CAUSE[v.cause]
            return (
              <tr key={r.name}>
                <td><b>{r.name}</b><small> · {r.impressions.toLocaleString('en-US')} impressions</small></td>
                <td className="num">{p(r.is)}</td>
                <td className="num">{(r.lostBudget ?? 0) >= 0.15 ? <b className="mw-warn">{p(r.lostBudget)}</b> : p(r.lostBudget)}</td>
                <td className="num">{(r.lostRank ?? 0) >= 0.35 ? <b className="mw-bad">{p(r.lostRank)}</b> : p(r.lostRank)}</td>
                <td className="num">{p(r.top)}</td>
                <td className="num">
                  {v.shift === null ? '—'
                    : <span className={v.shift >= 0 ? 'mw-up' : 'mw-dn'}>{v.shift > 0 ? '+' : ''}{v.shift}pt</span>}
                </td>
                <td><i className={`mw-tag ${c.tone}`}>{c.label}</i></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** What to actually do, worst first. */
export function AuctionActions({ rows }: { rows: Verdict[] }) {
  const worth = rows.filter(v => v.cause === 'budget' || v.cause === 'rank' || v.cause === 'mixed')
  if (!worth.length) return <p className="lede">Nothing needs changing — every campaign is showing on most of its auctions.</p>
  return (
    <>
      {worth.map(v => (
        <details className={`mw-lead is-${v.cause === 'rank' ? 'late' : 'ok'}`} key={v.row.name}>
          <summary>
            <span className={`mw-rt ${v.cause === 'rank' ? 'late' : 'ok'}`}>{CAUSE[v.cause].label}</span>
            <span className="mw-task-main">
              <b>{v.row.name}</b>
              <small>{v.finding}</small>
            </span>
          </summary>
          <div className="mw-task-body">
            <p className="mw-waits"><b>Do this.</b> {v.action}</p>
            <div className="mw-lead-facts">
              <span><b>Impressions now</b> {v.row.impressions.toLocaleString('en-US')}</span>
              <span><b>Available</b> ~{v.upside.toLocaleString('en-US')} more</span>
              <span><b>Clicks</b> {v.row.clicks.toLocaleString('en-US')}</span>
              <span><b>Exact-match share</b> {v.row.exact === null ? '—' : `${Math.round(v.row.exact * 1000) / 10}%`}</span>
            </div>
          </div>
        </details>
      ))}
      <p className="lede" style={{ marginTop: 14 }}>
        <b>Why the two causes need opposite answers.</b> Lost to budget means the money ran out
        before the day did — the campaign works, there is just less of it than the market wants.
        Lost to rank means we were in the auction and beaten on bid or on quality; adding budget
        there spends more to lose more. Rank is bid × quality, and quality is the half that costs
        nothing.
      </p>
    </>
  )
}
