// The owner's own "this line is X, this much" on the correction page. Run it:
//   npx -y tsx --conditions=react-server tests/stock-choice.test.mts
//
// Owner, 27 Sep 2026: pick chicken / beef / fresh / frozen shrimp, enter the
// quantity, pick the unit -- "not all of the stock are recorded as kg".
import { stockFromChoice, stockFromLine, unitsFor } from '../lib/stock-items'

let failed = 0
const check = (what: string, ok: boolean, got?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : `  -- got ${JSON.stringify(got)}`}`)
  if (!ok) failed++
}
const one = (r: ReturnType<typeof stockFromChoice>) => (Array.isArray(r) && r.length === 1 ? r[0] : null)

{
  // 2 packs of 2 kg chicken breast, RM 40.38 after promo (Sri Ternak #174).
  const r = one(stockFromChoice({ item: 'breast', qty: 4, unit: 'kg' }, 40.38, 'CHN FRZ CHICKEN B/BREAST 2KG'))
  check('4 kg chicken breast -> 3,840 g (4% trim)', r?.item === 'breast' && Math.round(r.qty) === 3840, r)
}
{
  const r = one(stockFromChoice({ item: 'beef', qty: 4080, unit: 'g' }, 89.76, 'BUFFALO'))
  check('4,080 g beef -> 3,264 g (20% trim)', r?.item === 'beef' && Math.round(r.qty) === 3264, r)
}
{
  const r = one(stockFromChoice({ item: 'shrimp', qty: 2, unit: 'kg' }, 54, 'Udang'))
  check('2 kg fresh shrimp -> 66 pieces', r?.item === 'shrimp' && Math.round(r.qty) === 66, r)
  const p = one(stockFromChoice({ item: 'shrimp_frozen', qty: 40, unit: 'pcs' }, 13.99, 'FRZ UDANG'))
  check('40 pieces frozen shrimp -> 40, as counted', p?.item === 'shrimp_frozen' && p.qty === 40, p)
}
{
  const r = one(stockFromChoice({ item: 'egg', qty: 3, unit: 'tray' }, 43.2, 'TELUR'))
  check('3 trays of eggs -> 90', r?.item === 'egg' && r.qty === 90 && Math.abs(r.unit_cost! - 0.48) < 1e-9, r)
}
{
  const r = one(stockFromChoice({ item: 'siakap', qty: 4, unit: 'fish' }, 68, 'Ikan siakap'))
  check('4 siakap counted -> 4 fish', r?.item === 'siakap' && r.qty === 4, r)
}
{
  const r = stockFromChoice({ item: 'bird', qty: 3.6, unit: 'kg' }, 36, 'AYAM')
  check('3.6 kg whole chicken -> legs + breast', Array.isArray(r) && r.length === 2 && r[0].item === 'leg' && Math.round(r[0].qty) === 4, r)
}
{
  check('not stock -> nothing', JSON.stringify(stockFromChoice({ item: 'none', qty: 0, unit: 'pcs' }, 43, 'MEE PRAWN')) === '[]')
  check('a unit that does not fit is refused', !Array.isArray(stockFromChoice({ item: 'beef', qty: 3, unit: 'tray' }, 10, 'x')))
  // Beef gained 'bag': it has a bagG, so the kitchen portions it into bags and
  // may now count it that way. The order is the item's own unit first, then the
  // finer one, then how it is stored, then packets (owner, 5 Oct 2026).
  check('beef is bought in kg, g, bags or packets', JSON.stringify(unitsFor('beef')) === JSON.stringify(['kg', 'g', 'bag', 'pkt']))
  check('a piece item offers pieces first', unitsFor('shrimp')[0] === 'pcs')
}
{
  // The saved choice beats reading the name: "PRAWN MEE" is not shrimp.
  const r = stockFromLine({ name: 'FRZ SHUDANG PRAWN 1KG', qty: 1, unit: 'pkt', line_total: 13.99, stock: { item: 'none', qty: 0, unit: 'pcs' } })
  check('a line marked not-stock adds nothing', Array.isArray(r) && r.length === 0, r)
}

{
  // Packets: 3 pkt of frozen shrimp, each 1 kg -> 3 kg -> 99 pieces.
  const r = one(stockFromChoice({ item: 'shrimp_frozen', qty: 3, unit: 'pkt', per: 1, perUnit: 'kg' }, 41.97, 'FRZ UDANG 1KG'))
  check('3 pkt x 1 kg frozen shrimp -> 99 pieces', r?.item === 'shrimp_frozen' && Math.round(r.qty) === 99 && /3 pkt x 1 kg = 3 kg/.test(r.note ?? ''), r)
  const b = one(stockFromChoice({ item: 'breast', qty: 2, unit: 'pkt', per: 2, perUnit: 'kg' }, 40.38, 'CHICKEN 2KG'))
  check('2 pkt x 2 kg chicken breast -> 3,840 g', b?.item === 'breast' && Math.round(b.qty) === 3840, b)
  const e = one(stockFromChoice({ item: 'egg', qty: 2, unit: 'pkt', per: 10, perUnit: 'pcs' }, 9, 'TELUR 10S'))
  check('2 pkt x 10 eggs -> 20', e?.item === 'egg' && e.qty === 20, e)
  check('a packet with nothing in it is refused', !Array.isArray(stockFromChoice({ item: 'beef', qty: 2, unit: 'pkt' }, 10, 'x')))
  check('every item can be bought in packets', unitsFor('beef').includes('pkt') && unitsFor('siakap').includes('pkt'))
}
if (failed) { console.log(`\n${failed} failed`); process.exit(1) }
console.log('\nall passed')
