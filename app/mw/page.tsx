import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { getTargets } from '@/lib/mw-data'
import { loadStack } from '@/lib/mw-priority-load'
import { forPerson } from '@/lib/mw-priorities'
import { personByActor, doers, OWNER_NAME } from '@/lib/mw-people'
import { seenByPerson } from '@/lib/mw-presence'
import { stackSignals } from '@/lib/mw-stack-signals'
import { MwHero } from './_ui'
import { Signals, DoFirst, TaskList, PeopleCards, peopleRows } from './_stack-ui'
import { WeekList } from './_week-ui'
import { isoWeek, mondayOf, dueOf, isReady } from '@/lib/mw-week'
import { weekTasks } from '@/lib/mw-week-store'

// 👉 Moving Walls → Today. One look, then the one list of what to do.
//
// This replaced the Overview (21 Oct 2026). The Overview answered "what
// happened" in four sections and asked nobody to do anything; three of its
// cards had been written by hand on 28 Sep and shown as current ever since.
//
//   "I need clear action plans, clear direction based on the data shown."
//                                                        (owner, 21 Oct 2026)
//
// Since 26 Oct 2026 the page opens on "My week" (lib/mw-week.ts): each person
// sees only their own few cards, each with numbered steps and one button. Rif,
// Mehul and Safwaan see every person's cards. The ranked list that decides
// which cards exist is still here, behind "Full ranked list", for Rif.
//
//   "I need everyone to know what they have to do and how to do them."
//                                                        (owner, 26 Oct 2026)

export const dynamic = 'force-dynamic'

type Q = { who?: string; ch?: string; all?: string; view?: string }
const CHANNELS = ['Tracking', 'Paid', 'SEO', 'Content', 'Sales'] as const

