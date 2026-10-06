'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { saveDishRecipe, createIngredient, type SaveResult, type NewIngredientResult } from './actions'
import type { RecipeLine } from '@/lib/dish-recipes'

// One recipe, keyed in.
//
// The dish and the variation are READ-ONLY on purpose: they come straight off
// the POS line, so a recipe can never be typed in a way that fails to match the
// bill it belongs to. The old book matched dishes by regex and that is exactly
// how "Ikan Temenung 3 Rasa" ended up deducting siakap.
//
// Three things in here are doing the real checking:
//   - the 30-day total: 160 g looks fine, 3.84 kg either matches the freezer or
//     it does not, and that is the number a person can actually judge;
//   - the food cost, from what he really paid on recent receipts -- kg typed
//     where g was meant reads as 3,100% and the mistake is unmissable;
//   - "next one that needs a recipe", so a sitting of fifty is one flow.

export type Ing = { key: string; name: string; unit: string; counted: boolean }
export type EditorTarget = {
  kind: 'dish' | 'set_part'
  dish: string; dish_label: string
  variation_key: string; variation_label: string
  sold: number; days: number; revenue: number
  lines: RecipeLine[]; sure: boolean; note: string | null
}

type Draft = { ingredient: string; qty: string; unit: string }

const UNITS: Record<string, string[]> = {
  g: ['g', 'kg'], pc: ['pcs'], fish: ['fish'],
}
const unitsFor = (i: Ing | undefined) => (i ? UNITS[i.unit] ?? [i.unit] : ['g'])
const toBase = (qty: number, unit: string) => (unit === 'kg' ? qty * 1000 : qty)

const money = (n: number) => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const round = (n: number) => Math.round(n * 10) / 10

