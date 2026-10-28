import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { getMwData, num } from '@/lib/mw-data'
import { getMarketSeo, withData } from '@/lib/mw-market-data'
import { glanceOf } from '@/lib/mw-seo-glance'
import { getPeople } from '@/lib/mw-people-store'
import { personByActor } from '@/lib/mw-people'
import { isoWeek, mondayOf, dueOf, isReady, type WeekTask, type Finding } from '@/lib/mw-week'
import { weekTasks, weekFindings } from '@/lib/mw-week-store'
import { MwHero } from '../_ui'
import { WeekCard } from '../_week-ui'

// 👉 Moving Walls → To do. The one page the team works from (owner, 28 Oct 2026):
//
//   "I want to show insights first what we discovered from data. And then, we
//    show what is recommended to do to improve or fix the problems. Once those
//    insights and action plan comes in details then people will know exactly
//    what to do and they'll do them."
//
// Findings come from the Monday run (mw_week_findings), most enquiries first.
// Each card sits under the finding it fixes. Nothing here asks anyone to send
// a prompt to Claude: the analysis is done before the page is read.

export const dynamic = 'force-dynamic'

type Q = { mine?: string }

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const STATE: Record<WeekTask['state'], string> = { todo: 'To do', submitted: 'Submitted ✓', done: 'Done ✓', cant: "Can't" }

