'use client'

import { useOptimistic, useTransition, useState } from 'react'
import { tagGroup } from '../actions'
import type { VariantGroup } from '@/lib/dish-recipes'

// Fifteen minutes that halve the rest of the job.
//
// Every one of these fifty groups appears in the POS variation column. Deciding
// ONCE that "Sugar level" does not reach the freezer is what takes 429 sold
// combinations down to about 150 -- so this screen is answered before the
// recipes are keyed, not after.
//
// Optimistic: the toggle moves the instant it is tapped and the save follows.
// Nothing reloads, nothing jumps (owner, 6 Oct 2026).

type Row = VariantGroup & { suggest: boolean }

export function VariationRows({ groups }: { groups: Row[] }) {
  const [, start] = useTransition()
  const [rows, setRow] = useOptimistic(
    groups,
    (state: Row[], next: { key: string; affects: boolean | null }) =>
      state.map(g => (g.key === next.key ? { ...g, affects_stock: next.affects } : g)))
  const [onlyOpen, setOnlyOpen] = useState(true)

  const left = rows.filter(g => g.affects_stock === null)
  const shown = onlyOpen && left.length ? left : rows

  const set = (key: string, affects: boolean | null) => {
    start(async () => {
      setRow({ key, affects })
      const fd = new FormData()
      fd.set('key', key)
      fd.set('affects', affects === true ? 'yes' : affects === false ? 'no' : '')
      await tagGroup(null, fd)
    })
  }

  return (
    <div className="vg">
      <div className="vg-top">
        <p className="vg-count">
          <b>{rows.length - left.length}</b> of {rows.length} decided
          {left.length === 0 && <> — all done.</>}
        </p>
        {left.length > 0 && (
          <button type="button" className="btn ghost" onClick={() => setOnlyOpen(o => !o)}>
            {onlyOpen ? 'Show all' : `Show the ${left.length} left`}
          </button>
        )}
      </div>

      {shown.map(g => {
        const undecided = g.affects_stock === null
        return (
          <section key={g.key} className={`vg-row${undecided ? ' is-open' : ''}`}>
            <div className="vg-head">
              <span className="vg-label">{g.label}</span>
              <span className="vg-n num">{g.options.length}</span>
            </div>
            <p className="vg-opts">{g.options.slice(0, 6).join(' · ')}
              {g.options.length > 6 && <> · +{g.options.length - 6} more</>}</p>

            <div className="vg-pick" role="group" aria-label={`Does ${g.label} change what is used?`}>
              <button type="button" aria-pressed={g.affects_stock === true}
                className={`vg-btn${g.affects_stock === true ? ' is-on' : ''}`}
                onClick={() => set(g.key, true)}>
                Changes what&rsquo;s used
              </button>
              <button type="button" aria-pressed={g.affects_stock === false}
                className={`vg-btn${g.affects_stock === false ? ' is-off' : ''}`}
                onClick={() => set(g.key, false)}>
                Doesn&rsquo;t change stock
              </button>
              {!undecided && (
                <button type="button" className="vg-undo" onClick={() => set(g.key, null)}>
                  undo
                </button>
              )}
            </div>

            {undecided && (
              <p className="vg-hint">
                My read: <b>{g.suggest ? 'changes what’s used' : 'doesn’t change stock'}</b> — but you decide.
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}
