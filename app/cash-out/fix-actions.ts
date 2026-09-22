'use server'

// Fixing a receipt Jarvis flagged ("lines don't add up", "not categorised")
// straight from the Cash Out page, on the phone.
//
// Three ways out, because there are three real causes:
//   save     -- a line was misread: correct its qty / price / category.
//   discount -- the lines are right and the shop took money off: the printed
//               TOTAL stands, the gap is recorded as a discount.
//   total    -- the total was misread: use what the lines add up to.
// Every save re-derives the per-type split and redoes the receipt's stock-in,
// so food cost and the Stock page follow the correction.
import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { sanitiseItems, splitByType, EXPENSE_TYPES } from '@/lib/vision'
import { receiptStockIn } from '@/lib/stock-data'

export type FixResult = { ok: boolean; message: string } | null

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}
const r2 = (n: number) => Math.round(n * 100) / 100

export async function fixReceipt(_prev: FixResult, form: FormData): Promise<FixResult> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  const id = Number(form.get('id'))
  const mode = String(form.get('mode') || 'save')
  const { data: rec } = await supabase.from('records').select('*').eq('id', id).eq('category', 'cash_out').single()
  if (!rec) return { ok: false, message: 'That receipt no longer exists.' }

  const meta: any = { ...(rec.meta ?? {}) }
  const old: any[] = Array.isArray(meta.items) ? meta.items : []
  const raw = old.map((it, i) => {
    const qty = num(form.get(`qty_${i}`)) ?? it.qty
    const price = num(form.get(`price_${i}`)) ?? it.unit_price
    const type = String(form.get(`type_${i}`) || it.expense_type || '')
    return {
      ...it, qty, unit_price: price, line_total: r2(qty * price),
      expense_type: (EXPENSE_TYPES as readonly string[]).includes(type) ? type : undefined,
    }
  })
  if (raw.some(it => !(it.qty > 0) || it.unit_price < 0)) return { ok: false, message: 'Every line needs a quantity above 0 and a price of 0 or more.' }

  const linesTotal = r2(raw.reduce((t, it) => t + it.line_total, 0))
  let amount = Number(rec.amount)
  if (mode === 'total') amount = linesTotal
  const discount = mode === 'discount' ? r2(linesTotal - amount) : 0
  if (mode === 'discount' && discount <= 0) {
    return { ok: false, message: `The lines add to RM ${linesTotal.toFixed(2)}, not more than the total, so there's no discount. Fix a line or use the lines' total.` }
  }

  // Same sanitiser as a fresh photo: per-kg prices, clamps, lines-vs-total.
  // A recorded discount makes the lines reconcile by definition.
  const s = sanitiseItems(raw, mode === 'discount' ? linesTotal : amount)
  if (!s.items?.length) return { ok: false, message: 'Those numbers don’t look right. Check the quantities and prices.' }
  const split = splitByType(s.items, amount, s.reconciles)

  meta.items = s.items
  meta.type_split = split
  if (discount) meta.discount = discount
  else delete meta.discount
  if (s.reconciles) delete meta.items_note
  else meta.items_note = `Lines add to RM ${linesTotal.toFixed(2)} but the receipt total is RM ${amount.toFixed(2)}.`
  meta.fixed_at = new Date().toISOString()

  const { error } = await supabase.from('records').update({ amount, meta }).eq('id', id).eq('category', 'cash_out')
  if (error) return { ok: false, message: error.message }

  // Redo this receipt's stock-in from the corrected lines.
  await supabase.from('stock_moves').delete().eq('record_id', id).eq('kind', 'purchase')
  await receiptStockIn(id, s.items as any, 'Fixed on Cash Out')

  revalidatePath('/cash-out'); revalidatePath('/cash-in'); revalidatePath('/stock')
  if (!s.reconciles) return { ok: true, message: `Saved, but the lines (RM ${linesTotal.toFixed(2)}) still don’t match the total (RM ${amount.toFixed(2)}).` }
  return {
    ok: true,
    message: mode === 'discount' ? `Saved. RM ${discount.toFixed(2)} recorded as a discount; total stays RM ${amount.toFixed(2)}.`
      : mode === 'total' ? `Saved. Total corrected to RM ${amount.toFixed(2)}.`
      : 'Saved. It adds up now.',
  }
}
