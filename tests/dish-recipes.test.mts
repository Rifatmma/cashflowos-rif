// The recipe book keyed to the POS.
//   npx -y tsx --conditions=react-server tests/dish-recipes.test.mts
//
// What these pin down, all of it measured on real days:
//   - a choice that doesn't move stock never splits a dish into two recipes;
//   - a choice nobody has ruled on is KEPT, because silently merging two
//     recipes that might differ is the failure the old book was full of;
//   - a Medium and a Small are separate recipes, full stop;
//   - a set resolves from its own choices, and "No dessert" is not a gap.

import {
  norm, stockParts, variationKey, useForLine, useForDay, worklist, coverage,
  type DishRecipe, type VariantGroup,
} from '../lib/dish-recipes'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m)
    : (bad++, console.log(`FAIL ${m}\n       got    ${JSON.stringify(a)}\n       wanted ${JSON.stringify(b)}`))
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const G = (label: string, affects: boolean | null, options: string[]): VariantGroup =>
  ({ key: label.toLowerCase().replace(/\W+/g, '-'), label, options, affects_stock: affects, seen: 0 })

const GROUPS: VariantGroup[] = [
  G('Sugar level', false, ['No Sugar Tanpa Gula', 'Less Sugar Kurang Gula', 'Normal Sugar Manis Biasa']),
  G('Drink Temperature', false, ['Iced Sejuk', 'Warm Suam', 'Hot Panas']),
  G('Drink Size', false, ['Glass', 'Jug']),
  G('Size Chicken', true, ['Small เล็ก', 'Medium ใหญ่']),
  G('Brand new group', null, ['Something', 'Else']),
]

const line = (name: string, variation: string, qty = 1, total = 0) =>
  ({ category: '', sub: '', name, variation, qty, price: 0, total })

// ── names ───────────────────────────────────────────────────────────────────
{
  eq(norm('Tomyum Chicken (ต้มยำไก่)'), 'tomyum chicken', 'Thai is dropped from a dish name')
  eq(norm('Siakap  Tiga   Rasa!'), 'siakap tiga rasa', 'punctuation and runs of spaces fold away')
  is(norm('Ikan Temenung 3 Rasa') !== norm('Siakap Tiga Rasa'),
    'temenung and siakap are NOT the same dish (the old book deducted siakap for both)')
}

// ── which parts of a variation count ────────────────────────────────────────
{
  const v = '(Iced Sejuk)(Normal Sugar Manis Biasa)(Glass)'
  eq(stockParts(v, GROUPS), [], 'ice, sugar and glass all drop out')
  eq(variationKey(stockParts(v, GROUPS)), '', 'so a Teh O is one recipe, not twelve')
}
{
  const a = variationKey(stockParts('(Small เล็ก)(Normal Sugar Manis Biasa)', GROUPS))
  const b = variationKey(stockParts('(Medium ใหญ่)(Normal Sugar Manis Biasa)', GROUPS))
  is(a !== b && a !== '' && b !== '',
    'a Small and a Medium stay separate recipes once sugar is stripped')
}
{
  eq(variationKey(stockParts('(Small เล็ก)(Chicken)', GROUPS)),
     variationKey(stockParts('(Chicken)(Small เล็ก)', GROUPS)),
     'the order the POS printed the choices in does not matter')
}
{
  const kept = stockParts('(Something)(Normal Sugar Manis Biasa)', GROUPS)
  eq(kept, ['Something'], 'a group nobody has decided on is KEPT, never silently dropped')
}

// ── one line, one recipe ────────────────────────────────────────────────────
const R = (dish: string, variation_key: string, lines: { ingredient: string; qty: number }[],
  kind: 'dish' | 'set_part' = 'dish'): DishRecipe => ({
  kind, dish, dish_label: dish, variation_key, variation_label: variation_key,
  lines: lines.map(l => ({ ...l, unit: 'g' })), sure: true,
})

const BOOK: DishRecipe[] = [
  R('chicken sweet sour', 'small', [{ ingredient: 'breast', qty: 80 }]),
  R('chicken sweet sour', 'medium', [{ ingredient: 'breast', qty: 160 }]),
  R('teh o', '', []),
  R('chicken cashew nuts', '', [{ ingredient: 'breast', qty: 120 }], 'set_part'),
  R('siakap 3 rasa', '', [{ ingredient: 'siakap', qty: 1 }], 'set_part'),
  R('3 plate rice', '', [{ ingredient: 'rice', qty: 330 }], 'set_part'),
]

