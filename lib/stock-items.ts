// How a receipt line becomes stock. The ingredient catalogue itself now lives in
// lib/stock-catalog.ts, re-exported here so every existing import still works.
//
// Every quantity is held in the item's own unit: grams, pieces, or fish. A
// receipt says "2 kg", a recipe says "6 shrimp", so the conversions live here in
// one place and both sides meet in the same unit.
//
// Pure: no server imports, safe to test directly.

export type { Unit, ItemDef } from './stock-catalog'
export { ITEMS, ITEM, NOT_STOCK_ITEM, WHOLE_BIRD_ITEM } from './stock-catalog'
import { ITEMS, ITEM, NOT_STOCK_ITEM, WHOLE_BIRD_ITEM } from './stock-catalog'
import type { Unit, ItemDef } from './stock-catalog'

// A whole bird isn't a stock item of its own: it becomes leg quarters plus
// breast the moment it's cut. Starting estimate (owner chose "estimate, the count
// corrects it"): one ~1.8 kg bird = 2 leg quarters + 300 g breast.
export const BIRD_KG = 1.8
export const BIRD_YIELD = { leg: 2, breast: 300 }
const WHOLE_BIRD = /(ayam segar|whole chicken|ayam proses|ayam bulat|ayam hidup)/

// Receipt lines that contain an alias word but are NOT the ingredient.
const NOT_STOCK = /(stok|stock|kiub|cube|perasa|serbuk|powder|sos|sauce|tepung|flour|mee|mi |bihun|kuey|noodle|minyak|oil|kicap|pes|paste|keropok|cracker|nugget|sosej|sausage|burger|masin kering|kering|dried|biskut|susu)/

/** Uses of `unit` and 'fish' are singular-friendly labels for the UI. */
export function fmtQty(q: number, unit: Unit): string {
  const r = (x: number, dp = 0) => x.toLocaleString('en-MY', { maximumFractionDigits: dp })
  if (unit === 'g') return Math.abs(q) >= 1000 ? `${r(q / 1000, 2)} kg` : `${r(q)} g`
  if (unit === 'fish') return `${r(q, 1)} fish`
  return `${r(q, 1)} pc${Math.abs(q) === 1 ? '' : 's'}`
}

export type ReceiptLine = {
  name: string; qty?: number; unit?: string; line_total?: number
  pack_size?: number; pack_unit?: string; base_qty?: number; base_unit?: string
  expense_type?: string
  /** The owner's own answer to "what went on the shelf": beats reading the name. */
  stock?: StockChoice
}

// ---------------------------------------------------------------------------
// The owner says what a line is, in the unit they think in.
//
// Owner, 27 Sep 2026: "an option to choose whether it's chicken, beef, fresh
// shrimp, frozen shrimp, then insert the quantity, and also an option to choose
// a unit, cause not all of the stock are recorded as kg". Reading the item from
// a receipt name, and its weight from "2KG" in that name, is what went wrong on
// line after line; a choice made on the correction page is not guessed at.
// ---------------------------------------------------------------------------
export type { EntryUnit as StockUnit } from './units'
import type { EntryUnit } from './units'
/**
 * A packet only means something with what is in it: "3 pkt, each 1 kg". So
 * `pkt` carries `per` + `perUnit` (one of the item's other units), and is
 * turned into that unit before anything else (owner, 27 Sep 2026).
 */
export type StockChoice = { item: string; qty: number; unit: EntryUnit; per?: number; perUnit?: EntryUnit }
export { entryWord as unitWord } from './units'

// THE UNIT LISTS NOW LIVE IN lib/units.ts, which is the only place one may be
// declared. These two stay as the names the rest of the app already calls.
//
// The old order put 'kg' first for every piece item that had a perKg, and
// unitsFor(item)[0] is the default selection -- so shrimp, chicken leg, crab and
// mussel all defaulted to kilograms while the RECIPES that consume them are
// written in pieces. The item's own storage unit now comes first
// (owner, 5 Oct 2026).
import { entryUnitsFor, packUnitsFor as packUnitsForItem } from './units'
export const unitsFor = entryUnitsFor
export const packUnitsFor = packUnitsForItem

