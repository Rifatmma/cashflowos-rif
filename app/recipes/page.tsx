import Link from 'next/link'
import { buildWorklist, getIngredients } from '@/lib/dish-recipes-data'
import { getItems, getMoves, unitCosts } from '@/lib/stock-data'
import { Worklist, type Row } from './Worklist'

// 📖 The recipe book: one complete recipe per dish + variation, nothing inherited.
//
// WHY IT WAS REBUILT. The old book (lib/recipes.ts) matched dishes by regex and
// carried S/M/L sizes. On 5 Oct 2026 that meant one recipe stood in for five
// chicken dishes, Ikan Temenung 3 Rasa deducted siakap, a Medium deducted the
// same as a Small, a beef green curry deducted chicken, and 39% of the dishes
// sold moved no stock at all.
//
// The owner asked for full independence, and for a page he could sit down and
// key the whole thing into (6 Oct 2026). The worklist comes from his own daily
// dish reports, so it only ever asks about dishes that have actually sold.

export const dynamic = 'force-dynamic'

export default async function Recipes() {
  const [{ rows, groups, cover, days }, ingredients, items, moves] = await Promise.all([
    buildWorklist(90), getIngredients(), getItems(), getMoves(120),
  ])

  const costs = Object.fromEntries(
    Object.entries(unitCosts(moves, items)).map(([k, v]) => [k, (v as any).cost ?? 0]))

  const list: Row[] = rows.map(r => ({
    kind: r.kind, dish: r.dish, dish_label: r.dish_label,
    variation_key: r.variation_key, variation_label: r.variation_label,
    sold: r.sold, revenue: r.revenue, days: r.days,
    lines: r.recipe ? r.recipe.lines : null,
    sure: !!r.recipe?.sure,
    note: r.recipe?.note ?? null,
  }))

  const undecided = groups.filter(g => g.affects_stock === null).length

  return (
    <div className="co">
      <h1 className="ph">Recipes</h1>

      {undecided > 0 && (
        <div className="cnt-alert">
          <b>Start here: {undecided} of {groups.length} choices still need a decision.</b> Until you
          say which ones change what&rsquo;s used, a dish ordered at four sugar levels counts as four
          separate recipes. It takes about fifteen minutes and it shrinks this list.
          <p style={{ marginTop: 10 }}>
            <Link className="btn" href="/recipes/variations">Decide the choices</Link>
          </p>
        </div>
      )}

      <div className="rx-progress">
        <div className="rx-bar" aria-hidden>
          <span style={{ width: `${cover.pct}%` }} />
        </div>
        <p className="rx-progress-say">
          <b>{cover.doneRows}</b> of {cover.rows} done — covering <b>{cover.pct}%</b> of the{' '}
          <span className="num">{cover.sold.toLocaleString('en-MY')}</span> dishes sold in the last{' '}
          {days} days.
        </p>
      </div>

      <p className="led-note">
        Sorted by how much you actually sell, so the first rows are most of your food cost. The dish
        and the choice come from your POS and can&rsquo;t be edited — you only fill in what goes in.
      </p>

      <Worklist rows={list} ingredients={ingredients} costs={costs} days={days} />

      <p className="led-foot">
        <Link href="/recipes/variations">Which choices change the recipe</Link> ·{' '}
        <a href="/api/recipes/export">Download the book</a> ·{' '}
        <Link href="/stock">Stock</Link> · <Link href="/stock/count">Count stock</Link>
      </p>
    </div>
  )
}
