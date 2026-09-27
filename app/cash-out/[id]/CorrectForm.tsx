'use client'

// Every line of one receipt, editable, with what it puts on the shelf shown as
// you type -- so "2 packs of chicken, 4 kg" is checked against the Stock page
// before it is saved, not at the weekly count.
import { useActionState, useState } from 'react'
import { correctReceipt, type CorrectResult } from './actions'
import {
  stockFromLine, stockFromChoice, choiceFromLine, itemForName, unitsFor, packUnitsFor, unitWord, ITEM, ITEMS,
  NOT_STOCK_ITEM, WHOLE_BIRD_ITEM, type StockChoice, type StockUnit,
} from '@/lib/stock-items'

export type Line = {
  name: string; qty: number; unit: string; unit_price: number; line_total: number
  stock: StockChoice | null; expense_type: string
}
// sItem: '' = work it out from the name, 'none' = not stock, else a stock item.
type Draft = {
  name: string; qty: string; unit: string; price: string; total: string; type: string
  sItem: string; sQty: string; sUnit: StockUnit | ''
  // Only for sUnit 'pkt': what one packet holds.
  sPer: string; sPerUnit: StockUnit | ''
}

// What a line can go into stock as. Whole chicken is not an item of its own: it
// is cut into leg quarters and breast, so it is offered as that.
const STOCK_OPTIONS: [string, string][] = [
  ...[...ITEMS].sort((a, b) => a.sort - b.sort).map(i => [i.key, i.name] as [string, string]),
  [WHOLE_BIRD_ITEM, 'Whole chicken (cut into legs + breast)'],
]
const itemLabel = (k: string) => k === WHOLE_BIRD_ITEM ? 'whole chicken' : (ITEM[k]?.name ?? k).toLowerCase()

const TYPES: [string, string][] = [
  ['cogs_food', 'Food'], ['cogs_beverage', 'Drinks'], ['cogs_packaging', 'Packaging'],
  ['supplies_cleaning', 'Cleaning & supplies'], ['equipment', 'Equipment'], ['utilities', 'Utilities'],
  ['services', 'Services'], ['marketing', 'Marketing'], ['other', 'Other'], ['owner_drawings', "Owner's drawings"],
]
const f2 = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const clean = (n: number) => String(Math.round(n * 10000) / 10000)
const num = (s: string) => { const n = Number(String(s).replace(/,/g, '').trim()); return s.trim() === '' || !Number.isFinite(n) ? null : n }

function toDraft(l: Line): Draft {
  return {
    name: l.name, qty: clean(l.qty), unit: l.unit === 'unit' ? '' : l.unit,
    price: clean(l.unit_price), total: clean(l.line_total),
    type: l.expense_type ?? '',
    sItem: l.stock?.item ?? '', sQty: l.stock && l.stock.item !== NOT_STOCK_ITEM ? clean(l.stock.qty) : '',
    sUnit: l.stock && l.stock.item !== NOT_STOCK_ITEM ? l.stock.unit : '',
    sPer: l.stock?.per ? clean(l.stock.per) : '', sPerUnit: l.stock?.perUnit ?? '',
  }
}
const fmtStock = (item: string, q: number) => {
  const def = ITEM[item]
  return def?.unit === 'g' ? `${Math.round(q).toLocaleString('en-MY')} g`
    : def?.unit === 'fish' ? `${Math.round(q * 10) / 10} fish`
    : `${Math.round(q * 10) / 10}`
}

/** The draft's stock choice as saved. */
function choiceOf(d: Draft): StockChoice | null {
  if (!d.sItem) return null
  if (d.sItem === NOT_STOCK_ITEM) return { item: NOT_STOCK_ITEM, qty: 0, unit: 'pcs' }
  const c: StockChoice = { item: d.sItem, qty: num(d.sQty) ?? 0, unit: (d.sUnit || 'pcs') as StockUnit }
  return d.sUnit === 'pkt' ? { ...c, per: num(d.sPer) ?? 0, perUnit: (d.sPerUnit || packUnitsFor(d.sItem)[0]) as StockUnit } : c
}

