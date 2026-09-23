'use server'

import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { ITEM, IGNORE_KEY } from '@/lib/stock-items'
import { getItems, getMoves, importDay } from '@/lib/stock-data'
import { normName } from '@/lib/recipes'
import { isSalesRow, salesDayOf } from '@/lib/sales'
import { addDays, mytDate } from '@/lib/period'

export type Result = { ok: boolean; message: string } | null

const refresh = () => { revalidatePath('/stock'); revalidatePath('/stock/recipes'); revalidatePath('/cash-in') }
const numOf = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}
const who = (form: FormData) => String(form.get('by') || '').trim().slice(0, 40) || 'Stock page'

/**
 * The weekly count. Staff type what's physically there; the difference from the
 * book is written as a `count` move, so on-hand becomes exactly what they counted.
 * An item's first ever count is its OPENING stock, not "missing".
 */
export async function saveCount(_prev: Result, form: FormData): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  const [items, moves] = await Promise.all([getItems(), getMoves(3650)])
  const rows: any[] = []
  const bad: string[] = []
  for (const i of items) {
    const raw = numOf(form.get(`c_${i.key}`))
    // Portioned items (80 g / 120 g / 250 g bags) are counted in bags, plus any loose kg still in
    // the supplier's pack. Bags are already trimmed, so they're usable grams as-is.
    const bagG = ITEM[i.key]?.bagG
    const bags = bagG ? numOf(form.get(`c_${i.key}_bags`)) : null
    if (raw === null && bags === null) continue
    if ((raw !== null && (Number.isNaN(raw) || raw < 0)) || (bags !== null && (Number.isNaN(bags) || bags < 0))) { bad.push(i.name); continue }
    const loose = raw ?? 0
    const counted = (i.unit === 'g' ? loose * 1000 : loose) + (bags ?? 0) * (bagG ?? 0)   // grams are typed in kg
    const mine = moves.filter(m => m.item === i.key)
    const book = mine.reduce((t, m) => t + m.qty, 0)
    const opening = !mine.some(m => m.kind === 'count')
    rows.push({ item: i.key, qty: counted - book, kind: 'count', by: who(form), meta: { counted, before: book, opening } })
  }
  if (bad.length) return { ok: false, message: `Check the number for ${bad.join(', ')}.` }
  if (!rows.length) return { ok: false, message: 'Type at least one count.' }
  const { error } = await supabase.from('stock_moves').insert(rows)
  if (error) return { ok: false, message: error.message }
  refresh()
  const missing = rows.filter(r => !r.meta.opening && r.qty < 0).length
  return { ok: true, message: `Counted ${rows.length} item${rows.length === 1 ? '' : 's'}.${missing ? ` ${missing} came in under the book — see "Missing since last count".` : ''}` }
}

/** Add a delivery, log waste, or fix a number by hand. */
export async function addMove(_prev: Result, form: FormData): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  const key = String(form.get('item') || '')
  const def = ITEM[key]
  if (!def) return { ok: false, message: 'Pick an item.' }
  const kind = String(form.get('kind') || 'purchase')
  if (!['purchase', 'waste', 'add', 'remove'].includes(kind)) return { ok: false, message: 'Pick what happened.' }
  const reason = String(form.get('reason') || '').trim().slice(0, 60)
  const amount = numOf(form.get('amount'))
  if (amount === null || Number.isNaN(amount) || amount <= 0) return { ok: false, message: 'Type how much.' }
  const unit = String(form.get('unit') || '')
  const cost = numOf(form.get('cost'))

  const items = await getItems()
  const usable = kind === 'purchase' ? (Number(items.find(i => i.key === key)?.usable_pct ?? 100) / 100) : 1
  let q: number
  if (def.unit === 'g' && unit === 'bag') {
    if (!def.bagG) return { ok: false, message: `${def.name} isn't bagged. Use kg or g.` }
    q = amount * def.bagG
  } else if (def.unit === 'g') q = unit === 'g' ? amount : amount * 1000
  else if (def.unit === 'fish') q = unit === 'kg' ? amount / 0.55 : amount
  else if (unit === 'kg') {
    if (!def.perKg) return { ok: false, message: `${def.name} is counted in pieces. Type pieces.` }
    q = amount * def.perKg
  } else q = amount
  // Bags are portioned after trimming, so they don't lose it again.
  if (unit !== 'bag') q *= usable

  const sign = kind === 'waste' || kind === 'remove' ? -1 : 1
  const row = {
    item: key, qty: sign * q,
    kind: kind === 'add' || kind === 'remove' ? 'correction' : kind,
    unit_cost: kind === 'purchase' && cost && cost > 0 ? cost / q : null,
    by: who(form),
    note: [reason, String(form.get('note') || '').trim()].filter(Boolean).join(' — ').slice(0, 200) || null,
  }
  const { error } = await supabase.from('stock_moves').insert(row)
  if (error) return { ok: false, message: error.message }
  refresh()
  return { ok: true, message: 'Saved.' }
}

/**
 * "This receipt line is <item>." Aliases ADD to what's there, never replace
 * (owner's standing rule), and a name already taught to a different item is
 * refused rather than silently moved.
 */
