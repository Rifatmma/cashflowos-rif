import Link from 'next/link'
import { getGroups, soldLines, getCategories } from '@/lib/dish-recipes-data'
import { VARIANT_GROUPS, ADDON_GROUP } from '@/lib/easyeat-menu'
import { variationParts } from '@/lib/easyeat'
import { norm } from '@/lib/dish-recipes'
import { VariationRows } from './VariationRows'
import { CategoryRows } from './CategoryRows'

// 👉 Which choices on a bill actually change what leaves the freezer.
//
// Answer this once and the recipe worklist shrinks in front of you: a dish
// ordered at four sugar levels is one recipe, not four.

export const dynamic = 'force-dynamic'

export default async function Variations() {
  const [groups, lines, categories] = await Promise.all([getGroups(), soldLines(90), getCategories(90)])

  // How often each group has actually turned up on a bill, so the ones that
  // matter are not buried under fifty rows of equal weight.
  const seen = new Map<string, number>()
  for (const { line } of lines) {
    for (const p of variationParts(line.variation)) seen.set(norm(p), (seen.get(norm(p)) ?? 0) + line.qty)
  }
  const suggest = new Map([...VARIANT_GROUPS, ADDON_GROUP].map(g => [g.key, g.suggest]))

  const rows = groups
    .map(g => ({
      ...g,
      suggest: suggest.get(g.key) ?? true,
      seen: g.options.reduce((t, o) => t + (seen.get(norm(o)) ?? 0), 0),
    }))
    .sort((a, b) =>
      Number(a.affects_stock !== null) - Number(b.affects_stock !== null) ||
      b.seen - a.seen ||
      a.label.localeCompare(b.label))

  return (
    <div className="co">
      <h1 className="ph">What needs a recipe</h1>

      <h2 className="rx-h2">Whole sections with nothing to count</h2>
      <p className="led-note">
        Start here — it is the biggest saving on the list. A drink takes nothing off a shelf
        anybody counts, and Beverages alone is half the worklist. Setting a section aside
        doesn&rsquo;t delete anything: put it back and every row returns as it was.
      </p>
      <CategoryRows categories={categories} />

      <h2 className="rx-h2">Which choices change the recipe</h2>
      <p className="led-note">
        Every one of these appears on your bills. Say once whether it changes what comes out of the
        freezer — a Medium uses more chicken, but less sugar uses the same of everything. The ones
        you mark <i>doesn&rsquo;t change stock</i> stop splitting a dish into separate recipes.
      </p>

      <VariationRows groups={rows} />

      <p className="led-foot">
        <Link href="/recipes">The recipe book</Link> · <Link href="/stock">Stock</Link>
      </p>
    </div>
  )
}
