import 'server-only'
// 👉 The owner's food diary: reading and writing meals, and costing one.
//
// THE LADDER, best first (owner's brief, 24 Sep 2026):
//   1. his own menu   -- the recipe book has real gram weights, so it is a sum
//   2. a common dish  -- nasi lemak, roti canai, teh tarik: a lookup table
//   3. the photo      -- Claude looks at the plate; only reached when 1 and 2 miss
// Every meal carries the working, so a number he disagrees with can be argued
// with line by line instead of being a mystery.
import { supabase, supabaseConfigured } from './supabase'
import { mytDate } from './period'
import { getRecipes } from './stock-data'
import { findRecipe, linesFor } from './recipes'
import {
  fromIngredients, findCommonDish, workingOf, budgetFor, ACTIVITY,
  type Body, type Estimate,
} from './nutrition'

export type Meal = {
  id: number
  day: string
  eaten_at: string
  title: string
  kcal: number
  source: 'photo' | 'typed' | 'menu'
  working: string | null
  confidence: 'high' | 'medium' | 'low'
  items: any[]
  sha256: string | null
  storage_path: string | null
  mime: string | null
  corrected: boolean
  meta: any
}

// ---------------------------------------------------------------------------
// The profile and the budget. Stored like the restaurant's fixed costs: a new
// row each time something changes, so the past keeps the figures it was judged
// against.
// ---------------------------------------------------------------------------
export const PROFILE_CATEGORY = 'me_profile'

export const DEFAULT_BODY: Body = {
  weight_kg: 85, height_cm: 170, age: 36, sex: 'male',
  activity: 'light',            // desk work, badminton once a week
  lose_kg_per_week: 0.5,
}

export async function getBody(): Promise<Body> {
  if (!supabaseConfigured) return DEFAULT_BODY
  const { data } = await supabase.from('records').select('meta, due_date')
    .eq('category', PROFILE_CATEGORY).eq('status', 'active').order('due_date', { ascending: false }).limit(1)
  const m = (data ?? [])[0]?.meta as Partial<Body> | undefined
  return m && m.weight_kg ? { ...DEFAULT_BODY, ...m } : DEFAULT_BODY
}

export async function saveBody(next: Body, why?: string): Promise<void> {
  if (!supabaseConfigured) return
  const today = mytDate()
  const { data: same } = await supabase.from('records').select('id')
    .eq('category', PROFILE_CATEGORY).eq('due_date', today).limit(1)
  const row = {
    title: `Body and budget from ${today}`, status: 'active', amount: 0,
    category: PROFILE_CATEGORY, due_date: today, notes: why ?? null, meta: next,
  }
  if (same?.length) await supabase.from('records').update(row).eq('id', same[0].id)
  else await supabase.from('records').insert(row)
}

/** The daily target, plus every step of how it was reached. */
export async function getBudget() {
  const body = await getBody()
  const b = budgetFor(body)
  return {
    body, ...b,
    activityLabel: ACTIVITY[body.activity].label,
    working:
      `Resting burn ${b.rest} · ${ACTIVITY[body.activity].label} x${ACTIVITY[body.activity].factor} = ${b.burn} a day · ` +
      `${body.lose_kg_per_week} kg a week means eating ${b.cut} less = ${b.target} kcal`,
  }
}

// ---------------------------------------------------------------------------
// Costing a meal
// ---------------------------------------------------------------------------
export type Costed = {
  title: string
  kcal: number
  working: string
  confidence: 'high' | 'medium' | 'low'
  lines: { what: string; kcal: number }[]
  source: 'menu' | 'typed' | 'photo'
  portionNote?: string
}

const round10 = (n: number) => Math.round(n / 10) * 10

/**
 * Did the recipe match on something that identifies the DISH, or on a single
 * generic word? The matched alternative has to be a real chunk of the name --
 * "fried squid" yes, "ayam" no.
 */
