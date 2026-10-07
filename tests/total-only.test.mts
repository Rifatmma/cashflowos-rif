import { parseTotalOnly, parseTypedReceipt } from '../lib/typed-receipt'
let bad = 0
const T = '2026-10-08'
const ok = (m: string) => console.log(`ok   ${m}`)
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m)
    : (bad++, console.log(`FAIL ${m}\n       got    ${JSON.stringify(a)}\n       wanted ${JSON.stringify(b)}`))

const p = (t: string) => { const r = parseTotalOnly(t, T); return r && r.ok ? { m: r.merchant, total: r.total, lines: r.lines.length } : null }

eq(p('Touch n Go RM 45'), { m: 'Touch n Go', total: 45, lines: 0 }, 'a payee and a ringgit figure is a bill')
eq(p('TNG RM 45.60'), { m: 'TNG', total: 45.6, lines: 0 }, 'cents too')
eq(p('Grab - RM 24.50'), { m: 'Grab', total: 24.5, lines: 0 }, 'a dash between them is fine')
eq(p('Supplier: Shell\nTotal: RM 80'), { m: 'Shell', total: 80, lines: 0 }, 'labelled, with no items')
eq(p('Total: RM 80'), { m: undefined, total: 80, lines: 0 }, 'a total with no shop still files')

// Must NOT swallow ordinary chat.
eq(p('the rice was 2 at 45.90'), null, 'a correction is not a bill')
eq(p('Kakak 40'), null, 'a bare name and number is too close to chat')
eq(p('45'), null, 'a lone number is not a bill')
eq(p('ok'), null, 'nothing is not a bill')
eq(p('/undo-12'), null, 'a command is not a bill')
eq(p('can you check how much we spent on udang last week RM 300'), null, 'a long sentence is not a bill')
eq(p('RM 45'), null, 'money with no payee is not a bill')

// The full template still wins where it applies.
const full = parseTypedReceipt('Item Name: Udang\nPrice: RM 54', T)
eq(full?.ok, true, 'a real template still parses as itemised')
eq(parseTotalOnly('Item Name: Udang\nTotal: RM 54', T), null, 'and is never treated as total-only')

// Real payees from his own books must still work.
eq(p('Technology Park Malaysia Flexi Parking RM 7.42'),
  { m: 'Technology Park Malaysia Flexi Parking', total: 7.42, lines: 0 }, 'a long real payee still files')
eq(p('IWK JomPAY RM 180'), { m: 'IWK JomPAY', total: 180, lines: 0 }, 'a JomPAY bill files')
eq(p('paid tukang 150'), { m: 'paid tukang', total: 150, lines: 0 }, 'a paying word carries a bill with no RM')
eq(p('how much did we pay Hijrah RM 60'), null, 'but a question about a payment is still a question')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
