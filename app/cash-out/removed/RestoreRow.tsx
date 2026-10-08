'use client'

import { useActionState } from 'react'
import { putBack, type RestoreResult } from './actions'

export function RestoreRow({ id, merchant }: { id: number; merchant: string }) {
  const [res, run, busy] = useActionState<RestoreResult, FormData>(putBack, null)
  if (res?.ok) return <span className="rmd-done">Put back ✓</span>
  return (
    <form action={run} className="rmd-act">
      <input type="hidden" name="id" value={id} />
      <button className="btn ghost" disabled={busy} aria-label={`Put ${merchant} back`}>
        {busy ? 'Putting back…' : 'Put it back'}
      </button>
      {res && !res.ok && <span className="rp-bad">{res.message}</span>}
    </form>
  )
}
