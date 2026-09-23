// 👉 Recipes — how much stock each dish takes, editable from the phone.
//
// Dishes the POS sold that no recipe matched come first (they took no stock),
// then my guesses to check, then the whole book, folded. Saving a recipe marks
// it checked; "Re-apply" re-runs the last two weeks with the new numbers.
import Link from 'next/link'
import { getRecords } from '@/lib/records'
import { getRecipes } from '@/lib/stock-data'
import { ITEM, ITEMS, fmtQty } from '@/lib/stock-items'
import { isSalesRow, salesDayOf } from '@/lib/sales'
import { addDays, mytDate } from '@/lib/period'
import { findRecipe, type Line } from '@/lib/recipes'
import ActionForm from '../ActionForm'
import RecipeRows from './RecipeRows'
import { saveRecipe, addRecipe, reapplyRecipes } from '../actions'

export const dynamic = 'force-dynamic'

const strip = (s: string) => String(s || '').replace(/[฀-๿]+/g, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim()
const say = (lines: Line[] = []) => lines.length ? lines.map(l => `${ITEM[l.item]?.name ?? l.item} ${fmtQty(l.qty, ITEM[l.item]?.unit ?? 'g')}`).join(' · ') : 'nothing tracked'

// Plain data for the client rows: no server objects cross the boundary.
const ITEM_OPTS = ITEMS.map(i => ({ key: i.key, name: i.name, unit: i.unit, bagG: i.bagG }))

export default async function Recipes() {
  const today = mytDate()
  const [recipes, all] = await Promise.all([getRecipes(), getRecords()])

  // Unmatched dishes on recent days, newest first, one row each.
  const recent = all.filter(r => isSalesRow(r) && salesDayOf(r) >= addDays(today, -30))
    .sort((a, b) => salesDayOf(b).localeCompare(salesDayOf(a)))
  const unmatched = new Map<string, { name: string; variation: string; qty: number }>()
  for (const r of recent) for (const u of (r.meta?.unmatched ?? []) as any[]) {
    // Checked against the LIVE recipe book, not the snapshot taken when the day
    // was imported -- a dish taught since then must drop off this list at once.
    if (findRecipe(String(u.name ?? ''), String(u.variation ?? ''), recipes)) continue
    const k = strip(u.name) + '|' + strip(u.variation)
    const cur = unmatched.get(k)
    if (cur) cur.qty += Number(u.qty) || 0
    else unmatched.set(k, { name: u.name, variation: u.variation ?? '', qty: Number(u.qty) || 0 })
  }
  const guesses = recipes.filter(r => r.guess)

  const Editor = ({ r }: { r: (typeof recipes)[number] }) => (
    <details className="co-rx st-recipe">
      <summary>
        <span className="co-rx-main">
          <span className="co-rx-name">{r.label}{r.guess && <span className="co-tag">MY GUESS</span>}</span>
          <span className="co-rx-sub">
            {r.sizes.M ? `S: ${say(r.sizes.S)} · M: ${say(r.sizes.M)}` : say(r.sizes.S)}
          </span>
        </span>
      </summary>
      <div className="co-rx-body">
        <ActionForm action={saveRecipe} submit={r.guess ? 'Correct — save' : 'Save'}>
          <input type="hidden" name="id" value={r.id} />
          <div className="eyebrow" style={{ margin: '4px 0' }}>{r.sizes.M ? 'Small' : 'Per portion'}</div>
          <RecipeRows size="S" lines={r.sizes.S ?? []} items={ITEM_OPTS} />
          <details className="st-msize" open={!!r.sizes.M}>
            <summary className="co-dim">Medium size</summary>
            <RecipeRows size="M" lines={r.sizes.M ?? []} blanks={r.sizes.M ? 1 : 3} items={ITEM_OPTS} />
          </details>
          {r.variant && <p className="co-meta">Used when the POS options say {r.variant.split('|').join(' or ')}.</p>}
        </ActionForm>
      </div>
    </details>
  )

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">Recipes</h1>
        <Link href="/stock" className="co-dim">← Stock</Link>
      </div>
      <p className="co-sub" style={{ marginTop: 0 }}>
        What <b>one portion</b> of each dish takes from stock. Pick the ingredient and the box tells you the unit:
        <b>grams</b> for breast, beef, octopus, lala and rice; <b>pieces</b> for shrimp, prawns, mussels, chicken
        feet and eggs; <b>fish</b> for siakap. Only proteins, eggs and rice are tracked; one rice portion = 110 g.
      </p>

      {unmatched.size > 0 && (
        <section className="co-card">
          <div className="eyebrow co-flag" style={{ marginBottom: 6 }}>Sold with no recipe · took no stock</div>
          {[...unmatched.values()].map(u => (
            <details key={u.name + u.variation} className="co-rx st-recipe" open={unmatched.size <= 2}>
              <summary>
                <span className="co-rx-main">
                  <span className="co-rx-name">{strip(u.name)}</span>
                  <span className="co-rx-sub">{strip(u.variation) || 'no options'} · {u.qty} sold</span>
                </span>
              </summary>
              <div className="co-rx-body">
                <ActionForm action={addRecipe} submit="Add recipe">
                  <input type="hidden" name="dish" value={u.name} />
                  <label className="st-field"><span>Only for these options (optional)</span>
                    <span className="st-input"><input type="text" name="variation" placeholder="e.g. beef" /></span>
                  </label>
                  <RecipeRows size="S" lines={[]} blanks={4} items={ITEM_OPTS} />
                  <p className="co-meta">
                    Amounts are for <b>one portion</b> of this dish. Leave every line empty and save to mark it as
                    having no tracked ingredients.
                  </p>
                </ActionForm>
              </div>
            </details>
          ))}
        </section>
      )}

      {guesses.length > 0 && (
        <section className="co-card">
          <div className="eyebrow" style={{ marginBottom: 6 }}>My guesses · please check</div>
          {guesses.map(r => <Editor key={r.id} r={r} />)}
        </section>
      )}

      <section className="co-card">
        <div className="co-row" style={{ marginBottom: 6 }}>
          <span className="eyebrow">Recipe book</span>
          <span className="co-dim num">{recipes.length}</span>
        </div>
        {recipes.filter(r => !r.guess).map(r => <Editor key={r.id} r={r} />)}
      </section>

      <section className="co-card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Changed a recipe?</div>
        <p className="co-sub" style={{ marginTop: 0 }}>Past days keep the recipe they were filed with until you re-apply.</p>
        <ActionForm action={reapplyRecipes} submit="Re-apply to the last 2 weeks" pendingLabel="Re-applying…" ghost>
          <span />
        </ActionForm>
      </section>
    </div>
  )
}
