// Reading Semrush's own exports. The risk here is not crashing — it is
// importing a file as the wrong report or the wrong market and putting
// confident nonsense in front of the team. Every test is about refusing.
import { readFile, detectKind, detectCountry, splitCsv } from '../lib/mw-import'

let bad = 0
const ok = (m: string) => console.log('ok  ', m)
const fail = (m: string) => { bad++; console.log('FAIL', m) }

// Exactly what Semrush's UI produces: quoted fields, semicolon separated.
const positions = [
  '"Keyword";"Position";"Previous position";"Search Volume";"CPC";"URL";"Traffic";"Keyword Difficulty"',
  '"outdoor advertising companies";"17";"21";"880";"0.38";"https://www.movingwalls.com/locations/india";"1";"13.00"',
  '"ooh advertising";"26";"26";"1600";"0.46";"https://www.movingwalls.com/locations/india";"1";"33.00"',
].join('\n')

const competitors = [
  '"Domain";"Competitor Relevance";"Common Keywords";"Organic Keywords";"Organic Traffic"',
  '"gohoardings.com";"0.28";"16";"223";"1343"',
].join('\n')

const gap = [
  '"Keyword";"gohoardings.com";"trzy.in";"Search Volume";"CPC";"Keyword Difficulty"',
  '"billboard advertising";"2";"0";"1900";"0.51";"30.00"',
  '"transit advertising";"15";"0";"1000";"0.55";"43.00"',
].join('\n')

// ── the three reports are told apart by their columns, not their names ──────
const IN = 'www.movingwalls.com-organic.Positions-in-2026-09-30T08_12_00Z.csv'
const p = readFile(IN, positions)
if (p.kind !== 'positions') fail(`positions export read as ${p.kind}`)
else if (p.keywords?.length !== 2) fail(`expected 2 keywords, got ${p.keywords?.length}`)
else if (p.keywords[0].vol !== 880 || p.keywords[0].pos !== 17) fail('quoted numbers not parsed')
else ok('a Positions export is recognised and its quoted numbers parsed')

if (p.keywords?.[0].prev !== 21) fail('previous position lost')
else ok('previous position is kept, so month-over-month movement survives')

const c = readFile('www.movingwalls.com-organic.Competitors-my-2026-09-30.csv', competitors)
if (c.kind !== 'competitors') fail(`competitors export read as ${c.kind}`)
else if (c.competitors?.[0].domain !== 'gohoardings.com') fail('competitor domain lost')
else ok('a Competitors export is recognised')

const g = readFile('keyword-gap-ph-2026-09-30.csv', gap)
if (g.kind !== 'gap') fail(`gap export read as ${g.kind}`)
else if (g.rivals?.length !== 2) fail(`expected 2 rival columns, got ${g.rivals?.length}`)
else if (g.gap?.[0].theirBest !== 2 || g.gap?.[0].rival !== 'gohoardings.com') fail('best rival position not attributed')
else ok('a Keyword Gap export is recognised and attributed to the right rival')

// ── a file it cannot place must be refused, never guessed ───────────────────
const nameless = readFile('export (3).csv', positions)
if (!nameless.problem) fail('a file with no market in its name was imported anyway')
else if (nameless.kind !== 'positions') fail('the report type should still be detected')
else ok(`unknown market is refused with a reason: "${nameless.problem}"`)

const junk = readFile('notes-in.csv', 'name,phone\nbob,123')
if (!junk.problem) fail('an unrelated CSV was accepted')
else ok(`an unrelated CSV is refused: "${junk.problem}"`)

const empty = readFile('positions-in.csv', '')
if (!empty.problem) fail('an empty file was accepted')
else ok('an empty file is refused')

// ── the market must come from a whole token, not a substring ────────────────
// "august" contains "us"; without whole-token matching every file dated in
// August would import as the United States.
const august = detectCountry('movingwalls-positions-august-2026.csv')
if (august) fail(`"august" matched database "${august.db}"`)
else ok('a database code is only matched as a whole token, so "august" is not the US')

const two = detectCountry('movingwalls-in-my-2026.csv')
if (two) fail('a filename naming two markets was resolved to one')
else ok('a filename naming two markets is refused rather than guessed')

if (detectCountry(IN)?.country !== 'india') fail('the real Semrush filename did not resolve to India')
else ok('a real Semrush export filename resolves to its market')

// ── the human can override when the filename is useless ─────────────────────
const forced = readFile('export (3).csv', positions, { country: 'india', market: 'india', db: 'in' })
if (forced.problem) fail(`a hand-picked market was still refused: ${forced.problem}`)
else if (forced.country !== 'india') fail('the hand-picked market was ignored')
else ok('a market picked by hand overrides the filename')

// ── comma-separated exports happen too ──────────────────────────────────────
const comma = splitCsv('Keyword,Position,Search Volume\nbillboard,4,900')
if (comma.rows[0]?.['search volume'] !== '900') fail('comma-separated export not handled')
else ok('a comma-separated export is handled as well as semicolon')

if (detectKind(['keyword', 'position', 'search volume']) !== 'positions') fail('unquoted header not detected')
else ok('headers are matched case-insensitively and unquoted')

console.log(bad ? `\n${bad} failing` : '\nall good — exports are read, and anything ambiguous is refused')
if (bad) process.exit(1)
