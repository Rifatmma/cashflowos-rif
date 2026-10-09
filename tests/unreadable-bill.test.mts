// A bill Jarvis cannot read is still filed.
//   npx -y tsx --conditions=react-server tests/unreadable-bill.test.mts
//
// Tina sent photos on 9 Oct 2026 and Jarvis asked her to type out the shop,
// date, item name, weight, quantity and price. The owner:
//
//   "Why is this still happening I thought it shouldn't matter if he can read
//    them or not. Save the photo file the bill and mark it as need to check
//    right? why is he still asking?"
//
// He is right. These pin what the receipt should then LOOK like, because a
// RM 0.00 row that does not announce itself is worse than the asking was.

import { problemOf } from '../lib/receipt-view'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const rec = (amount: number, meta: any) =>
  ({ id: 1, amount, created_at: new Date().toISOString(), due_date: null, meta } as any)

{
  const p = problemOf(rec(0, { amount_unread: true, needs_check: true, source: 'photo' }), true)
  is(p?.kind === 'unsure', 'a bill with no readable total is flagged, not hidden')
  is(/type what it came to/.test(p?.says ?? ''), 'and it says what to do about it')
  is(/RM 0\.00/.test(p?.detail ?? ''), 'and admits the figure is a placeholder')
}
{
  // Once he types the real figure the flag must go, or it nags forever.
  const p = problemOf(rec(84.5, { amount_unread: true, source: 'photo' }), true)
  is(p?.kind !== 'unsure' || !/type what it came to/.test(p?.says ?? ''),
    'typing the total clears it, even if the old flag is still on the row')
}
{
  // The unread flag outranks the others: an amount nobody set makes every
  // total below it wrong, so it is the thing to fix first.
  const p = problemOf(rec(0, { amount_unread: true, needs_check: true, needs_check_why: 'no shop name on it' }), true)
  is(/type what it came to/.test(p?.says ?? ''), 'the missing total is named before the missing shop')
}
{
  const p = problemOf(rec(0, { amount_unread: true, source: 'photo' }), false)
  is(p?.kind === 'no-photo', 'with no photo either, the missing proof still comes first')
}
{
  const p = problemOf(rec(61.3, { source: 'photo', expense_type: 'cogs_food' }), true)
  is(p === null, 'an ordinary readable receipt with a photo and a category has no problem at all')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
