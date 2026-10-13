// The insight panel tells a market lead what kind of market they are in,
// before showing them forty things to write. It is computed, so the thing it
// must never do is assert something the data does not say.
//
// Built from the real rows: the United States reads as a product market, and
// Malaysia as a location one, from their own Search Console data.
import {
  marketKinds, verdictOf, landings, bands, flags, languages, languageOf,
  moneyLine, trend, placeTest, kindOf, type InsightKeyword,
} from '../lib/mw-market-insight'
import { COUNTRIES } from '../lib/mw-markets'

let bad = 0
const ok = (m: string) => console.log('ok  ', m)
const fail = (m: string) => { bad++; console.log('FAIL', m) }

const us = COUNTRIES.find(c => c.country.key === 'united-states')!.country
const my = COUNTRIES.find(c => c.country.key === 'malaysia')!.country

const k = (q: string, pos: number, impr: number, url = '/blog/x', clicks = 0): InsightKeyword =>
  ({ q, pos, impr, url, clicks })

// ── what kind of market ────────────────────────────────────────────────────
// Real US rows: product language on blog posts, almost nothing about a place.
const usRows = [
  k('programmatic dooh explained', 18, 13153),
  k('dooh ssp', 45, 102),
  k('best ooh audience measurement tool', 22, 102),
  k('billboard advertising new york', 30, 60, '/locations/americas'),
]
const usSplit = marketKinds(usRows, us)
if (usSplit[0].kind !== 'product') fail(`the US reads as a product market (got ${usSplit[0].kind})`)
else ok(`the US reads as a product market, ${Math.round(usSplit[0].share * 100)}% of impressions`)
if (verdictOf(usSplit, us).headline !== 'United States is a product and measurement market') fail('verdict names it')
else ok(`verdict: "${verdictOf(usSplit, us).headline}"`)

// Real Malaysian rows: places and the trade.
const myRows = [
  k('billboard advertising kuala lumpur', 13, 300, '/locations/malaysia'),
  k('billboard near me', 9, 260, '/locations/malaysia'),
  k('federal highway billboard', 11, 200, '/locations/malaysia'),
  k('dooh ssp', 40, 10),
]
const mySplit = marketKinds(myRows, my)
if (mySplit[0].kind !== 'place') fail(`Malaysia reads as a location market (got ${mySplit[0].kind})`)
else ok('Malaysia reads as a location market from the same code')

// Weighted by impressions, not by how many phrases exist — one search shown
// 13,000 times matters more than forty shown once.
const weighted = marketKinds([k('dooh platform', 5, 10000), k('billboard kuala lumpur', 5, 1), k('billboard near me', 5, 1)], my)
if (weighted[0].kind !== 'product') fail('impressions decide, not the number of phrases')
else ok('one search shown 10,000 times outweighs two shown once')

// Brand is excluded: our own name is not a market signal.
const withBrand = marketKinds([...usRows, k('moving walls', 1, 99999)], us)
if (withBrand.reduce((t, s) => t + s.impressions, 0) !== usSplit.reduce((t, s) => t + s.impressions, 0)) {
  fail('brand must not count toward what a market asks for')
} else ok('brand searches are excluded entirely')

if (kindOf('billboard advertising', placeTest(my)) !== 'trade') fail('industry language with no place is trade')
else ok('"billboard advertising" is trade, neither place nor product')

// ── where it lands ─────────────────────────────────────────────────────────
const land = landings(usRows)
if (land[0].section !== 'Blog') fail('the biggest landing section comes first')
else ok(`demand lands mostly on ${land[0].section} (${Math.round(land[0].share * 100)}%)`)

// ── bands ──────────────────────────────────────────────────────────────────
const bs = bands([k('a', 3, 100), k('b', 15, 200), k('c', 25, 50), k('d', 90, 10)])
if (bs.map(b => b.queries).join(',') !== '1,1,1,1') fail('each position lands in exactly one band')
else ok('positions band without overlap or gaps')
if (bs[0].impressions !== 100) fail('page one holds the #3')
else ok('page one holds #3, page two holds #15')

// ── language ───────────────────────────────────────────────────────────────
if (languageOf('ooh 種類') !== 'Chinese') fail('Chinese script is detected')
else ok('"ooh 種類" reads as Chinese — the real Hong Kong search')
if (languageOf('harga sewa billboard') !== 'Malay or Indonesian') fail('Bahasa is detected')
else ok('"harga sewa billboard" reads as Malay or Indonesian — the one we pay for')
if (languageOf('publicidad exterior') !== 'Spanish') fail('Spanish is detected')
else ok('"publicidad exterior" reads as Spanish')
if (languageOf('billboard advertising malaysia') !== 'English') fail('plain English is English')
else ok('"billboard advertising malaysia" stays English')
// Words shared across languages must not mark English as foreign.
for (const q of ['digital media planning', 'outdoor media company', 'programmatic advertising']) {
  if (languageOf(q) !== 'English') fail(`"${q}" is English`)
}
ok('shared words like "media" and "digital" do not make English look foreign')

const langs = languages([k('billboard advertising', 10, 900), k('harga sewa billboard', 40, 100)])
if (langs[0].language !== 'English' || Math.round(langs[1].share * 100) !== 10) fail('language shares are by impressions')
else ok('language split is 90% English, 10% Bahasa — by impressions, not phrase count')

// ── money ──────────────────────────────────────────────────────────────────
const noLeads = moneyLine({ sessions: 186, leads: 0, prevSessions: 172, prevLeads: 0 }, us)
if (!/no enquiries/.test(noLeads) || !/up from 172/.test(noLeads)) fail(`traffic with no enquiries says so (got "${noLeads}")`)
else ok(`"${noLeads}"`)
if (!/no sessions/.test(moneyLine({ sessions: 0, leads: 0, prevSessions: null, prevLeads: null }, us))) fail('no sessions says so')
else ok('a market with no analytics says so rather than showing zeroes')

// ── trend ──────────────────────────────────────────────────────────────────
const one = trend([{ cycle: '2026-10', impressions: 9092, sessions: null, leads: null }], 'impressions')
if (one.enough) fail('one point is not a line')
else ok('a single cycle refuses to draw a line')
const two = trend([
  { cycle: '2026-09', impressions: null, sessions: 779, leads: 13 },
  { cycle: '2026-10', impressions: 9092, sessions: 1024, leads: 13 },
], 'sessions')
if (!two.enough || two.points[0].value !== 779) fail('two points draw, oldest first')
else ok('two cycles draw a line, oldest first: 779 → 1,024')

// ── flags ──────────────────────────────────────────────────────────────────
const f = flags({
  country: us, keywords: usRows, splits: usSplit, landing: land,
  pages: ['/locations/americas'], gap: null,
})
if (!f.some(x => /no \/locations\/united-states page/.test(x.says))) fail('a missing country page is flagged')
else ok('the missing /locations/united-states page is flagged')
if (!f.some(x => /adtech/.test(x.says))) fail('a product market says to compare against adtech')
else ok('a product market says to compare against adtech, not billboard owners')

// A market WITH its page must not be told it is missing.
const f2 = flags({
  country: my, keywords: myRows, splits: mySplit, landing: landings(myRows),
  pages: ['/locations/malaysia'], gap: null,
})
if (f2.some(x => /no \/locations\/malaysia page/.test(x.says))) fail('a market with a page is not flagged for missing one')
else ok('a market that has its page is not told otherwise')

console.log(bad ? `\n${bad} failing` : '\nall good — every claim on the panel traces to the rows behind it')
if (bad) process.exit(1)