export function matchIsSpecific(dish: string, pattern: string): boolean {
  const n = ' ' + String(dish || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '
  for (const alt of String(pattern || '').split('|')) {
    const plain = alt.replace(/[\^$\\?*+()\[\]{}]/g, '').replace(/\s+/g, ' ').trim()
    if (plain.length >= 6 && n.includes(plain.toLowerCase())) return true
    // Regexy alternatives ("k[uw]e?a?y ?t[eu]o?w goreng") cannot be compared as
    // text, so judge them by how much they describe: two words or more.
    if (/[[\]?*+]/.test(alt) && alt.split(/\s+/).length >= 2) {
      try { if (new RegExp(alt, 'i').test(n)) return true } catch { /* bad pattern, ignore */ }
    }
  }
  return false
}

/**
 * From the owner's own menu. `portions` lets "two plates" or "half" ride along
 * without re-reading anything.
 */
export async function costFromMenu(dish: string, variation = '', portions = 1, loose = false): Promise<Costed | null> {
  const book = await getRecipes()
  const r = findRecipe(dish, variation, book)
  if (!r) return null
  // A recipe that matched only on a family word is NOT this dish. "Nasi lemak
  // ayam" matches the "Chicken dishes" family on the word ayam, and costing it
  // as 80 g of breast would say 140 kcal for a 950 kcal plate (24 Sep 2026).
  const specific = matchIsSpecific(dish, r.pattern)
  if (!specific && !loose) return null
  const use = linesFor(r, 'S')
  const each: Record<string, number> = {}
  for (const l of use) each[l.item] = (each[l.item] ?? 0) + l.qty * portions
  const e = fromIngredients(each, `${r.label} ${dish}`)
  if (!e.kcal) return null
  return {
    title: r.label + (portions !== 1 ? ` x${portions}` : ''),
    kcal: round10(e.kcal),
    working: (specific ? 'From your own recipe: ' : `Closest thing on your menu (${r.label}): `) + workingOf(e),
    confidence: specific ? e.confidence : 'low',
    lines: e.lines,
    source: 'menu',
  }
}

/** From the table of everyday dishes -- no photo, no model call. */
export function costFromCommon(text: string, portions = 1): Costed | null {
  const hit = findCommonDish(text)
  if (!hit) return null
  const kcal = round10(hit.kcal * portions)
  return {
    title: hit.name + (portions !== 1 ? ` x${portions}` : ''),
    kcal,
    working: `${hit.name}: ${hit.note}${portions !== 1 ? `, ${portions} servings` : ''} = ${kcal} kcal`,
    confidence: 'medium',
    lines: [{ what: hit.name, kcal }],
    source: 'typed',
  }
}

/**
 * Typed meal. Both routes are tried and the LARGER wins: the recipe knows the
 * protein exactly but not the sauce or the noodles, the table knows what a
 * whole plate comes to. Undercounting is the error that costs him the diet.
 */
export async function costTyped(text: string, portions = 1): Promise<Costed | null> {
  const [menu, common] = [await costFromMenu(text, '', portions), costFromCommon(text, portions)]
  if (menu && common) {
    return menu.kcal >= common.kcal
      ? { ...menu, working: `${menu.working} (a normal ${common.title.toLowerCase()} is about ${common.kcal})` }
      : { ...common, working: `${common.working} — more than your recipe's ${menu.kcal}, so I took the bigger` }
  }
  // Nothing named it exactly. A family recipe ("beef dishes") plus the carb and
  // the oil still beats saying "I don't know" -- and it says it is a guess.
  return menu ?? common ?? await costFromMenu(text, '', portions, true)
}

// ---------------------------------------------------------------------------
// Reading and writing the diary
// ---------------------------------------------------------------------------
export async function getMeals(days = 30): Promise<Meal[]> {
  if (!supabaseConfigured) return []
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase.from('meals').select('*').gte('day', since)
    .order('day', { ascending: false }).order('id', { ascending: false })
  if (error) { console.error('[CFO] meals read failed:', error.message); return [] }
  return (data ?? []) as Meal[]
}

export async function logMeal(m: {
  title: string; kcal: number; working?: string; confidence?: string; source: string
  items?: any[]; sha256?: string | null; storage_path?: string | null; mime?: string | null
  day?: string; meta?: any
}): Promise<Meal | null> {
  if (!supabaseConfigured) return null
  const row = {
    day: m.day ?? mytDate(),
    title: m.title.slice(0, 120),
    kcal: Math.max(0, Math.round(m.kcal)),
    source: m.source,
    working: m.working ?? null,
    confidence: m.confidence ?? 'medium',
    items: m.items ?? [],
    sha256: m.sha256 ?? null,
    storage_path: m.storage_path ?? null,
    mime: m.mime ?? null,
    meta: m.meta ?? {},
  }
  const { data, error } = await supabase.from('meals').insert(row).select('*').single()
  if (error) {
    // The same photo twice is not a second meal.
    if (/duplicate|unique/i.test(error.message)) return null
    console.error('[CFO] meal log failed:', error.message)
    return null
  }
  return data as Meal
}

/** "Half that", "two plates", "it was 300g" -- rewrite the number, keep the first one. */
export async function correctMeal(id: number, kcal: number, why: string): Promise<Meal | null> {
  if (!supabaseConfigured) return null
  const { data: cur } = await supabase.from('meals').select('*').eq('id', id).single()
  if (!cur) return null
  const meta = { ...(cur.meta ?? {}), first_estimate: (cur.meta as any)?.first_estimate ?? cur.kcal, corrections: [ ...(((cur.meta as any)?.corrections ?? []) as any[]), { from: cur.kcal, to: Math.round(kcal), why, at: new Date().toISOString() }] }
  const { data, error } = await supabase.from('meals')
    .update({ kcal: Math.max(0, Math.round(kcal)), corrected: true, working: `${cur.working ?? ''}${cur.working ? ' · ' : ''}corrected: ${why}`, meta })
    .eq('id', id).select('*').single()
  if (error) { console.error('[CFO] meal correction failed:', error.message); return null }
  return data as Meal
}

export async function deleteMeal(id: number): Promise<void> {
  if (!supabaseConfigured) return
  await supabase.from('meals').delete().eq('id', id)
}

/** The last meal logged today -- what "half that" refers to. */
export async function latestMeal(): Promise<Meal | null> {
  if (!supabaseConfigured) return null
  const { data } = await supabase.from('meals').select('*').order('id', { ascending: false }).limit(1)
  return ((data ?? [])[0] as Meal) ?? null
}

export const kcalOn = (meals: Meal[], day: string) =>
  meals.filter(m => m.day === day).reduce((t, m) => t + Number(m.kcal), 0)

/** Today in one line, for Telegram. */
export async function dayLine(day = mytDate()): Promise<string> {
  const [meals, budget] = await Promise.all([getMeals(2), getBudget()])
  const eaten = kcalOn(meals, day)
  const left = budget.target - eaten
  const list = meals.filter(m => m.day === day)
  if (!list.length) return `Nothing logged today. Budget ${budget.target} kcal.`
  return (
    list.map(m => `• ${m.title} — ${m.kcal}`).join('\n') +
    `\n\n${eaten} eaten · ${left >= 0 ? `${left} left` : `${-left} over`} of ${budget.target}`
  )
}

export type { Estimate }
