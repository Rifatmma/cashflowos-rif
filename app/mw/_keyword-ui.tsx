import type { KeywordVerdict, KeywordSummary, PageGroup, Verdict } from '@/lib/mw-keywords'
import type { GeneratedSection } from '@/lib/mw-page-content'
import { DownloadHtml } from './_download-html'

const LABEL: Record<Verdict, { text: string; tone: string }> = {
  converting: { text: 'Earning its place', tone: 'good' },
  'fix-page': { text: 'Fix the page first', tone: 'warn' },
  'fix-ad': { text: 'Fix the ad', tone: 'warn' },
  'fix-ctr': { text: 'Wrong intent', tone: 'warn' },
  'pause-candidate': { text: 'Fair to pause', tone: 'bad' },
  watch: { text: 'Too early', tone: 'dim' },
}

const BAND: Record<string, string> = {
  ABOVE_AVERAGE: 'good', AVERAGE: 'dim', BELOW_AVERAGE: 'bad',
}
const bandWord = (b: string | null) =>
  b === 'ABOVE_AVERAGE' ? 'Above avg' : b === 'BELOW_AVERAGE' ? 'Below avg' : b === 'AVERAGE' ? 'Average' : '—'

const rm = (n: number) => `S$${n.toFixed(2)}`

export function KeywordBand({ s }: { s: KeywordSummary }) {
  return (
    <>
      <p className="lede"><b>{s.headline}</b></p>
      <div className="mw-filters" style={{ marginTop: 12 }}>
        {(Object.keys(LABEL) as Verdict[]).filter(v => s.counts[v] > 0).map(v => (
          <span key={v} className={`mw-tag ${LABEL[v].tone}`} style={{ padding: '6px 14px' }}>
            {LABEL[v].text}: <b>{s.counts[v]}</b> · {rm(s.money[v])}
          </span>
        ))}
      </div>
      {s.pageIsTheProblem && (
        <p className="lede" style={{ marginTop: 14 }}>
          Google scores a keyword on three things: how relevant the ad is, how likely people are to
          click it, and what happens after they do. On this account the first two are mostly fine and
          the third is <b>below average on every keyword Google scores</b>. That is not a keyword
          problem — the ads are winning clicks the website then loses. Pausing these would be pausing
          demand we are failing to serve.
        </p>
      )}
    </>
  )
}

