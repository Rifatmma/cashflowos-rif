// How a correction re-types receipt lines. Run it:
//   npx -y tsx --conditions=react-server tests/receipt-lines.test.mts
//
// The case that started it: Balaji record #156 (27 Sep 2026). The tom yam tin
// was read as drinks; the owner said "line 3 should be food". The old tool
// wiped every line's type, kept the drinks split, and Jarvis reported a split
// that was never saved.
import { applyLineFix, describeLines, describeSplit, keepLineMoney, parseLineEdits } from '../lib/receipt-lines'

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

// ---- #175: 60 eggs read, 90 bought, RM 43.20 printed and right ----
const eggs60 = [{ name: 'USIK GL DELI TELUR SEGAR KM', qty: 60, unit: 'pcs', unit_price: 0.72, line_total: 43.2 }]
{
  const r = keepLineMoney([{ name: 'USIK GL DELI TELUR SEGAR KM', qty: 90, unit: 'pcs', unit_price: 0.72, line_total: 64.8 }], eggs60, 43.2)
  check('quantity fix keeps the line money', r[0].line_total === 43.2 && r[0].unit_price === 0.48, r)
}
{
  // A genuine price change that adds up is left alone.
  const r = keepLineMoney([{ name: 'X', qty: 2, unit: 'pcs', unit_price: 5, line_total: 10 }], [{ name: 'X', qty: 1, unit_price: 5, line_total: 5 }], 10)
  check('a correction that adds up is untouched', r[0].line_total === 10 && r[0].unit_price === 5, r)
}
{
  const e = parseLineEdits('Line 1 should be 90 pieces of eggs\n\nTotal: rm 43.2')
  check('reads "Line 1 should be 90 pieces"', JSON.stringify(e) === JSON.stringify([{ line: 1, qty: 90, unit: 'pcs' }]), e)
  const g = parseLineEdits('Line 1 udang galah 1 kg price rm 41\nLine 2 udang 2 kg price rm 54')
  check('reads a line with its money', JSON.stringify(g) === JSON.stringify([{ line: 1, qty: 1, unit: 'kg', line_total: 41 }, { line: 2, qty: 2, unit: 'kg', line_total: 54 }]), g)
  check('ignores a reply with no line fix', parseLineEdits('Shop: pasar borong\nTotal: RM 95').length === 0)
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1) }
console.log('\nall passed')
