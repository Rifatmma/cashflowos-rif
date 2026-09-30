import Link from 'next/link'
import type { MarketSeo } from '@/lib/mw-market-data'
import type { ThemeRoll } from '@/lib/mw-themes'
import { rollSummary } from '@/lib/mw-themes'
import { num } from '@/lib/mw-data'

// 👉 The SEO tab, by market.
//
// Every section used to show India and Malaysia because the numbers were
// hand-written once. They now come from mw_market_seo, one row per country
// per cycle, so the same section can be rendered for whichever market the
// reader picks. Tabs are plain links and the page re-renders on the server:
// no client JS, which is how the rest of /mw works and why it loads on a
// phone on bad wifi (owner, 29 Sep 2026).

export function MarketTabs({ all, active, section }: { all: MarketSeo[]; active: string; section: string }) {
  return (
    <div className="mw-mtabs">
      {all.map(m => (
        <Link key={m.market.key}
          href={`/mw/seo?${section}=${m.market.key}#${section}`}
          aria-current={active === m.market.key ? 'page' : undefined}>
          {m.market.label}
          <small>{m.market.owner ?? 'no owner'}</small>
        </Link>
      ))}
    </div>
  )
}

/** Brand against everything else — the only half that grows the business. */
export function BrandByMarket({ m }: { m: MarketSeo }) {
  if (!m.keywords.length) {
    return <p className="lede">No ranking data for {m.market.label} this cycle, so there is nothing to split.</p>
  }
  const b = Math.max(0, Math.min(100, m.brandPct))
  return (
    <>
      <div className="mw-split">
        <div className="mw-split-bar">
          <i className="brand" style={{ width: `${b}%` }} />
          <i className="non" style={{ width: `${100 - b}%` }} />
        </div>
        <div className="mw-split-key">
          <span><b className="brand" /> Brand {m.brandPct}% · {num(m.brandTraffic)} visits</span>
          <span><b className="non" /> Non-brand {m.nonBrandPct}% · {num(m.nonBrandTraffic)} visits</span>
        </div>
      </div>
      <p className="lede" style={{ marginTop: 12 }}>
        {m.nonBrandPct < 25 ? (
          <><strong>Almost all of {m.market.label}&rsquo;s organic traffic is people typing our name.</strong>{' '}
            Those visitors would have found us anyway. Only the {m.nonBrandPct}% non-brand share is new
            demand, and that is the number to grow.</>
        ) : m.nonBrandPct < 60 ? (
          <><strong>{m.market.label} earns {m.nonBrandPct}% of its organic traffic from people who were not
            looking for us by name.</strong> That is a working market — the job is to widen it.</>
        ) : (
          <><strong>{m.market.label} is mostly non-brand at {m.nonBrandPct}%.</strong> The content is doing
            the work here rather than the name.</>
        )}
      </p>
    </>
  )
}

