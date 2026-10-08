'use client'

import { useActionState, useState } from 'react'
import { removeReceipt, type RemoveResult } from './actions'

// Taking a receipt back out of the books.
//
// TWO TAPS, NOT ONE. Every other button on this page changes a number that can
// be changed again; this one makes a receipt stop existing. So the first tap
// only opens the question, and the question NAMES the shop and the amount —
// the two things that tell him whether his thumb landed on the right row.
//
// It says where it goes, because "remove" that quietly meant "deleted forever"
// would be the wrong promise: it can be put back from /cash-out/removed.

export function RemoveReceipt({ id, merchant, amount }: {
  id: number; merchant: string; amount: number
}) {
  const [res, run, busy] = useActionState<RemoveResult, FormData>(removeReceipt, null)
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <div className="rm-wrap">
        <button type="button" className="rm-open" onClick={() => setAsking(true)}>
          Remove this receipt
        </button>
        <p className="co-meta rm-why">
          Filed by mistake, or never really happened? Taking it out corrects every total and
          the stock it moved. You can put it back afterwards.
        </p>
      </div>
    )
  }

  return (
    <form action={run} className="rm-ask">
      <input type="hidden" name="id" value={id} />
      <p className="rm-q">
        Remove <b>{merchant}</b> &mdash;{' '}
        <b className="num">RM {amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>?
      </p>
      <p className="co-meta">
        It comes out of Cash Out and out of your totals, and anything it put on the shelf comes
        off. It is kept under <b>Removed receipts</b>, so nothing is lost.
      </p>
      <label className="cr-field cr-wide">
        <span>Why (optional &mdash; so you remember later)</span>
        <input name="reason" maxLength={300} placeholder="e.g. same bill filed twice" />
      </label>
      <div className="rm-btns">
        <button className="btn rm-go" disabled={busy}>{busy ? 'Removing…' : 'Yes, remove it'}</button>
        <button type="button" className="btn ghost" onClick={() => setAsking(false)} disabled={busy}>
          Keep it
        </button>
      </div>
      {res && !res.ok && <div className="cr-error" role="alert">⚠️ {res.message}</div>}
    </form>
  )
}
