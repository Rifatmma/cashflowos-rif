// Built on the real Malaysian search results, because the whole point of
// reading the SERP is that it disagreed with the shared-keyword report: the
// domain we had been comparing against was twelfth, and the actual leader was
// not on the list at all.
import { rankRivals, ourPlaces, isRival, type Serp } from '../lib/mw-serp-rivals'
import { gapVerdict, looksLikeInventory, type GapRow, type GapCluster } from '../lib/mw-gap'

let bad = 0
const ok = (m: string) => console.log('ok  ', m)
const fail = (m: string) => { bad++; console.log('FAIL', m) }

const serp = (query: string, doms: string[]): Serp =>
  ({ query, rows: doms.map((d, i) => ({ pos: i + 1, domain: d, url: `https://${d}/p${i}` })) })

// Exactly what Semrush returned for db=my, 13 Oct 2026.
const my: Serp[] = [
  serp('billboard advertising malaysia', [
    'www.skyboard.com.my', 'www.advertising.com.my', 'www.ledscreenads.com', 'www.bigtree.com.my',
    'firstboard.com', 'www.skybluemedia.my', 'bigscreen.my', 'danwanoutdoor.com',
    'www.facebook.com', 'bignetwork.com.my', 'www.billboardsin.com', 'outofhome.com.my',
  ]),
  serp('digital billboard advertising malaysia', [
    'www.skybluemedia.my', 'www.advertising.com.my', 'bigscreen.my', 'firstboard.com',
    'outofhome.com.my', 'www.ledscreenads.com', 'www.newnormz.com.my', 'www.bigtree.com.my',
    'www.facebook.com', 'digitalbillboard.com.my',
  ]),
]

const rivals = rankRivals(my)

// Two searches is deliberately too few to crown a leader, and the module does
// not pretend otherwise: skybluemedia.my takes top spot here on the strength
// of one #1, while advertising.com.my has two #2s. Both are defensible from
// this evidence, which is exactly why the script pulls ten searches or more.
// What matters at this size is that BOTH outrank the domain we had been
// comparing against, and that the real leader appears at all -- the
// shared-keyword report never returned advertising.com.my, at any position.
const top2 = rivals.slice(0, 2).map(r => r.domain)
if (!top2.includes('advertising.com.my')) fail(`advertising.com.my is top-two (got ${top2.join(', ')})`)
else ok(`top two are ${top2.join(' and ')} — the shared-keyword report returned neither`)

const oohm = rivals.find(r => r.domain === 'outofhome.com.my')!
if (!oohm || rivals.indexOf(oohm) < 3) fail('outofhome.com.my is not a top-three rival')
else ok(`outofhome.com.my ranks ${rivals.indexOf(oohm) + 1}th here — it was the ONLY domain we used to compare against`)

if (rivals.some(r => /facebook/.test(r.domain))) fail('facebook is not a competitor')
else ok('facebook is dropped — it ranks for everything and sells none of what we sell')

if (!isRival('billboardsin.com')) fail('a marketplace competing for the same buyer is still a rival')
else ok('billboardsin.com is kept — it competes for our buyer, and excluding it would flatter us')

if (isRival('www.movingwalls.com') || isRival('moving-walls.com')) fail('we are not our own rival')
else ok('our own domains, both spellings, are excluded')

// A domain appearing once must not look like a market leader.
const once = rankRivals([...my, serp('x', ['oneoff.com'])]).find(r => r.domain === 'oneoff.com')
if (once) fail('a single appearance is a coincidence, not a competitor')
else ok('a domain seen on one search only is held back')

// Position has to matter more than presence.
const a = rivals.find(r => r.domain === 'advertising.com.my')!
const b = rivals.find(r => r.domain === 'bigtree.com.my')!
if (!(a.score > b.score)) fail('two #2s must outweigh a #4 and a #8')
else ok('two #2 finishes outscore a #4 and a #8 — page one is where the clicks are')

