import 'server-only'
// Stock and daily sales: every read and write against Supabase lives here.
//
// THE LEDGER. `stock_moves` is append-only: on hand = the sum of an item's moves.
//   purchase  +  from a receipt, or the phone form
//   sale      -  from the day's POS report (re-importing a day REPLACES that day's)
//   count     ±  the gap between what the book said and what staff counted
//   waste     -  thrown away, logged on the phone form
//   correction±  a manual fix
// A count's first ever row for an item is the OPENING stock; it's not waste.
//
// Seeding is automatic and additive: missing items/recipes are inserted, and an
// existing row is never overwritten -- the owner's edits always win.
import { supabase, supabaseConfigured } from './supabase'
import { ITEMS, ITEM, stockFromLine, type ReceiptLine, type Unit } from './stock-items'
import { RECIPE_SEED, useForDay, type Recipe, type Use } from './recipes'
import type { DishReport } from './easyeat'
import { SALES_KIND } from './sales'
import { addDays, mytDate } from './period'

export type ItemRow = {
  key: string; name: string; unit: Unit; min_level: number | null; aliases: string[]
  usable_pct: number; sort: number; active: boolean
}
export type Move = {
  id: number; item: string; qty: number; kind: string; unit_cost: number | null
  record_id: number | null; sales_date: string | null; by: string | null; note: string | null
  meta: any; created_at: string
}

let seeded = false
export async function ensureSeeded() {
  if (seeded || !supabaseConfigured) return
  const items = ITEMS.map(i => ({ key: i.key, name: i.name, unit: i.unit, sort: i.sort, usable_pct: i.usablePct ?? 100 }))
  const { error: e1 } = await supabase.from('stock_items').upsert(items, { onConflict: 'key', ignoreDuplicates: true })
  const recipes = RECIPE_SEED.map(r => ({
    key: r.key, label: r.label, pattern: r.pattern, variant: r.variant ?? null,
    variant_not: r.variant_not ?? null, sizes: r.sizes, guess: !!r.guess, sort: r.sort,
  }))
  const { error: e2 } = await supabase.from('recipes').upsert(recipes, { onConflict: 'key', ignoreDuplicates: true })
  if (e1 || e2) console.warn('[CFO] stock seed:', e1?.message, e2?.message)
  else seeded = true
}

export async function getItems(): Promise<ItemRow[]> {
  await ensureSeeded()
  const { data } = await supabase.from('stock_items').select('*').eq('active', true).order('sort')
  return (data ?? []) as ItemRow[]
}

export async function getRecipes(): Promise<(Recipe & { id: number; updated_at: string })[]> {
  await ensureSeeded()
  const { data } = await supabase.from('recipes').select('*').eq('active', true).order('sort')
  return (data ?? []).map((r: any) => ({ ...r, sizes: r.sizes ?? {} }))
}

export async function getMoves(sinceDays = 400): Promise<Move[]> {
  if (!supabaseConfigured) return []
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
  const out: Move[] = []
  // Paged: a busy kitchen writes ~15 sale moves a day.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('stock_moves').select('*')
      .gte('created_at', since).order('created_at').range(from, from + 999)
    if (error) { console.warn('[CFO] stock_moves:', error.message); break }
    out.push(...((data ?? []) as Move[]))
    if (!data || data.length < 1000) break
  }
  return out.map(m => ({ ...m, qty: Number(m.qty), unit_cost: m.unit_cost === null ? null : Number(m.unit_cost) }))
}

/** Aliases the owner taught ("this is…") keyed by item, for receipt matching. */
export const aliasMap = (items: ItemRow[]) =>
  Object.fromEntries(items.filter(i => i.aliases?.length).map(i => [i.key, i.aliases]))

/**
 * Every taught alias, including the "not stock" list (vegetables, sauces) which
 * lives on an inactive row so it never shows up as an ingredient.
 */
export async function taughtAliases(): Promise<Record<string, string[]>> {
  if (!supabaseConfigured) return {}
  await ensureSeeded()
  const { data } = await supabase.from('stock_items').select('key, aliases')
  return Object.fromEntries((data ?? []).filter((i: any) => i.aliases?.length).map((i: any) => [i.key, i.aliases]))
}

