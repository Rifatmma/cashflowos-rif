// The recipe book, keyed to what the POS actually sold.
//
// WHY THIS REPLACES lib/recipes.ts. The old book matched a dish by regex and
// carried S/M/L sizes. Measured against one real day (5 Oct 2026): one recipe
// stood in for five chicken dishes, `siakap` was deducting siakap for Ikan
// Temenung 3 Rasa, a Medium deducted the same as a Small, a beef green curry
// deducted chicken, and an added egg deducted nothing. 39% of the dishes sold
// moved no stock at all.
//
// The owner's instruction (6 Oct 2026) was full independence: every dish +
// variation combination gets its own complete recipe, inheriting nothing.
//
// WHAT MAKES THAT AFFORDABLE. Two things, both his decisions:
//   1. A variant group is tagged ONCE as moving stock or not. Sugar level, ice
//      and spiciness never do, so they are stripped out of the key -- which is
//      what takes 429 sold combinations down to about 150.
//   2. Sets are the one exception, because 91% of sets sold were a combination
//      never seen before (53 distinct out of 58 sold, over 9 days). A set's
//      choices are read off the line and resolved to `set_part` recipes typed
//      once. That is not inheritance: a set line genuinely IS several dishes.
//
// Pure. No database, no network -- everything here is testable directly.

import { variationParts, isSet, type DishLine } from './easyeat'

export type RecipeLine = {
  ingredient: string      // stock_items.key
  qty: number
  unit: string            // the ingredient's own unit: 'g' | 'pc' | 'fish'
}

export type DishRecipe = {
  id?: number
  kind: 'dish' | 'set_part'
  dish: string            // normalised POS item name ('' for a set part)
  dish_label: string
  variation_key: string   // normalised, sorted, stock-relevant parts only
  variation_label: string
  lines: RecipeLine[]
  sure: boolean
  note?: string | null
}

export type VariantGroup = {
  key: string
  label: string
  options: string[]
  affects_stock: boolean | null
  seen: number
}

// ── naming ──────────────────────────────────────────────────────────────────
// EasyEat prints three languages on one line: "Tomyum Chicken (ต้มยำไก่)",
// "Siakap Tiga Rasa (ปลากระพงสามรส)". Thai is dropped, the rest folded, so a
// name that gains or loses its Thai half still matches the recipe it had.

export const norm = (s: string): string =>
  String(s ?? '')
    .replace(/[฀-๿]+/g, ' ')        // Thai
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * The parts of a variation that change what comes out of the freezer.
 *
 * A part is kept when its group is tagged `affects_stock`. A part whose group
 * is unknown is KEPT, deliberately: an untagged group is one nobody has ruled
 * on, and silently dropping it would quietly merge two recipes that may differ.
 * The variations screen exists to empty that category.
 */
export function stockParts(variation: string, groups: VariantGroup[]): string[] {
  const off = new Set(
    groups.filter(g => g.affects_stock === false).flatMap(g => g.options.map(norm)))
  return variationParts(variation)
    .map(p => p.trim())
    .filter(p => p && !off.has(norm(p)))
}

/** Order-independent: "(Small)(Chicken)" and "(Chicken)(Small)" are one recipe. */
export const variationKey = (parts: string[]): string =>
  parts.map(norm).filter(Boolean).sort().join(' + ')

export const keyOf = (l: Pick<DishLine, 'name' | 'variation'>, groups: VariantGroup[]) =>
  ({ dish: norm(l.name), variation_key: variationKey(stockParts(l.variation, groups)) })

const idOf = (r: Pick<DishRecipe, 'kind' | 'dish' | 'variation_key'>) =>
  `${r.kind}\u0000${r.dish}\u0000${r.variation_key}`

export const bookIndex = (book: DishRecipe[]): Map<string, DishRecipe> =>
  new Map(book.map(r => [idOf(r), r]))

// ── what one sold line uses ─────────────────────────────────────────────────

export type Use = Record<string, number>

export type LineUse = {
  line: DishLine
  each: Use                     // per ONE of them
  status: 'deducted' | 'no-recipe' | 'partial'
  recipeId?: number
  /** Set choices with no `set_part` recipe yet -- named, so they can be fixed. */
  missing: string[]
}

const add = (into: Use, lines: RecipeLine[], times = 1) => {
  for (const l of lines) {
    if (!l?.ingredient || !(Number(l.qty) > 0)) continue
    into[l.ingredient] = (into[l.ingredient] ?? 0) + Number(l.qty) * times
  }
}

/**
 * A set line, resolved from its choices.
 *
 * "Set 2-4 Pax (Kuah Merah)(Siakap 3 Rasa)(Chicken Cashew Nuts)(Calamari Salted
 * Egg)(Crispy Fried Shrimp)(No add on)(3 plate rice)(No dessert)" is eight
 * choices; each one that has a `set_part` recipe contributes its portion. A
 * choice that says "no" to something contributes nothing and is not missing.
 */
const SAYS_NO = /^(no|tanpa|without)\b|^no\s|\bno add on\b|\bno dessert\b|\bno egg\b|\bno ice\b|\bno bingsu\b/i

