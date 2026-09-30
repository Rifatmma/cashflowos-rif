import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { currentGuest } from '@/lib/guest'
import { getActions, byOwner, type ActionRow } from '@/lib/mw-actions'
import { MARKETS } from '@/lib/mw-markets'
import { THEME } from '@/lib/mw-themes'
import { MwHero, Section } from '../_ui'
import { Load, PlanRow, PlanNote } from './_plan-ui'

// 👉 Moving Walls → Market plan. Who does what, in which market, and how.
//
// The SEO tab says what is happening; this page says what to do about it and
// whose job it is. One row per task, filterable by person or market, with the
// decision and the lead's own date on it (owner, 29 Sep 2026).

export const dynamic = 'force-dynamic'

export default async function MwPlan({ searchParams }: { searchParams: Promise<{ who?: string; market?: string; theme?: string }> }) {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  const { who, market, theme } = await searchParams
  const all = (await getActions('seo')).filter(r => r.source === 'generated')
  const owners = [...new Set(all.map(r => r.owner ?? 'Unassigned'))].sort()
  const markets = MARKETS.filter(m => all.some(r => r.market === m.key))

  const rows = all.filter(r =>
    (!who || (r.owner ?? 'Unassigned') === who) &&
    (!market || r.market === market) &&
    (!theme || r.theme === theme))

  const real = rows.filter(r => r.how?.kind !== 'blind')
  const answered = rows.filter(r => r.decision).length
  const dated = rows.filter(r => r.decision?.proposed_due).length
  const cycle = all.find(r => r.cycle)?.cycle ?? '—'

  const link = (o: { who?: string; market?: string }) => {
    const q = new URLSearchParams()
    if (o.who) q.set('who', o.who)
    if (o.market) q.set('market', o.market)
    if (theme) q.set('theme', theme)
    const s = q.toString()
    return s ? `/mw/plan?${s}` : '/mw/plan'
  }

  return (
    <div className="mw-wrap">
      <MwHero tab="plan" pulled={cycle} stale={false}
        headline="What each market does next">
        <p>
          One list for the whole team: the task, who owns it, and exactly how to do it. Nobody is given a
          deadline — each lead says when they can do theirs.
          {guest ? ` Signed in as ${guest}.` : ''}
        </p>
      </MwHero>

      {all.length === 0 ? (
        <Section title="No plan generated yet">
          <p className="lede">
            The market plan is built from Search Console, GA4 and the site&rsquo;s own sitemap. Run the refresh,
            or wait for the 9am pull, and the tasks appear here. <Link href="/mw/seo">SEO tab</Link>
          </p>
        </Section>
      ) : (
        <>
          <Section title="Who is holding what"
            sub="Size is effort, not importance: S about an hour, M half a day, L a day or two.">
            <Load rows={byOwner(real, k => MARKETS.find(m => m.key === k)?.label ?? k)} />
            <p className="lede">
              {real.length} task{real.length === 1 ? '' : 's'} this cycle · {answered} answered ·{' '}
              {dated} with a date from the lead.
            </p>
            <p className="lede">
              A new page is two tasks: the market lead writes the copy, then the page is built and its meta tags,
              schema and links set. Each is somebody&rsquo;s own task, and the build says who it is waiting on.
            </p>
          </Section>

          {theme && THEME[theme] && (
            <Section title={THEME[theme].title}>
              <p className="lede">{THEME[theme].why}</p>
              <p className="lede" style={{ marginTop: 10 }}>
                <b>Closes when:</b> {THEME[theme].doneWhen}{' '}
                <Link href="/mw/plan">Show every task instead</Link>
              </p>
            </Section>
          )}

          <Section title="Filter">
            <div className="mw-filters">
              <Link href={link({ market })} aria-current={!who ? 'page' : undefined}>Everyone</Link>
              {owners.map(o => (
                <Link key={o} href={link({ who: o, market })} aria-current={who === o ? 'page' : undefined}>{o}</Link>
              ))}
            </div>
            <div className="mw-filters">
              <Link href={link({ who })} aria-current={!market ? 'page' : undefined}>All markets</Link>
              {markets.map(m => (
                <Link key={m.key} href={link({ who, market: m.key })} aria-current={market === m.key ? 'page' : undefined}>
                  {m.label}
                </Link>
              ))}
            </div>
          </Section>

          {MARKETS.filter(m => rows.some(r => r.market === m.key)).map(m => {
            const mine = rows.filter(r => r.market === m.key)
            const work = mine.filter(r => r.how?.kind !== 'blind')
            return (
              <Section key={m.key} title={`${m.label} — ${m.owner ?? 'no owner'}`}
                sub={work.length
                  ? `${work.length} ${work.length === 1 ? 'task' : 'tasks'} this cycle · regional lead ${m.lead ?? '—'}`
                  : `Regional lead ${m.lead ?? '—'}`}>
                {work.map(r => <PlanRow key={r.id} r={r as ActionRow} />)}
                {mine.filter(r => r.how?.kind === 'blind').map(r => <PlanNote key={r.id} r={r as ActionRow} />)}
              </Section>
            )
          })}
        </>
      )}
    </div>
  )
}
