import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { currentGuest } from '@/lib/guest'
import { MwHero, Section } from '../_ui'
import { marketViews } from '@/lib/mw-market-view'
import { cityRows, issuesFrom, opportunitiesFrom } from '@/lib/mw-board'
import { openProposals } from '@/lib/mw-proposals'
import { rollupLine } from '@/lib/mw-status'

// 👉 Moving Walls → Market plan. The index.
//
// This page used to be the whole plan: 32,000 pixels, 274 buttons, 59
// accordions, and a filter buried sixth that only reached one of the three
// work sections — filtering to the India lead still left her 16 city cards and
// 22 page changes belonging to other people.
//
//   "I want each market lead to be in charge of whatever is going on in the
//    market as a top level."                            (owner, 12 Oct 2026)
//
// So the market is the top-level object now. This is ten rows; the work lives
// at /mw/plan/<market>. Nobody loads everything, because there is no longer a
// page that shows everything.

export const dynamic = 'force-dynamic'

const money = (n: number) => `S$${n.toFixed(2)}`

export default async function MwPlanIndex() {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  const views = await marketViews()
  const [cities, props] = await Promise.all([cityRows(), openProposals()])
  const issues = issuesFrom(cities, props.map(p => ({ slug: p.slug, url: p.url, kind: p.kind, status: p.status, evidence: p.evidence })))
  const chances = opportunitiesFrom(cities)

  const live = views.filter(v => v.roll.total > 0)
  const totalOpen = live.reduce((s, v) => s + v.roll.open, 0)
  const totalRisk = live.reduce((s, v) => s + v.atRisk, 0)

  return (
    <div className="mw-wrap">
      <MwHero tab="plan" pulled={''} stale={false} headline={`${totalOpen} open across ${live.length} markets`}>
        <p>
          Each market lead owns everything in their market — the tasks, the city pages and the page
          changes, in one place. Open yours below.
          {totalRisk > 0 && <> There is <b>{money(totalRisk)} a month</b> of paid spend riding on what is still open.</>}
          {guest ? ` Signed in as ${guest}.` : ''}
        </p>
      </MwHero>

      {live.length === 0 ? (
        <Section title="No plan generated yet">
          <p className="lede">
            The plan is built from Search Console, GA4 and the site&rsquo;s own sitemap. Run the refresh, or wait
            for the 9am pull. <Link href="/mw/seo">SEO tab</Link>
          </p>
        </Section>
      ) : (
        <>
          <Section title="Markets" sub="One owner each. The number is what is still open.">
            <div className="mw-mkt-grid">
              {live.map(v => (
                <Link key={v.market.key} href={`/mw/plan/${v.market.key}`} className="mw-mkt">
                  <div className="mw-mkt-top">
                    <b>{v.market.label}</b>
                    <span className="mw-mkt-owner">{v.market.owner ?? 'Unassigned'}</span>
                  </div>
                  <div className="mw-mkt-nums">
                    <span className={v.roll.open ? 'open' : 'clear'}>{v.roll.open}</span>
                    <small>{v.roll.open === 1 ? 'thing open' : 'things open'}</small>
                  </div>
                  <p className="mw-mkt-line">{rollupLine(v.roll, v.atRisk)}</p>
                  <p className="mw-mkt-what">
                    {v.tasks.length > 0 && `${v.tasks.length} task${v.tasks.length === 1 ? '' : 's'}`}
                    {v.cities.length > 0 && ` · ${v.cities.length} city page${v.cities.length === 1 ? '' : 's'}`}
                    {v.proposals.length > 0 && ` · ${v.proposals.length} page${v.proposals.length === 1 ? '' : 's'} to review`}
                  </p>
                </Link>
              ))}
            </div>
          </Section>

          {issues.length > 0 && (
            <Section title="What is wrong right now" sub="Across every market, ordered by what it costs a month.">
              {issues.map(i => (
                <div className="mw-board is-issue" key={i.id}>
                  <h4>{i.headline}</h4>
                  <p>{i.detail}</p>
                </div>
              ))}
            </Section>
          )}

          {chances.length > 0 && (
            <Section title="What there is to win" sub="Positions already earned and pages already built.">
              {chances.map(i => (
                <div className="mw-board is-chance" key={i.id}>
                  <h4>{i.headline}</h4>
                  <p>{i.detail}</p>
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}