/** Stock from an explicit choice. Same conversions and trimming as a read receipt. */
export function stockFromChoice(c: StockChoice, lineTotal: number, from: string): StockIn[] | { unknownQty: string; item: string } {
  const qty = Number(c.qty)
  const total = Number(lineTotal) || 0
  if (c.item === NOT_STOCK_ITEM) return []
  if (!(qty > 0) || !unitsFor(c.item).includes(c.unit)) return { unknownQty: from, item: c.item }
  if (c.unit === 'pkt') {
    // "3 pkt, each 1 kg" is 3 kg: unpack, then the usual conversion.
    const per = Number(c.per)
    if (!(per > 0) || !c.perUnit || !packUnitsFor(c.item).includes(c.perUnit)) return { unknownQty: from, item: c.item }
    const r = stockFromChoice({ item: c.item, qty: qty * per, unit: c.perUnit }, total, from)
    if (!Array.isArray(r)) return r
    const packs = `${fmtNum(qty)} pkt x ${fmtNum(per)} ${c.perUnit === 'pcs' ? 'pieces' : c.perUnit}`
    return r.map(s => ({ ...s, note: s.note?.replace('set by owner: ', `set by owner: ${packs} = `) }))
  }
  const kg = c.unit === 'kg' ? qty : c.unit === 'g' ? qty / 1000 : null

  if (c.item === WHOLE_BIRD_ITEM) {
    return stockFromLine({ name: 'ayam segar', qty: 1, unit: 'kg', base_qty: kg!, base_unit: 'kg', line_total: total })
  }
  const def = ITEM[c.item]
  const usable = (def.usablePct ?? 100) / 100
  const trim = usable < 1 ? `, less ${Math.round((1 - usable) * 100)}% trimmed off` : ''
  let q: number
  let how: string
  if (def.unit === 'g') { q = kg! * 1000 * usable; how = `${fmtNum(kg!)} kg${trim}` }
  else if (def.unit === 'fish') {
    if (kg) { q = kg / FISH_KG; how = `${fmtNum(kg)} kg / ${FISH_KG * 1000} g a fish` }
    else { q = qty; how = `${fmtNum(qty)} fish` }
  } else if (kg) { q = kg * def.perKg! * usable; how = `${fmtNum(kg)} kg at ${def.perKg} per kg${trim}` }
  else if (c.unit === 'tray') { q = qty * EGGS_PER_TRAY; how = `${fmtNum(qty)} trays x ${EGGS_PER_TRAY}` }
  else if (c.unit === 'dozen') { q = qty * 12; how = `${fmtNum(qty)} dozen x 12` }
  else { q = qty; how = `${fmtNum(qty)} pieces` }
  return [{ item: c.item, qty: q, unit_cost: total > 0 ? total / q : null, from, note: `set by owner: ${how}` }]
}

/**
 * The reading stockFromLine would make, as a choice the owner can then edit:
 * "CHN FRZ CHICKEN B/BREAST 2KG" x 2 -> chicken breast, 4 kg. Starting from
 * this means picking the item only needs the number checked, not retyped.
 */
export function choiceFromLine(l: ReceiptLine, extraAliases: Record<string, string[]> = {}): StockChoice | null {
  const key = itemForName(l.name, extraAliases)
  if (!key) return null
  if (key === WHOLE_BIRD_ITEM) { const kg = kgOf(l); return kg ? { item: key, qty: kg, unit: 'kg' } : null }
  const def = ITEM[key]
  const r = stockFromLine({ ...l, stock: undefined }, extraAliases)
  const q = Array.isArray(r) && r[0]?.item === key ? r[0].qty : null
  if (!q) return null
  const usable = (def.usablePct ?? 100) / 100
  const round = (n: number) => Math.round(n * 1000) / 1000
  if (def.unit === 'g') return { item: key, qty: round(q / 1000 / usable), unit: 'kg' }
  if (def.unit === 'fish') return { item: key, qty: round(q), unit: 'fish' }
  if (key === 'egg') return q % EGGS_PER_TRAY === 0 ? { item: key, qty: q / EGGS_PER_TRAY, unit: 'tray' } : { item: key, qty: round(q), unit: 'pcs' }

  // A PIECE ITEM READ FROM A WEIGHT IS CONVERTED TO PIECES.
  //
  // I argued the other way on 5 Oct 2026: that turning "2 KG UDANG" into a
  // piece count dresses a conversion up as a reading. The owner overruled it,
  // and he is right about his own system:
  //
  //   "for me the 2 kg udang should mean 66 pieces cause the logic I set up
  //    right? The recipe use pieces so you must translate the kg to pieces.
  //    each kg have about 33 pieces of shrimp. Let's do 35 pieces instead."
  //                                                     (owner, 6 Oct 2026)
  //
  // 66 was his arithmetic at the old rate of 33. At the 35 he set in the same
  // breath the same bill reads 70.
  //
  // Pieces are the kitchen's unit: every recipe is written in them and every
  // pc item's ledger is kept in them, so a weight was ALWAYS going to be
  // converted -- stockFromChoice did it one step later, out of sight. Leaving
  // the picker on kg only meant the owner read a figure the books did not use.
  //
  // What answers my objection is that the conversion shows its working rather
  // than hiding it: the stock note still reads "2 kg at 35 per kg", the bill's
  // own line keeps the weight exactly as printed, and kg is still in the picker
  // one tap away for a bill that is better left as a weight.
  return { item: key, qty: round(q), unit: 'pcs' }
}

