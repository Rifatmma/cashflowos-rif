'use client'

// The interactive leaf on the ad task board. Like ApproveButtons, it never
// imports the server-only Supabase client — it calls the 'use server' wrappers
// in ./actions.ts instead.
import { useState, useTransition } from 'react'
import { setStatus, declineTask, saveNote } from './actions'
import { STATUS_LABEL, type TaskStatus } from '@/lib/ad-tasks'

const NEXT: { to: TaskStatus; label: string; ghost?: boolean }[] = [
  { to: 'doing', label: '▶ Doing' },
  { to: 'done', label: '✅ Done' },
  { to: 'blocked', label: '⏸ Blocked', ghost: true },
  { to: 'todo', label: '↺ To do', ghost: true },
]

const box: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--paper)',
  border: '1px solid var(--line-2)', borderRadius: 'var(--r-13)',
  padding: '9px 11px', fontSize: 13, color: 'var(--ink)',
  fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical',
}

export default function TaskControls({
  id, status, note, reason,
}: {
  id: number
  status: TaskStatus
  note: string
  reason: string
}) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState<null | 'note' | 'decline'>(null)
  const [draft, setDraft] = useState(note)
  const [why, setWhy] = useState(reason)

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, close = false) =>
    startTransition(async () => {
      try {
        const r = await fn()
        setMsg(r.message)
        if (r.ok && close) setOpen(null)
      } catch {
        setMsg('Something went wrong — refresh and try again.')
      }
    })

  return (
    <div>
      <div className="btnrow" style={{ flexWrap: 'wrap', gap: 6 }}>
        {NEXT.filter(n => n.to !== status).map(n => (
          <button
            key={n.to}
            className={`btn${n.ghost ? ' ghost' : ''}`}
            style={{ padding: '6px 11px', fontSize: 13 }}
            disabled={pending}
            onClick={() => run(() => setStatus(id, n.to))}
          >
            {n.label}
          </button>
        ))}
        <button
          className="btn ghost"
          style={{ padding: '6px 11px', fontSize: 13 }}
          disabled={pending}
          onClick={() => setOpen(open === 'note' ? null : 'note')}
        >
          📝 Note{note ? ' •' : ''}
        </button>
        {status !== 'declined' && (
          <button
            className="btn danger"
            style={{ padding: '6px 11px', fontSize: 13 }}
            disabled={pending}
            onClick={() => setOpen(open === 'decline' ? null : 'decline')}
          >
            ✕ Not doing this
          </button>
        )}
      </div>

      {open === 'note' && (
        <div style={{ marginTop: 8 }}>
          <textarea
            style={box}
            rows={3}
            value={draft}
            maxLength={2000}
            placeholder="Progress, blockers, what you tried, who is on it…"
            onChange={e => setDraft(e.target.value)}
          />
          <div className="btnrow" style={{ marginTop: 6 }}>
            <button className="btn" style={{ padding: '6px 13px', fontSize: 13 }} disabled={pending}
              onClick={() => run(() => saveNote(id, draft), true)}>
              {pending ? '…' : 'Save note'}
            </button>
            <button className="btn ghost" style={{ padding: '6px 13px', fontSize: 13 }}
              onClick={() => { setDraft(note); setOpen(null) }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {open === 'decline' && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 6px', lineHeight: 1.5 }}>
            <strong>Why are you not doing this?</strong> This is the part worth keeping — it teaches Claude
            what does not fit your restaurant, so the next set of suggestions is better.
          </p>
          <textarea
            style={box}
            rows={3}
            value={why}
            maxLength={2000}
            placeholder="e.g. we tried dayparting in June and it starved delivery — Meta never recovered the pacing"
            onChange={e => setWhy(e.target.value)}
          />
          <div className="btnrow" style={{ marginTop: 6 }}>
            <button className="btn danger" style={{ padding: '6px 13px', fontSize: 13 }} disabled={pending}
              onClick={() => run(() => declineTask(id, why), true)}>
              {pending ? '…' : 'Save & decline'}
            </button>
            <button className="btn ghost" style={{ padding: '6px 13px', fontSize: 13 }}
              onClick={() => { setWhy(reason); setOpen(null) }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && <p className="decided" style={{ marginTop: 6 }}>{msg}</p>}
      {status === 'declined' && open !== 'decline' && (
        <p style={{ fontSize: 12, color: 'var(--dim)', margin: '6px 0 0', lineHeight: 1.5 }}>
          Declined — {STATUS_LABEL.declined.toLowerCase()} with reason saved.
        </p>
      )}
    </div>
  )
}
