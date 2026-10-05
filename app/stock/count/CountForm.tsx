'use client'

import { useActionState } from 'react'
import { saveCount } from '../actions'

// The count itself.
//
// NO UNIT DROPDOWN, DELIBERATELY. The risk here is not that the owner cannot
// pick a unit — it is that he picks the wrong one, and the FIRST count of an
// item writes its opening balance, which is permanent. So each field states its
// own unit in words and there is nothing to get wrong: shrimp in pieces, beef in
// kg, siakap in fish, exactly as the recipes count them.
//
// Where an item is portioned into bags, saveCount already takes bags AND loose
// kg separately, which is how a freezer actually looks (owner, 5 Oct 2026).

type Row = {
  key: string; name: string; unit: string; onHand: number
  counted: boolean; lastCount: string | null
  bagG: number | null; ask: string; negative: boolean
}

type Result = { ok: boolean; message: string } | null

const show = (r: Row) => {
  const n = r.unit === 'g' ? r.onHand / 1000 : r.onHand
  const v = Math.round(n * 10) / 10
  return `${v.toLocaleString('en-MY')} ${r.ask}`
}

export function CountForm({ rows }: { rows: Row[] }) {
  const [res, action, busy] = useActionState(saveCount, null as Result)

  return (
    <form action={action} className="cnt">
      {rows.map(r => (
        <div key={r.key} className={`cnt-row${r.negative ? ' is-neg' : ''}`}>
          <div className="cnt-head">
            <span className="cnt-name">{r.name}</span>
            <span className="cnt-book num">
              {show(r)}
              <small>{r.counted ? ` · last counted ${r.lastCount}` : ' · never counted'}</small>
            </span>
          </div>
          <div className="cnt-fields">
            {r.bagG !== null && (
              <label className="cr-field">
                <span>Bags of {r.bagG} g</span>
                <input name={`c_${r.key}_bags`} inputMode="decimal" placeholder="0" />
              </label>
            )}
            <label className="cr-field">
              <span>{r.bagG !== null ? `Loose ${r.ask}` : r.ask.charAt(0).toUpperCase() + r.ask.slice(1)}</span>
              <input name={`c_${r.key}`} inputMode="decimal" placeholder="0" />
            </label>
          </div>
        </div>
      ))}

      <label className="cr-field cr-wide cnt-by">
        <span>Counted by</span>
        <input name="by" placeholder="your name" maxLength={40} />
      </label>

      <div className="cnt-foot">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save the count'}</button>
        <p className="co-meta">
          Only the items you filled in are changed. Everything blank stays as it was.
        </p>
      </div>

      {res && <p className={res.ok ? 'rp-ok' : 'rp-bad'} role="status">{res.message}</p>}
    </form>
  )
}
