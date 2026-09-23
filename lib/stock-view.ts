// The buy list, without the Stock page around it.
//
// The dashboard needs the same answer the Stock page gives -- what runs out and
// what to pick up today -- so the arithmetic lives here rather than being
// written twice and drifting apart.
import { ITEM, fmtQty } from './stock-items'
import { forecastFor, shortTonight, buyFor, coverDays, roundBuy } from './stock-forecast'
import { mytDate } from './period'
import type { Move, ItemState } from './stock-data'

export type BuyRow = {
  key: string
  name: string
  unit: 'g' | 'pc' | 'fish'
  onHand: number
  perDay: number
  short: number                 // short for tonight, in the item's unit
  cover: number | null          // days of cover left
  buy: { qty: number; label: string }
  seen: boolean                 // has Jarvis ever seen this item arrive or be counted?
}

/** What to buy, thinnest cover first. `coverFor` days of cover is the target. */
export function buyList(state: ItemState[], moves: Move[], today = mytDate(), coverFor = 2): BuyRow[] {
  return state.map(st => {
    const usage = moves
      .filter(m => m.item === st.key && m.kind === 'sale' && m.sales_date)
      .map(m => ({ date: String(m.sales_date), qty: -m.qty }))
    const f = forecastFor(usage, today)
    return {
      key: st.key, name: st.name, unit: st.unit, onHand: st.onHand, perDay: f.perDay,
      short: shortTonight(st.onHand, f),
      cover: coverDays(st.onHand, f),
      buy: roundBuy(buyFor(st.onHand, f, coverFor), st.unit, ITEM[st.key]?.bagG),
      seen: moves.some(m => m.item === st.key && (m.kind === 'purchase' || m.kind === 'count')),
    }
  }).sort((a, b) => (a.cover ?? 99) - (b.cover ?? 99))
}

/** "2 bags" where an item is bagged, "3 pcs" where it is not. */
export const showQty = (key: string, qty: number, unit: 'g' | 'pc' | 'fish') => {
  const bagG = ITEM[key]?.bagG
  if (!bagG) return fmtQty(qty, unit)
  const n = Math.round((qty / bagG) * 10) / 10
  return `${n} bag${Math.abs(n) === 1 ? '' : 's'}`
}
