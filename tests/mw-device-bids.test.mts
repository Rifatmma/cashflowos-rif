// Should the desktop bid be cut, and would cutting it do anything?
//   npx -y tsx --conditions=react-server tests/mw-device-bids.test.mts
//
// Written from the live account on 9 Oct 2026, the day the old rule sent the
// owner into Google Ads to make a change that would have done nothing:
//
//   T1-India-Geofence-KW     MAXIMIZE_CONVERSIONS
//     desktop  391 clicks  S$363.09   6 conv   -> S$60.52 a lead
//     mobile 12,020 clicks  S$960.91  24 conv  -> S$40.04 a lead
//   SEA - Market Venues      TARGET_SPEND
//     desktop  241 clicks  S$325.77   2 conv   -> S$162.89 a lead
//     mobile   356 clicks  S$369.50   0 conv   -> no lead at any price

import { desktopBidVerdict, type DeviceCriterion, type DevicePerf } from '../lib/mw-device-bids'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const crit = (n: string, strategy: string, mod: number | null = null): DeviceCriterion[] =>
  [{ n, dev: 'DESKTOP', mod, strategy }, { n, dev: 'MOBILE', mod: null, strategy }]
const perf = (n: string, d: [number, number, number], m: [number, number, number]): DevicePerf[] => [
  { n, dev: 'DESKTOP', clicks: d[0], cost: d[1], conv: d[2] },
  { n, dev: 'MOBILE', clicks: m[0], cost: m[1], conv: m[2] },
]

// ── the real account, both campaigns together ───────────────────────────────
{
  const v = desktopBidVerdict(
    [...crit('T1-India-Geofence-KW', 'MAXIMIZE_CONVERSIONS'), ...crit('SEA - Market Venues', 'TARGET_SPEND')],
    [...perf('T1-India-Geofence-KW', [391, 363.09, 6], [12020, 960.91, 24]),
     ...perf('SEA - Market Venues', [241, 325.77, 2], [356, 369.50, 0])],
  )
  is(v?.status === 'moot', 'on his real numbers the answer is: do not do this')
  is(/Smart Bidding/.test(v?.evidence ?? ''), 'and it says why — the live India campaign ignores device modifiers')
  is(/tCPA|−100%|-100%/.test(v?.mootWhy ?? ''), 'and names the levers that would actually work')
}

// ── the rule the old one got wrong ──────────────────────────────────────────
{
  // Same numbers, same gap, but a strategy that HONOURS device modifiers.
  const v = desktopBidVerdict(
    crit('Manual campaign', 'MANUAL_CPC'),
    perf('Manual campaign', [391, 363.09, 6], [12020, 960.91, 24]),
  )
  is(v?.status === 'not', 'where the lever works and desktop is dearer, it is a real task')
  is(/-34%|−34%/.test(v?.evidence ?? ''), 'and the size is the cut that levels cost per lead, not a guessed range')
  is(!/-60%/.test(v?.evidence ?? ''), 'so it does not repeat the old "−40% to −60%" either')
}
{
  // Desktop the only converter: cutting it would cut the only thing earning.
  const v = desktopBidVerdict(
    crit('SEA - Market Venues', 'TARGET_SPEND'),
    perf('SEA - Market Venues', [241, 325.77, 2], [356, 369.50, 0]),
  )
  is(v?.status === 'moot', 'desktop converting while mobile does not is never a reason to cut desktop')
}
{
  const v = desktopBidVerdict(
    crit('Fine campaign', 'MANUAL_CPC'),
    perf('Fine campaign', [300, 300, 10], [300, 300, 10]),
  )
  is(v?.status === 'moot', 'equal cost per lead is not a problem to fix')
  is(/not costing more/.test(v?.evidence ?? ''), 'and it says so plainly')
}
{
  // 10% dearer is inside the noise on samples this size.
  const v = desktopBidVerdict(
    crit('Close campaign', 'MANUAL_CPC'),
    perf('Close campaign', [300, 330, 10], [300, 300, 10]),
  )
  is(v?.status === 'moot', 'a 10% gap is not acted on')
}
{
  const v = desktopBidVerdict(
    crit('Already set', 'MANUAL_CPC', 0.6),
    perf('Already set', [391, 363.09, 6], [12020, 960.91, 24]),
  )
  is(v?.status === 'done', 'a campaign that already adjusts desktop reads as done')
  is(/-40%/.test(v?.evidence ?? ''), 'and reports the adjustment it found')
}
{
  is(desktopBidVerdict([], []) === null, 'no device criteria at all means nothing to say')
}
{
  // The cut is floored: a catastrophic ratio must not produce −95%.
  const v = desktopBidVerdict(
    crit('Terrible', 'MANUAL_CPC'),
    perf('Terrible', [100, 1000, 1], [100, 100, 10]),
  )
  is(/-60%/.test(v?.evidence ?? ''), 'and never recommends deeper than −60%')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
