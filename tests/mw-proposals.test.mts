// When does a "no" get asked again?
//   npx -y tsx --conditions=react-server tests/mw-proposals.test.mts
//
// This is the owner's own rule, and it cuts both ways:
//
//   "Ask why, but do propose again if this becomes relevant and my reasoning
//    is not correct. Don't always believe in my judgement — every decision
//    musts be a data driven decision and mine isn't always data driven."
//
// So the bar has to be high enough that he keeps reading the list. Re-raising
// on evidence he has already seen and rejected is nagging, and it costs every
// other suggestion, not just this one.

import { reopenReason, spendOf, clicksOf, bestPos } from '../lib/mw-proposals'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const ev = (cost: number, pos?: number) => ({
  paid: cost ? [{ term: 'billboard price', cost, clicks: 10, conv: 0 }] : [],
  organic: pos ? [{ term: 'billboard price', pos, vol: 100 }] : [],
})

// ── nothing has changed ─────────────────────────────────────────────────────
{
  is(reopenReason(ev(20), ev(20)) === null, 'the same evidence is never raised again')
  is(reopenReason(ev(20), ev(24)) === null, 'and a 20% drift is not news')
  is(reopenReason(ev(20), ev(10)) === null, 'spend falling is certainly not a reason to re-ask')
  is(reopenReason(ev(0), ev(0)) === null, 'no evidence either side, nothing to say')
}

// ── the data has overtaken the reason ───────────────────────────────────────
{
  const r = reopenReason(ev(20), ev(40))
  is(r !== null, 'spend doubling puts it back on the list')
  is(/S\$20\.00 to S\$40\.00/.test(r ?? ''), 'and says which figure moved, in money')
}
{
  const r = reopenReason(ev(20), ev(30))
  is(r !== null, 'exactly 1.5x is enough — the threshold is inclusive')
}
{
  const r = reopenReason(ev(0), ev(12))
  is(r !== null && /where it had none/.test(r), 'spend appearing where there was none is new information')
}
{
  const r = reopenReason(ev(0, 28), ev(0, 14))
  is(r !== null && /#28 to #14/.test(r), 'climbing 14 places makes the ranking worth defending, and it says so')
}
{
  is(reopenReason(ev(0, 28), ev(0, 25)) === null, 'drifting three places is noise, not a reason')
}
{
  const r = reopenReason(ev(0), ev(0, 15))
  is(r !== null && /did not rank at all/.test(r), 'newly ranking inside the top 20 counts')
  is(reopenReason(ev(0), ev(0, 60)) === null, 'but newly ranking at #60 does not')
}

// ── reading the evidence ────────────────────────────────────────────────────
{
  const e = { paid: [{ cost: 10, clicks: 5, conv: 1 }, { cost: 2.5, clicks: 3, conv: 0 }], organic: [{ pos: 14 }, { pos: 8 }] }
  is(spendOf(e) === 12.5, 'spend adds up across the terms behind a change')
  is(clicksOf(e) === 8, 'so do the clicks')
  is(bestPos(e) === 8, 'and the best position is the one with most to lose')
  is(bestPos({ organic: [] }) === null, 'no organic evidence reads as null, not zero')
  is(bestPos({ organic: [{ pos: 0 }] }) === null, 'an unranked term is not a position of 0')
  is(spendOf({}) === 0 && clicksOf(undefined) === 0, 'missing evidence is zero, not a crash')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
