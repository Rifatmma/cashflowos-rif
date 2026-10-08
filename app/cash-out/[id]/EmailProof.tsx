'use client'

import { useActionState } from 'react'
import { fetchProofFromEmail, type EmailProofResult } from './email-proof-actions'

// Shown only on a receipt that came from the mailbox and has nothing proving
// it. A card charge has no paper to photograph, so the only evidence that
// exists is the email — and it is one tap away rather than a terminal command.

export function EmailProof({ id }: { id: number }) {
  const [res, run, busy] = useActionState<EmailProofResult, FormData>(fetchProofFromEmail, null)

  return (
    <form action={run} className="ep">
      <input type="hidden" name="id" value={id} />
      {!res?.ok && (
        <>
          <button className="btn ghost" disabled={busy}>
            {busy ? 'Looking in your email…' : 'Get the proof from your email'}
          </button>
          <p className="co-meta ep-why">
            This one was paid online, so there is no bill to photograph. I&rsquo;ll fetch the
            invoice the seller attached &mdash; or, if there wasn&rsquo;t one, save the email itself.
          </p>
        </>
      )}
      {res && (
        <p className={res.ok ? 'rp-ok' : 'rp-bad'} role="status">
          {res.ok ? '📎 ' : '⚠️ '}{res.message}
          {res.ok && ' Reload to see it.'}
        </p>
      )}
      {/* Only when it failed: what Gmail actually returned, so it can be
          pasted back to me and the reading corrected against real data. */}
      {res && !res.ok && res.note && (
        <details className="ep-note">
          <summary>What came back from Gmail</summary>
          <pre>{res.note}</pre>
        </details>
      )}
    </form>
  )
}
