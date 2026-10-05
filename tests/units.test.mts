// Units: the item's own unit comes first, and a bill is never rewritten.
//   npx -y tsx --conditions=react-server tests/units.test.mts
//
// The complaint: "the unit part only have g, kg, pkt. In my recipe I also use
// pieces — how many pieces of shrimp, or chicken leg. The unit should come from
// the recipe which ties down to stock."
//
// It was not a hardcoded list. packUnitsFor returned 'kg' FIRST for every piece
// item with a perKg, and unitsFor(item)[0] is the default — so pieces was
// always offered and never chosen.

import { entryUnitsFor, packUnitsFor, defaultEntryUnit, normaliseEntryUnit, receiptUnitOptions } from '../lib/units'
import { choiceFromLine } from '../lib/stock-items'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m)
    : (bad++, console.log(`FAIL ${m}\n       got    ${JSON.stringify(a)}\n       wanted ${JSON.stringify(b)}`))

// ---- the fix: the recipe's unit is the default ----------------------------
// recipes.ts: tomyum seafood is 3 shrimp, 3 mussel; hatyai is 1/3 of a leg.
for (const item of ['shrimp', 'shrimp_frozen', 'leg', 'feet', 'galah', 'crab', 'mussel', 'squid_frozen']) {
  eq(defaultEntryUnit(item), 'pcs', `${item} defaults to pieces, as the recipes count it`)
}
eq(defaultEntryUnit('siakap'), 'fish', 'a fish is counted in fish')
eq(defaultEntryUnit('breast'), 'kg', 'a weight item still defaults to kg')
eq(defaultEntryUnit('beef'), 'kg', 'and so does beef')
eq(defaultEntryUnit('egg'), 'tray', 'eggs arrive in trays')

// ---- every unit is still reachable ---------------------------------------
eq(entryUnitsFor('shrimp'), ['pcs', 'kg', 'g', 'pkt'], 'shrimp: pieces first, kg still there')
eq(entryUnitsFor('breast'), ['kg', 'g', 'bag', 'pkt'], 'breast gains bags — the kitchen bags it up')
eq(entryUnitsFor('siakap'), ['fish', 'kg', 'g', 'pkt'], 'siakap: fish first')
eq(entryUnitsFor('rice'), ['kg', 'g', 'pkt'], 'rice has no bags, so none is offered')

// "2 birds" was untypeable before — packUnitsFor('bird') returned only kg and g.
eq(entryUnitsFor('bird')[0], 'pcs', 'a whole bird is bought by the bird')

eq(packUnitsFor('shrimp').includes('pkt'), false, 'a packet cannot contain packets')
eq(entryUnitsFor('nonsense'), [], 'an item that does not exist offers nothing')

// ---- the legacy vocabulary is read, never offered -------------------------
eq(normaliseEntryUnit('pc'), 'pcs', "addMove's 'pc' is understood")
eq(normaliseEntryUnit('PCS'), 'pcs', 'and case does not matter')
eq(normaliseEntryUnit('ekor'), 'fish', 'Malay for a fish')
eq(normaliseEntryUnit('beg'), 'bag', 'and for a bag')
eq(normaliseEntryUnit('sack'), null, 'something genuinely unknown stays unknown')
eq(entryUnitsFor('shrimp').includes('pc' as any), false, "'pc' is never offered in a picker")

// ---- a bill is evidence: never rewritten, never made unsaveable -----------
{
  const opts = receiptUnitOptions('btl')
  eq(opts[0], { value: 'btl', label: 'btl — as printed' }, 'what the supplier printed stays, at the top')
  eq(opts.some(o => o.value === 'kg'), true, 'with the common units after it')
}
{
  const opts = receiptUnitOptions('kg')
  eq(opts[0].value, 'kg', 'a unit already in the list is not duplicated')
  eq(opts.filter(o => o.value === 'kg').length, 1, 'exactly once')
}
eq(receiptUnitOptions('unit')[0].value, 'kg', "the 'unit' sentinel is not shown back as a choice")
eq(receiptUnitOptions(null)[0].value, 'kg', 'a blank line just gets the list')

// ---- the one place pieces are NOT forced ---------------------------------
// "2 KG UDANG" must still read as 2 kg. Rendering 66 pcs would turn a reading
// into a guess and show it with the authority of the paper.
{
  const c = choiceFromLine({ name: 'UDANG', qty: 2, unit: 'kg', line_total: 66, base_qty: 2, base_unit: 'kg' } as any)
  eq(c?.unit, 'kg', 'a weight printed on the bill is kept as a weight')
  eq(c?.item, 'shrimp', 'and still maps to the right item')
}
{
  const c = choiceFromLine({ name: 'UDANG', qty: 30, unit: 'pcs', line_total: 66 } as any)
  eq(c?.unit, 'pcs', 'a count printed on the bill is kept as a count')
}
{
  const c = choiceFromLine({ name: 'UDANG', qty: 12, unit: 'ekor', line_total: 40 } as any)
  eq(c?.unit, 'pcs', 'and so is a count written in Malay')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