export default async function MwTodo({ searchParams }: { searchParams: Promise<Q> }) {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')
  const isOwner = guest === null
  const q = await searchParams

  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
  const week = isoWeek(today)
  const prev = isoWeek(new Date(Date.parse(mondayOf(week) + 'T00:00:00Z') - 7 * 864e5).toISOString().slice(0, 10))
  const [people, cards, findings, lastCards, snap, markets] = await Promise.all([
    getPeople(), weekTasks(week), weekFindings(week), weekTasks(prev), getMwData(), getMarketSeo(),
  ])
  const me = personByActor(people, isOwner ? 'owner' : guest)
  const seesAll = isOwner || me?.role === 'boss'
  // A lead or Dinesh opens on their own cards; "Everyone" is one click away.
  const mine = !!me && (q.mine === '1' || (q.mine !== '0' && !seesAll))
  const canAct = (t: WeekTask) => isOwner || (!!me && t.owner === me.name)

  const ready = cards.filter(t => isReady(t) || t.state === 'cant')
  const shown = mine && me ? ready.filter(t => t.owner === me.name) : ready
  const open = ready.filter(t => t.state !== 'cant')
  const done = open.filter(t => t.state === 'done' || t.state === 'submitted').length

  const actionF = findings.filter(f => f.kind === 'action')
  const infoF = findings.filter(f => f.kind === 'info')
  const under = (f: Finding) => shown.filter(t => t.findingId === f.id)
  const known = new Set(actionF.map(f => f.id))
  const loose = shown.filter(t => !t.findingId || !known.has(t.findingId))

  const nb = glanceOf(withData(markets)).find(s => s.key === 'nonbrand')
  const orgLeads = snap?.data.seo.kpi.leads
  const range = `${fmt(mondayOf(week))}–${fmt(dueOf(week))}`

  return (
    <div className="mw-wrap">
      <MwHero tab="todo" pulled={snap?.data.meta.pulled ?? '—'} stale={false}
        sources="Moving Walls · Search Console · Semrush · GA4 ·"
        headline={mine && me
          ? `${me.name}, ${shown.filter(t => t.state === 'todo').length} to do this week`
          : `Week ${week.slice(-2)} · ${range}: ${done} of ${open.length} done`}>
        <p>What the data showed this week, then exactly what to do about it. Due Friday {fmt(dueOf(week))}.</p>
      </MwHero>

      <div className="mw-todo-top">
        <div className="mw-tile"><div className="k">Non-brand share</div><div className="v">{nb?.value ?? '—'}</div><div className="d mw-nu">{nb?.note ?? ''}</div></div>
        <div className="mw-tile"><div className="k">Organic enquiries</div><div className="v">{orgLeads ?? '—'}</div><div className="d mw-nu">GA4 · not reliable until the form fix</div></div>
        <div className="mw-tile"><div className="k">Done this week</div><div className="v">{done} of {open.length}</div><div className="d mw-nu">due Fri {fmt(dueOf(week))}</div></div>
      </div>

      {me && (
        <nav className="mw-planner-cut" aria-label="Whose cards" style={{ margin: '0 0 14px' }}>
          <Link href="/mw/todo?mine=0" aria-current={!mine ? 'true' : undefined} scroll={false}>Everyone</Link>
          <Link href="/mw/todo?mine=1" aria-current={mine ? 'true' : undefined} scroll={false}>Only mine</Link>
        </nav>
      )}

      {!findings.length && !ready.length && (
        <section className="mw-card"><p className="mw-planner-lab">This week&apos;s findings aren&apos;t ready yet. They&apos;re written every Monday morning.</p></section>
      )}

      {actionF.length > 0 && <h2 className="mw-todo-h">What we found <span className="mw-planner-lab">· most enquiries first</span></h2>}
      {actionF.map((f, i) => {
        const ts = under(f)
        if (mine && !ts.length) return null
        return (
          <section key={f.id} className="mw-card mw-finding" id={`f-${f.id.replace(/[^a-z0-9]/gi, '-')}`}>
            <h3 className="mw-finding-title"><span className="mw-finding-n">{i + 1}</span>{f.title}</h3>
            <p className="mw-finding-ev">{f.evidence}</p>
            <p className="mw-planner-lab">Source: {f.source}{f.links.map(l => <span key={l.url}> · <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a></span>)}</p>
            {ts.length > 0 && <Actions tasks={ts} canAct={canAct} />}
          </section>
        )
      })}

      {loose.length > 0 && (
        <section className="mw-card mw-finding">
          <h3 className="mw-finding-title">Also this week</h3>
          <Actions tasks={loose} canAct={canAct} />
        </section>
      )}

      {infoF.length > 0 && !mine && (
        <section className="mw-card">
          <h2 style={{ marginBottom: 4 }}>What else the data showed <span className="mw-planner-lab">· no action this week</span></h2>
          {infoF.map(f => (
            <details key={f.id} className="mw-info">
              <summary>{f.title}</summary>
              <p className="mw-finding-ev">{f.evidence}</p>
              <p className="mw-planner-lab">Source: {f.source}</p>
            </details>
          ))}
        </section>
      )}

      {lastCards.length > 0 && (
        <section className="mw-card">
          <h2 style={{ marginBottom: 4 }}>Last week</h2>
          <ul className="mw-last">
            {lastCards.filter(t => !mine || t.owner === me?.name).filter(t => t.state !== 'todo' || t.carried === 0).map(t => (
              <li key={t.id}>
                <span className={`mw-last-st is-${t.state}`}>{STATE[t.state]}</span> {t.owner} · {t.title}
                {t.state === 'cant' && t.reason ? <span className="mw-planner-lab"> · &ldquo;{t.reason}&rdquo;</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="lede" style={{ marginTop: 8 }}>
        The numbers behind these findings are on <Link href="/mw">Home</Link> and in the <Link href="/mw/seo">organic detail</Link>.
      </p>
    </div>
  )
}

/** The cards under one finding: a one-line row each, opened to the full card. Your own open cards start open. */
function Actions({ tasks, canAct }: { tasks: WeekTask[]; canAct: (t: WeekTask) => boolean }) {
  const order = (t: WeekTask) => (t.state === 'todo' ? 0 : 1)
  const live = tasks.filter(t => t.state !== 'cant')
  const out = tasks.filter(t => t.state === 'cant')
  return (
    <div className="mw-actions">
      {[...live].sort((a, b) => order(a) - order(b) || b.value - a.value).map(t => (
        <details key={t.id} className={`mw-action is-${t.state}`} open={t.state === 'todo' && canAct(t) && !!tasks.length && tasks.length <= 3}>
          <summary>
            <span className="mw-action-who">{t.owner}</span>
            <span className="mw-action-title">{t.title}</span>
            <span className={`mw-action-st is-${t.state}`}>{STATE[t.state]}</span>
          </summary>
          <WeekCard t={t} canAct={canAct(t)} />
        </details>
      ))}
      {/* A "Can't" is kept so its topic never comes back, but it is not work. */}
      {out.length > 0 && (
        <details className="mw-info">
          <summary className="mw-planner-lab">{out.length} ruled out this week</summary>
          <ul className="mw-last">
            {out.map(t => <li key={t.id}>{t.owner} · {t.title}{t.reason ? <span className="mw-planner-lab"> · &ldquo;{t.reason}&rdquo;</span> : null}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
