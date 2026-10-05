// The auction report, against the real September numbers pulled from Google
// on 5 Oct 2026. No network.
//   npx -y tsx --conditions=react-server tests/mw-auction.test.mts
//
// The whole point is that two campaigns missing the same share of auctions
// need OPPOSITE advice: India is capped on money, PMAX is losing on rank.
// Telling the owner to raise PMAX's budget would spend more to lose more.

import { auctionReport, judge, summarise, type ShareRow } from '../lib/mw-auction'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m)
    : (bad++, console.log(`FAIL ${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`))
const has = (hay: string, needle: string, m: string) =>
  hay.includes(needle) ? ok(m) : (bad++, console.log(`FAIL ${m} — "${needle}" not in "${hay}"`))

const row = (o: Partial<ShareRow>): ShareRow => ({
  name: 'x', impressions: 1000, clicks: 10,
  is: null, lostBudget: null, lostRank: null, top: null, absTop: null, exact: null, ...o,
})

// Verbatim from the API, September 2026.
const india = row({
  name: 'T1-India-Geofence-KW', impressions: 155064, clicks: 5973,
  is: 0.39027248754761207, lostBudget: 0.5165543510108409, lostRank: 0.09317316144154703,
  top: 0.32420363203334324, absTop: 0.20571598690086335, exact: 0.4245709123757904,
})
const pmax = row({
  name: 'F1-PMAX', impressions: 187395, clicks: 6644,
  is: 0.14686998394863562, lostBudget: 0.08025682182985554, lostRank: 0.7728731942215088,
  exact: 0.14686998394863562,
})
const sea = row({
  name: 'SEA - Market Venues Types + Locations', impressions: 3712, clicks: 304,
  is: 0.3866291968643692, lostBudget: 0.17600946605531725, lostRank: 0.43736133708031355,
  top: 0.2875942629010794, absTop: 0.152151412095224, exact: 0.4289719626168224,
})

// ---- the two causes, told apart ------------------------------------------
eq(judge(india).cause, 'budget', 'India at 52% budget-lost is a money problem')
has(judge(india).action, 'daily cap', 'and the advice is about the cap')

eq(judge(pmax).cause, 'rank', 'PMAX at 77% rank-lost is a rank problem')
has(judge(pmax).action, 'More budget will not help', 'and the advice refuses more budget')

eq(judge(sea).cause, 'rank', 'SEA loses more to rank than budget, so rank wins the verdict')

// ---- ordering: worst first -----------------------------------------------
const report = auctionReport([india, pmax, sea])
eq(report[0].row.name, 'F1-PMAX', 'the worst offender is listed first')

// ---- a campaign that is fine is left alone -------------------------------
const good = judge(row({ name: 'Brand', impressions: 5000, is: 0.92, lostBudget: 0.03, lostRank: 0.05 }))
eq(good.cause, 'winning', 'a campaign at 92% share is winning')
has(good.action, 'Nothing to fix', 'and is told to be left alone')

// ---- no data is not zero data --------------------------------------------
const quiet = judge(row({ name: 'Display', impressions: 900, is: null }))
eq(quiet.cause, 'unknown', 'a campaign with no reported share is unknown, not failing')
eq(quiet.upside, 0, 'and claims no upside')

// ---- the summary is weighted by impressions ------------------------------
const s = summarise([india, pmax, sea])
eq(s.impressionShare, 25.8, 'blended share is weighted by impressions, not a flat average')
has(s.headline, 'losing on rank', 'and the headline names rank as the bigger loss')

// A flat average of the three shares would be 31.5% -- materially rosier than
// the 25.8% the impressions actually say, because PMAX is the biggest campaign
// and the worst performer.
const flat = Math.round(((0.39027248754761207 + 0.14686998394863562 + 0.3866291968643692) / 3) * 1000) / 10
eq(flat > s.impressionShare, true, 'a flat average would have flattered it')

// ---- an empty account says so --------------------------------------------
eq(summarise([]).impressionShare, null, 'no campaigns means no share, not zero')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
