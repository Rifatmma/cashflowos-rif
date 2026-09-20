// 👉 This is a normal tab — safe to tweak. It reads the ONE `records` table and
// lists your ops to-dos with overdue ones flagged red.
//
// IT SHOWS TWO CATEGORIES ON PURPOSE:
//   • 'task'     — ops to-dos, created here or by the bot. Editable anywhere.
//   • 'ad_task'  — the Facebook Ads playbook board. Shown so this tab is the one
//                  place every to-do appears, but EDITED on /ads/playbook, which
//                  owns their status buttons, notes and decline reasons.
// They keep separate categories so ad work can't pollute the ops numbers — see
// docs/add-a-tab-prompt.md on why reusing a built-in category is a bug.
import Link from 'next/link'
import { getRecords, todayISO, type Rec } from '@/lib/records'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'

export const dynamic = 'force-dynamic'

// Resolved = finished one way or the other. 'declined' only ever appears on ad
// tasks (you decided not to do it, with a reason) and must not count as open.
const RESOLVED = new Set(['done', 'declined'])

export default async function Tasks() {
  const today = todayISO()
  const all = await getRecords()
  const rows = all
    .filter(r => r.category === 'task' || r.category === 'ad_task')
    .sort((a, b) => ((a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1))

  const isAd = (r: Rec) => r.category === 'ad_task'
  const isResolved = (r: Rec) => RESOLVED.has((r.status || '').toLowerCase())
  // Ongoing ad habits carry a start-by date, not a deadline — they would sit
  // permanently overdue otherwise and drown the real ones.
  const isHabit = (r: Rec) => isAd(r) && r.meta?.phase === 'ongoing'
  const isOverdue = (r: Rec) =>
    !!r.due_date && r.due_date < today && !isResolved(r) && !isHabit(r)

  const overdue = rows.filter(isOverdue).length
  const open = rows.filter(r => !isResolved(r)).length
  const done = rows.filter(r => (r.status || '').toLowerCase() === 'done').length
  const fromAds = rows.filter(r => isAd(r) && !isResolved(r)).length

  return (
    <>
      <h1 className="ph">Tasks ✅</h1>
      <p className="cap">Every to-do in one place — ops work and the Facebook Ads playbook.</p>

      <div className="grid">
        <Stat label="Open" value={open} />
        <Stat label="Overdue" value={overdue} yes={overdue > 0} />
        <Stat label="Done" value={done} />
        <Stat label="Open from Ads" value={fromAds} href="/ads/playbook" />
      </div>

      {rows.length === 0 ? (
        <Empty label="tasks" />
      ) : (
        <>
          <table className="tbl">
            <thead>
              <tr>
                <th>Task</th>
                <th>Source</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const od = isOverdue(r)
                const status = (r.status || '').toLowerCase()
                const ad = isAd(r)
                return (
                  <tr key={r.id}>
                    <td data-label="Task">
                      <span style={isResolved(r) ? { textDecoration: 'line-through', color: 'var(--dim)' } : undefined}>
                        {r.title}
                      </span>
                      {ad && r.meta?.priority ? (
                        <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}> #{r.meta.priority}</span>
                      ) : null}
                    </td>
                    <td data-label="Source">
                      {ad ? (
                        <Link href="/ads/playbook" style={{ color: 'var(--clay)', textDecoration: 'none', fontSize: 13 }}>
                          📊 Facebook Ads
                        </Link>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Ops</span>
                      )}
                    </td>
                    <td data-label="Due" style={od ? { color: 'var(--rust)' } : undefined}>
                      {r.due_date ?? '—'}
                      {isHabit(r) && <span style={{ color: 'var(--dim)', fontSize: 12 }}> · weekly</span>}
                    </td>
                    <td data-label="Status">
                      <span className={`pill ${od ? 'overdue' : status === 'declined' ? 'rejected' : status}`}>
                        {od ? 'overdue' : r.status || '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {fromAds > 0 && (
            <p className="hint" style={{ marginTop: 14 }}>
              Ad tasks are listed here but edited on the{' '}
              <Link href="/ads/playbook" style={{ color: 'var(--clay)' }}>Playbook</Link> tab, where each one has
              its status buttons, notes and a place to record why you decided against it.
            </p>
          )}
        </>
      )}
    </>
  )
}
