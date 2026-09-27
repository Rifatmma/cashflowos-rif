// How a correction re-types receipt lines. Run it:
//   npx -y tsx --conditions=react-server tests/receipt-lines.test.mts
//
// The case that started it: Balaji record #156 (27 Sep 2026). The tom yam tin
// was read as drinks; the owner said "line 3 should be food". The old tool
// wiped every line's type, kept the drinks split, and Jarvis reported a split
// that was never saved.
import { applyLineFix, describeLines, describeSplit } from '../lib/receipt-lines'

let failed = 0
const check = (what: string, ok: boolean, got?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : `  -- got ${JSON.stringify(got)}`}`)
  if (!ok) failed++
}

const balaji = [
  { name: 'PLASTIC CAWAN EC A16 (MURA) VIILET', qty: 1, unit: 'pkt', unit_price: 11.5, line_total: 11.5, expense_type: 'cogs_packaging' as const },
  { name: 'NFC LYCHEE IN SYRUP 565GM', qty: 1, unit: 'tin', unit_price: 5.8, line_total: 5.8, expense_type: 'cogs_beverage' as const },
  { name: 'THAI OMYAM 3KG TIN', qty: 1, unit: 'tin', unit_price: 39.9, line_total: 39.9, expense_type: 'cogs_beverage' as const },
]

{
  const r = applyLineFix({ prevItems: balaji, lineTypes: [{ line: 3, expense_type: 'cogs_food' }], amount: 57.2 })
  check('line 3 alone becomes food', r.ok && r.items[2].expense_type === 'cogs_food', r)
  check('lines 1 and 2 keep their types', r.ok && r.items[0].expense_type === 'cogs_packaging' && r.items[1].expense_type === 'cogs_beverage', r)
  check('split is rebuilt from the lines', r.ok && JSON.stringify(r.type_split) === JSON.stringify({ cogs_packaging: 11.5, cogs_beverage: 5.8, cogs_food: 39.9 }), r.ok && r.type_split)
  check('headline type is the biggest share', r.ok && r.expense_type === 'cogs_food', r.ok && r.expense_type)
  check('card says what each line is filed as', r.ok && describeLines(r.items)[2] === 'Line 3 · THAI OMYAM 3KG TIN — RM 39.90 · filed as food', r.ok && describeLines(r.items))
  check('split reads in owner words', r.ok && describeSplit(r.type_split) === 'food RM 39.90 · packaging RM 11.50 · drinks RM 5.80', r.ok && describeSplit(r.type_split))
}

{
  // Retyping the lines without types must not wipe what they were filed as.
  const typed = balaji.map(({ expense_type, ...rest }) => rest)
  const r = applyLineFix({ prevItems: balaji, items: typed, amount: 57.2 })
  check('retyped lines keep their old types', r.ok && r.items.every((i, n) => i.expense_type === balaji[n].expense_type), r)
}

{
  const r = applyLineFix({ prevItems: balaji, wholeType: 'cogs_food', amount: 57.2 })
  check('whole-receipt type sets every line, no stale split', r.ok && r.items.every(i => i.expense_type === 'cogs_food') && !r.type_split && r.expense_type === 'cogs_food', r)
}

{
  const r = applyLineFix({ prevItems: balaji, lineTypes: [{ line: 4, expense_type: 'cogs_food' }], amount: 57.2 })
  check('a line that does not exist is refused', !r.ok, r)
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1) }
console.log('\nall passed')
