// How a typed bill turns into stock. Run it:
//   npx -y tsx --conditions=react-server tests/typed-receipt.test.mts
//
// Two bills in two days were read wrong, both by multiplying a weight that was
// already the total ("Weight: 4 kilo / Quantity: 8 ekor" became 32 kg of fish;
// "Weight: 2 kilo / Quantity: 50 pieces" became 100 kg of shrimp). These are
// those bills, plus the ones that MUST keep multiplying.
import { parseTypedReceipt } from '../lib/typed-receipt'
import { stockFromLine } from '../lib/stock-items'

type Case = { what: string; text: string; totalKg?: number; perKg?: number; stock?: [string, number] }

const CASES: Case[] = [
  {
    what: 'shrimp: 50 pieces weighing 2 kg between them',
    text: 'Item Name: Udang \nWeight: 2 kilo \nQuantity: 50 pieces \nPrice: RM 54',
    totalKg: 2, perKg: 27, stock: ['shrimp', 50],
  },
  {
    what: 'siakap: 8 fish weighing 4 kg between them',
    text: 'Item Name: Ikan siakap \nWeight: 4 kilo \nQuantity: 8 ekor \nPrice: RM 68',
    totalKg: 4, perKg: 17, stock: ['siakap', 8],
  },
  {
    what: 'oil: 3 separate 1 kg packs, so it still multiplies',
    text: 'Item Name: Minyak masak\nWeight: 1 kg\nQuantity: 3\nPrice: RM 7.50',
    totalKg: 3, perKg: 2.5,
  },
  {
    what: 'breast: 2 bags of 2 kg, so it still multiplies',
    text: 'Item Name: Chicken breast\nWeight: 2 kg\nQuantity: 2\nPrice: RM 48',
    totalKg: 4, perKg: 12, stock: ['breast', 3840],   // 4 kg less 4% trimming
  },
  {
    what: 'eggs: 2 trays of 30',
    text: 'Item Name: Telur\nWeight: 30 pcs\nQuantity: 2\nPrice: RM 27',
    stock: ['egg', 60],
  },
]

let bad = 0
const near = (a: number, b: number) => Math.abs(a - b) < 0.01

for (const c of CASES) {
  const t = parseTypedReceipt(c.text, '2026-09-24')
  if (!t?.ok) { console.log(`FAIL ${c.what}: did not parse`); bad++; continue }
  const l = t.lines[0]
  const totalKg = (l.pack_size ?? 0) * l.qty
  const problems: string[] = []
  if (c.totalKg !== undefined && !near(totalKg, c.totalKg)) problems.push(`weight ${totalKg} kg, wanted ${c.totalKg}`)
  if (c.perKg !== undefined && !near(l.line_total / totalKg, c.perKg)) problems.push(`RM ${(l.line_total / totalKg).toFixed(2)}/kg, wanted ${c.perKg}`)
  if (c.stock) {
    const got = stockFromLine({ ...l, base_qty: totalKg || undefined, base_unit: l.pack_unit } as any)
    const hit = Array.isArray(got) ? got.find(g => g.item === c.stock![0]) : null
    if (!hit) problems.push(`no ${c.stock[0]} in stock`)
    else if (!near(hit.qty, c.stock[1])) problems.push(`${c.stock[0]} ${Math.round(hit.qty)}, wanted ${c.stock[1]}`)
  }
  if (problems.length) { console.log(`FAIL ${c.what}: ${problems.join(' · ')}`); bad++ }
  else console.log(`ok   ${c.what}`)
}
if (bad) process.exitCode = 1

// ---------------------------------------------------------------------------
// Receipt lines, not typed bills: a dozen is twelve (owner, 24 Sep 2026).
// Owner, 24 Sep 2026: "in a restaurant we'll always order a tray, so keep that
// as the default for the egg". Only a printed count, the word dozen, or pieces
// said out loud override it.
const EGGS: [string, any, number][] = [
  ['5 papan (the Chop Chang Jiang bill)', { name: 'C Eggs (Brown)', qty: 5, unit: 'papan', line_total: 69 }, 150],
  ['5 with no unit at all', { name: 'C Eggs (Brown)', qty: 5, unit: 'unit', line_total: 69 }, 150],
  ['2 trays of 30 printed on the pack', { name: 'TELUR GRED A 30S', qty: 2, unit: 'tray', line_total: 27 }, 60],
  ['3 dzn', { name: 'Telur ayam', qty: 3, unit: 'dzn', line_total: 42 }, 36],
  ['10 loose', { name: 'Eggs', qty: 10, unit: 'pcs', line_total: 6 }, 10],
]
for (const [what, line, want] of EGGS) {
  const got = stockFromLine(line)
  const n = Array.isArray(got) ? (got[0]?.qty ?? 0) : 0
  if (Math.abs(n - want) > 0.01) { console.log(`FAIL eggs, ${what}: ${n}, wanted ${want}`); process.exitCode = 1 }
  else console.log(`ok   eggs, ${what} -> ${want}`)
}
