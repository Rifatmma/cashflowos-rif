// 👉 Units. The one place a unit list may be declared.
//
// THERE ARE THREE KINDS OF UNIT, NOT THREE MISTAKES. Collapsing them into one
// list would be wrong, and that was my first instinct:
//
//   STORAGE  'g' | 'pc' | 'fish'
//     The ledger's currency, and WHAT RECIPES ARE WRITTEN IN. A recipe line is
//     {item, qty} with qty in this unit — three shrimp, 40 g squid, one third
//     of a leg quarter. Defined in stock-items.ts as `Unit`.
//
//   ENTRY    kg g pcs fish tray dozen bag pkt
//     What the owner says went on the shelf. A DECISION, made on the correction
//     page or the count form, in whatever unit he thinks in.
//
//   RECEIPT  kg g l ml pcs pkt box carton bottle can bag unit
//     What the supplier PRINTED. Evidence. A bill saying "btl" is a fact about
//     the bill; rewriting it to "bottle", or refusing to store it, destroys the
//     record of what the paper said.
//
// What was actually wrong was three lists for ONE role (entry), plus a fourth
// private vocabulary inside addMove using `pc` where everything else says `pcs`.
//
// THE ORDERING RULE, which is the whole fix for the owner's complaint:
//   the item's own storage unit first, then how it is bought, then conversions,
//   then `pkt` last.
// packUnitsFor used to return 'kg' first for every piece item with a perKg, and
// unitsFor(item)[0] is the default selection — so shrimp, chicken leg, crab and
// mussel all defaulted to kg while the recipes that consume them are counted in
// pieces (owner, 5 Oct 2026).

import { ITEM, WHOLE_BIRD_ITEM, type Unit } from './stock-catalog'

// ----------------------------------------------------------------- entry

export type EntryUnit = 'kg' | 'g' | 'pcs' | 'fish' | 'tray' | 'dozen' | 'bag' | 'pkt'

const ENTRY_WORDS: Record<EntryUnit, string> = {
  kg: 'kg', g: 'g', pcs: 'pieces', fish: 'fish',
  tray: 'trays (30)', dozen: 'dozen', bag: 'bags', pkt: 'packets (pkt)',
}
export const entryWord = (u: EntryUnit) => ENTRY_WORDS[u] ?? u

/** `addMove` spoke `pc`; everything else says `pcs`. Accepted on read, never offered. */
export function normaliseEntryUnit(u: string): EntryUnit | null {
  const s = String(u || '').trim().toLowerCase()
  const alias: Record<string, EntryUnit> = {
    pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs',
    kg: 'kg', kgs: 'kg', kilo: 'kg', kilogram: 'kg',
    g: 'g', gram: 'g', grams: 'g',
    fish: 'fish', ekor: 'fish',
    tray: 'tray', trays: 'tray',
    dozen: 'dozen', doz: 'dozen',
    bag: 'bag', bags: 'bag', beg: 'bag',
    pkt: 'pkt', packet: 'pkt', packets: 'pkt', pack: 'pkt',
  }
  return alias[s] ?? null
}

/**
 * The units an item may be entered in, best default first.
 *
 * Replaces unitsFor + packUnitsFor and the hardcoded selects on the stock page.
 */
export function entryUnitsFor(item: string): EntryUnit[] {
  // A whole bird is bought by the bird. "2 birds" was untypeable before.
  if (item === WHOLE_BIRD_ITEM) return ['pcs', 'kg', 'g']
  if (item === 'egg') return ['tray', 'pcs', 'dozen', 'pkt']

  const def = ITEM[item]
  if (!def) return []

  const out: EntryUnit[] = []
  const add = (u: EntryUnit) => { if (!out.includes(u)) out.push(u) }

  // 1. The item's own storage unit, so the default matches the recipe.
  if (def.unit === 'pc') add('pcs')
  else if (def.unit === 'fish') add('fish')
  else add('kg')                      // a gram item is bought and counted in kg

  // 2. How it is bought, when that differs.
  if (def.unit === 'pc' && def.perKg) add('kg')
  if (def.unit === 'fish') add('kg')

  // 3. The finer conversion.
  add('g')

  // 4. Portion bags, for anything the kitchen bags up.
  if (def.bagG) add('bag')

  // 5. Packets last — a wrapper around one of the above.
  add('pkt')
  return out
}

/** What one packet can hold: every unit of the item except packets. */
export const packUnitsFor = (item: string): EntryUnit[] =>
  entryUnitsFor(item).filter(u => u !== 'pkt')

/** The unit an item is entered in unless the owner says otherwise. */
export const defaultEntryUnit = (item: string): EntryUnit | undefined => entryUnitsFor(item)[0]

/** How a storage unit reads on its own, for labels and counts. */
export const storageWord = (u: Unit) => (u === 'g' ? 'kg' : u === 'fish' ? 'fish' : 'pieces')

// --------------------------------------------------------------- receipt

/**
 * What a supplier might print. Offered as a picker so the common cases are one
 * tap, but NEVER enforced: whatever is already stored stays selectable, and
 * "Other…" reveals a free-text box. A bill is evidence, and evidence that does
 * not fit the list is still evidence.
 */
export const RECEIPT_UNITS = [
  'kg', 'g', 'l', 'ml', 'pcs', 'pkt', 'box', 'carton',
  'tray', 'dozen', 'bottle', 'can', 'bag', 'unit',
] as const
export type ReceiptUnit = (typeof RECEIPT_UNITS)[number]

/**
 * The options to show for a receipt line, with whatever is already stored kept
 * at the top and labelled, so a correction never silently rewrites the bill.
 */
export function receiptUnitOptions(current?: string | null): { value: string; label: string }[] {
  const cur = String(current || '').trim().toLowerCase()
  const known = (RECEIPT_UNITS as readonly string[]).includes(cur)
  const out: { value: string; label: string }[] = []
  if (cur && cur !== 'unit' && !known) out.push({ value: cur, label: `${cur} — as printed` })
  for (const u of RECEIPT_UNITS) out.push({ value: u, label: u })
  return out
}
