// The one thing this module must never do is let an impression be read as a
// search. Semrush's `vol` is an estimate of how often a phrase is typed
// anywhere; Search Console's `impr` is a count of how often we were shown.
// Every test here is really the same test asked a different way.
import { groupByCountry, mergeKeywords, sizeOf, sizeShort, demandOf, weightOf, type GscTriple } from '../lib/mw-gsc-market'
import type { PlanKeyword } from '../lib/mw-plan'

let bad = 0
const ok = (m: string) => console.log('ok  ', m)
const fail = (m: string) => { bad++; console.log('FAIL', m) }

const t = (query: string, country: string, impressions: number, position: number, page = 'https://www.movingwalls.com/locations/australia', clicks = 0): GscTriple =>
  ({ query, page, country, clicks, impressions, position })

// ── grouping ───────────────────────────────────────────────────────────────
// Real rows: Australia's three biggest non-brand searches, none of which
// Semrush knows about.
const au = groupByCountry([
  t('billboard advertising sydney', 'aus', 605, 19),
  t('billboard advertising melbourne', 'aus', 412, 28),
  t('outdoor advertising australia', 'aus', 377, 14),
])
if (au.length !== 1 || au[0].country.key !== 'australia') fail('aus maps to the Australia country')
else ok('aus maps to Australia, owned by ANZ')

if (au[0].impressions !== 1394) fail('impressions sum across the market')
else ok('market impressions sum to 1,394')

if (au[0].keywords.some(k => k.vol !== 0)) fail('a Search Console row must never carry a volume')
else ok('every Search Console row has vol 0 — impressions are not written into it')

if (au[0].keywords[0].q !== 'billboard advertising sydney') fail('keywords sort by impressions')
else ok('keywords come back biggest-impressions first')

// A country nobody owns is dropped, not invented into a market.
if (groupByCountry([t('billboards', 'zwe', 100, 5)]).length !== 0) fail('an unowned country is dropped')
else ok('a country with no market is dropped rather than guessed at')

// The same query on two pages is cannibalisation, not a duplicate to collapse.
const two = groupByCountry([
  t('ooh advertising jakarta', 'idn', 63, 18, 'https://www.movingwalls.com/locations/indonesia'),
  t('ooh advertising jakarta', 'idn', 20, 31, 'https://www.movingwalls.com/locations/indonesia/jakarta'),
])
if (two[0]?.keywords.length !== 2) fail('the same query on two pages survives as two rows')
else ok('one query on two pages stays two rows — that is the finding, not a duplicate')

// The same pair twice (a split date range) adds up and keeps the better rank.
const dup = groupByCountry([
  t('ooh indonesia', 'idn', 20, 15),
  t('ooh indonesia', 'idn', 14, 11),
])
const d = dup[0].keywords[0]
if (d.impr !== 34 || d.pos !== 11) fail(`a repeated pair sums impressions and keeps the best position (got ${d.impr}, #${d.pos})`)
else ok('a repeated pair sums to 34 impressions at #11 — no averaged position nobody held')

// ── merging ────────────────────────────────────────────────────────────────
const sem: PlanKeyword[] = [
  { q: 'billboard advertising', pos: 29, vol: 720, visits: 1, kd: 44, url: '/locations/australia' },
  { q: 'sydney billboard', pos: 14, vol: 70, visits: 0, kd: 31, url: '/locations/australia' },
]
const con: PlanKeyword[] = [
  { q: 'billboard advertising', pos: 22, vol: 0, visits: 4, impr: 318, clicks: 4, url: '/locations/australia', src: 'gsc' },
  { q: 'billboard advertising sydney', pos: 19, vol: 0, visits: 0, impr: 605, clicks: 0, url: '/locations/australia', src: 'gsc' },
]
const merged = mergeKeywords(sem, con)

if (merged.length !== 3) fail(`three distinct searches survive the merge (got ${merged.length})`)
else ok('two sources, one overlap, three rows out')

const both = merged.find(k => k.q === 'billboard advertising')!
if (both.src !== 'both') fail('a row both sources saw is marked both')
else ok('a row both sources saw is marked "both" — the strongest evidence there is')
if (both.vol !== 720) fail('Semrush keeps the volume')
else ok('volume stays Semrush’s 720')
if (both.impr !== 318) fail('Search Console keeps the impressions')
else ok('impressions stay Search Console’s 318')
if (both.pos !== 22) fail('the measured position wins over the modelled one')
else ok('position is Search Console’s #22, not Semrush’s #29 — counted beats modelled')
if (both.visits !== 4) fail('counted clicks beat an estimate of traffic')
else ok('visits are the 4 counted clicks, not the estimate')
if (both.kd !== 44) fail('difficulty survives — only Semrush has it')
else ok('keyword difficulty survives; Search Console has no opinion on it')

const semOnly = merged.find(k => k.q === 'sydney billboard')!
if (semOnly.impr !== undefined) fail('a Semrush-only row must not invent impressions')
else ok('a row Search Console never saw has no impressions — not zero-as-fact, absent')

// ── the sentences ──────────────────────────────────────────────────────────
if (sizeOf({ q: 'x', pos: 1, vol: 720, visits: 0 }) !== '720 searches a month') fail('volume reads as searches')
else ok('a Semrush row reads "720 searches a month"')

if (sizeOf({ q: 'x', pos: 1, vol: 0, visits: 0, impr: 605 }) !== '605 impressions a month') fail('impressions read as impressions')
else ok('a Search Console row reads "605 impressions a month" — never "605 searches"')

if (sizeOf({ q: 'x', pos: 1, vol: 0, visits: 0 }) !== 'no volume recorded') fail('nothing known says so')
else ok('a row with neither says "no volume recorded" rather than "0 searches"')

if (sizeShort({ q: 'x', pos: 1, vol: 0, visits: 0, impr: 605 }) !== '605 impr') fail('the short form keeps its units too')
else ok('the short form is "605 impr", not "605/mo"')

// The sum of an estimate and a count is not a quantity of anything.
const mixed = demandOf([{ volume: 720 }, { volume: 0, impr: 605 }])
if (!mixed.includes('605 impressions') || !mixed.includes('720 searches')) fail(`a mixed set names both units (got "${mixed}")`)
else ok('a mixed set says both figures separately instead of adding 720 to 605')

if (demandOf([{ volume: 0, impr: 605 }, { volume: 0, impr: 412 }]) !== '1,017 impressions a month') fail('an all-GSC set sums impressions')
else ok('an all-Search-Console market reads "1,017 impressions a month"')

if (weightOf({ q: 'x', pos: 1, vol: 70, visits: 0, impr: 605 }) !== 605) fail('the counted figure is the one weighed')
else ok('weighing prefers the counted 605 over the modelled 70')

console.log(bad ? `\n${bad} failing` : '\nall good — impressions and searches never cross over')
if (bad) process.exit(1)
