'use client'

import { useMemo, useState } from 'react'
import { RecipeEditor, type Ing, type EditorTarget } from './RecipeEditor'
import { markNothing } from './actions'
import type { RecipeLine } from '@/lib/dish-recipes'

// 📖 The recipe book as a worklist, not a blank form.
//
// The POS already knows every dish+variation that has been sold and how often,
// so nothing here asks "which dish?" -- it hands him the next one and sorts by
// VOLUME, because the first twenty rows are most of the food cost. The book is
// useful long before it is finished, and the progress bar counts dishes rather
// than rows so it says something true about coverage.
//
// Everything is local state. Opening a row, filtering, saving: none of it
// navigates (owner, 6 Oct 2026).

export type Row = {
  kind: 'dish' | 'set_part'
  category: string
  dish: string; dish_label: string
  variation_key: string; variation_label: string
  sold: number; revenue: number; days: number
  lines: RecipeLine[] | null
  sure: boolean
  note: string | null
}

const money = (n: number) => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const id = (r: Row) => `${r.kind}|${r.dish}|${r.variation_key}`

const FILTERS: { key: string; label: string; match: (r: Row) => boolean }[] = [
  { key: 'todo', label: 'Needs a recipe', match: r => r.kind === 'dish' && !r.lines },
  { key: 'sets', label: 'Set choices', match: r => r.kind === 'set_part' },
  { key: 'unsure', label: 'Not sure', match: r => !!r.lines && !r.sure },
  { key: 'done', label: 'Done', match: r => !!r.lines },
  { key: 'all', label: 'Everything', match: () => true },
]

export function Worklist({
  rows, ingredients, costs, days,
}: {
  rows: Row[]; ingredients: Ing[]; costs: Record<string, number>; days: number
}) {
  const [filter, setFilter] = useState('todo')
  const [open, setOpen] = useState<string | null>(null)
  // Rows opened in this sitting stay on screen even once they no longer match
  // the filter. Without this, saving under "Needs a recipe" refreshes the page
  // data, the row stops matching, the editor unmounts and the confirmation the
  // owner was reading disappears mid-sentence.
  const [touched, setTouched] = useState<Set<string>>(() => new Set())

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of FILTERS) c[f.key] = rows.filter(f.match).length
    return c
  }, [rows])

  const shown = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter) ?? FILTERS[0]
    return rows.filter(r => f.match(r) || touched.has(id(r)))
  }, [rows, filter, touched])

  const nextAfter = (key: string) => {
    const i = shown.findIndex(r => id(r) === key)
    for (let j = i + 1; j < shown.length; j++) if (!shown[j].lines) return shown[j]
    return shown.find(r => !r.lines && id(r) !== key) ?? null
  }

  return (
    <div className="lg rx">
      <div className="lg-filters" role="group" aria-label="Show">
        {FILTERS.map(f => (
          <button key={f.key} type="button"
            className={`lg-chip${filter === f.key ? ' is-on' : ''}`}
            aria-pressed={filter === f.key}
            disabled={counts[f.key] === 0 && f.key !== 'all'}
            onClick={() => { setFilter(f.key); setOpen(null) }}>
            {f.label}<span className="lg-n">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="lg-empty">Nothing here — that whole list is done.</p>
      ) : (
        <ol className="lg-rows rx-rows">
          {shown.map(r => {
            const k = id(r)
            const done = !!r.lines
            return (
              <li key={k} className={`lg-row rx-row${done ? ' is-done' : ' has-problem'}`}>
                <button type="button" className="lg-r-head" aria-expanded={open === k}
                  onClick={() => {
                    setTouched(t => new Set(t).add(k))
                    setOpen(o => (o === k ? null : k))
                  }}>
                  <span className="lg-name">
                    {r.dish_label}
                    {r.variation_label && <span className="rx-var"> {r.variation_label}</span>}
                  </span>
                  <span className="lg-amount num">{done ? '✓' : ''}</span>
                  <span className="lg-meta">
                    sold <span className="num">{r.sold}</span> in {r.days} day{r.days === 1 ? '' : 's'}
                    {r.revenue > 0 && <> · <span className="num">{money(r.revenue)}</span></>}
                    {r.kind === 'set_part' && ' · inside sets'}
                  </span>
                  {!done && <span className="lg-problem">no recipe yet</span>}
                  {done && !r.lines?.length && <span className="rx-none">nothing to count</span>}
                  {done && !!r.lines?.length && !r.sure && <span className="rx-unsure">saved, but you weren&rsquo;t sure</span>}
                </button>

                {/* One tap for the odd row inside a counted section that has
                    nothing in it -- "ICE (only ice without water)" and its
                    kind. A whole section goes in one tap on the other screen. */}
                {!done && open !== k && (
                  <form action={markNothing} className="rx-quick">
                    <input type="hidden" name="kind" value={r.kind} />
                    <input type="hidden" name="dish" value={r.dish} />
                    <input type="hidden" name="dish_label" value={r.dish_label} />
                    <input type="hidden" name="variation_key" value={r.variation_key} />
                    <input type="hidden" name="variation_label" value={r.variation_label} />
                    <button className="rx-quick-btn">Nothing to count</button>
                  </form>
                )}

                {open === k && (
                  <RecipeEditor
                    target={{
                      kind: r.kind, dish: r.dish, dish_label: r.dish_label,
                      variation_key: r.variation_key, variation_label: r.variation_label,
                      sold: r.sold, days: r.days, revenue: r.revenue,
                      lines: r.lines ?? [], sure: r.sure, note: r.note,
                    } satisfies EditorTarget}
                    ingredients={ingredients}
                    costs={costs}
                    nextLabel={nextAfter(k)?.dish_label ?? null}
                    onDone={ok => {
                      const nx = ok ? nextAfter(k) : null
                      if (nx) setTouched(t => new Set(t).add(id(nx)))
                      setOpen(nx ? id(nx) : null)
                      if (nx) {
                        // Keep the next row under the thumb rather than at the
                        // bottom of a long list.
                        requestAnimationFrame(() => {
                          document.getElementById(`rx-${id(nx)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        })
                      }
                    }}
                  />
                )}
                <span id={`rx-${k}`} className="rx-anchor" aria-hidden />
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
