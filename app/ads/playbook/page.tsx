// 👉 Facebook Ads → Playbook. A tracked task board, not a list of suggestions.
//
// PHONE FIRST: the three most urgent open tasks sit at the top with one-tap
// status buttons. Everything else folds away -- phases, the decisions you've
// made, and the reference material (shot list, audiences, the offer), which is
// reading, not doing.
//
// Definitions live in lib/ad-tasks.ts; mutable state (status, notes, decline
// reasons) lives in Supabase `records` under category 'ad_task', joined on
// meta.key. See the header of lib/ad-tasks.ts for why it's split that way.
import { getRecords, type Rec } from '@/lib/records'
import { mytDate, daysBetween, dayLabel } from '@/lib/period'
import { SNAPSHOT as S, CREATIVE, POSTING, AUDIENCES } from '@/lib/ads-snapshot'
import { TASKS, PHASES, PROMO_ENDS, STATUS_LABEL, seedSql, type TaskStatus, type TaskDef } from '@/lib/ad-tasks'
import { AdsHeader, Card, Fold, Written, money } from '../_ui'
import TaskControls from './TaskControls'
import SeedButton from './SeedButton'

export const dynamic = 'force-dynamic'

type Live = TaskDef & { id: number | null; status: TaskStatus; note: string; reason: string; overdue: boolean; open: boolean }

const NEXT_UP = 3

function TaskCard({ x, today }: { x: Live; today: string }) {
  const due = x.phase === 'ongoing' ? 'weekly'
    : x.overdue ? `overdue · ${dayLabel(x.due, today).toLowerCase()}`
    : x.due === today ? 'due today'
    : `due ${dayLabel(x.due, today).toLowerCase()}`
  return (
    <div className={`co-card ad-task ${x.overdue ? 'ad-task-late' : ''} ${x.open ? '' : 'ad-task-closed'}`}>
      <div className="co-row" style={{ alignItems: 'flex-start' }}>
        <span className="ad-task-title">{x.title}</span>
        <span className={`ad-due mono ${x.overdue || x.due === today ? 'ad-bad' : ''}`}>{x.open ? due : STATUS_LABEL[x.status].toLowerCase()}</span>
      </div>
      <p className="ad-task-why">{x.why}</p>
      <p className="co-meta mono">{x.kind} · {x.impact} impact · {x.effort.toLowerCase()} · measure: {x.measure}</p>
      {x.note && <p className="ad-task-note">{x.note}</p>}
      {x.reason && <p className="ad-task-reason">Not doing this: {x.reason}</p>}
      {x.id !== null
        ? <TaskControls id={x.id} status={x.status} note={x.note} reason={x.reason} />
        : <p className="co-meta">Not on the board yet — tap the button above to add it.</p>}
    </div>
  )
}

