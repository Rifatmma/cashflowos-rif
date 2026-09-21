'use client'

// The interactive leaf on the ad task board. Like ApproveButtons, it never
// imports the server-only Supabase client — it calls the 'use server' wrappers
// in ./actions.ts instead.
//
// PHONE FIRST: the three things you actually tap -- Done, Doing, Not doing --
// sit in one row. Note, Blocked and back-to-To-do live behind "More", because
// six buttons per task is a wall on a phone. Declining still refuses to save
// without a reason: the reasons are how Claude learns what doesn't fit.
import { useState, useTransition } from 'react'
import { setStatus, declineTask, saveNote } from './actions'
import { type TaskStatus } from '@/lib/ad-tasks'

const box: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--paper)',
  border: '1px solid var(--line-2)', borderRadius: 'var(--r-13)',
  padding: '10px 12px', fontSize: 14, color: 'var(--ink)',
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
  const [open, setOpen] = useState<null | 'note' | 'decline' | 'more'>(null)
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

  const resolved = status === 'done' || status === 'declined'

  return (
    <div className="ad-ctl">
      <div className="ad-ctl-row">
        {status !== 'done' && (
          <button className="btn ad-ctl-btn" disabled={pending} onClick={() => run(() => setStatus(id, 'done'))}>
            Done
          </button>
        )}
        {status !== 'doing' && !resolved && (
          <button className="btn ghost ad-ctl-btn" disabled={pending} onClick={() => run(() => setStatus(id, 'doing'))}>
            Doing
          </button>
        )}
        {status !== 'declined' && (
          <button className="btn ghost ad-ctl-btn" disabled={pending}
            onClick={() => setOpen(open === 'decline' ? null : 'decline')}>
            Not doing
          </button>
        )}
        <button className="btn ghost ad-ctl-btn ad-ctl-more" disabled={pending} aria-expanded={open === 'more'}
          onClick={() => setOpen(open === 'more' ? null : 'more')}>
          More{note ? ' •' : ''}
        </button>
      </div>

      {open === 'more' && (
        <div className="ad-ctl-row" style={{ marginTop: 6 }}>
          <button className="btn ghost ad-ctl-btn" disabled={pending} onClick={() => setOpen('note')}>
            {note ? 'Edit note' : 'Add note'}
          </button>
          {status !== 'blocked' && !resolved && (
            <button className="btn ghost ad-ctl-btn" disabled={pending} onClick={() => run(() => setStatus(id, 'blocked'), true)}>
              Blocked
            </button>
          )}
          {status !== 'todo' && (
            <button className="btn ghost ad-ctl-btn" disabled={pending} onClick={() => run(() => setStatus(id, 'todo'), true)}>
              Back to to-do
            </button>
          )}
        </div>
      )}

      {open === 'note' && (
        <div style={{ marginTop: 8 }}>
          <textarea style={box} rows={3} value={draft} maxLength={2000}
            placeholder="Progress, blockers, what you tried…" onChange={e => setDraft(e.target.value)} />
          <div className="ad-ctl-row" style={{ marginTop: 6 }}>
            <button className="btn ad-ctl-btn" disabled={pending} onClick={() => run(() => saveNote(id, draft), true)}>
              {pending ? '…' : 'Save note'}
            </button>
            <button className="btn ghost ad-ctl-btn" onClick={() => { setDraft(note); setOpen(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {open === 'decline' && (
        <div style={{ marginTop: 8 }}>
          <p className="ad-ctl-why">
            <strong>Why not?</strong> This is the part worth keeping — it teaches Claude what doesn&rsquo;t fit your
            restaurant, so the next suggestions are better.
          </p>
          <textarea style={box} rows={3} value={why} maxLength={2000}
            placeholder="e.g. we tried dayparting in June and delivery never recovered"
            onChange={e => setWhy(e.target.value)} />
          <div className="ad-ctl-row" style={{ marginTop: 6 }}>
            <button className="btn danger ad-ctl-btn" disabled={pending} onClick={() => run(() => declineTask(id, why), true)}>
              {pending ? '…' : 'Save and decline'}
            </button>
            <button className="btn ghost ad-ctl-btn" onClick={() => { setWhy(reason); setOpen(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {msg && <p className="decided" style={{ marginTop: 6 }}>{msg}</p>}
    </div>
  )
}