export function KeywordTable({ rows }: { rows: KeywordVerdict[] }) {
  if (!rows.length) return <p className="lede">No keyword has enough traffic to judge yet.</p>
  return (
    <div className="mw-scroll-x">
      <table className="mw-kw wide">
        <thead>
          <tr>
            <th>Keyword</th>
            <th className="num">Cost</th>
            <th className="num">Clicks</th>
            <th className="num">Conv.</th>
            <th className="num">QS</th>
            <th>Ad</th>
            <th>Page</th>
            <th>Exp. CTR</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(v => {
            const r = v.row
            return (
              <tr key={`${r.campaign}-${r.adGroup}-${r.text}`}>
                <td>
                  <b>{r.text}</b>
                  <small> · {r.matchType?.toLowerCase() ?? '—'} · {r.adGroup}</small>
                </td>
                <td className="num">{rm(r.cost)}</td>
                <td className="num">{r.clicks}</td>
                <td className="num">{r.conversions || '—'}</td>
                <td className="num">
                  {r.qs === null ? '—'
                    : <b className={r.qs >= 7 ? 'mw-up' : r.qs <= 4 ? 'mw-dn' : ''}>{r.qs}</b>}
                </td>
                <td><i className={`mw-tag ${BAND[r.adRelevance ?? ''] ?? 'dim'}`}>{bandWord(r.adRelevance)}</i></td>
                <td><i className={`mw-tag ${BAND[r.landingPage ?? ''] ?? 'dim'}`}>{bandWord(r.landingPage)}</i></td>
                <td><i className={`mw-tag ${BAND[r.expectedCtr ?? ''] ?? 'dim'}`}>{bandWord(r.expectedCtr)}</i></td>
                <td><i className={`mw-tag ${LABEL[v.verdict].tone}`}>{LABEL[v.verdict].text}</i></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** The worklist: what to do, in order, with the reasoning open to inspection. */
export function KeywordActions({ rows }: { rows: KeywordVerdict[] }) {
  const worth = rows.filter(v => v.verdict !== 'watch' && v.verdict !== 'converting')
  if (!worth.length) return <p className="lede">Nothing needs a decision. Every keyword with real traffic is converting.</p>
  return (
    <>
      {worth.slice(0, 20).map(v => (
        <details className={`mw-lead is-${v.verdict === 'pause-candidate' ? 'late' : 'ok'}`}
          key={`${v.row.campaign}-${v.row.adGroup}-${v.row.text}`}>
          <summary>
            <span className={`mw-rt ${v.verdict === 'pause-candidate' ? 'late' : 'ok'}`}>{rm(v.row.cost)}</span>
            <span className="mw-task-main">
              <b>{v.row.text}</b>
              <small>{v.finding}</small>
            </span>
            <span className="mw-lead-flags">
              <i className={LABEL[v.verdict].tone === 'bad' ? 'bad' : 'warn'}>{LABEL[v.verdict].text}</i>
            </span>
          </summary>
          <div className="mw-task-body">
            <p className="mw-waits"><b>Do this.</b> {v.action}</p>
            <div className="mw-lead-facts">
              <span><b>Quality score</b> {v.row.qs ?? 'not scored'}</span>
              <span><b>Ad relevance</b> {bandWord(v.row.adRelevance)}</span>
              <span><b>Landing page</b> {bandWord(v.row.landingPage)}</span>
              <span><b>Expected CTR</b> {bandWord(v.row.expectedCtr)}</span>
              <span><b>CTR</b> {(v.row.ctr * 100).toFixed(1)}%</span>
              <span><b>Campaign</b> {v.row.campaign}</span>
            </div>
          </div>
        </details>
      ))}
    </>
  )
}

/** Per landing page: what is wrong with it, and the section that fixes it. */
export function PageFixes({ groups, sections, audits }: {
  groups: PageGroup[]
  sections: Record<string, GeneratedSection>
  audits: Record<string, { score: number; title: string | null; words: number; faults: { says: string; fix: string }[] } | null>
}) {
  if (!groups.length) return <p className="lede">No landing page is currently holding a keyword back.</p>
  return (
    <>
      {groups.map(g => {
        const sec = sections[g.url]
        const a = audits[g.url]
        return (
          <details className="mw-lead is-ok" key={g.url} open={groups.length === 1}>
            <summary>
              <span className="mw-rt ok">{rm(g.cost)}</span>
              <span className="mw-task-main">
                <b>{g.url.replace(/^https?:\/\/(www\.)?/, '')}</b>
                <small>
                  {g.keywords.length} keyword{g.keywords.length > 1 ? 's' : ''} · {g.clicks} clicks ·{' '}
                  {g.conversions} conversion{g.conversions === 1 ? '' : 's'}
                </small>
              </span>
            </summary>
            <div className="mw-task-body">
              <h4>What this page is being paid to answer</h4>
              <ul className="mw-list">
                {g.mustAnswer.slice(0, 10).map(k => <li key={k}>{k}</li>)}
              </ul>

              <h4>What the page actually does</h4>
              {a ? (
                <>
                  <div className="mw-lead-facts">
                    <span><b>Health</b> {a.score}/100</span>
                    <span><b>Words</b> {a.words.toLocaleString('en-US')}</span>
                    <span><b>Title</b> {a.title ? `“${a.title}”` : 'missing'}</span>
                  </div>
                  {a.faults.length ? (
                    <ul className="mw-list" style={{ marginTop: 10 }}>
                      {a.faults.map((f, i) => (
                        <li key={i}><b>{f.says}</b> — {f.fix}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="lede">
                      Technically sound. The gap is content: nothing on it names the cities and
                      formats above, which is what the searcher came for.
                    </p>
                  )}
                </>
              ) : (
                <p className="lede">The page could not be read just now, so only the keyword side is shown.</p>
              )}

              {sec && (
                <>
                  <h4>A section that answers them</h4>
                  <ul className="mw-list">
                    {sec.summary.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                  <p className="lede" style={{ marginTop: 10 }}>
                    Written in the site&rsquo;s own design — Poppins, <code>#2563eb</code>,
                    rounded cards — so it can be pasted into the CMS or handed to whoever owns the
                    Next.js site. Every figure it cannot know is marked{' '}
                    <code>[CONFIRM: …]</code> rather than invented.
                  </p>
                  <DownloadHtml html={sec.html} filename={sec.filename} />
                </>
              )}
            </div>
          </details>
        )
      })}
    </>
  )
}