// ---------------------------------------------------------------------------
// The picture of stock the pages and Jarvis read.
// ---------------------------------------------------------------------------
export type ItemState = {
  key: string; name: string; unit: Unit; min: number | null
  onHand: number
  counted: boolean          // has ever been counted (else on-hand is a book figure from zero)
  lastCount: string | null  // YYYY-MM-DD, MYT
  perDay: number            // average used per trading day, last 7 days with sales
  daysLeft: number | null
  low: boolean
  cost: number              // RM per unit
  costEstimated: boolean    // true until a receipt gives the real price
}

export function unitCosts(moves: Move[], items: { key: string }[]) {
  const out: Record<string, { cost: number; estimated: boolean }> = {}
  for (const i of items) {
    const last = [...moves].reverse().find(m => m.item === i.key && m.kind === 'purchase' && m.unit_cost && m.unit_cost > 0)
    out[i.key] = last
      ? { cost: last.unit_cost!, estimated: false }
      : { cost: ITEM[i.key]?.fallbackCost ?? 0, estimated: true }
  }
  return out
}

export function stockState(items: ItemRow[], moves: Move[], today = mytDate()): ItemState[] {
  const costs = unitCosts(moves, items)
  const weekAgo = addDays(today, -7)
  return items.map(i => {
    const mine = moves.filter(m => m.item === i.key)
    const onHand = mine.reduce((t, m) => t + m.qty, 0)
    const counts = mine.filter(m => m.kind === 'count')
    const sales = mine.filter(m => m.kind === 'sale' && m.sales_date && m.sales_date > weekAgo)
    const days = new Set(sales.map(m => m.sales_date)).size
    const perDay = days ? -sales.reduce((t, m) => t + m.qty, 0) / days : 0
    const daysLeft = perDay > 0 ? Math.max(onHand, 0) / perDay : null
    const min = i.min_level === null || i.min_level === undefined ? null : Number(i.min_level)
    const counted = counts.length > 0
    // Low: under the owner's minimum, else under 2 days at the current pace.
    // Counting is optional (owner, 23 Sep: the receipts do the counting), so this
    // works off the book figure -- but an item that has never been counted AND
    // never been bought is just an empty row, not a warning.
    const known = counted || mine.some(m => m.kind === 'purchase')
    const low = known && onHand > -1 && (min !== null ? onHand < min : daysLeft !== null && daysLeft < 2)
    return {
      key: i.key, name: i.name, unit: i.unit, min, onHand, counted,
      lastCount: counted ? mytDate(counts.at(-1)!.created_at) : null,
      perDay, daysLeft, low, cost: costs[i.key].cost, costEstimated: costs[i.key].estimated,
    }
  })
}

/** RM of stock that went missing (count below the book) between two dates, per item. */
export function wasteBetween(moves: Move[], costs: Record<string, { cost: number }>, start: string, end: string) {
  const out: Record<string, { qty: number; rm: number }> = {}
  for (const m of moves) {
    if (m.kind !== 'count' || m.meta?.opening) continue
    const d = mytDate(m.created_at)
    if (d < start || d > end) continue
    const o = (out[m.item] ??= { qty: 0, rm: 0 })
    o.qty += -m.qty
    o.rm += -m.qty * (costs[m.item]?.cost ?? 0)
  }
  return out
}

