'use client'

import { useState, useTransition } from 'react'
import { setRuleActive } from './rule-actions'

// The one interactive leaf on an otherwise all-server tab: switch a supplier note
// off when it turns out to be wrong. Kept deliberately small — a client component
// here means the rest of Cash Out stays a server render.
export default function RuleToggle({ id, active }: { id: number; active: boolean }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setRuleActive(id, !active)
            setErr(res.ok ? null : res.message ?? 'That did not save.')
          })
        }
        title={active ? 'Stop applying this when reading receipts' : 'Apply this again'}
      >
        {pending ? '…' : active ? 'Stop using' : 'Use again'}
      </button>
      {err && <div style={{ color: 'var(--rust)', fontSize: 12, marginTop: 4 }}>{err}</div>}
    </>
  )
}
