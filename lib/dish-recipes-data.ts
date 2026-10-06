import 'server-only'
// Reading and writing the recipe book.
//
// The pure half is lib/dish-recipes.ts. This half talks to the database and to
// the sold lines already sitting inside every daily sales record -- the dish
// report the owner sends Jarvis each morning is the only source of what the POS
// actually sold, variations included, so the worklist is built from it rather
// than from the EasyEat menu. A dish nobody has ever ordered does not need a
// recipe yet, and a combination that sold yesterday does.

import { supabase, supabaseConfigured } from './supabase'
import { SALES_KIND } from './sales'
import type { DishLine } from './easyeat'
import { VARIANT_GROUPS, ADDON_GROUP } from './easyeat-menu'
import {
  worklist, coverage, norm,
  type DishRecipe, type VariantGroup, type WorkRow,
} from './dish-recipes'

// ── categories with nothing to count ────────────────────────────────────────

export type RecipeCategory = {
  key: string; label: string; counted: boolean
  rows: number; items: number; sold: number; revenue: number
}

export async function getSkippedCategories(): Promise<Set<string>> {
  if (!supabaseConfigured) return new Set()
  const { data, error } = await supabase.from('recipe_categories').select('key').eq('counted', false)
  if (error) { console.warn('[CFO] recipe_categories:', error.message); return new Set() }
  return new Set((data ?? []).map((r: any) => r.key))
}

