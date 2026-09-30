import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { COUNTRIES, dbOf } from '@/lib/mw-markets'
import { getMarketSeo, withData } from '@/lib/mw-market-data'
import { getGaps } from '@/lib/mw-gap-run'
import { MwHero, Section } from '../_ui'
import { ImportForm } from './_import-ui'

// 👉 Moving Walls → Import. Semrush data without Semrush API access.
//
// The account is on Pro: the Standard API that serves the domain reports is a
// Business feature, and the v4 keys this account can issue are rejected by
// that endpoint. Rather than lose competitor and keyword data entirely, the
// same three reports are exported from the Semrush UI and dropped here. They
// land in the same tables the API pull filled, so nothing downstream knows or
// cares where the numbers came from (owner, 30 Sep 2026).

export const dynamic = 'force-dynamic'

const REPORTS = [
  {
    name: 'Organic Research → Positions',
    gives: 'what each market ranks for: keyword, position, previous position, volume, difficulty, CPC and the page',
    feeds: 'striking-distance tasks, "where we already win", brand split, cannibalisation, momentum',
    how: 'Organic Research → enter movingwalls.com → pick the country → Positions tab → Export',
  },
  {
    name: 'Organic Research → Competitors',
    gives: 'who else ranks for the same searches, and how much traffic it earns them',
    feeds: 'the competitive position tab',
    how: 'Same screen → Competitors tab → Export',
  },
  {
    name: 'Keyword Gap',
    gives: 'searches your rivals rank for and we do not',
    feeds: 'the content gap page and its briefs',
    how: 'Keyword Gap → movingwalls.com versus up to four rivals → pick the country → Export. Quarterly is enough.',
  },
]

export default async function MwImport() {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  const [markets, gaps] = await Promise.all([getMarketSeo(), getGaps()])
  const live = withData(markets)

  const countries = COUNTRIES
    .filter(c => dbOf(c.country))
    .map(c => ({ key: c.country.key, label: `${c.country.label} (${dbOf(c.country)})`, market: c.market.key }))

  // What is already loaded, so it is obvious what still needs an export.
  const loaded = COUNTRIES.map(({ country, market }) => {
    const m = live.find(x => x.market.key === market.key)
    const cs = m?.countries.find(c => c.country === country.key)
    return {
      key: country.key,
      label: country.label,
      market: market.label,
      keywords: cs?.keywords.length ?? 0,
      competitors: cs?.competitors.length ?? 0,
      gap: gaps.find(g => g.country === country.key)?.clusters.length ?? 0,
    }
  }).filter(r => dbOf(COUNTRIES.find(c => c.country.key === r.key)!.country))

  const have = loaded.filter(r => r.keywords > 0).length

  return (
    <div className="mw-wrap">
      <MwHero tab="import" pulled={`${have} of ${loaded.length} markets loaded`} stale={false}
        headline="Bring Semrush in by hand">
        <p>
          This account is on Pro, and the Semrush reports this dashboard uses are only served to the
          Business-tier API. The same reports export from the Semrush interface as CSV, and dropping them
          here fills exactly the tables the automatic pull would have. The plan runs monthly and the gap
          quarterly, so this is a few minutes once a month rather than a chore.
        </p>
      </MwHero>

      <Section title="Drop the exports in"
        sub="Several files at once. Each one is identified by its columns and its filename, and anything ambiguous is handed back rather than guessed at.">
        <ImportForm countries={countries} />
      </Section>

      <Section title="Which three reports to export">
        <div className="mw-reports">
          {REPORTS.map(r => (
            <div className="mw-report" key={r.name}>
              <b>{r.name}</b>
              <p className="gives">{r.gives}</p>
              <p className="how">{r.how}</p>
              <p className="feeds">Feeds: {r.feeds}</p>
            </div>
          ))}
        </div>
        <p className="lede" style={{ marginTop: 14 }}>
          Keep the filenames Semrush gives them — they contain the country code, which is how each file is
          placed. A few hundred rows per market is plenty; there is no need to export everything.
        </p>
      </Section>

      <Section title="What is loaded"
        sub="One row per market Semrush covers. Empty means that market has no data until you export it.">
        <table className="mw-kw wide">
          <thead>
            <tr><th>Market</th><th>Country</th><th className="num">Keywords</th><th className="num">Competitors</th><th className="num">Gap topics</th></tr>
          </thead>
          <tbody>
            {loaded.sort((a, b) => b.keywords - a.keywords).map(r => (
              <tr key={r.key}>
                <td>{r.market}</td>
                <td><b>{r.label}</b></td>
                <td className="num">{r.keywords || <span className="mw-zero">—</span>}</td>
                <td className="num">{r.competitors || <span className="mw-zero">—</span>}</td>
                <td className="num">{r.gap || <span className="mw-zero">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="The way out of doing this by hand"
        sub="Not urgent, but worth knowing.">
        <p className="lede">
          <b>Search Console would replace most of this, free.</b> It is our own data and gives the query, the
          page Google ranks, the position, clicks and impressions per country — enough for striking distance,
          click-through problems, cannibalisation and city gaps. It returns 403 today only because the
          connected Google account is not a user on <code>sc-domain:movingwalls.com</code>; that is a
          permission somebody internal can grant, not a purchase. Competitor and gap data would still come
          from these exports, since nothing free provides it.
        </p>
      </Section>

      <p className="lede" style={{ marginTop: 8 }}>
        <Link href="/mw/seo">SEO &amp; organic</Link> · <Link href="/mw/plan">Market plan</Link> ·{' '}
        <Link href="/mw/gaps">Content gap</Link>
      </p>
    </div>
  )
}