export async function teachAlias(_prev: Result, form: FormData): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  const key = String(form.get('item') || '')
  const text = String(form.get('text') || '').trim().toLowerCase().slice(0, 80)
  // IGNORE_KEY = "not stock" (vegetables, sauces, dry goods): learned the same
  // way, so the line is never asked about again.
  if ((key !== IGNORE_KEY && !ITEM[key]) || !text) return { ok: false, message: 'Pick an item.' }
  if (key === IGNORE_KEY) {
    const { data: row } = await supabase.from('stock_items').select('aliases').eq('key', IGNORE_KEY).maybeSingle()
    if (!row) {
      const { error } = await supabase.from('stock_items').insert({
        key: IGNORE_KEY, name: 'Not tracked (veg, sauces, dry goods)', unit: 'g', sort: 999, active: false, aliases: [text],
      })
      if (error) return { ok: false, message: error.message }
    } else if (!(row.aliases ?? []).includes(text)) {
      const { error } = await supabase.from('stock_items').update({ aliases: [...(row.aliases ?? []), text] }).eq('key', IGNORE_KEY)
      if (error) return { ok: false, message: error.message }
    }
    refresh()
    return { ok: true, message: 'Noted — I will not ask about that one again.' }
  }
  const items = await getItems()
  const clash = items.find(i => i.key !== key && i.aliases?.includes(text))
  if (clash) return { ok: false, message: `"${text}" is already taught as ${clash.name}. Remove it there first.` }
  const it = items.find(i => i.key === key)!
  if (it.aliases?.includes(text)) return { ok: true, message: 'Already known.' }
  const { error } = await supabase.from('stock_items').update({ aliases: [...(it.aliases ?? []), text] }).eq('key', key)
  if (error) return { ok: false, message: error.message }
  refresh()
  return { ok: true, message: `Learned: "${text}" is ${it.name}. Applies to receipts from now on.` }
}

// setMin used to live here. Removed 23 Sep 2026: the owner shouldn't have to
// configure a minimum per ingredient. Low = under 2 days at the current pace,
// worked out from the last 7 trading days.

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------
function linesFrom(form: FormData, size: string) {
  const out: { item: string; qty: number }[] = []
  for (let i = 0; i < 6; i++) {
    const item = String(form.get(`${size}_item_${i}`) || '')
    const qty = numOf(form.get(`${size}_qty_${i}`))
    if (!item || qty === null) continue
    if (!ITEM[item] || Number.isNaN(qty) || qty <= 0) return null
    out.push({ item, qty })
  }
  return out
}

/** Save one recipe's quantities. Saving marks it checked (no longer "my guess"). */
export async function saveRecipe(_prev: Result, form: FormData): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  const id = Number(form.get('id'))
  const S = linesFrom(form, 'S'), M = linesFrom(form, 'M')
  if (!S || !M) return { ok: false, message: 'Every line needs an item and a number above zero.' }
  const sizes: Record<string, any> = { S }
  if (M.length) sizes.M = M
  const { data: cur } = await supabase.from('recipes').select('sizes').eq('id', id).single()
  if (!cur) return { ok: false, message: 'That recipe no longer exists.' }
  if ((cur.sizes as any)?.L) sizes.L = (cur.sizes as any).L
  const { error } = await supabase.from('recipes').update({ sizes, guess: false, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { ok: false, message: error.message }
  refresh()
  return { ok: true, message: 'Saved. Tap “Re-apply” to update past days.' }
}

/** A recipe for a dish the book didn't know. Sorted first, so it wins over families. */
export async function addRecipe(_prev: Result, form: FormData): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  const dish = String(form.get('dish') || '').trim()
  const n = normName(dish)
  if (!n) return { ok: false, message: 'Type the dish name as it shows on EasyEat.' }
  const S = linesFrom(form, 'S')
  if (!S) return { ok: false, message: 'Every line needs an item and a number above zero.' }
  const variation = normName(String(form.get('variation') || ''))
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const key = 'owner-' + (n + (variation ? '-' + variation : '')).replace(/\s+/g, '-').slice(0, 60)
  const { error } = await supabase.from('recipes').upsert({
    key, label: dish.replace(/[฀-๿]+/g, '').trim() + (variation ? ` (${variation})` : ''),
    pattern: '^' + esc(n), variant: variation ? esc(variation) : null,
    sizes: { S }, guess: false, sort: 1, active: true, updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) return { ok: false, message: error.message }
  refresh()
  return { ok: true, message: S.length ? 'Recipe added. Tap “Re-apply” to update past days.' : 'Marked as having no tracked ingredients.' }
}

/** Re-run the recipes over recent days (from the dish lines stored on each day). */
export async function reapplyRecipes(_prev: Result, _form: FormData): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  const since = addDays(mytDate(), -14)
  const { data } = await supabase.from('records').select('*').eq('category', 'cash_in')
  const rows = (data ?? []).filter((r: any) => isSalesRow(r) && r.meta?.channel === 'dine_in' && salesDayOf(r) >= since)
  let n = 0
  for (const r of rows as any[]) {
    const lines = (r.meta?.lines ?? []).map((l: any) => ({
      category: l.category ?? '', sub: l.sub ?? (l.recipe === 'set' ? 'Set Menu' : ''), name: l.name,
      variation: l.variation ?? '', qty: Number(l.qty) || 0, price: 0, total: Number(l.total) || 0,
    }))
    if (!lines.length) continue
    await importDay({ date: salesDayOf(r), lines, total: Number(r.amount) || 0, qty: Number(r.meta?.qty) || 0 }, 'Re-applied recipes', r.meta?.file)
    n++
  }
  refresh()
  return { ok: true, message: n ? `Re-applied to ${n} day${n === 1 ? '' : 's'}.` : 'No days in the last two weeks to update.' }
}