{
  const s = useForLine(line('Chicken Sweet&Sour', '(Small เล็ก)'), BOOK, GROUPS)
  const m = useForLine(line('Chicken Sweet&Sour', '(Medium ใหญ่)'), BOOK, GROUPS)
  eq(s.each, { breast: 80 }, 'a Small takes 80 g')
  eq(m.each, { breast: 160 }, 'and a Medium takes 160 g, which the old book could not say')
}
{
  const r = useForLine(line('Green Curry', '(Beef เนื้อ)'), BOOK, GROUPS)
  eq(r.status, 'no-recipe', 'a dish with no recipe deducts NOTHING rather than guessing')
  eq(r.each, {}, 'and takes nothing off the shelf')
}

// ── sets ────────────────────────────────────────────────────────────────────
{
  const set = {
    ...line('Set 2-4 Pax',
      '(Siakap 3 Rasa)(Chicken Cashew Nuts)(3 plate rice)(No dessert)(No add on)', 2),
    sub: 'Set Menu',
  }
  const r = useForLine(set, BOOK, GROUPS)
  eq(r.each, { siakap: 1, breast: 120, rice: 330 }, 'a set is the sum of the choices on its line')
  eq(r.missing, [], '"No dessert" and "No add on" are answers, not gaps')
  eq(r.status, 'deducted', 'so the set counts as fully covered')
}
{
  const set = { ...line('Set 2 Pax', '(Chicken Cashew Nuts)(Kailan Ikan Masin)'), sub: 'Set Menu' }
  const r = useForLine(set, BOOK, GROUPS)
  eq(r.status, 'partial', 'a set missing one component is partial, not silently fine')
  eq(r.missing, ['Kailan Ikan Masin'], 'and it names the component that is missing')
}

// ── a whole day ─────────────────────────────────────────────────────────────
{
  const day = useForDay([
    line('Chicken Sweet&Sour', '(Small เล็ก)', 3),
    line('Chicken Sweet&Sour', '(Medium ใหญ่)', 2),
    line('Green Curry', '(Beef เนื้อ)', 5),
  ], BOOK, GROUPS)
  eq(day.total, { breast: 3 * 80 + 2 * 160 }, 'the day adds up each line times how many sold')
  eq(day.sold, 10, 'ten dishes sold')
  eq(day.covered, 5, 'five of them had a recipe')
  eq(day.noRecipe.map(n => n.name), ['Green Curry'], 'and the hole is named, with its quantity')
}

// ── the worklist ────────────────────────────────────────────────────────────
{
  const sold = [
    { line: line('Chicken Sweet&Sour', '(Small เล็ก)', 3, 33), day: '2026-10-05' },
    { line: line('Chicken Sweet&Sour', '(Small เล็ก)', 2, 22), day: '2026-10-04' },
    { line: line('Green Curry', '(Beef เนื้อ)', 9, 180), day: '2026-10-05' },
    { line: { ...line('Set 2 Pax', '(Chicken Cashew Nuts)(No dessert)', 4, 172), sub: 'Set Menu' }, day: '2026-10-05' },
  ]
  const rows = worklist(sold, BOOK, GROUPS)
  eq(rows[0].dish_label, 'Green Curry', 'the heaviest thing with no recipe comes first')
  is(rows.every(r => r.dish_label !== 'Set 2 Pax'),
    'a set is not a row of its own — its choices are what get typed in')
  is(rows.some(r => r.kind === 'set_part' && r.dish_label === 'Chicken Cashew Nuts'),
    'the set choice becomes a row')
  is(!rows.some(r => r.dish_label === 'No dessert'), 'and "No dessert" does not')
  const sweet = rows.find(r => r.dish_label === 'Chicken Sweet&Sour')!
  eq([sweet.sold, sweet.days], [5, 2], 'the same combination on two days is one row, counted across both')

  const c = coverage(rows)
  is(c.pct > 0 && c.pct < 100, 'coverage is measured in dishes sold, not rows filled in')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
