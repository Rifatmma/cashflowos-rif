import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { loadStack } from '@/lib/mw-priority-load'
import { doers, bosses } from '@/lib/mw-people'
import { seenByPerson } from '@/lib/mw-presence'
import { MwHero, Section } from '../_ui'
import { PeopleCards, peopleRows, seenWords, hrs } from '../_stack-ui'

// 👉 Moving Walls → People. Who owns what, what is done, and who hasn't looked.
//
//   "Need to show that they don't use it but the task is open so the boss
//    which is Mehul and Safwaan will push them. The boss should get this
//    visibility so that they know what their employees are doing."
//                                                        (owner, 21 Oct 2026)
//
// It replaced the market plan's index. A market lead's work now lives on
// their own page, across every market they own, in the one ranked order.

export const dynamic = 'force-dynamic'

export default async function MwPeople() {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  const [stack, seen] = await Promise.all([loadStack(), seenByPerson()])
  const rows = peopleRows(doers(stack.people), stack.queue, seen, stack.doneThisWeek, () => null)
  const never = rows.filter(r => !r.seen?.last && r.open > 0)
  const load = stack.queue.load

  return (
    <div className="mw-wrap">
      <MwHero tab="people" pulled="" stale={false} sources="Moving Walls · tasks, decisions and app visits ·"
        headline={never.length
          ? `${never.length} ${never.length === 1 ? 'person has' : 'people have'} open tasks and ${never.length === 1 ? 'has' : 'have'} never opened the app`
          : 'Everyone with open tasks has opened the app'}>
        <p>
          Each person gets only what fits their week. Their tasks live here and on Today — no emails go
          out, so {bosses(stack.people).map(b => b.name).join(' and ')} follow up from this page.
        </p>
      </MwHero>

      <Section title="Team">
        <PeopleCards rows={rows} hrefFor={n => `/mw/people/${encodeURIComponent(n)}`} />
      </Section>

      <Section title="This week, person by person" sub="Hours planned against the hours each person has, and what is waiting behind it.">
        <table className="mw-kw wide">
          <thead>
            <tr><th>Person</th><th>Owns</th><th className="num">This week</th><th className="num">Hours</th><th className="num">Waiting</th><th className="num">Done (7 days)</th><th>Last opened</th></tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const l = load[r.p.name]
              const s = seenWords(r.seen)
              return (
                <tr key={r.p.name}>
                  <td><Link href={`/mw/people/${encodeURIComponent(r.p.name)}`}><b>{r.p.name}</b></Link></td>
                  <td>{r.p.title}</td>
                  <td className="num">{r.now}</td>
                  <td className="num">{l ? `${hrs(l.planned)} of ${hrs(l.cap)}` : '—'}</td>
                  <td className="num">{r.open - r.now}</td>
                  <td className="num">{r.done || <span className="mw-zero">0</span>}</td>
                  <td><span className={`mw-seen is-${s.tone}`}>{s.text}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>

      <p className="lede" style={{ marginTop: 8 }}>
        The old per-market plan pages are still reachable from each person&apos;s page while their page changes and city cards move over.
      </p>
    </div>
  )
}