export type StockIn = { item: string; qty: number; unit_cost: number | null; from: string; note?: string }

// Names the owner has marked "not stock" -- vegetables, sauces, dry goods. Kept
// under this key in the taught-alias map so the same "this is…" picker can also
// mean "stop asking me about this one".
const WEIGHT_UNIT = /^(kg|kilo|kilos|g|gm|gram|grams)$/i
// A unit column that states a COUNT. Malay and Thai included: a market bill in
// Selangor prints "ekor" or "biji" as often as "pcs".
const COUNT_UNIT = /^(pc|pcs|piece|pieces|ekor|biji|butir|unit|units|ตัว)$/i

// A siakap weighs 500-600 g. The owner settled on 550: "cannot be exactly 5
// every time" (24 Sep 2026), so the middle of his range it is -- 4 kg reads as
// 7.3 fish rather than a flattering 8, and the weekly count keeps it honest.
export const FISH_KG = 0.55

export const IGNORE_KEY = '__ignore'

const FROZEN = /(^|[^a-z])(frz|fzn|frozen|beku|iqf)([^a-z]|$)|แช่แข็ง/
const SHRIMP_WORD = /(udang|prawn|shrimp|กุ้ง)/
const SQUID_WORD = /(sotong|squid|calamari|หมึก)/

/** Which stock item a receipt name means, if any. Owner-taught aliases win. */
export function itemForName(name: string, extraAliases: Record<string, string[]> = {}): string | 'bird' | null {
  const n = ' ' + String(name || '').toLowerCase() + ' '
  // Taught aliases first: an exact "this is…" from the owner beats any guess.
  if ((extraAliases[IGNORE_KEY] ?? []).some(a => a && n.includes(a.toLowerCase()))) return null
  for (const [key, list] of Object.entries(extraAliases)) {
    if (key === IGNORE_KEY) continue
    if (list.some(a => a && n.includes(a.toLowerCase()))) return key
  }
  if (WHOLE_BIRD.test(n)) return 'bird'
  if (NOT_STOCK.test(n)) return null
  // The frozen items, checked on their own. On a supplier line the frozen marker
  // and the seafood word sit at opposite ends -- "FRZ SHUDANG PRAWN SIZE 41/50
  // IQF 1KG JPK" -- so an alias that wants them side by side misses it and the
  // bag lands in the fresh item (owner, 23 Sep 2026). Galah is never frozen stock.
  if (FROZEN.test(n)) {
    if (SHRIMP_WORD.test(n) && !/galah|แม่น้ำ/.test(n)) return 'shrimp_frozen'
    if (SQUID_WORD.test(n)) return 'squid_frozen'
  }
  // Most specific first: "udang galah" must not land on shrimp, "kaki ayam" not on breast.
  for (const key of ['galah', 'feet', 'tongue', 'breast', 'leg', 'shrimp_frozen', 'shrimp', 'crab', 'squid_frozen', 'squid', 'mussel', 'lala', 'siakap', 'beef', 'egg', 'rice']) {
    if (ITEM[key].aliases.some(a => new RegExp(a).test(n))) return key
  }
  return null
}

/** kg in a receipt line: its printed weight, else the name ("10KG"), else the item's usual pack. */
function kgOf(l: ReceiptLine, def?: ItemDef): number | null {
  if (typeof l.base_qty === 'number' && l.base_qty > 0 && (l.base_unit === 'kg' || !l.base_unit)) return l.base_qty
  const m = String(l.name).match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i)
  const qty = Number(l.qty) > 0 ? Number(l.qty) : 1
  if (m) return (m[2].toLowerCase() === 'kg' ? Number(m[1]) : Number(m[1]) / 1000) * qty
  // A loose weighed item often comes back as qty in kg.
  if (l.unit && /^kg$/i.test(l.unit)) return qty
  if (def?.defaultPackKg) return def.defaultPackKg * qty
  return null
}