export const costOfUse = (use: Use, costs: Record<string, { cost: number }>) =>
  Object.entries(use || {}).reduce((t, [k, q]) => t + Number(q) * (costs[k]?.cost ?? 0), 0)

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** File one day's POS report: the sales row, and that day's stock usage. Safe to repeat. */
export async function importDay(rep: DishReport, by: string, fileName?: string) {
  const recipes = await getRecipes()
  const items = await getItems()
  const day = useForDay(rep.lines, recipes)
  const tracked = new Set(items.map(i => i.key))

  const meta = {
    kind: SALES_KIND,
    sales_date: rep.date,
    channel: 'dine_in',
    source: 'easyeat',
    file: fileName || undefined,
    qty: rep.qty,
    sets_sold: day.setsSold,
    usage: day.total,
    unmatched: day.unmatched,
    lines: day.results.map(r => ({
      name: r.line.name, variation: r.line.variation, category: r.line.category, sub: r.line.sub || undefined,
      qty: r.line.qty, total: r.line.total, status: r.status,
      recipe: r.recipe?.key, guess: r.recipe?.guess || undefined, each: r.each,
      missing: r.missing?.length ? r.missing : undefined,
    })),
    filed_by: by,
    filed_at: new Date().toISOString(),
  }

  // One sales row per day per channel: update it if the day was filed before.
  const { data: existing } = await supabase.from('records').select('id')
    .eq('category', 'cash_in').eq('meta->>kind', SALES_KIND)
    .eq('meta->>sales_date', rep.date).eq('meta->>channel', 'dine_in').limit(1)
  let recordId: number
  const replaced = !!existing?.length
  if (replaced) {
    recordId = existing![0].id
    const { error } = await supabase.from('records')
      .update({ amount: rep.total, meta, status: 'paid', due_date: rep.date }).eq('id', recordId)
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await supabase.from('records').insert({
      title: `Sales ${rep.date} (dine-in)`, status: 'paid', amount: rep.total,
      category: 'cash_in', due_date: rep.date, notes: 'EasyEat daily dish report', meta,
    }).select('id').single()
    if (error) throw new Error(error.message)
    recordId = data.id
  }

  // Replace the day's sale moves so a re-upload never double-deducts.
  await supabase.from('stock_moves').delete().eq('kind', 'sale').eq('sales_date', rep.date).eq('meta->>channel', 'dine_in')
  const moves = Object.entries(day.total)
    .filter(([k, q]) => tracked.has(k) && q > 0)
    .map(([k, q]) => ({ item: k, qty: -q, kind: 'sale', record_id: recordId, sales_date: rep.date, by, meta: { channel: 'dine_in' } }))
  if (moves.length) {
    const { error } = await supabase.from('stock_moves').insert(moves)
    if (error) throw new Error(`stock: ${error.message}`)
  }
  return { recordId, replaced, day }
}

/**
 * Stock in from a filed receipt. Never throws: a receipt must still file even if
 * the stock side has a problem. Returns what it added and what it couldn't size.
 */
export async function receiptStockIn(recordId: number | null, lines: ReceiptLine[], by?: string) {
  try {
    if (!supabaseConfigured || !lines?.length) return { added: [], unsized: [] }
    const aliases = await taughtAliases()
    const rows: any[] = []
    const unsized: string[] = []
    // Some suppliers print their whole price list and charge for one line of it
    // -- Chop Chang Jiang listed egg grades AA/A/B/C/D, and the four with no
    // money against them each added an egg to the fridge (owner, 24 Sep 2026).
    // If anything on this receipt was paid for, the free-of-charge lines are
    // not purchases.
    const anyPriced = lines.some(l => Number(l.line_total) > 0)
    for (const l of lines) {
      if (l.expense_type && l.expense_type === 'owner_drawings') continue
      if (anyPriced && !(Number(l.line_total) > 0)) continue
      const r = stockFromLine(l, aliases)
      if (!Array.isArray(r)) { unsized.push(r.unknownQty); continue }
      for (const s of r) {
        rows.push({ item: s.item, qty: s.qty, kind: 'purchase', unit_cost: s.unit_cost, record_id: recordId, by: by ?? null, note: s.note ?? null, meta: { from: s.from } })
      }
    }
    if (rows.length) {
      const { error } = await supabase.from('stock_moves').insert(rows)
      if (error) { console.warn('[CFO] receipt stock-in:', error.message); return { added: [], unsized } }
    }
    return { added: rows.map(r => ({ item: r.item, qty: r.qty })), unsized }
  } catch (e: any) {
    console.warn('[CFO] receipt stock-in failed:', e?.message)
    return { added: [], unsized: [] }
  }
}
