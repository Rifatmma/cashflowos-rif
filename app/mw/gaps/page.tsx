import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { getGaps, getRivals, quarterOf } from '@/lib/mw-gap-run'
import { effortOf, worthWriting } from '@/lib/mw-gap'
import { MARKETS, COUNTRIES, serpUrl } from '@/lib/mw-markets'
import { num } from '@/lib/mw-data'
import { MwHero, Section } from '../_ui'
import { RivalEditor } from './_gap-ui'

// 👉 Moving Walls → Content gap. What competitors win and we do not.
//
// Its own page rather than a tenth section on the SEO tab, because it is used
// differently: the SEO tab is a two-minute scan, this is where a market lead
// sits for an hour planning a quarter of content. The SEO tab carries a
// three-line summary and a link here (owner, 29 Sep 2026).

export const dynamic = 'force-dynamic'

export default async function MwGaps({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  const { c } = await searchParams
  const [gaps, rivals] = await Promise.all([getGaps(), getRivals()])
  const quarter = gaps[0]?.quarter ?? quarterOf()

  const withGap = COUNTRIES
    .map(({ country, market }) => ({
      country, market,
      gap: gaps.find(g => g.country === country.key) ?? null,
      rivals: rivals[country.key] ?? [],
    }))
    .filter(x => x.gap || x.rivals.length)
    .sort((a, b) => (b.gap?.clusters.length ?? 0) - (a.gap?.clusters.length ?? 0))

  const active = withGap.find(x => x.country.key === c) ?? withGap[0] ?? null
  const topics = active?.gap?.clusters.filter(worthWriting) ?? []
  const totalTopics = gaps.reduce((t, g) => t + g.clusters.filter(worthWriting).length, 0)

  return (
    <div className="mw-wrap">
      <MwHero tab="gaps" pulled={quarter} stale={false}
        headline={totalTopics ? `${totalTopics} pages our competitors have and we do not` : 'Content gap'}>
        <p>
          Searches a named competitor ranks for and we do not, grouped into pages somebody can actually write.
          Pulled once a quarter — a gap pull costs about sixteen times a keyword pull, and rivals do not
          change their content strategy monthly.
        </p>
      </MwHero>

      {!withGap.length ? (
        <Section title="Nobody has named any competitors yet">
          <p className="lede">
            The gap is measured against competitors <b>you</b> name, not ones Semrush guesses. Its suggestions
            for India included two industry associations, and for Malaysia a near-miss of our own domain.
            Name three or four real rivals per market and the next quarterly pull fills this in.
          </p>
        </Section>
      ) : (
        <>
          <Section title="Market">
            <div className="mw-mtabs">
              {withGap.map(x => (
                <Link key={x.country.key} href={`/mw/gaps?c=${x.country.key}`}
                  aria-current={active?.country.key === x.country.key ? 'page' : undefined}>
                  {x.country.label}
                  <small>
                    {x.gap ? `${x.gap.clusters.filter(worthWriting).length} topics` : 'not pulled yet'}
                  </small>
                </Link>
              ))}
            </div>
          </Section>

          {active && (
            <>
              <Section title={`Who we are measured against in ${active.country.label}`}
                sub="Your list, not Semrush's. Change it and the next quarterly pull uses the new one.">
                <RivalEditor country={active.country.key} label={active.country.label} rivals={active.rivals} />
              </Section>

              {!active.gap ? (
                <Section title="Not pulled yet">
                  <p className="lede">
                    {active.country.label} has rivals named but no gap stored for {quarter}. It fills in on the
                    next quarterly pull.
                  </p>
                </Section>
              ) : (
                <Section title={`${topics.length} pages to write for ${active.country.label}`}
                  sub="Each block is one page. Ranked by the demand behind it.">
                  {topics.length === 0 ? (
                    <p className="lede">
                      Nothing worth a page this quarter — {active.gap.keptCount} relevant searches came back but
                      none clustered into enough demand to justify writing.
                    </p>
                  ) : topics.map((t, i) => {
                    const e = effortOf(t)
                    return (
                      <details className="mw-gapc" key={t.head}>
                        <summary>
                          <span className="rank">{i + 1}</span>
                          <span className="mw-task-main">
                            <b>{t.head}</b>
                            <small>
                              {t.keywords.length} search{t.keywords.length === 1 ? '' : 'es'} ·{' '}
                              {num(t.vol)} a month · {e.size} · {t.rivals.join(', ') || 'a rival'}
                            </small>
                          </span>
                          {t.cpc > 0 && <span className="cpc">${t.cpc.toFixed(2)}/click</span>}
                        </summary>
                        <div className="mw-task-body">
                          <p className="mw-why">
                            {t.rivals.length === 1 ? `${t.rivals[0]} ranks` : `${t.rivals.join(' and ')} rank`} for{' '}
                            {t.keywords.length === 1 ? 'this search' : `these ${t.keywords.length} searches`}, worth{' '}
                            {num(t.vol)} a month in {active.country.label}.{' '}
                            {t.keywords.length === 1 ? 'We do not rank for it at all' : 'We rank for none of them'} — {e.says}.
                            {t.cpc > 0 && <> Buying this traffic costs ${t.cpc.toFixed(2)} a click.</>}
                          </p>
                          <h4>What to do</h4>
                          <ol className="mw-steps">
                            <li>Write one page answering all of these, not a page per search — they are the same question asked differently.</li>
                            <li>Lead with &ldquo;{t.head}&rdquo; in the title and H1; give the others their own H2.</li>
                            <li>
                              See how it is answered today:{' '}
                              <a href={serpUrl(t.head, active.country)} target="_blank" rel="noreferrer">
                                the live Google result for &ldquo;{t.head}&rdquo; in {active.country.label}
                              </a>
                              {t.rivals.length > 0 && <>
                                {' '}— {t.rivals[0]} is the one to beat
                                {t.keywords[0]?.theirUrl && <>, on{' '}
                                  <a href={t.keywords[0].theirUrl} target="_blank" rel="noreferrer">
                                    {t.keywords[0].theirUrl.replace(/^https?:\/\/(www\.)?/, '')}
                                  </a>
                                </>}
                              </>}. Then answer it better with something they cannot copy: our inventory, our
                              measurement, a named local campaign.
                            </li>
                            <li>Link it from /locations/{active.country.key} and from the related blog posts.</li>
                          </ol>
                          <h4>The searches</h4>
                          <table className="mw-kw">
                            <thead><tr><th>Search</th><th>Their best</th><th>Searches/mo</th><th>Difficulty</th></tr></thead>
                            <tbody>
                              {t.keywords.map(k => (
                                <tr key={k.q}>
                                  <td>
                                    <a className="mw-serp" href={serpUrl(k.q, active.country)} target="_blank" rel="noreferrer"
                                      title={`See who ranks for "${k.q}" in ${active.country.label}`}>{k.q}</a>
                                  </td>
                                  <td className="num">
                                    {k.theirBest
                                      ? (k.theirUrl
                                        ? <a href={k.theirUrl} target="_blank" rel="noreferrer" title={k.theirUrl}>#{k.theirBest}</a>
                                        : `#${k.theirBest}`)
                                      : '—'}
                                  </td>
                                  <td className="num">{num(k.vol)}</td>
                                  <td className="num">
                                    <span className={`mw-kd ${k.kd < 20 ? 'easy' : k.kd < 40 ? 'mid' : 'hard'}`}>{k.kd || '—'}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )
                  })}

                  <p className="lede" style={{ marginTop: 14 }}>
                    <b>How much was thrown away:</b> Semrush returned {active.gap.rawCount} rows and{' '}
                    {active.gap.rawCount - active.gap.keptCount} were dropped as nothing to do with us —
                    flyovers, bus stops, shopping malls and the like, which rivals rank for incidentally. The
                    biggest single one for India was a 60,500-a-month search for a flyover. Sorting a raw gap
                    by volume is how teams waste a quarter.
                  </p>
                </Section>
              )}
            </>
          )}
        </>
      )}

      <p className="lede" style={{ marginTop: 8 }}>
        <Link href="/mw/seo">Back to SEO &amp; organic</Link> · <Link href="/mw/plan">Market plan</Link>
      </p>
    </div>
  )
}

export const metadata = { title: 'Content gap' }
export const _markets = MARKETS
