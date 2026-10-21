import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { loadStack } from '@/lib/mw-priority-load'
import { forPerson } from '@/lib/mw-priorities'
import { personByActor } from '@/lib/mw-people'
import { seenByPerson } from '@/lib/mw-presence'
import { MARKET } from '@/lib/mw-markets'
import { MwHero, Section } from '../../_ui'
import { TaskList, seenWords, hrs } from '../../_stack-ui'

// 👉 One person's week: their tasks across every market they own, in the one
// ranked order, as simple cards with Done and "Can't — why".
//
// Built for the people who never opened the market plan: nothing to learn,
// nothing to read past. What they owe, why it matters in one line, how long
// it takes, and when it counts as done.

export const dynamic = 'force-dynamic'

export default async function MwPerson({ params }: { params: Promise<{ name: string }> }) {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')
  // Same rule as actor() in ./actions: anyone who is not a guest is the owner.
  const isOwner = guest === null

  const { name } = await params
  const [stack, seen] = await Promise.all([loadStack(), seenByPerson()])
  const person = stack.people.find(p => p.name === decodeURIComponent(name))
  if (!person) notFound()

  const me = personByActor(stack.people, isOwner ? 'owner' : guest)
  const mine = forPerson(stack.queue, person.name)
  const now = mine.filter(x => x.when === 'now')
  const later = mine.filter(x => x.when === 'later')
  const focus = new Set(stack.queue.focus)
  const canAnswer = (x: { owner: string; helper?: string }) => isOwner || (!!me && me.name === person.name && (x.owner === me.name || x.helper === me.name))
  const s = seenWords(seen.get(person.name))
  const l = stack.queue.load[person.name]

  return (
    <div className="mw-wrap">
      <MwHero tab="people" pulled="" stale={false} sources="Moving Walls · one person's week ·"
        headline={`${person.name} — ${now.length} task${now.length === 1 ? '' : 's'} this week`}>
        <p>
          <Link href="/mw/people">← Everyone</Link> · {person.title} · {s.text}
          {l ? ` · ${hrs(l.planned)} of ${hrs(l.cap)} planned` : ''} · {stack.doneThisWeek.get(person.name) ?? 0} done in the last 7 days
        </p>
      </MwHero>

      <Section title="This week" sub="Most valuable first. Mark each one done, or say why it can't be done — a reason is kept and the task only comes back if the numbers change.">
        <TaskList items={now} focus={focus} canAnswer={canAnswer} empty="Nothing this week." />
      </Section>

      {later.length > 0 && (
        <Section title={`Waiting — ${later.length} more`} sub="These start when this week's are done, so nobody gets a wall of tasks.">
          <TaskList items={later} focus={focus} canAnswer={canAnswer} />
        </Section>
      )}

      {person.markets.length > 0 && (
        <p className="lede">
          Page changes and city pages for {person.markets.map(m => MARKET[m]?.label ?? m).join(', ')}:{' '}
          {person.markets.map((m, i) => (
            <span key={m}>{i > 0 && ' · '}<Link href={`/mw/plan/${m}`}>{MARKET[m]?.label ?? m}</Link></span>
          ))}
        </p>
      )}
    </div>
  )
}
