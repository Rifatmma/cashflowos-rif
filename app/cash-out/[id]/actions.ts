'use server'

// Saving a corrected receipt from its own page (/cash-out/<id>).
//
// WHY A PAGE: fixing a 16-line bill line by line through Jarvis lost six lines
// and nearly moved RM 60 that was never spent (Sri Ternak #174, 27 Sep 2026).
// Here the owner sees the photo and every line at once and types the truth.
//
// What goes on the shelf is the owner's to say, per line: which stock item
// (chicken breast, beef, fresh or frozen shrimp...), how much, and in what unit
// -- "not all of the stock are recorded as kg" (owner, 27 Sep 2026). Two 2 kg
// packs of chicken are qty 2 at the pack price on the bill, but 4 kg of chicken
// breast in the freezer. The choice is saved on the line (item.stock) and
// stockFromLine uses it instead of reading the name.
//
// Every save keeps the old lines in meta.prev_items, re-derives the per-type
// split, and redoes this receipt's stock-in from the saved lines.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { sanitiseItems, splitByType, EXPENSE_TYPES } from '@/lib/vision'
import { receiptStockIn } from '@/lib/stock-data'
import { ITEM, unitsFor, packUnitsFor, NOT_STOCK_ITEM, WHOLE_BIRD_ITEM, type StockChoice } from '@/lib/stock-items'

export type CorrectResult = { ok: boolean; message: string; stock?: string[] } | null