function useForSet(line: DishLine, idx: Map<string, DishRecipe>): Omit<LineUse, 'line'> {
  const each: Use = {}
  const missing: string[] = []
  let found = 0
  for (const part of variationParts(line.variation)) {
    const p = part.trim()
    if (!p || SAYS_NO.test(p)) continue
    const r = idx.get(idOf({ kind: 'set_part', dish: norm(p), variation_key: '' }))
    if (r) { add(each, r.lines); found++ }
    else missing.push(p)
  }
  return {
    each,
    missing,
    status: found === 0 ? 'no-recipe' : missing.length ? 'partial' : 'deducted',
  }
}

export function useForLine(line: DishLine, book: DishRecipe[] | Map<string, DishRecipe>, groups: VariantGroup[]): LineUse {
  const idx = book instanceof Map ? book : bookIndex(book)
  if (isSet(line)) return { line, ...useForSet(line, idx) }
  const k = keyOf(line, groups)
  const r = idx.get(idOf({ kind: 'dish', ...k }))
  if (!r) return { line, each: {}, status: 'no-recipe', missing: [] }
  const each: Use = {}
  add(each, r.lines)
  return { line, each, status: 'deducted', recipeId: r.id, missing: [] }
}

export type DayUse = {
  results: LineUse[]
  total: Use
  /** Dishes sold whose recipe is missing -- the honest hole in the day. */
  noRecipe: { name: string; variation: string; qty: number; total: number }[]
  covered: number       // dishes with a recipe
  sold: number          // dishes sold
}

export function useForDay(lines: DishLine[], book: DishRecipe[], groups: VariantGroup[]): DayUse {
  const idx = bookIndex(book)
  const results = lines.map(l => useForLine(l, idx, groups))
  const total: Use = {}
  for (const r of results) for (const [k, q] of Object.entries(r.each)) total[k] = (total[k] ?? 0) + q * r.line.qty
  const sold = lines.reduce((t, l) => t + l.qty, 0)
  const covered = results.filter(r => r.status !== 'no-recipe').reduce((t, r) => t + r.line.qty, 0)
  return {
    results, total, sold, covered,
    noRecipe: results.filter(r => r.status === 'no-recipe')
      .map(r => ({ name: r.line.name, variation: r.line.variation, qty: r.line.qty, total: r.line.total })),
  }
}

// ── the worklist ────────────────────────────────────────────────────────────

export type WorkRow = {
  kind: 'dish' | 'set_part'
  category: string        // the POS category, so a whole one can be set aside
  dish: string
  dish_label: string
  variation_key: string
  variation_label: string
  sold: number            // dishes, over the window
  revenue: number
  days: number
  recipe: DishRecipe | null
}

/**
 * Every dish+variation the POS has actually sold, heaviest first.
 *
 * Sorted by VOLUME rather than alphabetically on purpose: the first twenty rows
 * are most of the food cost, so the book is useful long before it is finished.
 */
export function worklist(
  lines: { line: DishLine; day: string }[],
  book: DishRecipe[],
  groups: VariantGroup[],
  /** POS categories with nothing to count -- their rows never appear. */
  skip: Set<string> = new Set(),
): WorkRow[] {
  const idx = bookIndex(book)
  const seen = new Map<string, WorkRow & { dayset: Set<string> }>()

  const bump = (
    kind: 'dish' | 'set_part', category: string, dish: string, dish_label: string,
    variation_key: string, variation_label: string,
    qty: number, revenue: number, day: string,
  ) => {
    const id = idOf({ kind, dish, variation_key })
    let row = seen.get(id)
    if (!row) {
      row = {
        kind, category, dish, dish_label, variation_key, variation_label,
        sold: 0, revenue: 0, days: 0, dayset: new Set<string>(),
        recipe: idx.get(id) ?? null,
      }
      seen.set(id, row)
    }
    row.sold += qty
    row.revenue += revenue
    row.dayset.add(day)
  }

  for (const { line, day } of lines) {
    // A set is never skipped by its category: its CHOICES are real dishes and
    // the category on the line is the set's own ("Promotion"), not theirs.
    if (!isSet(line) && skip.has(norm(line.category))) continue
    if (isSet(line)) {
      // A set does not become a row of its own -- its CHOICES do, because that
      // is what gets typed in once and then resolves every future combination.
      for (const part of variationParts(line.variation)) {
        const p = part.trim()
        if (!p || SAYS_NO.test(p)) continue
        bump('set_part', line.category, norm(p), p, '', '', line.qty, 0, day)
      }
      continue
    }
    const parts = stockParts(line.variation, groups)
    bump('dish', line.category, norm(line.name), line.name.trim(),
      variationKey(parts), parts.join(' · '), line.qty, line.total, day)
  }

  return [...seen.values()]
    .map(({ dayset, ...r }) => ({ ...r, days: dayset.size }))
    .sort((a, b) =>
      Number(!!a.recipe) - Number(!!b.recipe) ||
      b.sold - a.sold ||
      a.dish_label.localeCompare(b.dish_label))
}

/** How much of what was sold the book now covers, by dishes rather than rows. */
export function coverage(rows: WorkRow[]) {
  const sold = rows.reduce((t, r) => t + r.sold, 0)
  const done = rows.filter(r => r.recipe)
  return {
    rows: rows.length,
    doneRows: done.length,
    sold,
    doneSold: done.reduce((t, r) => t + r.sold, 0),
    pct: sold > 0 ? Math.round((done.reduce((t, r) => t + r.sold, 0) / sold) * 100) : 0,
  }
}
