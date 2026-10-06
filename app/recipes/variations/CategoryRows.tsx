'use client'

import { useOptimistic, useTransition } from 'react'
import { setCategory } from '../actions'
import type { RecipeCategory } from '@/lib/dish-recipes-data'

// Setting a whole menu category aside.
//
// The single highest-leverage tap in the whole build: Beverages is 194 of the
// 382 rows on the worklist, 31 drinks multiplied by their sugar, ice and size
// choices, and not one of them touches a shelf anybody counts.
//
// Nothing is deleted. Turning a category back on returns every row untouched,
// which is what makes it safe to set drinks aside today and revisit it the day
// syrup and condensed milk go into stock.

export function CategoryRows({ categories }: { categories: RecipeCategory[] }) {
  const [, start] = useTransition()
  const [rows, flip] = useOptimistic(
    categories,
    (state: RecipeCategory[], next: { key: string; counted: boolean }) =>
      state.map(c => (c.key === next.key ? { ...c, counted: next.counted } : c)))

  const set = (c: RecipeCategory, counted: boolean) => {
    start(async () => {
      flip({ key: c.key, counted })
      const fd = new FormData()
      fd.set('key', c.key); fd.set('label', c.label); fd.set('counted', counted ? 'yes' : 'no')
      await setCategory(null, fd)
    })
  }

  const off = rows.filter(c => !c.counted)
  const saved = off.reduce((t, c) => t + c.rows, 0)

  return (
    <div className="cg">
      {saved > 0 && (
        <p className="cg-saved">
          <b>{saved} rows</b> set aside — {off.map(c => c.label).join(', ')}.
        </p>
      )}
      <table className="mw-kw cg-table">
        <thead>
          <tr><th>Category</th><th className="num">Rows</th><th className="num">Sold</th><th /></tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.key} className={c.counted ? '' : 'is-off'}>
              <td>{c.label}<small className="cg-items"> · {c.items} item{c.items === 1 ? '' : 's'}</small></td>
              <td className="num">{c.rows}</td>
              <td className="num">{c.sold.toLocaleString('en-MY')}</td>
              <td>
                <button type="button" className={`cg-btn${c.counted ? '' : ' is-off'}`}
                  aria-pressed={!c.counted}
                  onClick={() => set(c, !c.counted)}>
                  {c.counted ? 'Nothing to count' : 'Put it back'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