/** 4 -> "4", 1.078 -> "1.078", 3.2900 -> "3.29": no trailing zeros in the working. */
const fmtNum = (n: number) => String(Math.round(n * 1000) / 1000)

/**
 * Is the count on the line the count for the WHOLE line rather than per pack?
 * True when the staff typed it as a quantity in pieces ("Quantity: 50 pieces"),
 * which the typed-bill parser marks by unit and by putting it in the name.
 */
const packIsTotal = (l: ReceiptLine) => /^(pcs|pieces?)$/i.test(String(l.unit ?? ''))

/**
 * How many eggs one unit holds.
 *
 * Chop Chang Jiang's bill says "5 papan" by hand -- papan telur, the Malay egg
 * tray of 30 -- and it was read as 5 dozen, then as 5 eggs (owner, 24 Sep 2026).
 * A dozen is twelve, a papan/tray/dulang is thirty.
 */
const EGGS_PER_TRAY = 30
const wordsOf = (l: ReceiptLine) => `${l.unit ?? ''} ${l.name ?? ''}`
const dozensOf = (l: ReceiptLine) =>
  /(^|[^a-z])(doz|dozen|dozens|dzn|dz)([^a-z]|$)|โหล/i.test(wordsOf(l)) ? 12 : 1
const traysOf = (l: ReceiptLine) =>
  /(^|[^a-z])(papan|tray|trays|dulang|แผง)([^a-z]|$)/i.test(wordsOf(l)) ? EGGS_PER_TRAY : 1
// Loose eggs, said out loud. Anything else is a tray -- see the egg branch.
const looseEggs = (l: ReceiptLine) =>
  /(^|[^a-z])(pcs?|pieces?|biji|butir|ulas)([^a-z]|$)/i.test(wordsOf(l))

/** Pieces printed on a pack: "TELUR GRED A 30S", "10 BIJI". */
function packCount(name: string): number | null {
  const m = String(name).match(/(\d+)\s*(s|biji|pcs|pc|ekor|keping)\b/i)
  return m ? Number(m[1]) : null
}

/**
 * Turn one receipt line into stock. Returns [] for lines that aren't tracked
 * stock, and a line with `note` when it IS stock but the quantity couldn't be
 * worked out (shown on the Stock page for a human to fix).
 */