export async function setCategoryCounted(key: string, label: string, counted: boolean) {
  const { error } = await supabase.from('recipe_categories')
    .upsert({ key, label, counted, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

/**
 * Every category the POS has sold from, with what setting it aside would cost.
 *
 * The counts are of the FULL list, skip or no skip, so the screen can say
 * "Beverages: 194 rows" whether or not it is currently set aside.
 */
export async function getCategories(days = 90): Promise<RecipeCategory[]> {
  const [lines, book, groups, skipped] = await Promise.all([
    soldLines(days), getBook(), getGroups(), getSkippedCategories(),
  ])
  const all = worklist(lines, book, groups)
  const by = new Map<string, RecipeCategory>()
  for (const r of all) {
    const key = norm(r.category) || '(none)'
    let c = by.get(key)
    if (!c) {
      c = {
        key, label: r.category.trim() || 'No category',
        counted: !skipped.has(key),
        rows: 0, items: 0, sold: 0, revenue: 0,
      }
      by.set(key, c)
    }
    c.rows++
    c.sold += r.sold
    c.revenue += r.revenue
  }
  const names = new Map<string, Set<string>>()
  for (const r of all) {
    const key = norm(r.category) || '(none)'
    if (!names.has(key)) names.set(key, new Set())
    names.get(key)!.add(r.dish)
  }
  for (const [k, set] of names) { const c = by.get(k); if (c) c.items = set.size }
  return [...by.values()].sort((a, b) => b.rows - a.rows)
}

export type { DishRecipe, VariantGroup, WorkRow }

// ── variant groups ──────────────────────────────────────────────────────────

let groupsSeeded = false

/**
 * Put the 50 groups read off EasyEat in the table, undecided.
 *
 * `ignoreDuplicates` matters: a re-seed must never reach back in and undo a
 * decision the owner has already made.
 */
export async function ensureGroups(): Promise<void> {
  if (groupsSeeded || !supabaseConfigured) return
  const rows = [...VARIANT_GROUPS, ADDON_GROUP].map(g => ({
    key: g.key, label: g.label, options: g.options,
    affects_stock: null as boolean | null,
  }))
  const { error } = await supabase.from('variant_groups')
    .upsert(rows, { onConflict: 'key', ignoreDuplicates: true })
  if (error) { console.warn('[CFO] variant_groups seed:', error.message); return }
  groupsSeeded = true
}

export async function getGroups(): Promise<VariantGroup[]> {
  if (!supabaseConfigured) return []
  await ensureGroups()
  const { data, error } = await supabase.from('variant_groups').select('*').order('label')
  if (error) { console.warn('[CFO] variant_groups:', error.message); return [] }
  return (data ?? []).map((g: any) => ({
    key: g.key, label: g.label, options: g.options ?? [],
    affects_stock: g.affects_stock, seen: g.seen ?? 0,
  }))
}

export async function setGroupAffects(key: string, affects: boolean | null) {
  const { error } = await supabase.from('variant_groups')
    .update({ affects_stock: affects, updated_at: new Date().toISOString() }).eq('key', key)
  if (error) throw new Error(error.message)
}

// ── the book ────────────────────────────────────────────────────────────────

export async function getBook(): Promise<DishRecipe[]> {
  if (!supabaseConfigured) return []
  const out: DishRecipe[] = []
  // Paged. The book tops out around 200 rows today, but the receipt side was
  // silently truncated at PostgREST's 1,000 once already and once is enough.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('dish_recipes').select('*')
      .order('id').range(from, from + 999)
    if (error) { console.warn('[CFO] dish_recipes:', error.message); break }
    out.push(...(data ?? []).map((r: any) => ({ ...r, lines: r.lines ?? [] })))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function saveRecipe(r: DishRecipe, by: string): Promise<void> {
  const row = {
    kind: r.kind, dish: r.dish, dish_label: r.dish_label,
    variation_key: r.variation_key, variation_label: r.variation_label,
    lines: r.lines, sure: r.sure, note: r.note ?? null,
    updated_by: by, updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('dish_recipes')
    .upsert(row, { onConflict: 'kind,dish,variation_key' })
  if (error) throw new Error(error.message)
}

export async function deleteRecipe(kind: string, dish: string, variation_key: string) {
  const { error } = await supabase.from('dish_recipes').delete()
    .eq('kind', kind).eq('dish', dish).eq('variation_key', variation_key)
  if (error) throw new Error(error.message)
}

// ── what the POS has sold ───────────────────────────────────────────────────

export type SoldLine = { line: DishLine; day: string }

/**
 * Every line of every dish report filed, newest `days` of them.
 *
 * The lines were stored on the sales record when the report was imported, so
 * this needs no file and no EasyEat call -- it is the same data the owner has
 * been sending Jarvis every morning.
 */
export async function soldLines(days = 90): Promise<SoldLine[]> {
  if (!supabaseConfigured) return []
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const out: SoldLine[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('records')
      .select('meta')
      .eq('category', 'cash_in').eq('meta->>kind', SALES_KIND)
      .gte('meta->>sales_date', since)
      .order('id').range(from, from + 499)
    if (error) { console.warn('[CFO] soldLines:', error.message); break }
    for (const rec of data ?? []) {
      const m: any = rec.meta ?? {}
      const day = String(m.sales_date ?? '')
      for (const l of (Array.isArray(m.lines) ? m.lines : [])) {
        out.push({
          day,
          line: {
            category: String(l?.category ?? ''), sub: String(l?.sub ?? ''),
            name: String(l?.name ?? ''), variation: String(l?.variation ?? ''),
            qty: Number(l?.qty) || 0, price: 0, total: Number(l?.total) || 0,
          },
        })
      }
    }
    if (!data || data.length < 500) break
  }
  return out
}

/** The worklist and how much of the day's selling it covers. */
export async function buildWorklist(days = 90) {
  const [lines, book, groups, skip] = await Promise.all([
    soldLines(days), getBook(), getGroups(), getSkippedCategories(),
  ])
  const rows = worklist(lines, book, groups, skip)
  // What a set-aside category took with it, so the screen can say so rather
  // than quietly reporting a smaller job than the owner remembers agreeing to.
  const full = skip.size ? worklist(lines, book, groups) : rows
  const setAside = {
    rows: full.length - rows.length,
    sold: full.reduce((t, r) => t + r.sold, 0) - rows.reduce((t, r) => t + r.sold, 0),
  }
  return { rows, groups, book, cover: coverage(rows), days, setAside }
}

// ── ingredients ─────────────────────────────────────────────────────────────

export type Ingredient = { key: string; name: string; unit: string; counted: boolean }

export async function getIngredients(): Promise<Ingredient[]> {
  if (!supabaseConfigured) return []
  const { data, error } = await supabase.from('stock_items')
    .select('key, name, unit, counted, active, sort').eq('active', true).order('sort')
  if (error) { console.warn('[CFO] ingredients:', error.message); return [] }
  return (data ?? []).map((i: any) => ({
    key: i.key, name: i.name, unit: i.unit, counted: i.counted !== false,
  }))
}

/**
 * An ingredient named in a recipe that nobody counts yet.
 *
 * The owner wants the kitchen's knowledge written down now and the vegetables
 * measured once his team has worked out how (6 Oct 2026). So it goes in the
 * catalogue with counted=false: it shows in the recipe and in food cost, and it
 * writes no stock move, which is what stops it inventing a balance. Turning it
 * on later is one flag, with the recipes already written.
 */
export async function addIngredient(name: string, unit: string): Promise<Ingredient> {
  const clean = String(name).trim().slice(0, 60)
  if (!clean) throw new Error('An ingredient needs a name.')
  const key = norm(clean).replace(/ /g, '_').slice(0, 40)
  if (!key) throw new Error(`"${clean}" has no letters or numbers in it to make a name from.`)
  const { data: already } = await supabase.from('stock_items').select('key, name, unit, counted')
    .eq('key', key).maybeSingle()
  if (already) return { key: already.key, name: already.name, unit: already.unit, counted: already.counted !== false }
  const { error } = await supabase.from('stock_items').insert({
    key, name: clean, unit, counted: false, active: true, sort: 900,
  })
  if (error) throw new Error(error.message)
  return { key, name: clean, unit, counted: false }
}
