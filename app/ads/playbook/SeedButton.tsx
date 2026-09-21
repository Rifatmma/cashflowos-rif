'use client'

// One button instead of a wall of SQL. Calls the idempotent seedTasks() server
// action, so tapping it twice is harmless — it inserts only the tasks that
// aren't already there and never touches an existing row.
import { useState, useTransition } from 'react'
import { seedTasks } from './actions'

export default function SeedButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(true)

  return (
    <div>
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const r = await seedTasks()
              setOk(r.ok)
              setMsg(r.message)
            } catch {
              setOk(false)
              setMsg('Something went wrong — refresh and try again.')
            }
          })
        }
      >
        {pending ? 'Adding…' : `Add ${count} task${count === 1 ? '' : 's'} to the board`}
      </button>
      {msg && (
        <p className="decided" style={{ marginTop: 8, color: ok ? undefined : 'var(--bad)' }}>
          {msg}
        </p>
      )}
    </div>
  )
}
