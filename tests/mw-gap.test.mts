// The gap is only useful if the noise is gone and what is left groups into
// pages somebody can write. Both halves are tested against the real India
// rows Semrush returned, junk included.
import { cleanGap, cluster, worthWriting, effortOf, type GapRow } from '../lib/mw-gap'

let bad = 0
const ok = (m: string) => console.log('ok  ', m)
const fail = (m: string) => { bad++; console.log('FAIL', m) }

const r = (q: string, vol: number, kd = 20, theirBest = 5, rival = 'gohoardings.com', cpc = 0): GapRow =>
  ({ q, vol, kd, theirBest, rival, cpc })

// Exactly what came back for India, sorted by volume — junk and all.
const india: GapRow[] = [
  r('mahamaya flyover', 60500, 32),
  r('dnd flyover', 22200, 28),
  r('dnd flyway', 22200, 38),
  r('new bus stop', 14800, 33),
  r('timesoffinland com', 14800, 24),
  r('hoardings', 6600, 50),
  r('ooh', 6600, 57),
  r('royal market', 3600, 31),
  r('advertising boards', 2900, 25),
  r('electronic media', 2900, 37),
  r('ooh full form', 2400, 11),
  r('airport advertising agency', 1900, 15),
  r('billboard advertising', 1900, 30),
  r('eveready chauraha', 1900, 28),
  r('nike is a brand my telenor', 1900, 28),
  r('outdoor advertising', 1900, 44),
  r('delhi metro advertising cost', 1600, 14),
  r('digital wall painting', 1600, 27),
  r('ooh advertising', 1600, 33),
  r('unipole', 1600, 29),
  r('funny hoardings in india', 1300, 32),
  r('pvr himalaya mall', 1300, 30),
  r('billboard advertising cost', 900, 26),
  r('billboard advertising agency', 700, 28),
]

// ── the noise has to go, or the report is worse than useless ────────────────
const clean = cleanGap(india, [])
const junk = ['mahamaya flyover', 'dnd flyover', 'dnd flyway', 'new bus stop',
  'timesoffinland com', 'royal market', 'eveready chauraha',
  'nike is a brand my telenor', 'pvr himalaya mall']
const leaked = junk.filter(q => clean.some(c => c.q === q))
if (leaked.length) fail(`junk survived the filter: ${leaked.join(', ')}`)
else ok(`${india.length - clean.length} of ${india.length} rows dropped as not our business`)

const wanted = ['billboard advertising', 'outdoor advertising', 'ooh advertising', 'advertising boards']
const lost = wanted.filter(q => !clean.some(c => c.q === q))
if (lost.length) fail(`real opportunities were filtered out: ${lost.join(', ')}`)
else ok('every genuine commercial search survived')

// The biggest number in the raw list must not be the headline.
if (clean[0] && clean[0].vol > 10000) fail(`a ${clean[0].vol}-volume navigation search is still top: ${clean[0].q}`)
else ok('the headline is a real search, not the biggest navigational one')

// ── a rival buried on page five is not winning anything ───────────────────
const buried = cleanGap([
  r('billboard advertising', 1900, 30, 2),
  r('unipole', 1600, 29, 48),
  r('hogarth india', 1300, 34, 37),
  r('outdoor advertising agency', 880, 19, 1),
], [])
if (buried.some(c => c.q === 'unipole' || c.q === 'hogarth india')) fail('a rival ranking in the forties still counts as a gap')
else if (buried.length !== 2) fail(`expected 2 real gaps, got ${buried.length}`)
else ok('gaps where the rival is past position 20 are dropped — nobody loses a deal on page five')

// ── we do not send anyone to write a page we already have ──────────────────
const already = cleanGap(india, ['Billboard Advertising', 'ooh advertising'])
if (already.some(c => /^billboard advertising$/i.test(c.q))) fail('a search we already rank for is still listed as a gap')
else ok('searches our own pull says we rank for are dropped, case-insensitively')

// ── clustering into pages ──────────────────────────────────────────────────
const cs = cluster(clean)
if (!cs.length) fail('nothing clustered')
else ok(`${clean.length} searches grouped into ${cs.length} topics`)

const billboard = cs.find(c => c.keywords.some(k => k.q === 'billboard advertising'))
if (!billboard) fail('no cluster contains "billboard advertising"')
else if (billboard.keywords.length < 3) fail(`"billboard advertising" did not gather its variants (${billboard.keywords.length})`)
else ok(`"billboard advertising" gathers ${billboard.keywords.length} searches worth ${billboard.vol}/mo into one page`)

// Every search lands in exactly one cluster: two leads must never be handed
// the same keyword, and nothing may silently vanish.
const seen = cs.flatMap(c => c.keywords.map(k => k.q))
if (seen.length !== clean.length) fail(`${clean.length} searches in, ${seen.length} out`)
else if (new Set(seen).size !== seen.length) fail('a search appears in more than one cluster')
else ok('every surviving search is in exactly one cluster, none duplicated')

if (cs.some((c, i) => i > 0 && cs[i - 1].vol < c.vol)) fail('clusters are not ranked by volume')
else ok('clusters are ranked by the demand behind them')

const thin = cs.filter(c => !worthWriting(c))
ok(`${thin.length} thin topics held back, ${cs.length - thin.length} worth a page`)

const e = effortOf({ ...cs[0], kd: 55 })
if (e.size !== 'L') fail('a difficulty-55 topic is not sized as a large job')
else ok(`effort reads as a sentence: "${e.says}"`)

console.log(bad ? `\n${bad} failing` : `\nall good — the India gap reduces to ${cs.filter(worthWriting).length} writable topics`)
if (bad) process.exit(1)
