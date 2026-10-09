'use client'

import Link from 'next/link'

// Every line of one receipt, editable, with what it puts on the shelf shown as
// you type -- so "2 packs of chicken, 4 kg" is checked against the Stock page
// before it is saved, not at the weekly count.
import { useActionState, useEffect, useRef, useState } from 'react'
import { correctReceipt, type CorrectResult } from './actions'
import { receiptUnitOptions } from '@/lib/units'
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
  /** True while the owner is typing a unit the picker does not offer. */
  unitFree?: boolean
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
// "2026-09-30" is a key, not a date. Nobody reads a backlog in ISO.
const dayWords = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB',
    { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

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

export default function CorrectForm({
  id, total, discount = 0, lines, aliases, receiptTypeInit = '',
  merchantInit = '', dateInit = '', refInit = '',
}: {
  id: number; total: number; discount?: number; lines: Line[]; aliases: Record<string, string[]>; receiptTypeInit?: string
  merchantInit?: string; dateInit?: string; refInit?: string
}) {
  const [res, run, pending] = useActionState<CorrectResult, FormData>(correctReceipt, null)
  // A refused save is shown at the TOP and scrolled to: at the bottom of a long
  // receipt it went unseen and Save looked like it did nothing (27 Sep 2026).
  const errRef = useRef<HTMLDivElement>(null)
  const okRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (res && !res.ok) errRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // A SUCCESS IS SCROLLED TO AS WELL. The save used to navigate away, which
    // was its own proof that something happened. Now that it stays put, the
    // confirmation has to find the reader, or saving at the bottom of a long
    // receipt looks exactly like saving having failed (owner, 6 Oct 2026).
    if (res?.ok) okRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [res])
  // THE TOTAL THE OWNER SAYS IT IS.
  //
  // Until now the only way to change a total was to make the lines add to it:
  // the buttons were "lines are right, the rest was a discount" and "total is
  // wrong, make it the sum of the lines". Both derive the number from the
  // lines, so a receipt Jarvis misread with 14 unreadable lines could not be
  // put right at all. "sometimes jarvis did not read it correctly... I need a
  // system to replace Jarvis thought" (owner, 8 Oct 2026). This is that.
  const [ownTotal, setOwnTotal] = useState(f2(total))
  // EVERYTHING JARVIS GUESSED IS EDITABLE.
  //
  // "I was not able to edit the shop name as well... Can you make every field
  // editable? ... I don't wanna go back to you and tell you to make this field
  // editable that field editable we've been back and forth on this so many
  // times." (owner, 8 Oct 2026). So the header of the receipt -- shop, date and
  // the shop's own reference -- is typed here, not just displayed.
  const [merchant, setMerchant] = useState(merchantInit)
  const [day, setDay] = useState(dateInit)
  const [ref, setRef] = useState(refInit)
  const [receiptType, setReceiptType] = useState(receiptTypeInit)
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
  // EMPTY, NOT '0'. A new line used to arrive with a real zero in the price and
  // total, which had to be deleted before a number could be typed — and if it
  // was not, "10" became "100" (owner, 10 Oct 2026). The placeholder says 0
  // without the field containing one.
  const add = () => setDrafts(a => [...a, { name: '', qty: '1', unit: '', price: '', total: '', type: '', sItem: '', sQty: '', sUnit: '', sPer: '', sPerUnit: '' }])
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
  // With no lines there is nothing to add up: the receipt's total stands, and
  // "total is wrong: make it RM 0.00" must never be offered.
  const gap = drafts.length ? Math.round((sum - discount - total) * 100) / 100 : 0
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
      {res?.ok && (
        <div ref={okRef} className="cr-saved" role="status">
          <p className="cr-saved-what"><b>Saved.</b> {res.message}</p>
          {res.next ? (
            <Link className="cr-next" href={`/cash-out/${res.next.id}`}>
              <span className="cr-next-lead">Next one that needs a look</span>
              <span className="cr-next-who">
                {res.next.merchant} · <span className="num">RM {res.next.amount.toFixed(2)}</span> · {dayWords(res.next.day)}
              </span>
              <span className="cr-next-why">{res.next.says}</span>
            </Link>
          ) : (
            <p className="cr-saved-what">That was the last one needing a look. Nothing else is waiting.</p>
          )}
          <p className="co-meta" style={{ marginTop: 10 }}>
            {/* Back to the list he was working, not to this month. */}
            <Link href="/cash-out?show=any">Back to everything that needs a look</Link>
          </p>
        </div>
      )}
      {res && !res.ok && <div ref={errRef} className="cr-error" role="alert">⚠️ {res.message}</div>}
      {drafts.length === 0 && (
        <label className="cr-field cr-wide">
          <span>No lines on this one. Filed as</span>
          <select name="receipt_type" value={receiptType} onChange={e => setReceiptType(e.target.value)} className={receiptType ? '' : 'rf-missing'}>
            <option value="" disabled>Choose…</option>
            {TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      )}

      {drafts.map((d, i) => {
        const stock = stockText(d, aliases)
        // Qty and Unit are always on show (owner, 27 Sep 2026: "where is the pkt
        // selection?" -- they only appeared after picking an item). On "Worked
        // out" they show what was read; typing in them takes that item over.
        const detected = !d.sItem && d.name.trim() ? itemForName(d.name, aliases) : null
        const auto = detected
          ? choiceFromLine({ name: d.name, qty: num(d.qty) ?? 1, unit: d.unit || 'unit', line_total: num(d.total) ?? 0 }, aliases)
          : null
        const item = d.sItem && d.sItem !== NOT_STOCK_ITEM ? d.sItem : !d.sItem ? (auto?.item ?? detected ?? '') : ''
        const qtyVal = d.sItem ? d.sQty : auto ? clean(auto.qty) : ''
        const unitVal: StockUnit | '' = d.sItem ? d.sUnit : auto?.unit ?? (item ? unitsFor(item)[0] : '')
        const take = (patch: Partial<Draft>) => set(i, d.sItem ? patch : {
          sItem: item, sQty: qtyVal, sUnit: unitVal, sPer: '', sPerUnit: packUnitsFor(item)[0] ?? '', ...patch,
        })
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
                <input inputMode="decimal" placeholder="0" value={d.qty} onChange={e => onQty(i, e.target.value)} />
              </label>
              <label className="cr-field">
                <span>Unit</span>
                {/* A PICKER THAT NEVER REWRITES THE BILL. The common units are one
                    tap, but whatever the supplier printed stays selectable at the
                    top of the list ("btl - as printed"), and "Other" reveals the
                    old free-text box. A receipt is evidence; evidence that does
                    not fit a dropdown is still evidence (owner, 5 Oct 2026). */}
                {d.unitFree ? (
                  <input
                    value={d.unit} autoFocus placeholder="as printed on the bill"
                    onChange={e => set(i, { unit: e.target.value })}
                    onBlur={() => { if (!d.unit.trim()) set(i, { unitFree: false }) }}
                  />
                ) : (
                  <select
                    value={d.unit}
                    onChange={e => {
                      if (e.target.value === '__other') set(i, { unit: '', unitFree: true })
                      else set(i, { unit: e.target.value })
                    }}
                  >
                    {!d.unit && <option value="">no unit</option>}
                    {receiptUnitOptions(d.unit).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                    <option value="__other">Other…</option>
                  </select>
                )}
              </label>
              <label className="cr-field">
                <span>Price each (RM)</span>
                <input inputMode="decimal" placeholder="0" value={d.price} onChange={e => onPrice(i, e.target.value)} />
              </label>
              <label className="cr-field">
                <span>Line total (RM)</span>
                <input inputMode="decimal" placeholder="0" value={d.total} onChange={e => onTotal(i, e.target.value)} />
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
              {d.sItem !== NOT_STOCK_ITEM && (
                <>
                  <label className="cr-field">
                    <span>Qty</span>
                    <input inputMode="decimal" value={qtyVal} disabled={!item}
                      onChange={e => take({ sQty: e.target.value })} placeholder={item ? 'e.g. 4' : 'pick an item'} />
                  </label>
                  <label className="cr-field">
                    <span>Unit</span>
                    <select value={unitVal} disabled={!item} aria-label={`Stock unit for line ${i + 1}`}
                      onChange={e => take({ sUnit: e.target.value as StockUnit, sPerUnit: d.sPerUnit || packUnitsFor(item)[0] })}>
                      {!item && <option value="">—</option>}
                      {unitsFor(item).map(u => <option key={u} value={u}>{unitWord(u)}</option>)}
                    </select>
                  </label>
                  {d.sItem && d.sUnit === 'pkt' && (
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
        {drafts.length === 0 ? (
          <p className="cr-sum">No lines &mdash; the receipt total <b className="num">RM {f2(total)}</b> stands. Add lines above if you have them.</p>
        ) : (
        <p className={`cr-sum ${Math.abs(gap) > 0.05 ? 'co-flag' : ''}`}>
          Lines add to <b className="num">RM {f2(sum)}</b>
          {discount > 0 && <> less discount <b className="num">RM {f2(discount)}</b></>}
          {' '}· receipt total <b className="num">RM {f2(total)}</b>
          {Math.abs(gap) > 0.05 ? ` · off by RM ${f2(Math.abs(gap))}` : ' · matches ✓'}
        </p>
        )}
        <div className="cr-head-edit">
          <div className="eyebrow">The bill itself</div>
          <label className="cr-field cr-wide">
            <span>Shop</span>
            <input name="merchant" value={merchant} maxLength={80}
              placeholder="who you paid" onChange={e => setMerchant(e.target.value)} />
            {!merchantInit && <small>Jarvis never invents a shop name. Type it and it&rsquo;s yours.</small>}
          </label>
          <div className="cr-head-row">
            <label className="cr-field">
              <span>Date on the bill</span>
              <input name="due_date" type="date" value={day} onChange={e => setDay(e.target.value)} />
            </label>
            <label className="cr-field">
              <span>Shop&rsquo;s own reference</span>
              <input name="receipt_no" value={ref} maxLength={40}
                placeholder="optional" onChange={e => setRef(e.target.value)} />
            </label>
          </div>
        </div>

        <label className="cr-field cr-total">
          <span>What the bill actually came to (RM)</span>
          <input inputMode="decimal" name="amount" value={ownTotal}
            onChange={e => setOwnTotal(e.target.value)} />
          <small>
            {num(ownTotal) !== null && Math.abs((num(ownTotal) ?? 0) - total) > 0.005
              ? `Jarvis read RM ${f2(total)}. Yours wins.`
              : 'Change this if Jarvis read the total wrong — what you type here is what gets filed.'}
          </small>
        </label>

        <div className="rf-btns">
          <button className="btn" name="mode" value="save" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
          {gap > 0.05 && <button className="btn ghost" name="mode" value="discount" disabled={pending}>Lines are right: RM {f2(sum - total)} was a discount</button>}
          {Math.abs(gap) > 0.05 && <button className="btn ghost" name="mode" value="total" disabled={pending}>Total is wrong: make it RM {f2(sum)}</button>}
        </div>
        {/* Success goes back to Cash Out, which says what was saved; only a
            problem is shown here. */}
        {res && !res.ok && <div className="co-meta co-flag">{res.message}</div>}
      </div>
    </form>
  )
}
