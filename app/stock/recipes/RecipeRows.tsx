'use client'

// The ingredient lines of a recipe. Client-side only so the UNIT appears the
// moment an ingredient is picked: the owner was looking at an empty number box
// with no idea whether it wanted grams, pieces or bags (23 Sep 2026).
import { useState } from 'react'

export type ItemOpt = { key: string; name: string; unit: 'g' | 'pc' | 'fish'; bagG?: number }
export type Line = { item: string; qty: number }

const unitWord = (o?: ItemOpt) => (!o ? '' : o.unit === 'g' ? 'grams' : o.unit === 'fish' ? 'fish' : 'pieces')

// A sensible example, so the box is never a blank stare.
const hint = (o?: ItemOpt) => {
  if (!o) return ''
  if (o.unit === 'fish') return '1'
  if (o.unit === 'pc') return o.key === 'egg' ? '1' : '3'
  return o.bagG ? String(o.bagG) : '110'
}

export default function RecipeRows({ size, lines, blanks = 2, items }: {
  size: string; lines: Line[]; blanks?: number; items: ItemOpt[]
}) {
  const start: (Line | null)[] = [...lines]
  while (start.length < Math.min(6, lines.length + blanks)) start.push(null)
  const [picked, setPicked] = useState<string[]>(start.map(l => l?.item ?? ''))
  const by = (k: string) => items.find(i => i.key === k)

  return (
    <>
      {start.slice(0, 6).map((l, i) => {
        const opt = by(picked[i])
        return (
          <div key={i} className="st-input st-line">
            <select
              name={`${size}_item_${i}`}
              value={picked[i]}
              onChange={e => setPicked(p => p.map((x, j) => (j === i ? e.target.value : x)))}
            >
              <option value="">—</option>
              {items.map(it => (
                <option key={it.key} value={it.key}>
                  {it.name} ({unitWord(it)})
                </option>
              ))}
            </select>
            <input
              type="number" name={`${size}_qty_${i}`} inputMode="decimal" step="any" min="0"
              defaultValue={l ? +l.qty.toFixed(3) : ''}
              placeholder={hint(opt)}
              aria-label={opt ? `${opt.name} in ${unitWord(opt)}` : 'amount'}
            />
            <span className="co-dim st-unit">
              {opt ? (opt.unit === 'g' ? 'g' : opt.unit === 'fish' ? 'fish' : 'pcs') : ''}
            </span>
          </div>
        )
      })}
      {picked.some(k => by(k)?.bagG) && (
        <p className="co-meta">
          In <b>grams</b> for this one
          {picked.filter(k => by(k)?.bagG).map(k => by(k)!).slice(0, 1).map(o => (
            <span key={o.key}> — one bag is {o.bagG} g, so a bag-and-a-half is {Math.round(o.bagG! * 1.5)}</span>
          ))}
          .
        </p>
      )}
    </>
  )
}
