// 👉 Facebook Ads → Playbook. A tracked task board, not a list of suggestions.
// Definitions live in lib/ad-tasks.ts; mutable state (status, notes, decline
// reasons) lives in Supabase `records` under category 'ad_task', joined on
// meta.key. See the header of lib/ad-tasks.ts for why it is split that way.
import Stat from '@/app/_components/Stat'
import { getRecords, todayISO, type Rec } from '@/lib/records'
import { SNAPSHOT as S, CREATIVE, POSTING, AUDIENCES, CURRENT } from '@/lib/ads-snapshot'
import {
  TASKS, PHASES, PROMO_ENDS, STATUS_PILL, STATUS_LABEL, seedSql,
  type TaskStatus, type TaskDef,
} from '@/lib/ad-tasks'
import { SubNav, Note, money, pct } from '../_ui'
import TaskControls from './TaskControls'
import SeedButton from './SeedButton'

export const dynamic = 'force-dynamic'

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export default async function Playbook() {
  const t = S.totals
  const today = todayISO()
  const rows = (await getRecords()).filter(r => r.category === 'ad_task')
  const tracked = rows.length > 0

  // Join definition → row on meta.key. A definition with no row shows as 'todo'
  // so the board is never empty while seeding is half-done.
  const byKey = new Map<string, Rec>()
  for (const r of rows) {
    const k = r.meta?.key
    if (typeof k === 'string') byKey.set(k, r)
  }

  type Live = TaskDef & {
    id: number | null
    status: TaskStatus
    note: string
    reason: string
    owner: string
    overdue: boolean
  }

  const live: Live[] = TASKS.map(def => {
    const r = byKey.get(def.key)
    const status = ((r?.status as TaskStatus) || 'todo')
    const open = status !== 'done' && status !== 'declined'
    return {
      ...def,
      id: r?.id ?? null,
      status,
      note: r?.notes ?? '',
      reason: r?.meta?.declined_reason ?? '',
      owner: r?.meta?.owner ?? '—',
      // Ongoing habits carry a "start by" date, not a deadline — without this
      // they would sit permanently overdue and drown the real deadlines.
      overdue: open && def.due < today && def.phase !== 'ongoing',
    }
  }).sort((a, b) => a.priority - b.priority)

  const count = (s: TaskStatus) => live.filter(x => x.status === s).length
  const done = count('done')
  const declined = count('declined')
  const overdue = live.filter(x => x.overdue).length
  const daysLeft = daysBetween(today, PROMO_ENDS)
  const declinedList = live.filter(x => x.status === 'declined')

  return (
    <>
      <h1 className="ph">Facebook Ads — Playbook 🎬</h1>
      <p className="cap">
        Every suggestion, scheduled and tracked. Built off run {CURRENT.id} · {S.period.since} to {S.period.until}.
      </p>
      <SubNav here="/ads/playbook" />

      {!tracked && (
        <div className="banner warn">
          <p style={{ margin: '0 0 10px' }}>
            <strong>Tracking is not switched on yet.</strong> The board below is read-only until the tasks exist
            in Supabase. One tap creates them — then status buttons, notes and decline reasons all start saving.
          </p>
          <SeedButton count={TASKS.length} />
        </div>
      )}

      <div className="grid">
        <Stat label="Tasks" value={live.length} />
        <Stat label="Done" value={done} />
        <Stat label="In progress" value={count('doing')} />
        <Stat label="Overdue" value={overdue} yes={overdue > 0} />
        <Stat label="Days left on promo" value={daysLeft >= 0 ? daysLeft : 'Ended'} yes={daysLeft <= 10} />
      </div>

      {/* progress bar */}
      <div className="kc" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
          <span style={{ color: 'var(--ink)' }}>
            {done} done · {declined} declined · {live.length - done - declined} still open
          </span>
          <span style={{ color: 'var(--dim)' }}>{pct(((done + declined) / live.length) * 100)} resolved</span>
        </div>
        <div style={{ height: 10, borderRadius: 5, background: 'var(--paper-2)', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: pct((done / live.length) * 100), background: 'var(--green)' }} />
          <div style={{ width: pct((declined / live.length) * 100), background: 'var(--bad-line)' }} />
        </div>
      </div>

      {/* ── The board, by phase ──────────────────────────── */}
      {PHASES.map(ph => {
        const items = live.filter(x => x.phase === ph.id)
        if (!items.length) return null
        const phDone = items.filter(x => x.status === 'done' || x.status === 'declined').length
        return (
          <section key={ph.id}>
            <p className="rowlabel" style={{ marginTop: 26 }}>
              {ph.label} <span style={{ color: 'var(--dim)', fontWeight: 400 }}>· {ph.window} · {phDone}/{items.length} resolved</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--dim)', margin: '0 0 10px', lineHeight: 1.6 }}>{ph.blurb}</p>

            {items.map(x => (
              <div className="kc" key={x.key} style={x.overdue ? { borderColor: 'var(--bad-line)' } : undefined}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)',
                    minWidth: 22, paddingTop: 2,
                  }}>#{x.priority}</span>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <p className="t" style={{ marginBottom: 4 }}>
                      <strong style={x.status === 'done' || x.status === 'declined'
                        ? { textDecoration: 'line-through', color: 'var(--dim)' } : undefined}>
                        {x.title}
                      </strong>
                      {' '}<span className={`pill ${STATUS_PILL[x.status]}`}>{STATUS_LABEL[x.status]}</span>
                      {' '}<span className="tag soon">{x.kind}</span>
                      {x.overdue && <> <span className="pill overdue">overdue</span></>}
                    </p>
                    <p className="s" style={{ marginBottom: 6 }}>{x.why}</p>
                    <p className="s">
                      <strong>Measure:</strong> {x.measure} ·{' '}
                      <strong>{x.phase === 'ongoing' ? 'Start by:' : 'Due:'}</strong> {x.due}
                      {' · '}<strong>Effort:</strong> {x.effort} · <strong>Impact:</strong> {x.impact}
                      {' · '}<strong>Owner:</strong> {x.owner}
                    </p>

                    {x.note && (
                      <p style={{
                        fontSize: 12, color: 'var(--ink)', background: 'var(--paper-2)',
                        borderRadius: 8, padding: '7px 9px', margin: '8px 0 0', lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                      }}>
                        📝 {x.note}
                      </p>
                    )}
                    {x.reason && (
                      <p style={{
                        fontSize: 12, color: 'var(--bad)', background: 'var(--bad-tint)',
                        borderRadius: 8, padding: '7px 9px', margin: '8px 0 0', lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                      }}>
                        ✕ Not doing this — {x.reason}
                      </p>
                    )}

                    <div style={{ marginTop: 8 }}>
                      {x.id !== null ? (
                        <TaskControls id={x.id} status={x.status} note={x.note} reason={x.reason} />
                      ) : (
                        <p style={{ fontSize: 12, color: 'var(--dim)', margin: 0 }}>
                          Not in Supabase yet — run the seed SQL below to make this editable.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )
      })}

      {/* ── Decisions & learning ─────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Decisions &amp; learning</p>
      {declinedList.length === 0 ? (
        <div className="empty">
          Nothing declined yet.<br />
          When you decide a suggestion is not right for the restaurant, hit <strong>Not doing this</strong> and say why.
          The reasons collect here — they are how Claude learns what does not fit you.
        </div>
      ) : (
        <>
          <table className="tbl">
            <thead><tr><th>Task</th><th>Why not</th><th>Phase</th></tr></thead>
            <tbody>
              {declinedList.map(x => (
                <tr key={x.key}>
                  <td data-label="Task"><strong>{x.title}</strong></td>
                  <td data-label="Why not">{x.reason || '—'}</td>
                  <td data-label="Phase">{PHASES.find(p => p.id === x.phase)?.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note>
            Point Claude at this section — say &ldquo;read the declined ad tasks&rdquo; — and the reasoning gets
            written into its long-term memory, so future suggestions stop repeating what you have already ruled out.
          </Note>
        </>
      )}

      {/* ── Reference ────────────────────────────────────── */}
      <p className="rowlabel" style={{ marginTop: 26 }}>Reference — the shot list</p>
      <div className="cols">
        <div className="col">
          <h3>How to shoot it</h3>
          {CREATIVE.map(c => (
            <div className="kc" key={c.t}>
              <p className="t"><strong>{c.t}</strong> <span className="tag live">{c.fmt}</span></p>
              <p className="s">{c.s}</p>
            </div>
          ))}
        </div>
        <div className="col">
          <h3>How to post it</h3>
          {POSTING.map(c => (
            <div className="kc" key={c.t}>
              <p className="t"><strong>{c.t}</strong></p>
              <p className="s">{c.s}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="rowlabel" style={{ marginTop: 26 }}>Reference — audiences worth testing</p>
      <div className="cols">
        <div className="col">
          <h3>From your own data</h3>
          {AUDIENCES.filter(a => a.why === 'From your data').map(a => (
            <div className="kc" key={a.t}>
              <p className="t"><strong>{a.t}</strong></p>
              <p className="s">{a.s}</p>
            </div>
          ))}
        </div>
        <div className="col">
          <h3>New bets</h3>
          {AUDIENCES.filter(a => a.why === 'New test').map(a => (
            <div className="kc" key={a.t}>
              <p className="t"><strong>{a.t}</strong></p>
              <p className="s">{a.s}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="rowlabel" style={{ marginTop: 26 }}>The offer, for reference</p>
      <div className="kc">
        <p className="t">
          <strong>{money(S.offer.price)}</strong>{' '}
          <span style={{ color: 'var(--dim)', textDecoration: 'line-through' }}>{money(S.offer.normalPrice)}</span>
          {' — ends '}{S.offer.endsAt}
        </p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink)', lineHeight: 1.8 }}>
          {S.offer.includes.map(i => <li key={i}>{i}</li>)}
        </ul>
        <p className="s" style={{ marginTop: 8 }}>
          At {S.offer.venue}. The free {S.offer.freeItem} is worth {money(S.offer.freeItemValue)} — lead with it.
        </p>
      </div>

      {/* ── Setup, tucked away ───────────────────────────── */}
      {!tracked && (
        <details style={{ marginTop: 26 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
            Prefer to run the SQL yourself?
          </summary>
          <Note>
            The button above does exactly this and is safe to tap twice. If you would rather paste it into the
            Supabase SQL Editor, here it is — generated from the task definitions so it cannot drift.
            Unlike the button, running this twice <em>would</em> duplicate the rows.
          </Note>
          <pre className="brief" style={{ maxHeight: 280, overflow: 'auto', fontSize: 11 }}>{seedSql('Rif')}</pre>
        </details>
      )}

      <p className="hint" style={{ marginTop: 22 }}>
        {tracked
          ? `Tracked in Supabase — ${rows.length} task rows. Status, notes and decline reasons save instantly.`
          : 'Read-only until the seed SQL is run.'}
        {' '}Cost per conversation {money(t.spend / t.convos)} · depth-2 {pct((t.depth2 / t.convos) * 100)} — write these
        down before you start testing so you can tell what actually moved.
      </p>
    </>
  )
}
