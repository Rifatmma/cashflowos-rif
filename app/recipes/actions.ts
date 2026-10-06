'use server'

// Saving the recipe book.
//
// Every save STAYS ON THE PAGE and returns what happened, rather than
// redirecting. Keying in 150 recipes is the longest sitting job in this app,
// and the receipt screen already proved what a redirect costs: "when I saved it
// the page reloads to October... that is not feasible for me at all"
// (owner, 6 Oct 2026).

import { revalidatePath } from 'next/cache'
import {
  saveRecipe, deleteRecipe, setGroupAffects, addIngredient, getIngredients,
  setCategoryCounted,
  type Ingredient,
} from '@/lib/dish-recipes-data'
import type { RecipeLine } from '@/lib/dish-recipes'

export type SaveResult =
  | { ok: true; message: string; lines: RecipeLine[] }
  | { ok: false; message: string }
  | null

export async function saveDishRecipe(_prev: SaveResult, form: FormData): Promise<SaveResult> {
  const kind = String(form.get('kind') || 'dish') as 'dish' | 'set_part'
  const dish = String(form.get('dish') || '')
  const dish_label = String(form.get('dish_label') || '')
  const variation_key = String(form.get('variation_key') || '')
  const variation_label = String(form.get('variation_label') || '')
  if (!dish) return { ok: false, message: 'That dish has no name — reload and try again.' }

  let raw: any[]
  try { raw = JSON.parse(String(form.get('lines') || '[]')) } catch {
    return { ok: false, message: 'Could not read the ingredients — reload and try again.' }
  }
  if (!Array.isArray(raw)) return { ok: false, message: 'Could not read the ingredients — reload and try again.' }

  const known = new Map((await getIngredients()).map(i => [i.key, i]))
  const lines: RecipeLine[] = []
  for (const [n, l] of raw.entries()) {
    const ingredient = String(l?.ingredient ?? '').trim()
    if (!ingredient) continue                       // a blank row is just an unused row
    const item = known.get(ingredient)
    if (!item) return { ok: false, message: `Line ${n + 1}: "${ingredient}" is not in the ingredient list.` }
    const qty = Number(l?.qty)
    if (!(qty > 0)) return { ok: false, message: `Line ${n + 1} (${item.name}): how much goes in? Enter a number above 0.` }
    lines.push({ ingredient, qty, unit: String(l?.unit || item.unit) })
  }

  // An empty recipe is allowed and meaningful: it is how the owner says "this
  // one genuinely takes nothing we count" (a plain Teh O), which is different
  // from never having looked at it. `sure` is what tells the two apart.
  const sure = String(form.get('sure') || '') === 'yes'
  if (!lines.length && !sure) {
    return { ok: false, message: 'Nothing was filled in. Add an ingredient, or mark it "I’m sure" to record that this dish uses nothing we count.' }
  }

  try {
    await saveRecipe({
      kind, dish, dish_label, variation_key, variation_label, lines, sure,
      note: String(form.get('note') || '').trim().slice(0, 300) || null,
    }, String(form.get('by') || 'Rif'))
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) }
  }

  revalidatePath('/recipes'); revalidatePath('/stock')
  // "1 pc eggs" reads like a typo. A weight keeps its unit, a count does not
  // need one -- the ingredient's own name already says what is being counted.
  const say = (l: RecipeLine) => {
    const name = known.get(l.ingredient)?.name ?? l.ingredient
    return l.unit === 'g' || l.unit === 'kg' ? `${l.qty} ${l.unit} ${name}` : `${l.qty} × ${name}`
  }
  const what = lines.length ? lines.map(say).join(', ') : 'nothing we count'
  return { ok: true, message: `${dish_label} uses ${what}.`, lines }
}

export async function clearDishRecipe(form: FormData): Promise<void> {
  await deleteRecipe(
    String(form.get('kind') || 'dish'),
    String(form.get('dish') || ''),
    String(form.get('variation_key') || ''))
  revalidatePath('/recipes')
}

export type GroupResult = { ok: boolean; message: string } | null

export async function tagGroup(_prev: GroupResult, form: FormData): Promise<GroupResult> {
  const key = String(form.get('key') || '')
  const v = String(form.get('affects') || '')
  if (!key) return { ok: false, message: 'Which group?' }
  try {
    await setGroupAffects(key, v === 'yes' ? true : v === 'no' ? false : null)
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) }
  }
  // Tagging a group re-keys the worklist: parts that no longer count are
  // dropped, which merges rows that were only ever separate because of them.
  revalidatePath('/recipes'); revalidatePath('/recipes/variations')
  return { ok: true, message: v === 'yes' ? 'Counted as part of the recipe.' : v === 'no' ? 'Ignored — it does not change stock.' : 'Back to undecided.' }
}

export type NewIngredientResult = { ok: boolean; message: string; item?: Ingredient } | null

export async function createIngredient(_prev: NewIngredientResult, form: FormData): Promise<NewIngredientResult> {
  const name = String(form.get('name') || '')
  const unit = String(form.get('unit') || 'g')
  try {
    const item = await addIngredient(name, unit)
    revalidatePath('/recipes'); revalidatePath('/stock')
    return {
      ok: true, item,
      message: `${item.name} added. It is written into recipes but not counted yet — turn counting on when you have a way to measure it.`,
    }
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) }
  }
}

export type CategoryResult = { ok: boolean; message: string } | null

/**
 * Set a whole POS category aside, or bring it back.
 *
 * Beverages alone is 194 of the 382 worklist rows and not one of them touches
 * a shelf the kitchen counts: "This item is drink which shouldn't be counted on
 * a stock so updating the recipe of this sounds a bit too much work"
 * (owner, 6 Oct 2026). Nothing is deleted — turning it back on returns every
 * row exactly as it was, which is what makes this safe to do now and revisit
 * when syrup and condensed milk become countable.
 */
export async function setCategory(_prev: CategoryResult, form: FormData): Promise<CategoryResult> {
  const key = String(form.get('key') || '')
  const label = String(form.get('label') || '')
  const counted = String(form.get('counted') || '') === 'yes'
  if (!key) return { ok: false, message: 'Which category?' }
  try {
    await setCategoryCounted(key, label, counted)
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) }
  }
  revalidatePath('/recipes'); revalidatePath('/recipes/variations')
  return {
    ok: true,
    message: counted ? `${label} is back on the list.` : `${label} set aside — nothing in it needs a recipe.`,
  }
}

/**
 * "There is nothing to count in this one", from the list, without opening it.
 *
 * Saved as a complete recipe with no ingredients and marked sure, which is a
 * different thing from never having looked: the book can tell the two apart and
 * so can the morning brief.
 */
export async function markNothing(form: FormData): Promise<void> {
  await saveRecipe({
    kind: String(form.get('kind') || 'dish') as 'dish' | 'set_part',
    dish: String(form.get('dish') || ''),
    dish_label: String(form.get('dish_label') || ''),
    variation_key: String(form.get('variation_key') || ''),
    variation_label: String(form.get('variation_label') || ''),
    lines: [], sure: true, note: null,
  }, String(form.get('by') || 'Rif'))
  revalidatePath('/recipes')
}
