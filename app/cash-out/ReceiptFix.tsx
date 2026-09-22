'use client'

// The fix form under a flagged receipt. Edit a line and the running total
// updates as you type, so you can see the moment it matches the receipt.
import { useActionState, useState } from 'react'
import { fixReceipt, type FixResult } from './fix-actions'

type Line = { name: string; qty: number; unit_price: number; expense_type?: string }
const TYPES: [string, string][] = [
  ['cogs_food', 'Food'], ['cogs_beverage', 'Drinks'], ['cogs_packaging', 'Packaging'],
  ['supplies_cleaning', 'Cleaning & supplies'], ['equipment', 'Equipment'], ['utilities', 'Utilities'],
  ['services', 'Services'], ['marketing', 'Marketing'], ['other', 'Other'],
]
const f2 = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ReceiptFix({ id, total, lines }: { id: number; total: number; lines: Line[] }) {
  const [res, run, pending] = useActionState<FixResult, FormData>(fixReceipt, null)
  const [vals, setVals] = useState(lines.map(l => ({ qty: String(l.qty), price: String(l.unit_price) })))
  const sum = vals.reduce((t, v) => t + (Number(v.qty) || 0) * (Number(v.price) || 0), 0)
  const gap = Math.round((sum - total) * 100) / 100
  const set = (i: number, k: 'qty' | 'price', v: string) => setVals(a => a.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  return (
    <form action={run} className="rf">
      <input type="hidden" name="id" value={id} />
      <div className="eyebrow" style={{ margin: '10px 0 4px' }}>Fix it</div>
      {lines.map((l, i) => (
        <div key={i} className="rf-line">
          <div className="rf-name">{l.name}</div>
          <div className="rf-row">
            <label><span className="co-dim">Qty</span>
              <input type="number" name={`qty_${i}`} inputMode="decimal" step="any" min="0" value={vals[i].qty} onChange={e => set(i, 'qty', e.target.value)} />
            </label>
            <label><span className="co-dim">Price each</span>
              <input type="number" name={`price_${i}`} inputMode="decimal" step="any" min="0" value={vals[i].price} onChange={e => set(i, 'price', e.target.value)} />
            </label>
            <select name={`type_${i}`} defaultValue={l.expense_type ?? ''} aria-label={`Category for ${l.name}`}
              className={l.expense_type ? '' : 'rf-missing'}>
              <option value="" disabled>Category…</option>
              {TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
        </div>
      ))}
      <p className={`co-meta ${Math.abs(gap) > 0.05 ? 'co-flag' : ''}`}>
        Lines add to <b className="num">RM {f2(sum)}</b> · receipt total <b className="num">RM {f2(total)}</b>
        {Math.abs(gap) > 0.05 ? ` · off by RM ${f2(Math.abs(gap))}` : ' · matches ✓'}
      </p>
      <div className="rf-btns">
        <button className="btn" name="mode" value="save" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
        {gap > 0.05 && <button className="btn ghost" name="mode" value="discount" disabled={pending}>Lines are right: RM {f2(gap)} was a discount</button>}
        {Math.abs(gap) > 0.05 && <button className="btn ghost" name="mode" value="total" disabled={pending}>Total is wrong: use RM {f2(sum)}</button>}
      </div>
      {res && <p className={`co-meta ${res.ok ? '' : 'co-flag'}`} role="status">{res.message}</p>}
    </form>
  )
}