/** What this line would put in stock, in the Stock page's own words. */
function stockText(d: Draft, aliases: Record<string, string[]>): { text: string; warn?: boolean } | null {
  const qty = num(d.qty); const total = num(d.total) ?? 0
  if (d.sItem === NOT_STOCK_ITEM) return { text: 'Not stock -- nothing added.' }
  const r = d.sItem
    ? (num(d.sQty) && d.sUnit ? stockFromChoice(choiceOf(d)!, total, d.name) : null)
    : (d.name.trim() && qty ? stockFromLine({ name: d.name, qty, unit: d.unit || 'unit', line_total: total }, aliases) : null)
  if (r === null) return d.sItem ? { text: `Enter how much ${itemLabel(d.sItem)} went into stock.`, warn: true } : null
  if (!Array.isArray(r) && d.sUnit === 'pkt') return { text: 'Say what one packet holds, e.g. each pkt = 1 kg.', warn: true }
  if (!Array.isArray(r)) return { text: `Looks like ${itemLabel(r.item)}, but the amount couldn't be worked out -- pick it below and enter the quantity.`, warn: true }
  if (!r.length) return null
  return { text: r.map(s => `+${fmtStock(s.item, s.qty)} ${itemLabel(s.item)}${s.note ? ` (${s.note})` : ''}`).join(' · ') }
}

