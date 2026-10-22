'use client'
import { useActionState } from 'react'
import { sendDigestPreview } from '../actions'

export function DigestPreviewButton() {
  const [state, action, pending] = useActionState(sendDigestPreview, { message: '' })
  return (
    <form action={action} className="mw-planner-row">
      <button className="mw-planner-btn" disabled={pending}>{pending ? 'Sending…' : 'Send me a preview now'}</button>
      {state.message && <span className="mw-planner-lab">{state.message}</span>}
    </form>
  )
}
