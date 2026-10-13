// Is this the same bill, or just a similar one?
//   npx -y tsx --conditions=react-server tests/twin-receipt.test.mts
//
// Built from the three bills that exposed the old rule. TH Supermart issued
// checks 1457255, 1457256 and 1457257 on 11 Oct 2026, each RM 7.50 for the same
// cooking oil, within about ninety seconds. "Same shop, same money, same day"
// called the last two duplicates of the first. RM 15 never reached the books
// and both photos were stacked onto record #493.
//
// The other half matters as much: the rule exists because Yuu typed the gas
// bill and Tina photographed it ninety seconds later, and that MUST still be
// caught — a typed record has no receipt number to compare.

import { judgeTwin, findTwinAmong, shopKey, refKey } from '../lib/twin-receipt'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

// ── the bills that broke it ────────────────────────────────────────────────
const filed = { id: 493, merchant: 'TH SUPERMART', receipt_no: '1457255' }
{
  const v = judgeTwin({ merchant: 'TH SUPERMART', receipt_no: '1457256' }, filed)
  is(v.twin === false, 'check 1457256 is not a duplicate of 1457255')
  is(v.why === 'different-receipt-no', 'and the reason is the number, not the shop')
}
{
  const v = judgeTwin({ merchant: 'TH SUPERMART', receipt_no: '1457257' }, filed)
  is(v.twin === false, 'nor is 1457257 — three bills, three purchases')
}
{
  // What SHOULD be caught: the shop's own reprint, "* DUPLICATED *" on top.
  const v = judgeTwin({ merchant: 'TH SUPERMART', receipt_no: '1457255' }, filed)
  is(v.twin === true && v.why === 'same-receipt-no',
     'the same printed number IS a duplicate — that is a reprint of one transaction')
}
{
  // Numbers are compared on their digits, not their formatting.
  const v = judgeTwin({ merchant: 'TH SUPERMART', receipt_no: ' #1457255 ' }, filed)
  is(v.twin === true, 'and punctuation or spacing around the number does not hide it')
}

// ── the case the rule was written for, which must still work ──────────────
{
  // Yuu typed it: a typed record carries no receipt number.
  const typed = { id: 300, merchant: 'Gas Malaysia', receipt_no: null }
  const v = judgeTwin({ merchant: 'GAS MALAYSIA SDN BHD', receipt_no: 'INV-99' }, typed)
  is(v.twin === true && v.why === 'same-shop-same-money-same-day',
     'a photo matching a typed record is still caught — there is no number to compare')
}
{
  const v = judgeTwin({ merchant: 'Gas Malaysia', receipt_no: null }, { id: 300, merchant: 'Gas Malaysia', receipt_no: 'INV-99' })
  is(v.twin === true, 'and it works the other way round too')
}
{
  const v = judgeTwin({ merchant: 'Gas Malaysia', receipt_no: null }, { id: 300, merchant: 'Gas Malaysia', receipt_no: null })
  is(v.twin === true, 'neither side numbered falls back to the heuristic, as before')
}

// ── shop matching ─────────────────────────────────────────────────────────
{
  is(judgeTwin({ merchant: 'Sri Ternak' }, { id: 1, merchant: 'TH SUPERMART' }).twin === false,
     'a different shop is never a duplicate')
  is(judgeTwin({ merchant: 'GAS MALAYSIA SDN. BHD.' }, { id: 1, merchant: 'Gas Malaysia' }).twin === true,
     'the legal suffix is ignored, so one reading matches the other')
  is(judgeTwin({ merchant: 'TH' }, { id: 1, merchant: 'TH SUPERMART' }).why === 'no-merchant',
     'a name too short to be a name is refused rather than matched loosely')
  is(judgeTwin({ merchant: null }, { id: 1, merchant: 'x' }).twin === false, 'no merchant, no match')
}

// ── choosing among several ────────────────────────────────────────────────
{
  // The exact reprint must win over a page-one heuristic match, whatever order
  // the database returned them in.
  const hit = findTwinAmong({ merchant: 'TH SUPERMART', receipt_no: '1457255' }, [
    { id: 494, merchant: 'TH SUPERMART', receipt_no: null },
    { id: 493, merchant: 'TH SUPERMART', receipt_no: '1457255' },
  ])
  is(hit?.id === 493, 'the record with the matching printed number is chosen')
  is(hit?.why === 'same-receipt-no', 'and reported as certain rather than as a guess')
}
{
  const none = findTwinAmong({ merchant: 'TH SUPERMART', receipt_no: '1457256' }, [
    { id: 493, merchant: 'TH SUPERMART', receipt_no: '1457255' },
    { id: 492, merchant: 'TH SUPERMART', receipt_no: '1457254' },
  ])
  is(none === null, 'a new check number among several old ones is nobody\'s duplicate')
}
{
  is(findTwinAmong({ merchant: 'TH SUPERMART' }, []) === null, 'nothing filed yet is not a duplicate')
}

// ── the helpers ───────────────────────────────────────────────────────────
{
  is(shopKey('Gas Malaysia Sdn Bhd (12345-X)') === 'gas malaysia', 'the shop key drops the suffix and the registration')
  is(refKey('#1457256 ') === '1457256' && refKey(null) === '', 'the reference key is digits and letters only')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