/** Ranking 4-30 with real demand: the list worth an afternoon. */
export function OpportunitiesByMarket({ m }: { m: MarketSeo }) {
  if (!m.opportunities.length) {
    return <p className="lede">Nothing in striking distance for {m.market.label} this cycle — either we rank on page one already, or we do not rank at all and the work is a new page.</p>
  }
  return (
    <>
      <table className="mw-kw wide">
        <thead>
          <tr>
            <th>Search</th><th className="num">Position</th><th className="num">Searches/mo</th>
            <th className="num">Difficulty</th><th className="num">Paid CPC</th><th>Page that ranks</th>
          </tr>
        </thead>
        <tbody>
          {m.opportunities.map((k, i) => (
            <tr key={`${k.q}-${i}`}>
              <td>{k.q}</td>
              <td className="num">#{k.pos.toFixed(0)}</td>
              <td className="num">{num(k.vol)}</td>
              <td className="num"><span className={`mw-kd ${k.kd < 20 ? 'easy' : k.kd < 40 ? 'mid' : 'hard'}`}>{k.kd.toFixed(0)}</span></td>
              <td className="num">{k.cpc > 0 ? `$${k.cpc.toFixed(2)}` : '—'}</td>
              <td className="path">{k.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lede" style={{ marginTop: 12 }}>
        Difficulty is Semrush&rsquo;s 0&ndash;100 estimate of how hard the first page is;{' '}
        <span className="mw-kd easy">under 20</span> is usually a rewrite rather than a campaign. Paid CPC is
        what a click costs to buy — it is here to show what the ranking is worth, not to compare the channels.
      </p>
      {m.offTopic.count > 0 && (
        <p className="lede" style={{ marginTop: 10 }}>
          <strong>Left out: {m.offTopic.count} searches worth {num(m.offTopic.vol)} a month that are not our
            business at all</strong> — {m.offTopic.sample.map(s => `“${s}”`).join(', ')}. Our name catches
          wall-decorating and building traffic, which inflates the keyword count and tells Google the site is
          about something it is not. They are excluded from the list above on purpose; nobody should spend a
          day on them.
        </p>
      )}
    </>
  )
}

/** Who else is winning the same searches in this market. */
export function CompetitorsByMarket({ m }: { m: MarketSeo }) {
  if (!m.competitors.length) {
    return (
      <p className="lede">
        No competitor pull stored for {m.market.label} yet. It is one extra Semrush call per market and runs
        with the weekly pull once it is switched on.
      </p>
    )
  }
  const max = Math.max(...m.competitors.map(c => c.traffic), 1)
  return (
    <table className="mw-kw wide">
      <thead><tr><th>Domain</th><th className="num">Shared searches</th><th className="num">Their keywords</th><th>Their traffic</th></tr></thead>
      <tbody>
        {m.competitors.map(c => (
          <tr key={c.domain}>
            <td>{c.domain}</td>
            <td className="num">{num(c.common)}</td>
            <td className="num">{num(c.keywords)}</td>
            <td>
              <span className="mw-minibar"><i style={{ width: `${(c.traffic / max) * 100}%` }} /></span>
              <span className="mw-minibar-n">{num(c.traffic)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Dinesh's board: what is wrong with the pages that are already live. */
export function PageHealthBoard({ all }: { all: MarketSeo[] }) {
  const rows = all.flatMap(m => m.health.map(h => ({ ...h, market: m.market.label })))
    .sort((a, b) => a.score - b.score)
  if (!rows.length) return <p className="lede">No pages audited yet.</p>
  const bad = rows.filter(r => r.band === 'bad').length
  const warn = rows.filter(r => r.band === 'warn').length
  const worse = rows.filter(r => r.worse)
  return (
    <>
      <p className="lede" style={{ marginBottom: worse.length ? 10 : 14 }}>
        Read straight from the live pages — no API and nobody&rsquo;s permission needed, so this is the one
        source that cannot stop working. Re-read every day while the plan itself is rebuilt monthly, so a page
        that breaks between plans shows up here the next morning. {rows.length} location pages checked:{' '}
        <b>{bad} need real work</b>, {warn} have something small, {rows.length - bad - warn} are clean.
      </p>
      {worse.length > 0 && (
        <p className="mw-waits" style={{ marginBottom: 14 }}>
          <b>{worse.length} {worse.length === 1 ? 'page has' : 'pages have'} got worse since this month&rsquo;s plan was built:</b>{' '}
          {worse.map(w => `${w.url}${w.was !== null ? ` (${w.was} → ${w.score})` : ''}`).join(', ')}. That is a
          regression, not a backlog item — worth fixing before anything else on this board.
        </p>
      )}
      <div className="mw-health">
        {rows.map(r => (
          <div className={`mw-health-row ${r.band}${r.worse ? ' worse' : ''}`} key={r.url}>
            <span className="score">{r.score}</span>
            <span className="path">
              <b>{r.url}</b>
              <small>{r.market}{r.top ? ` — ${r.top}` : ' — clean'}</small>
            </span>
            <span className="n">
              {r.worse && <b className="drop">worse</b>}
              {r.faults ? ` ${r.faults} to fix` : ' ok'}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

/** Markets that get attention and produce no enquiries. */
export function FunnelLeaks({ all }: { all: MarketSeo[] }) {
  const rows = all.filter(m => m.sessions > 0)
    .map(m => ({
      label: m.market.label, owner: m.market.owner, sessions: m.sessions, leads: m.leads, cvr: m.cvr,
    }))
    .sort((a, b) => b.sessions - a.sessions)
  if (!rows.length) return <p className="lede">No analytics by market this cycle.</p>
  const dry = rows.filter(r => r.sessions >= 100 && r.leads === 0)
  const max = Math.max(...rows.map(r => r.sessions), 1)
  return (
    <>
      <div className="mw-leak">
        {rows.map(r => (
          <div className={`mw-leak-row ${r.leads === 0 && r.sessions >= 100 ? 'dry' : ''}`} key={r.label}>
            <span className="who"><b>{r.label}</b><small>{r.owner ?? 'no owner'}</small></span>
            <span className="bar"><i style={{ width: `${(r.sessions / max) * 100}%` }} /></span>
            <span className="n">{num(r.sessions)} sessions</span>
            <span className={`lead ${r.leads === 0 ? 'zero' : ''}`}>
              {r.leads === 0 ? 'no enquiries' : `${r.leads} lead${r.leads === 1 ? '' : 's'} · ${r.cvr}%`}
            </span>
          </div>
        ))}
      </div>
      {dry.length > 0 && (
        <p className="lede" style={{ marginTop: 14 }}>
          <strong>{dry.map(d => d.label).join(', ')} {dry.length === 1 ? 'brings' : 'bring'} real traffic and
            not one enquiry.</strong> More traffic will not fix that — the page is not converting what it
          already gets. Those are on the market plan as their own task.
        </p>
      )}
    </>
  )
}

/**
 * Where we already rank well. Rif's point: a lead writing new content must
 * not quietly lose the positions the page already holds (owner, 29 Sep 2026).
 */
export function WinningByMarket({ m }: { m: MarketSeo }) {
  if (!m.winning.length) {
    return (
      <p className="lede">
        {m.market.label} does not rank in the top ten for any non-brand search yet. Everything here is still
        to win — the opportunity list above is where it starts.
      </p>
    )
  }
  const visits = m.winning.reduce((t, k) => t + k.traffic, 0)
  const top3 = m.winning.filter(k => k.pos <= 3).length
  return (
    <>
      <table className="mw-kw wide">
        <thead>
          <tr>
            <th>Search</th><th className="num">Position</th><th className="num">Searches/mo</th>
            <th className="num">Our visits</th><th className="num">Paid CPC</th><th>Page that ranks</th>
          </tr>
        </thead>
        <tbody>
          {m.winning.map((k, i) => (
            <tr key={`${k.q}-${i}`}>
              <td>{k.q}</td>
              <td className="num"><span className={`mw-rank ${k.pos <= 3 ? 'top' : 'good'}`}>#{k.pos.toFixed(0)}</span></td>
              <td className="num">{num(k.vol)}</td>
              <td className="num">{k.traffic ? num(k.traffic) : '—'}</td>
              <td className="num">{k.cpc > 0 ? `$${k.cpc.toFixed(2)}` : '—'}</td>
              <td className="path">{k.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lede" style={{ marginTop: 12 }}>
        <strong>{m.winning.length} non-brand {m.winning.length === 1 ? 'search is' : 'searches are'} already in the top ten{top3 > 0 && `, ${top3} of them in the top three`}</strong>
        {visits > 0 && <> — worth about {num(visits)} visits a month</>}. This is ground we hold, and it is
        the easiest thing in SEO to lose by accident. Every rewrite task in the market plan now lists the
        rankings its page already has, so the lead adds to the page without writing over what works.
      </p>
    </>
  )
}

/** What moved since the previous pull. */
export function Momentum({ m }: { m: MarketSeo }) {
  const { up, down, fresh, unknown } = m.movers
  if (unknown) {
    return (
      <p className="lede">
        No previous positions stored for {m.market.label} yet, so there is nothing to compare against. This is
        not &ldquo;nothing moved&rdquo; — it is the first pull that recorded history for this market, and
        gains and losses appear from the next one.
      </p>
    )
  }
  if (!up.length && !down.length && !fresh.length) {
    return (
      <p className="lede">
        Every tracked search in {m.market.label} holds the position it had at the last pull — nothing gained,
        nothing lost, nothing new.
      </p>
    )
  }
  const Group = ({ title, rows, dir }: { title: string; rows: typeof up; dir: 'up' | 'down' | 'new' }) =>
    rows.length ? (
      <div className="mw-move-col">
        <p className="eyebrow">{title}</p>
        <ul className={`mw-move ${dir}`}>
          {rows.map((k, i) => (
            <li key={`${k.q}-${i}`}>
              <span className="q">{k.q}</span>
              <span className="d">
                {dir === 'new' ? `new at #${k.pos.toFixed(0)}` : `#${k.prev.toFixed(0)} → #${k.pos.toFixed(0)}`}
              </span>
              <small>{num(k.vol)}/mo</small>
            </li>
          ))}
        </ul>
      </div>
    ) : null
  return (
    <div className="mw-move-grid">
      <Group title="Gained" rows={up} dir="up" />
      <Group title="Slipped" rows={down} dir="down" />
      <Group title="New" rows={fresh} dir="new" />
    </div>
  )
}

/** The chain: one SEO action, the market tasks under it, and who still owes what. */
export function ThemeChain({ rolls }: { rolls: ThemeRoll[] }) {
  const live = rolls.filter(r => r.state !== 'empty')
  if (!live.length) {
    return <p className="lede">No SEO actions this cycle — nothing in the data warranted one.</p>
  }
  return (
    <div className="mw-chain">
      {live.map(r => (
        <details className={`mw-theme is-${r.state}`} key={r.theme.key}>
          <summary>
            <span className={`mw-pill is-${r.state}`}>
              {r.state === 'done' ? 'Closed' : r.state === 'blocked' ? 'Held up' : `${r.pct}%`}
            </span>
            <span className="mw-theme-main">
              <b>{r.theme.title}</b>
              <small>{rollSummary(r)}</small>
            </span>
            <span className="mw-theme-bar">
              <i style={{ width: `${r.pct}%` }} />
            </span>
          </summary>
          <div className="mw-theme-body">
            <p className="mw-why">{r.theme.why}</p>
            <p className="mw-done-when"><b>Closes when:</b> {r.theme.doneWhen}</p>

            <h4>Who has to move, and how much</h4>
            <div className="mw-theme-owners">
              {r.owners.map(o => (
                <div className="mw-theme-owner" key={o.owner}>
                  <b>{o.owner}</b>
                  <span>
                    {o.open > 0 && <em>{o.open} to do</em>}
                    {o.done > 0 && <i className="ok">{o.done} done</i>}
                    {o.declined > 0 && <i className="no">{o.declined} declined</i>}
                  </span>
                </div>
              ))}
            </div>

            <h4>The tasks underneath</h4>
            <ul className="mw-theme-tasks">
              {r.children.map(c => (
                <li key={c.id} className={c.choice === 'done' || c.status === 'done' ? 'done' : c.choice === 'reject' ? 'no' : ''}>
                  <span className="dot" />
                  <span className="t">
                    <b>{c.title}</b>
                    <small>{c.marketLabel} · {c.owner ?? 'no owner'}</small>
                  </span>
                  <span className="s">
                    {c.choice === 'done' || c.status === 'done' ? 'done'
                      : c.choice === 'reject' ? `declined${c.declineReason ? ` — “${c.declineReason}”` : ''}`
                        : c.choice === 'accept' ? 'accepted' : 'no answer yet'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="lede" style={{ marginTop: 10 }}>
              <Link href={`/mw/plan?theme=${r.theme.key}`}>Open these in the market plan</Link> to read the
              full instructions and record a decision.
            </p>
          </div>
        </details>
      ))}
    </div>
  )
}

/**
 * The short version of the content gap. The working surface is /mw/gaps —
 * this is three lines per market so it is visible from the SEO scan without
 * turning that page into a research tool (owner, 29 Sep 2026).
 */
export function GapSummary({ rows }: {
  rows: { label: string; owner: string | null; country: string; topics: number; vol: number; top: string[] }[]
}) {
  if (!rows.length) {
    return (
      <p className="lede">
        No competitors named yet, so there is nothing to measure against.{' '}
        <Link href="/mw/gaps">Name three or four real rivals per market</Link> and the next quarterly pull
        fills this in. It is deliberately your list rather than Semrush&rsquo;s — its suggestions for India
        were two industry associations.
      </p>
    )
  }
  return (
    <>
      <div className="mw-gapsum">
        {rows.map(r => (
          <div className="mw-gapsum-row" key={r.country}>
            <span className="who"><b>{r.label}</b><small>{r.owner ?? 'no owner'}</small></span>
            <span className="top">
              {r.topics ? <>Biggest: {r.top.map(t => `“${t}”`).join(', ')}</> : 'nothing worth a page this quarter'}
            </span>
            <span className="n">{r.topics ? `${r.topics} pages · ${num(r.vol)}/mo` : '—'}</span>
          </div>
        ))}
      </div>
      <p className="lede" style={{ marginTop: 12 }}>
        <Link href="/mw/gaps">Open the content gap</Link> for the searches behind each one and what to write.
      </p>
    </>
  )
}