export default function CorrectForm({ id, total, discount = 0, lines, aliases }: {
  id: number; total: number; discount?: number; lines: Line[]; aliases: Record<string, string[]>
}) {
  const [res, run, pending] = useActionState<CorrectResult, FormData>(correctReceipt, null)
  const [drafts, setDrafts] = useState<Draft[]>(() => lines.map(toDraft))

  const set = (i: number, patch: Partial<Draft>) => setDrafts(a => a.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  // Price each and line total follow each other: type either one.
  const onQty = (i: number, v: string) => {
    const q = num(v); const p = num(drafts[i].price)
    set(i, { qty: v, ...(q && p != null ? { total: clean(q * p) } : {}) })
  }
  const onPrice = (i: number, v: string) => {
    const q = num(drafts[i].qty); const p = num(v)
    set(i, { price: v, ...(q && p != null ? { total: clean(q * p) } : {}) })
  }
  const onTotal = (i: number, v: string) => {
    const q = num(drafts[i].qty); const t = num(v)
    set(i, { total: v, ...(q && t != null ? { price: clean(t / q) } : {}) })
  }
  const remove = (i: number) => setDrafts(a => a.filter((_, j) => j !== i))
  const add = () => setDrafts(a => [...a, { name: '', qty: '1', unit: '', price: '0', total: '0', type: '', sItem: '', sQty: '', sUnit: '', sPer: '', sPerUnit: '' }])
  // Picking the item it had worked out starts from that reading (2 packs of
  // "2KG" -> 4 kg), so only the number needs checking. Another item starts
  // empty in its usual unit: a number carried over from a different item
  // would look right and be wrong.
  const onStockItem = (i: number, item: string) => {
    if (!item || item === NOT_STOCK_ITEM) return set(i, { sItem: item, sQty: '', sUnit: '', sPer: '', sPerUnit: '' })
    const d = drafts[i]
    const read = choiceFromLine({ name: d.name, qty: num(d.qty) ?? 1, unit: d.unit || 'unit', line_total: num(d.total) ?? 0 }, aliases)
    const reset = { sPer: '', sPerUnit: packUnitsFor(item)[0] }
    if (read && read.item === item) return set(i, { sItem: item, sQty: clean(read.qty), sUnit: read.unit, ...reset })
    set(i, { sItem: item, sQty: '', sUnit: unitsFor(item)[0], ...reset })
  }

  const sum = drafts.reduce((t, d) => t + (num(d.total) ?? 0), 0)
  // A discount already recorded counts: lines minus it should meet the total.
  const gap = Math.round((sum - discount - total) * 100) / 100
  const payload = JSON.stringify(drafts.map(d => ({
    name: d.name, qty: num(d.qty) ?? 0, unit: d.unit || 'unit',
    unit_price: num(d.price) ?? 0, line_total: num(d.total) ?? 0,
    stock: choiceOf(d),
    expense_type: d.type,
  })))

  return (
    <form action={run} className="cr">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="lines" value={payload} />

      {drafts.map((d, i) => {
        const stock = stockText(d, aliases)
        return (
          <fieldset key={i} className="cr-line">
            <legend className="cr-head">
              <span className="eyebrow">Line {i + 1}</span>
              <button type="button" className="cr-x" onClick={() => remove(i)} aria-label={`Remove line ${i + 1}`}>Remove</button>
            </legend>
            <label className="cr-field cr-wide">
              <span>Item</span>
              <input value={d.name} onChange={e => set(i, { name: e.target.value })} placeholder="e.g. Chicken breast 2kg" />
            </label>
            <div className="cr-grid">
              <label className="cr-field">
                <span>Qty</span>
                <input inputMode="decimal" value={d.qty} onChange={e => onQty(i, e.target.value)} />
              </label>
              <label className="cr-field">
                <span>Unit</span>
                <input value={d.unit} onChange={e => set(i, { unit: e.target.value })} placeholder="pkt, kg, pcs" />
              </label>
              <label className="cr-field">
                <span>Price each (RM)</span>
                <input inputMode="decimal" value={d.price} onChange={e => onPrice(i, e.target.value)} />
              </label>
              <label className="cr-field">
                <span>Line total (RM)</span>
                <input inputMode="decimal" value={d.total} onChange={e => onTotal(i, e.target.value)} />
              </label>
            </div>
            <label className="cr-field cr-wide">
              <span>Filed as</span>
              <select value={d.type} onChange={e => set(i, { type: e.target.value })} className={d.type ? '' : 'rf-missing'}>
                <option value="" disabled>Choose…</option>
                {TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <div className="cr-stockrow">
              <label className="cr-field">
                <span>Goes into stock as</span>
                <select value={d.sItem} onChange={e => onStockItem(i, e.target.value)}>
                  <option value="">{(() => {
                    const k = d.name.trim() ? itemForName(d.name, aliases) : null
                    return k ? `Worked out: ${itemLabel(k)}` : 'Worked out: not stock'
                  })()}</option>
                  <option value={NOT_STOCK_ITEM}>Not stock</option>
                  {STOCK_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              {d.sItem && d.sItem !== NOT_STOCK_ITEM && (
                <>
                  <label className="cr-field">
                    <span>Qty</span>
                    <input inputMode="decimal" value={d.sQty} onChange={e => set(i, { sQty: e.target.value })} placeholder="e.g. 4" />
                  </label>
                  <label className="cr-field">
                    <span>Unit</span>
                    <select value={d.sUnit} onChange={e => set(i, { sUnit: e.target.value as StockUnit, sPerUnit: d.sPerUnit || packUnitsFor(d.sItem)[0] })}>
                      {unitsFor(d.sItem).map(u => <option key={u} value={u}>{unitWord(u)}</option>)}
                    </select>
                  </label>
                  {d.sUnit === 'pkt' && (
                    <>
                      <label className="cr-field cr-pack">
                        <span>Each pkt =</span>
                        <input inputMode="decimal" value={d.sPer} onChange={e => set(i, { sPer: e.target.value })} placeholder="e.g. 1" />
                      </label>
                      <label className="cr-field">
                        <span>of</span>
                        <select value={d.sPerUnit} onChange={e => set(i, { sPerUnit: e.target.value as StockUnit })}>
                          {packUnitsFor(d.sItem).map(u => <option key={u} value={u}>{unitWord(u)}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                </>
              )}
            </div>
            {stock && <p className={`cr-stock ${stock.warn ? 'cr-stock-warn' : ''}`}>📦 {stock.text}</p>}
          </fieldset>
        )
      })}

      <button type="button" className="btn ghost cr-add" onClick={add}>+ Add a line</button>

      <div className="cr-foot">
        <p className={`cr-sum ${Math.abs(gap) > 0.05 ? 'co-flag' : ''}`}>
          Lines add to <b className="num">RM {f2(sum)}</b>
          {discount > 0 && <> less discount <b className="num">RM {f2(discount)}</b></>}
          {' '}· receipt total <b className="num">RM {f2(total)}</b>
          {Math.abs(gap) > 0.05 ? ` · off by RM ${f2(Math.abs(gap))}` : ' · matches ✓'}
        </p>
        <div className="rf-btns">
          <button className="btn" name="mode" value="save" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
          {gap > 0.05 && <button className="btn ghost" name="mode" value="discount" disabled={pending}>Lines are right: RM {f2(sum - total)} was a discount</button>}
          {Math.abs(gap) > 0.05 && <button className="btn ghost" name="mode" value="total" disabled={pending}>Total is wrong: make it RM {f2(sum)}</button>}
        </div>
        {/* Success goes back to Cash Out, which says what was saved; only a
            problem is shown here. */}
        {res && !res.ok && <div className="co-meta co-flag" role="alert">{res.message}</div>}
      </div>
    </form>
  )
}
