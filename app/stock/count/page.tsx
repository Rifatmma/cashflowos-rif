import Link from 'next/link'
import { getItems, getMoves, stockState } from '@/lib/stock-data'
import { ITEM } from '@/lib/stock-catalog'
import { CountForm } from './CountForm'

// 👉 Walk the freezer and type what is there.
//
// WHY THIS NEEDED ITS OWN SCREEN. The count already existed, as a collapsed
// <details> on the stock page whose summary said "not needed yet" and whose
// body said "the receipts do the counting the rest of the time"
// (app/stock/page.tsx:256-289). It has never once been used — there is not a
// single `count` move in the table — and six items are below zero as a result:
// lala -750 g, beef tongue -600 g, chicken leg -31 pieces. Those are not
// mysteries, they are a freezer that had food in it on the day the books opened
// and was recorded as empty.
//
// An item's FIRST count writes meta.opening, which is what makes the gap an
// opening balance rather than theft. So this is the one-way door: do it once,
// properly, after actually looking (owner, 5 Oct 2026).

export const dynamic = 'force-dynamic'

export default async function StockCount() {
  const [items, moves] = await Promise.all([getItems(), getMoves(3650)])
  const state = stockState(items, moves)

  const rows = state
    .map(s => ({
      ...s,
      bagG: ITEM[s.key]?.bagG ?? null,
      // What the field is asking for, in the unit the kitchen counts in.
      ask: s.unit === 'g' ? 'kg' : s.unit === 'fish' ? 'fish' : 'pieces',
      negative: s.onHand < 0,
    }))
    // Worst first: below zero, then never counted, then the rest.
    .sort((a, b) =>
      Number(b.negative) - Number(a.negative) ||
      Number(a.counted) - Number(b.counted) ||
      a.name.localeCompare(b.name))

  const negatives = rows.filter(r => r.negative)
  const neverCounted = rows.filter(r => !r.counted).length

  return (
    <div className="co">
      <h1 className="ph">Count the stock</h1>

      <p className="led-note">
        Type what is actually on the shelf. Anything you leave blank is left alone, so you can
        count three things today and the rest on Sunday.
      </p>

      {negatives.length > 0 && (
        <div className="cnt-alert">
          <b>{negatives.length} items are below zero.</b> That is not missing food — it is the
          freezer having had stock in it on the day the books opened, which nobody recorded. The
          first count of an item sets its opening balance and clears this for good.
          <ul>
            {negatives.map(r => (
              <li key={r.key}>
                {r.name} — <span className="num">{Math.round(r.onHand * 10) / 10}</span>{' '}
                {r.unit === 'g' ? 'g' : r.ask}
              </li>
            ))}
          </ul>
        </div>
      )}

      {neverCounted > 0 && negatives.length === 0 && (
        <p className="led-note">
          {neverCounted} items have never been counted, so their figure is only what the receipts
          add up to.
        </p>
      )}

      <CountForm rows={rows} />

      <p className="led-foot">
        <Link href="/stock">Back to stock</Link> · <Link href="/stock/recipes">Recipes</Link>
      </p>
    </div>
  )
}