export function stockFromLine(l: ReceiptLine, extraAliases: Record<string, string[]> = {}): StockIn[] | { unknownQty: string; item: string } {
  // The owner said what this line is: nothing to read or guess.
  if (l.stock?.item) return stockFromChoice(l.stock, Number(l.line_total) || 0, l.name)
  const key = itemForName(l.name, extraAliases)
  if (!key) return []
  const total = Number(l.line_total) || 0
  const qty = Number(l.qty) > 0 ? Number(l.qty) : 1

  if (key === 'bird') {
    const kg = kgOf(l)
    if (!kg) return { unknownQty: l.name, item: 'bird' }
    const birds = kg / BIRD_KG
    const legs = birds * BIRD_YIELD.leg
    const breast = birds * BIRD_YIELD.breast
    // Split the bird's cost by weight: a leg quarter weighs about 300 g.
    const perKg = total > 0 ? total / kg : null
    return [
      { item: 'leg', qty: legs, unit_cost: perKg ? perKg * 0.3 : null, from: l.name,
        note: `${fmtNum(kg)} kg / ${BIRD_KG} kg a bird = ${birds.toFixed(1)} birds x ${BIRD_YIELD.leg} legs` },
      { item: 'breast', qty: breast, unit_cost: perKg ? perKg / 1000 : null, from: l.name,
        note: `${fmtNum(kg)} kg / ${BIRD_KG} kg a bird = ${birds.toFixed(1)} birds x ${BIRD_YIELD.breast} g breast` },
    ]
  }

  const def = ITEM[key]
  const usable = (def.usablePct ?? 100) / 100
  // The working, in the owner's words. A printed name like "B/BREAST 2KG" is the
  // PACK size, so "2 kg" on the line and 4 kg in the fridge both look right and
  // the number seems to come from nowhere. Every purchase now says how it got
  // there, and the Stock page prints it (owner, 23 Sep 2026).
  const trim = usable < 1 ? `, less ${Math.round((1 - usable) * 100)}% trimmed off` : ''
  let q: number | null = null
  let how = ''
  if (def.unit === 'g') {
    const kg = kgOf(l, def)
    q = kg ? kg * 1000 * usable : null
    if (kg) how = `${qty > 1 ? `${fmtNum(qty)} x ` : ''}${fmtNum(kg / (qty > 1 ? qty : 1))} kg = ${fmtNum(kg)} kg${trim}`
  } else if (def.unit === 'fish') {
    // Same rule as the pieces below: if the bill gives a WEIGHT, the weight
    // decides at 550 g a fish, and a count typed by hand is only shown
    // for comparison. The owner asked for this on udang, sotong and siakap
    // alike (24 Sep 2026).
    const kg = kgOf(l, def)
    if (kg) {
      q = kg / FISH_KG
      how = `${fmtNum(kg)} kg / ${FISH_KG * 1000} g a fish` +
        // ...but "the bill said 5.6" is nonsense when the 5.6 IS the weight.
        (!WEIGHT_UNIT.test(String(l.unit ?? '')) && qty > 1 && Math.abs(qty - q) > 0.5
          ? ` (the bill said ${fmtNum(qty)})` : '')
    } else {
      q = qty
      how = `${fmtNum(qty)} fish on the bill`
    }
  } else {
    const pack = packCount(l.name)
    const dozens = dozensOf(l)
    const trays = traysOf(l)
    if (key === 'egg') {
      // A count printed on the pack ("GRED A 30S") wins, then what the bill
      // calls it. With nothing to go on it is a TRAY: "in a restaurant we'll
      // always order a tray, so keep that as the default" (owner, 24 Sep 2026).
      // Only "pcs / biji / butir" means single eggs.
      const per = pack ?? (dozens > 1 ? 12 : looseEggs(l) ? 1 : EGGS_PER_TRAY)
      q = per * qty
      how = pack ? `${fmtNum(qty)} x ${pack} printed on the pack`
        : per === 12 ? `${fmtNum(qty)} dozen x 12`
        : per === 1 ? `${fmtNum(qty)} on the bill`
        : `${fmtNum(qty)} trays x ${EGGS_PER_TRAY}${trays > 1 ? '' : ' (eggs come by the tray)'}`
    }
    else {
      const kg = kgOf(l, def)
      // A count printed or typed on the line beats an estimate from the weight:
      // "2 kilo / 50 pieces" of shrimp is 50, not 2 kg x 38 a kg (owner, 24 Sep 2026).
      // WEIGHT BEATS A HAND-TYPED COUNT. Staff count by eye; the owner gave the
      // conversion and would rather it were used: "I remember telling you that
      // a kilo of shrimp is about 30-35 pieces, so you should know that
      // already" (24 Sep 2026). A count only decides when no weight was given,
      // and when both are there the note shows what the bill said.
      const counted = pack ? pack * (packIsTotal(l) ? 1 : qty) : null
      const byWeight = kg && def.perKg ? kg * def.perKg * usable : null
      if (byWeight !== null) {
        q = byWeight
        how = `${fmtNum(kg!)} kg at ${def.perKg} per kg${trim}` +
          (counted !== null && Math.abs(counted - byWeight) > 1 ? ` (the bill said ${fmtNum(counted)})` : '')
      }
      else if (counted !== null) { q = counted; how = `${fmtNum(counted)} on the bill` }
      // A COUNT IN THE LINE'S OWN UNIT COLUMN, when there is no weight at all.
      // "UDANG  30 PCS  66.00" is thirty prawns. Only `packCount` — a number
      // printed inside the NAME, like "30S" — used to count, so a bill that put
      // the count in its own column fell through to "didn't say how much" and
      // the staff were asked for a quantity that was printed on the paper.
      //
      // Still subordinate to weight, which is checked above: the owner's rule
      // that a kilo of shrimp is 30-35 pieces stands (owner, 5 Oct 2026).
      else if (COUNT_UNIT.test(String(l.unit ?? '')) && qty > 0) {
        q = qty; how = `${fmtNum(qty)} ${String(l.unit).toLowerCase()} on the bill`
      }
      else if (dozens > 1) { q = qty * 12; how = `${fmtNum(qty)} dozen x 12` }
      else if (kg && def.perKg) { q = kg * def.perKg * usable; how = `${fmtNum(kg)} kg at ${def.perKg} per kg${trim}` }
      else q = null
    }
  }
  if (!q || !Number.isFinite(q)) return { unknownQty: l.name, item: key }
  return [{ item: key, qty: q, unit_cost: total > 0 ? total / q : null, from: l.name, note: how || undefined }]
}