export default async function Playbook() {
  const today = mytDate()
  const rows = (await getRecords()).filter(r => r.category === 'ad_task')
  const byKey = new Map<string, Rec>()
  for (const r of rows) if (typeof r.meta?.key === 'string') byKey.set(r.meta.key, r)

  const live: Live[] = TASKS.map(def => {
    const r = byKey.get(def.key)
    const status = ((r?.status as TaskStatus) || 'todo')
    const open = status !== 'done' && status !== 'declined'
    return {
      ...def, id: r?.id ?? null, status, open,
      note: r?.notes ?? '', reason: r?.meta?.declined_reason ?? '',
      // Weekly habits carry a start-by date, not a deadline -- never "overdue".
      overdue: open && def.due < today && def.phase !== 'ongoing',
    }
  })
  const missing = live.filter(x => x.id === null).length

  // Next up: overdue first, then soonest due, then priority. Habits last.
  // Priority 0 is reserved for legal problems and always leads, whatever its date.
  const nextUp = live.filter(x => x.open && x.phase !== 'ongoing')
    .sort((a, b) => Number(b.priority === 0) - Number(a.priority === 0) || Number(b.overdue) - Number(a.overdue) || a.due.localeCompare(b.due) || a.priority - b.priority)
    .slice(0, NEXT_UP)
  const nextKeys = new Set(nextUp.map(x => x.key))

  const done = live.filter(x => x.status === 'done').length
  const declined = live.filter(x => x.status === 'declined').length
  const overdue = live.filter(x => x.overdue).length
  const daysLeft = daysBetween(today, PROMO_ENDS)
  const declinedList = live.filter(x => x.status === 'declined')

  return (
    <div className="co ad">
      <AdsHeader title="Playbook" here="/ads/playbook"
        right={<span className={`ad-fresh mono ${daysLeft <= 3 ? 'stale' : ''}`}>
          {daysLeft > 0 ? `${daysLeft} days of promo left` : daysLeft === 0 ? 'promo ends today' : 'promo ended'}
        </span>} />

      {missing > 0 && (
        <div className="co-card ad-tone-warn">
          <p className="ad-alert" style={{ margin: '0 0 10px' }}>
            {missing === live.length
              ? <><b>Tracking isn&rsquo;t on yet.</b> One tap puts all {live.length} tasks on the board so their status, notes and reasons save.</>
              : <><b>{missing} new task{missing === 1 ? '' : 's'}</b> since you set the board up. One tap adds {missing === 1 ? 'it' : 'them'} — nothing you&rsquo;ve done is touched.</>}
          </p>
          <SeedButton count={missing} />
        </div>
      )}

      <Card eyebrow="Progress" right={<span className="num">{done} of {live.length} done</span>}>
        <div className="ad-progress" aria-hidden="true">
          <span style={{ width: `${(done / live.length) * 100}%`, background: 'var(--green)' }} />
          <span style={{ width: `${(declined / live.length) * 100}%`, background: 'var(--bad-line)' }} />
        </div>
        <p className="co-meta">
          {declined} not doing · {overdue > 0 ? <span className="ad-bad">{overdue} overdue</span> : 'nothing overdue'}
        </p>
      </Card>

      <p className="ad-section">Next up</p>
      {nextUp.length === 0
        ? <Card><p className="co-sub">Nothing urgent left. The weekly habits are below.</p></Card>
        : nextUp.map(x => <TaskCard key={x.key} x={x} today={today} />)}

      {PHASES.map(ph => {
        const items = live.filter(x => x.phase === ph.id && !nextKeys.has(x.key))
          .sort((a, b) => Number(!a.open) - Number(!b.open) || a.priority - b.priority)
        const all = live.filter(x => x.phase === ph.id)
        if (!all.length) return null
        const resolved = all.filter(x => !x.open).length
        return (
          <Fold key={ph.id} title={ph.label.replace(' — ', ' · ')} meta={`${resolved}/${all.length}`}>
            <p className="co-meta" style={{ marginTop: 0 }}>{ph.window} · {ph.blurb}</p>
            {items.length === 0
              ? <p className="co-sub">Everything open here is in Next up.</p>
              : items.map(x => <TaskCard key={x.key} x={x} today={today} />)}
          </Fold>
        )
      })}

      <Fold title="Decisions and what I learned" meta={`${declinedList.length} declined`}>
        {declinedList.length === 0 ? (
          <p className="co-sub">
            Nothing declined yet. When a suggestion isn&rsquo;t right for the restaurant, tap <b>Not doing</b> and say why.
            The reasons collect here, and they&rsquo;re how Claude learns what doesn&rsquo;t fit you.
          </p>
        ) : (
          <>
            {declinedList.map(x => (
              <div key={x.key} className="ad-note"><strong>{x.title}</strong><p>{x.reason || '—'}</p></div>
            ))}
            <p className="co-meta">Tell Claude &ldquo;read the declined ad tasks&rdquo; and the reasoning goes into its long-term memory.</p>
          </>
        )}
      </Fold>

      <Fold title="Reference: what to shoot" meta={`${CREATIVE.length} shots`}>
        <Written on={S.pulledAt} />
        {CREATIVE.map(c => <div key={c.t} className="ad-note"><strong>{c.t}</strong> <span className="co-dim mono">· {c.fmt}</span><p>{c.s}</p></div>)}
        <p className="ad-h">How to post it</p>
        {POSTING.map(c => <div key={c.t} className="ad-note"><strong>{c.t}</strong><p>{c.s}</p></div>)}
      </Fold>

      <Fold title="Reference: audiences worth testing" meta={`${AUDIENCES.length}`}>
        <Written on={S.pulledAt} />
        <p className="ad-h">From your own data</p>
        {AUDIENCES.filter(a => a.why === 'From your data').map(a => <div key={a.t} className="ad-note"><strong>{a.t}</strong><p>{a.s}</p></div>)}
        <p className="ad-h">New bets</p>
        {AUDIENCES.filter(a => a.why === 'New test').map(a => <div key={a.t} className="ad-note"><strong>{a.t}</strong><p>{a.s}</p></div>)}
      </Fold>

      <Fold title="Reference: the offer">
        <p className="ad-body">
          <b className="num">{money(S.offer.price)}</b>{' '}
          <span className="co-dim" style={{ textDecoration: 'line-through' }}>{money(S.offer.normalPrice)}</span>
          {' '}· ends {S.offer.endsAt}
        </p>
        <ul className="ad-list">{S.offer.includes.map(i => <li key={i}>{i}</li>)}</ul>
        <p className="co-meta">At {S.offer.venue}. The free {S.offer.freeItem} is worth {money(S.offer.freeItemValue)} — lead with it.</p>
      </Fold>

      {missing === live.length && (
        <Fold title="Prefer to run the SQL yourself?">
          <p className="co-meta">The button above does exactly this and is safe to tap twice. Running this twice would duplicate rows.</p>
          <pre className="brief" style={{ maxHeight: 280, overflow: 'auto', fontSize: 11 }}>{seedSql('Rif')}</pre>
        </Fold>
      )}
    </div>
  )
}
