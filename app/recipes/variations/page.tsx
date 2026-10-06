import Link from 'next/link'
import { getGroups, soldLines } from '@/lib/dish-recipes-data'
import { VARIANT_GROUPS, ADDON_GROUP } from '@/lib/easyeat-menu'
import { variationParts } from '@/lib/easyeat'
import { norm } from '@/lib/dish-recipes'
import { VariationRows } from './VariationRows'

// 👉 Which choices on a bill actually change what leaves the freezer.
//
// Answer this once and the recipe worklist shrinks in front of you: a dish
// ordered at four sugar levels is one recipe, not four.

export const dynamic = 'force-dynamic'

export default async function Variations() {
  const [groups, lines] = await Promise.all([getGroups(), soldLines(90)])

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
      <h1 className="ph">Which choices change the recipe</h1>

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
