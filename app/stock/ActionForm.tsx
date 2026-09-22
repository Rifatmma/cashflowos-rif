'use client'

// One small wrapper for every phone form on the Stock pages: runs a server
// action, disables the button while it works, and says what happened.
import { useActionState, type ReactNode } from 'react'
import type { Result } from './actions'

export default function ActionForm({ action, children, submit, className, pendingLabel = 'Saving…', ghost }: {
  action: (prev: Result, form: FormData) => Promise<Result>
  children: ReactNode
  submit: string
  className?: string
  pendingLabel?: string
  ghost?: boolean
}) {
  const [res, run, pending] = useActionState<Result, FormData>(action, null)
  return (
    <form action={run} className={className}>
      {children}
      <div className="st-submit">
        <button className={`btn ${ghost ? 'ghost' : ''}`} disabled={pending}>{pending ? pendingLabel : submit}</button>
        {res && <span className={`co-meta ${res.ok ? '' : 'co-flag'}`} role="status">{res.message}</span>}
      </div>
    </form>
  )
}