export type LineIn = {
  name: string; qty: number; unit: string; unit_price: number; line_total: number
  stock: StockChoice | null; expense_type: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

export async function correctReceipt(_prev: CorrectResult, form: FormData): Promise<CorrectResult> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  const id = Number(form.get('id'))
  const mode = String(form.get('mode') || 'save')
  let lines: LineIn[]
  try { lines = JSON.parse(String(form.get('lines') || '[]')) } catch { return { ok: false, message: 'Could not read the lines -- reload and try again.' } }
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, message: 'A receipt needs at least one line.' }

  const { data: rec } = await supabase.from('records').select('*').eq('id', id).eq('category', 'cash_out').single()
  if (!rec) return { ok: false, message: 'That receipt no longer exists.' }
  const meta: any = { ...(rec.meta ?? {}) }
  const old: any[] = Array.isArray(meta.items) ? meta.items : []

  for (const [n, l] of lines.entries()) {
    if (!String(l.name ?? '').trim()) return { ok: false, message: `Line ${n + 1} needs a name.` }
    if (!(Number(l.qty) > 0)) return { ok: false, message: `Line ${n + 1} needs a quantity above 0.` }
    if (!(Number(l.line_total) >= 0)) return { ok: false, message: `Line ${n + 1} needs a price of 0 or more.` }
    // An uncategorised line keeps the receipt on To check after it is saved,
    // which looks like the save did nothing (#176's frozen sotong, 27 Sep 2026).
    if (!(EXPENSE_TYPES as readonly string[]).includes(l.expense_type)) {
      return { ok: false, message: `Line ${n + 1} (${String(l.name).trim().slice(0, 40)}): choose what it's filed as -- food, drinks, packaging...` }
    }
    const c = l.stock
    if (c && c.item !== NOT_STOCK_ITEM) {
      if (!ITEM[c.item] && c.item !== WHOLE_BIRD_ITEM) return { ok: false, message: `Line ${n + 1}: pick a stock item from the list.` }
      if (!(Number(c.qty) > 0)) return { ok: false, message: `Line ${n + 1}: how much went into stock? Enter a quantity above 0.` }
      if (!unitsFor(c.item).includes(c.unit)) return { ok: false, message: `Line ${n + 1}: that unit doesn't fit the stock item.` }
      if (c.unit === 'pkt' && (!(Number(c.per) > 0) || !c.perUnit || !packUnitsFor(c.item).includes(c.perUnit))) {
        return { ok: false, message: `Line ${n + 1}: say what one packet holds, e.g. each pkt = 1 kg.` }
      }
    }
  }

  // The line total is what was charged; the price each is worked out from it,
  // so a price typed as "RM 23 each" and a total typed as "RM 46" both land right.
  const raw = lines.map(l => {
    const name = String(l.name).trim().slice(0, 80)
    const qty = Number(l.qty)
    const total = r2(Number(l.line_total))
    const same = old.find(o => String(o?.name ?? '').trim().toLowerCase() === name.toLowerCase())
    return {
      ...(same ? { key: same.key, group: same.group, pack_size: same.pack_size, pack_unit: same.pack_unit } : {}),
      name, qty, unit: String(l.unit || 'unit').trim().toLowerCase().slice(0, 12) || 'unit',
      unit_price: qty > 0 ? total / qty : 0, line_total: total,
    }
  })
  const linesTotal = r2(raw.reduce((t, it) => t + it.line_total, 0))
  let amount = Number(rec.amount)
  if (mode === 'total') amount = linesTotal
  // A plain Save keeps a discount recorded earlier while it still accounts for
  // the gap -- otherwise fixing one line would quietly undo it.
  const prevDiscount = Number(meta.discount) || 0
  const keptDiscount = mode === 'save' && prevDiscount > 0 && Math.abs(linesTotal - prevDiscount - amount) <= 0.05
  const discount = mode === 'discount' ? r2(linesTotal - amount) : keptDiscount ? prevDiscount : 0
  if (mode === 'discount' && discount <= 0) {
    return { ok: false, message: `The lines add to RM ${linesTotal.toFixed(2)}, not more than the total, so there's no discount.` }
  }

  const s = sanitiseItems(raw, discount ? linesTotal : amount)
  if (!s.items?.length || s.items.length !== raw.length) {
    return { ok: false, message: 'One of the lines has a number that doesn’t look right (too big, or negative). Check them.' }
  }
  // The owner's word wins over anything derived: the category they picked
  // (owner's drawings included -- that is theirs alone to set), and the stock.
  const items = s.items.map((it, n) => {
    const l = lines[n]
    const type = (EXPENSE_TYPES as readonly string[]).includes(l.expense_type) ? l.expense_type : undefined
    const c = l.stock
    const stock: StockChoice | undefined = c
      ? (c.item === NOT_STOCK_ITEM ? { item: NOT_STOCK_ITEM, qty: 0, unit: 'pcs' }
        : { item: c.item, qty: Number(c.qty), unit: c.unit, ...(c.unit === 'pkt' ? { per: Number(c.per), perUnit: c.perUnit } : {}) })
      : undefined
    // A weight they gave is also the honest RM-per-kg for price tracking.
    const w = stock?.unit === 'pkt' ? { unit: stock.perUnit, qty: stock.qty * (stock.per ?? 0) } : stock
    const kg = w && (w.unit === 'kg' || w.unit === 'g') ? (w.unit === 'kg' ? w.qty : w.qty / 1000) : null
    return {
      ...it,
      expense_type: type as any,
      ...(stock ? { stock } : {}),
      ...(kg ? { base_qty: kg, base_unit: 'kg' as const, price_per_base: r2(it.line_total / kg) } : {}),
    }
  })

  meta.prev_items = old
  meta.items = items
  meta.type_split = splitByType(items, amount, !!discount || s.reconciles)
  const types = new Set(items.map(i => i.expense_type).filter(Boolean))
  if (meta.type_split) meta.expense_type = Object.entries(meta.type_split as Record<string, number>).sort((a, b) => b[1] - a[1])[0][0]
  else if (types.size === 1) meta.expense_type = [...types][0]
  if (discount) meta.discount = discount
  else delete meta.discount
  if (discount || s.reconciles) delete meta.items_note
  else meta.items_note = `Lines add to RM ${linesTotal.toFixed(2)} but the receipt total is RM ${amount.toFixed(2)}.`
  meta.corrected_by = 'owner'
  meta.corrected_at = new Date().toISOString().slice(0, 10)
  meta.corrected_via = 'web'
  // Parked from Jarvis with "I'll fix it in the app": this save is that fix.
  delete meta.fix_later; delete meta.fix_later_note

  const { error } = await supabase.from('records').update({ amount, meta }).eq('id', id).eq('category', 'cash_out')
  if (error) return { ok: false, message: error.message }

  await supabase.from('stock_moves').delete().eq('record_id', id).eq('kind', 'purchase')
  const got = await receiptStockIn(id, items as any, 'Corrected on Cash Out')

  revalidatePath('/cash-out'); revalidatePath(`/cash-out/${id}`); revalidatePath('/stock'); revalidatePath('/')
  const stock = got.added.map(a => {
    const def = ITEM[a.item]
    const q = def?.unit === 'g' ? `${Math.round(a.qty).toLocaleString('en-MY')} g` : `${Math.round(a.qty * 10) / 10}`
    return `+${q} ${(def?.name ?? a.item).toLowerCase()}`
  })
  const lead =
    mode === 'discount' ? `RM ${discount.toFixed(2)} recorded as a discount; total stays RM ${amount.toFixed(2)}.`
      : mode === 'total' ? `Total corrected to RM ${amount.toFixed(2)}.`
      : discount || s.reconciles ? 'It adds up now.'
      : `The lines (RM ${linesTotal.toFixed(2)}) still don’t match the total (RM ${amount.toFixed(2)}), so it stays on To check.`
  // Done here: back to the list, which says what happened (owner, 27 Sep 2026:
  // staying on the page with the old warning showing looked like it failed).
  const msg = `${lead}${stock.length ? ` Stock: ${stock.join(', ')}.` : ''}`
  redirect(`/cash-out?saved=${id}&msg=${encodeURIComponent(msg.slice(0, 400))}`)
}