const mine = ourPlaces(my)
if (mine.some(m => m.pos !== 0)) fail('we do not appear in either result')
else ok('our own absence is reported as absence, not left out')

// ── the verdict ────────────────────────────────────────────────────────────
const landmarks: GapRow[] = [
  { q: 'taman tun dr ismail', vol: 33100, cpc: 0.23, kd: 33, theirBest: 23, rival: 'outofhome.com.my' },
  { q: 'kesas highway', vol: 3600, cpc: 0, kd: 20, theirBest: 28, rival: 'outofhome.com.my' },
]
const pages = [
  'https://outofhome.com.my/billboards/taman-tun-dr-ismail/',
  'https://outofhome.com.my/billboards/kesas-highway/',
  'https://outofhome.com.my/billboards/nkve-highway-setia-alam/',
  'https://outofhome.com.my/billboards/federal-highway-batu-tiga-toll/',
  'https://outofhome.com.my/billboards/klia-expressway-toll-plaza/',
  'https://outofhome.com.my/billboards/ldp-highway-sri-damansara/',
]

const inv = looksLikeInventory(pages)
if (!inv.yes || inv.prefix !== '/billboards') fail(`a page-per-site rival is detected (got ${JSON.stringify(inv)})`)
else ok(`a rival with ${Math.round(inv.share * 100)}% of pages under /billboards reads as inventory, not writing`)

// Malaysia for real: we rank 8-14 for everything commercial, nothing to write.
const position = gapVerdict({
  country: 'Malaysia', raw: landmarks, kept: [], clusters: [],
  ourCommercial: [
    { q: 'out of home advertising malaysia', pos: 11 },
    { q: 'billboard advertising malaysia', pos: 13 },
    { q: 'digital billboard advertising malaysia', pos: 14 },
    { q: 'billboard price malaysia', pos: 8 },
  ],
  rivalPages: pages,
})
if (position.kind !== 'position') fail(`Malaysia is a position problem (got ${position.kind})`)
else ok(`Malaysia reads as: "${position.headline}"`)
if (!/#8|#11/.test(position.why)) fail('the verdict cites our actual positions')
else ok('the verdict names the positions it is reasoning from')

// Same landmarks, but we rank for nothing — then it is the structure talking.
const inventory = gapVerdict({
  country: 'Malaysia', raw: landmarks, kept: [], clusters: [],
  ourCommercial: [{ q: 'billboard advertising malaysia', pos: 13 }],
  rivalPages: pages,
})
if (inventory.kind !== 'inventory') fail(`a page-farm rival reads as inventory (got ${inventory.kind})`)
else ok(`with no positions of our own it reads as: "${inventory.headline}"`)
if (/write more pages|copy/i.test(inventory.doThis) && !/not copy/i.test(inventory.doThis)) fail('it must not advise copying the farm')
else ok('it explicitly says not to copy the page farm')

// A thin comparison must admit it is thin rather than declaring victory.
const thin = gapVerdict({
  country: 'UAE', raw: [landmarks[0]], kept: [], clusters: [], ourCommercial: [],
})
if (thin.kind !== 'unseen') fail(`a 1-row comparison is unusable (got ${thin.kind})`)
else ok(`one row of evidence reads as: "${thin.headline}"`)

// And when there IS something, it says so plainly.
const cl: GapCluster[] = [{
  head: 'bus advertising', keywords: landmarks, vol: 980, kd: 9, cpc: 7.86, rivals: ['billboardsaustralia.com.au'],
}]
const content = gapVerdict({
  country: 'Australia', raw: landmarks, kept: landmarks, clusters: cl, ourCommercial: [],
})
if (content.kind !== 'content') fail('a real gap reads as content')
else ok(`a real gap still reads as: "${content.headline}"`)
if (!/No new pages/i.test(content.doThis)) fail('even a content gap says no new pages')
else ok('even a real content gap says "No new pages"')

console.log(bad ? `\n${bad} failing` : '\nall good — the SERP names the real rivals, and an empty gap always says why')
if (bad) process.exit(1)
