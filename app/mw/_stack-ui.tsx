// 👉 The pieces of Today and People: signals, the one ranked list, and a card per person.
//
// Server components. Every control is a link or a plain <form>, so it works
// on a phone with JS off — the same rule as the planner card it grew from.
// One look, then one action: no section here exists to be read.

import Link from 'next/link'
import type { Ranked, Queue } from '@/lib/mw-priorities'
import type { Person } from '@/lib/mw-people'
import type { Seen } from '@/lib/mw-presence'
import { setQueueStage } from './actions'

import type { StackSignal, SignalTone as Tone } from '@/lib/mw-stack-signals'
export type { StackSignal }

export function Signals({ items }: { items: StackSignal[] }) {
  return (
    <section className="mw-glance" aria-label="How marketing is doing">
      <div className="mw-glance-grid">
        {items.map(s => {
          const body = (
            <>
              <span className="mw-sig-dot" aria-hidden="true" />
              <span className="mw-sig-k">{s.label}</span>
              <span className="mw-sig-v">{s.value}</span>
              <span className="mw-sig-n">{s.note}</span>
            </>
          )
          return s.href
            ? <a key={s.key} href={s.href} className={`mw-sig is-${s.tone}`}>{body}</a>
            : <div key={s.key} className={`mw-sig is-${s.tone}`}>{body}</div>
        })}
      </div>
    </section>
  )
}

export function DoFirst({ item, href }: { item: Ranked | null; href: string }) {
  if (!item) return null
  return (
    <a className="mw-first" href={href}>
      <span className="mw-first-k">Do this first</span>
      <span className="mw-first-t">{item.title}</span>
      <span className="mw-first-g">{item.owner} · {hrs(item.effortHours)} · {item.valueLabel}</span>
      <span className="mw-first-go" aria-hidden="true">→</span>
    </a>
  )
}

export const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${+h.toFixed(1)} h`)

/** The ranked list. `canAnswer` decides who sees Done / Can't on each row. */
export function TaskList({ items, focus, canAnswer, empty }: {
  items: Ranked[]
  focus: Set<string>
  canAnswer: (x: Ranked) => boolean
  empty?: string
}) {
  if (!items.length) return <p className="mw-planner-lab">{empty ?? 'Nothing here.'}</p>
  return (
    <ol className="mw-queue">
      {items.map(x => (
        <li key={x.id} className={`mw-q${x.when === 'later' ? ' is-later' : ''}`} id={`t-${x.id.replace(/[^a-z0-9]/gi, '-')}`}>
          <span className="mw-q-n">{x.rank}</span>
          <div className="mw-q-main">
            <div className="mw-q-top">
              <span className={`mw-chip is-${x.channel.toLowerCase()}`}>{x.channel}</span>
              {focus.has(x.id) && <span className="mw-chip is-focus">Focus</span>}
              {x.when === 'later' && <span className="mw-chip is-later">Next week</span>}
              <b className="mw-q-title">{x.href ? <Link href={x.href}>{x.title}</Link> : x.title}</b>
            </div>
            <p className="mw-q-why">{x.why}</p>
            {x.reraised && <p className="mw-q-why is-reraised">↻ {x.reraised}</p>}
            <p className="mw-q-meta">
              {x.owner}{x.helper && x.helper !== x.owner ? ` · with ${x.helper}` : ''}
              {x.market ? ` · ${x.market}` : ''} · {hrs(x.effortHours)} · done when: {x.doneWhen}
            </p>
            {canAnswer(x) && (
              <div className="mw-q-act">
                <form action={setQueueStage}>
                  <input type="hidden" name="id" value={x.id} />
                  <input type="hidden" name="stage" value="done" />
                  <button className="mw-planner-btn is-small">Done</button>
                </form>
                <details className="mw-q-cant">
                  <summary className="mw-planner-btn is-quiet is-small">Can&apos;t do this</summary>
                  <form action={setQueueStage}>
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="stage" value="declined" />
                    <input name="reason" required maxLength={300} placeholder="Why not? It comes back only if the numbers change." aria-label="Why not" />
                    <button className="mw-planner-btn is-small">Save</button>
                  </form>
                </details>
              </div>
            )}
          </div>
          <span className="mw-q-v">{x.valueLabel}</span>
        </li>
      ))}
    </ol>
  )
}

/** "Last opened" in words, from the presence log. */
export function seenWords(s: Seen | undefined): { text: string; tone: Tone } {
  if (!s?.last) return { text: 'Never opened the app', tone: 'bad' }
  const d = Math.floor((Date.now() - Date.parse(s.last)) / 86_400_000)
  if (d <= 0) return { text: 'Opened today', tone: 'good' }
  if (d < 7) return { text: `Opened ${d} day${d === 1 ? '' : 's'} ago`, tone: 'good' }
  return { text: `Last opened ${d} days ago`, tone: 'warn' }
}

export type PersonRow = { p: Person; open: number; now: number; done: number; oldestDays: number | null; seen: Seen | undefined }

export function peopleRows(people: Person[], q: Queue, seen: Map<string, Seen>, doneThisWeek: Map<string, number>, ageOf: (x: Ranked) => number | null): PersonRow[] {
  return people.map(p => {
    const mine = q.items.filter(x => x.owner === p.name)
    const ages = mine.map(ageOf).filter((n): n is number => n !== null)
    return {
      p, open: mine.length, now: mine.filter(x => x.when === 'now').length,
      done: doneThisWeek.get(p.name) ?? 0,
      oldestDays: ages.length ? Math.max(...ages) : null,
      seen: seen.get(p.name),
    }
  })
}

export function PeopleCards({ rows, active, hrefFor }: { rows: PersonRow[]; active?: string | null; hrefFor: (name: string) => string }) {
  return (
    <div className="mw-pcards">
      {rows.map(r => {
        const s = seenWords(r.seen)
        return (
          <Link key={r.p.name} href={hrefFor(r.p.name)} scroll={false}
            className={`mw-pcard${active === r.p.name ? ' is-on' : ''}`} aria-current={active === r.p.name ? 'true' : undefined}>
            <span className="mw-pcard-top">
              <span className="mw-av" aria-hidden="true">{r.p.name.slice(0, 2).toUpperCase()}</span>
              <span className="mw-pcard-id">
                <b>{r.p.name}</b>
                <small>{r.p.title}</small>
              </span>
            </span>
            <span className="mw-pcard-n">{r.now} this week · {r.open - r.now} waiting · {r.done} done</span>
            <span className={`mw-pcard-seen is-${s.tone}`}>{s.text}</span>
          </Link>
        )
      })}
    </div>
  )
}