export default async function MwToday({ searchParams }: { searchParams: Promise<Q> }) {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')
  // Same rule as actor() in ./actions: anyone who is not a guest is the owner.
  const isOwner = guest === null
  const q = await searchParams

  const week = isoWeek(new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10))
  const [stack, seen, targets, cards] = await Promise.all([loadStack(), seenByPerson(), getTargets(), weekTasks(week)])
  const { queue, people, facts, markets } = stack
  const me = personByActor(people, isOwner ? 'owner' : guest)
  // Rif and the bosses see everyone; everybody else sees their own week.
  const seesAll = isOwner || me?.role === 'boss'
  const ready = cards.filter(isReady)
  const myCards = me ? ready.filter(t => t.owner === me.name) : []
  const canAct = (t: { owner: string }) => isOwner || (!!me && t.owner === me.name)
  const range = `${new Date(mondayOf(week) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}–${new Date(dueOf(week) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
  const board = doers(people).filter(p => p.name !== me?.name).map(p => ({ p, tasks: ready.filter(t => t.owner === p.name) })).filter(r => r.tasks.length)
  const left = (ts: { state: string }[]) => ts.filter(t => t.state === 'todo').length
  const showQueue = isOwner && q.view === 'queue'
  const focus = new Set(queue.focus)

  // ── the six numbers (lib/mw-stack-signals.ts, shared with the Monday email)
  const team = doers(people).filter(p => p.name !== OWNER_NAME)
  const signals = stackSignals({
    channels: facts.channels, utmFill: facts.utmFill, paid: facts.paid, cpaTarget: targets.cpa,
    leads14: facts.leads14, unanswered14: facts.unanswered14, markets, team, seen,
  })

  // ── the list, filtered
  const who = q.who && people.some(p => p.name === q.who) ? q.who : null
  const ch = CHANNELS.find(c => c === q.ch) ?? null
  let list = who ? forPerson(queue, who) : queue.items
  if (ch) list = list.filter(x => x.channel === ch)
  const showAll = q.all === '1' || !!who || !!ch
  const shown = showAll ? list : list.filter(x => focus.has(x.id) || x.when === 'now').slice(0, 12)
  const canAnswer = (x: { owner: string; helper?: string }) => isOwner || (!!me && (x.owner === me.name || x.helper === me.name))
  const href = (o: Partial<Q>) => {
    const sp = new URLSearchParams()
    const w = 'who' in o ? o.who : who, c = 'ch' in o ? o.ch : ch
    if (w) sp.set('who', w)
    if (c) sp.set('ch', c)
    if (o.all) sp.set('all', o.all)
    const s = sp.toString()
    return `/mw?view=queue${s ? `&${s}` : ''}#next`
  }
  const first = queue.items[0] ?? null
  const rows = peopleRows(doers(people), queue, seen, stack.doneThisWeek, () => null)

  return (
    <div className="mw-wrap">
      <MwHero tab="overview" pulled={facts.paid?.monthLabel ?? ''} stale={false}
        sources="Moving Walls · Google Ads · GA4 · Search Console · Zoho CRM ·"
        headline={me && !seesAll
          ? `${me.name}, you have ${left(myCards)} task${left(myCards) === 1 ? '' : 's'} this week`
          : `Week ${week.slice(-2)} · ${range}: ${left(ready)} of ${ready.length} tasks open`}>
        <p>
          {ready.length
            ? <>Each card says exactly what to do, where, and how you know it&apos;s done. Due Friday {range.split('–')[1]}.</>
            : <>This week&apos;s cards aren&apos;t ready yet. They&apos;re written every Monday morning.</>}
          {guest ? ` Signed in as ${guest}.` : ''}
        </p>
      </MwHero>

      {me && (myCards.length > 0 || !seesAll) && (
        <section className="mw-card" id="mine">
          <h2 style={{ marginBottom: 10 }}>{seesAll ? 'Your cards' : 'Your week'}</h2>
          <WeekList tasks={myCards} canAct={canAct} empty="No cards for you this week." />
        </section>
      )}

      {seesAll && (
        <section className="mw-card" id="team">
          <h2 style={{ marginBottom: 4 }}>Team this week</h2>
          <p className="mw-planner-note">Everyone&apos;s cards for week {week.slice(-2)}. Open ones first.</p>
          {board.length ? board.map(({ p, tasks }) => (
            <div key={p.name} className="mw-week-person">
              <h3>{p.name} <span className="mw-planner-lab">· {p.title} · {tasks.length - left(tasks)} of {tasks.length} done</span></h3>
              <WeekList tasks={tasks} canAct={canAct} />
            </div>
          )) : <p className="mw-planner-lab">No cards yet this week.</p>}
        </section>
      )}

      {seesAll && <Signals items={signals} />}

      {isOwner && !showQueue && (
        <p className="mw-planner-lab" style={{ margin: '4px 0 18px' }}>
          The cards come from one ranked list across every channel. <Link href="/mw?view=queue#next">Full ranked list</Link>
        </p>
      )}

      {showQueue && <>
      <DoFirst item={first} href={first ? `#t-${first.id.replace(/[^a-z0-9]/gi, '-')}` : '#next'} />

      <section className="mw-card" id="next">
        <div className="mw-next-head">
          <h2>Do next{who ? ` · ${who}` : ''}</h2>
          <nav className="mw-planner-cut" aria-label="Channel">
            <Link href={href({ ch: undefined })} aria-current={!ch ? 'true' : undefined} scroll={false}>All</Link>
            {CHANNELS.map(c => (
              <Link key={c} href={href({ ch: c })} aria-current={ch === c ? 'true' : undefined} scroll={false}>{c}</Link>
            ))}
          </nav>
        </div>
        <p className="mw-planner-note">
          {who
            ? <>{who}&apos;s tasks, this week first. <Link href={href({ who: undefined })} scroll={false}>Show everyone</Link></>
            : <>{queue.focus.length} of {queue.items.length} tasks carry {Math.round(queue.share * 100)}% of the expected gain. Each person gets only what fits their week; the rest waits.</>}
        </p>
        <TaskList items={shown} focus={focus} canAnswer={canAnswer} empty="Nothing open here." />
        {!showAll && list.length > shown.length && (
          <p className="mw-planner-lab" style={{ marginTop: 10 }}>
            <Link href={href({ all: '1' })} scroll={false}>Show all {list.length} tasks</Link>
          </p>
        )}
      </section>

      <section className="mw-card" id="people">
        <h2 style={{ marginBottom: 4 }}>People</h2>
        <p className="mw-planner-note">Click a person to see their tasks. Mehul and Safwaan see this view and get the weekly summary.</p>
        <PeopleCards rows={rows} active={who} hrefFor={n => href({ who: who === n ? undefined : n })} />
        <p className="mw-planner-lab" style={{ marginTop: 10 }}>
          The seven maintenance markets get one top task each. <Link href="/mw/people">Team summary</Link>
        </p>
      </section>
      </>}
    </div>
  )
}
