'use client'

import { useActionState } from 'react'
import { fetchAllEmailProof, type AllProofResult } from './email-proof-actions'

// One button for every receipt that only ever existed as an email.
//
// It works in batches because each one is a trip to the mailbox, so it always
// says what it did and what is left rather than spinning until it times out.

export function EmailProofAll({ count }: { count: number }) {
  const [res, run, busy] = useActionState<AllProofResult, FormData>(fetchAllEmailProof, null)
  const left = res ? res.left : count
  if (res && left === 0 && res.ok) {
    return <p className="co-meta epa-done">📎 {res.message}</p>
  }

  return (
    <form action={run} className="epa">
      <p className="epa-say">
        <b>{left} receipt{left === 1 ? '' : 's'}</b> paid online with nothing proving{' '}
        {left === 1 ? 'it' : 'them'}. The evidence is in your mailbox.
      </p>
      <button className="btn ghost" disabled={busy}>
        {busy ? 'Looking in your email…' : left > 3 ? 'Fetch the next few from your email' : 'Fetch them from your email'}
      </button>
      {res && (
        <>
          <p className={res.ok ? 'rp-ok' : 'rp-bad'} role="status">
            {res.ok ? '📎 ' : '⚠️ '}{res.message}
          </p>
          {res.done.length > 0 && (
            <ul className="epa-list">
              {res.done.map((d, i) => (
                <li key={i}>{d.merchant} — {d.kind === 'attachment' ? 'invoice attached' : 'email saved'}</li>
              ))}
            </ul>
          )}
          {/* When the mailbox gives nothing usable, show what it did return:
              that is the thing that says how to fix the reading. */}
          {res.failed.length > 0 && (
            <details className="ep-note">
              <summary>{res.failed.length} could not be fetched — what came back</summary>
              {res.failed.map((f, i) => <pre key={i}>{f.merchant}: {f.note}</pre>)}
            </details>
          )}
        </>
      )}
    </form>
  )
}