export function RecipeEditor({
  target, ingredients, costs, onDone, nextLabel,
}: {
  target: EditorTarget
  ingredients: Ing[]
  costs: Record<string, number>
  onDone: (saved: boolean) => void
  nextLabel: string | null
}) {
  const [res, run, busy] = useActionState<SaveResult, FormData>(saveDishRecipe, null)
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    target.lines.length
      ? target.lines.map(l => ({ ingredient: l.ingredient, qty: String(l.qty), unit: l.unit }))
      : [{ ingredient: '', qty: '', unit: '' }])
  const [sure, setSure] = useState(target.sure)
  const [note, setNote] = useState(target.note ?? '')
  const [adding, setAdding] = useState(false)
  const okRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (res?.ok) okRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [res])

  const byKey = new Map(ingredients.map(i => [i.key, i]))
  const set = (i: number, patch: Partial<Draft>) =>
    setDrafts(a => a.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  const pick = (i: number, key: string) => {
    const item = byKey.get(key)
    set(i, { ingredient: key, unit: item ? unitsFor(item)[0] : '' })
  }

  const payload = drafts
    .filter(d => d.ingredient && Number(d.qty) > 0)
    .map(d => ({
      ingredient: d.ingredient,
      qty: toBase(Number(d.qty), d.unit),
      unit: byKey.get(d.ingredient)?.unit ?? d.unit,
    }))

  // What this recipe would have used over the window just gone -- the check a
  // person can actually make against their own freezer.
  const over = payload.map(l => {
    const item = byKey.get(l.ingredient)!
    const total = l.qty * target.sold
    const show = item.unit === 'g' && total >= 1000 ? `${round(total / 1000)} kg` : `${round(total)} ${item.unit === 'g' ? 'g' : item.unit === 'fish' ? 'fish' : 'pcs'}`
    return { name: item.name.toLowerCase(), show, counted: item.counted }
  })
  const cost = payload.reduce((t, l) => t + l.qty * (costs[l.ingredient] ?? 0), 0)
  const each = target.sold > 0 ? target.revenue / target.sold : 0
  const pct = each > 0 && cost > 0 ? Math.round((cost / each) * 100) : null
  const uncounted = payload.some(l => !byKey.get(l.ingredient)?.counted)

  return (
    <div className="rx-edit">
      <form action={run}>
        <input type="hidden" name="kind" value={target.kind} />
        <input type="hidden" name="dish" value={target.dish} />
        <input type="hidden" name="dish_label" value={target.dish_label} />
        <input type="hidden" name="variation_key" value={target.variation_key} />
        <input type="hidden" name="variation_label" value={target.variation_label} />
        <input type="hidden" name="lines" value={JSON.stringify(payload)} />
        <input type="hidden" name="sure" value={sure ? 'yes' : 'no'} />
        <input type="hidden" name="note" value={note} />

        <div className="eyebrow">
          {target.kind === 'set_part' ? 'What this adds inside a set' : 'What one serving uses'}
        </div>

        {drafts.map((d, i) => {
          const item = byKey.get(d.ingredient)
          return (
            <div key={i} className="rx-line">
              <label className="cr-field rx-what">
                <span>Ingredient</span>
                <select value={d.ingredient} onChange={e => pick(i, e.target.value)}
                  className={d.ingredient ? '' : 'rf-missing'}>
                  <option value="">Choose…</option>
                  {ingredients.map(x => (
                    <option key={x.key} value={x.key}>
                      {x.name}{x.counted ? '' : ' — not counted yet'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cr-field rx-qty">
                <span>How much</span>
                <input inputMode="decimal" value={d.qty} placeholder="0"
                  onChange={e => set(i, { qty: e.target.value })} />
              </label>
              <label className="cr-field rx-unit">
                <span>Unit</span>
                <select value={d.unit} onChange={e => set(i, { unit: e.target.value })} disabled={!item}>
                  {unitsFor(item).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
              {drafts.length > 1 && (
                <button type="button" className="rx-rm"
                  onClick={() => setDrafts(a => a.filter((_, j) => j !== i))}
                  aria-label="Remove this ingredient">&times;</button>
              )}
            </div>
          )
        })}

        <div className="rx-adds">
          <button type="button" className="btn ghost"
            onClick={() => setDrafts(a => [...a, { ingredient: '', qty: '', unit: '' }])}>
            + Add ingredient
          </button>
          <button type="button" className="rx-newlink" onClick={() => setAdding(a => !a)}>
            Ingredient not in the list?
          </button>
        </div>

        {adding && <NewIngredient onAdded={() => setAdding(false)} />}

        {payload.length > 0 && (
          <div className="rx-check">
            <p className="rx-over">
              <b>{target.sold}</b> sold in the last {target.days === 1 ? 'day' : `${target.days} days of selling`} ={' '}
              {over.map((o, i) => (
                <span key={i}>{i > 0 && ', '}<span className="num">{o.show}</span> {o.name}</span>
              ))}
            </p>
            {cost > 0 && (
              <p className={`rx-cost${pct !== null && pct > 45 ? ' is-high' : ''}`}>
                About <span className="num">{money(cost)}</span> of stock
                {each > 0 && <> · sold at <span className="num">{money(each)}</span></>}
                {pct !== null && <> · <b>{pct}%</b> food cost</>}
              </p>
            )}
            {uncounted && (
              <p className="rx-uncounted">
                Some of this isn&rsquo;t counted yet, so it shows in the recipe but moves no stock.
              </p>
            )}
          </div>
        )}

        <label className="rx-sure">
          <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} />
          <span>I&rsquo;m sure about this one</span>
        </label>
        <label className="cr-field cr-wide">
          <span>Note (optional)</span>
          <input value={note} maxLength={300} placeholder="anything worth remembering about this dish"
            onChange={e => setNote(e.target.value)} />
        </label>

        {res && !res.ok && <div className="cr-error" role="alert">⚠️ {res.message}</div>}

        {res?.ok ? (
          <div ref={okRef} className="cr-saved" role="status">
            <p className="cr-saved-what"><b>Saved.</b> {res.message}</p>
            <div className="rx-after">
              {nextLabel && (
                <button type="button" className="btn" onClick={() => onDone(true)}>
                  Next: {nextLabel}
                </button>
              )}
              <button type="button" className="btn ghost" onClick={() => onDone(true)}>Close</button>
            </div>
          </div>
        ) : (
          <div className="rx-foot">
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save this recipe'}</button>
            <button type="button" className="btn ghost" onClick={() => onDone(false)}>Cancel</button>
          </div>
        )}
      </form>
    </div>
  )
}

/** Writing down an ingredient nobody counts yet, without leaving the recipe. */
function NewIngredient({ onAdded }: { onAdded: () => void }) {
  const [res, run, busy] = useActionState<NewIngredientResult, FormData>(createIngredient, null)
  useEffect(() => { if (res?.ok) onAdded() }, [res, onAdded])
  return (
    <div className="rx-new">
      <p className="co-meta">
        Add it now and count it later — it goes into the recipe and into food cost, but moves no
        stock until you turn counting on.
      </p>
      <div className="rx-new-row">
        <label className="cr-field rx-what">
          <span>Name</span>
          <input name="name" form="newing" placeholder="e.g. Kailan" maxLength={60} />
        </label>
        <label className="cr-field rx-unit">
          <span>Counted in</span>
          <select name="unit" form="newing" defaultValue="g">
            <option value="g">grams</option>
            <option value="pc">pieces</option>
            <option value="fish">fish</option>
          </select>
        </label>
        <button className="btn ghost" form="newing" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
      </div>
      <form id="newing" action={run} />
      {res && !res.ok && <p className="rp-bad">{res.message}</p>}
    </div>
  )
}
