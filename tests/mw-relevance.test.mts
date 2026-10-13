// isRelevant() decides what counts as our industry, and every piece of market
// analysis runs through it — the gap cleaner, the city audit, the opportunity
// list, which searches we read the results for.
//
// It was written as an array of quoted strings, and three of them contained
// `\b`. Inside a JavaScript string literal that is a BACKSPACE character, not
// a word boundary, so `'\bads?\b'` compiled to <BS>ads?<BS> and matched
// nothing. Silently — the regex was valid, it simply could not fire.
//
// `malaysia ads`, 1,000 searches a month in Malaysia, was being dropped as
// "not our industry". So was `outdoor ads`. So was `ad space`.
//
// These cases exist so that cannot come back, in either direction: the
// boundary has to match the short words AND still refuse the words that
// merely contain them.
import { isRelevant, isBrand } from '../lib/mw-markets'

let bad = 0
const ok = (m: string) => console.log('ok  ', m)
const fail = (m: string) => { bad++; console.log('FAIL', m) }

const keep = (q: string) => isRelevant(q) ? ok(`keeps "${q}"`) : fail(`should keep "${q}"`)
const drop = (q: string) => !isRelevant(q) ? ok(`drops "${q}"`) : fail(`should drop "${q}"`)

// The three that the backspace bug silently killed.
keep('malaysia ads')
keep('outdoor ads')
keep('ad space')
keep('ad board')
keep('ad network')

// Ordinary industry language, which always worked.
keep('billboard advertising malaysia')
keep('digital out of home')
keep('ooh')
keep('bus shelter advertising')
keep('programmatic dooh')

// The boundary has to work in the other direction too, or fixing the above
// would flood every market with words that merely contain "ad" or "ads".
drop('nomads')
drop('roads')
drop('bad weather')
drop('adventure holidays')
drop('loading bay')

// Not our industry, however much it looks like it.
drop('taman tun dr ismail')
drop('kesas highway')
drop('plaza tol klia')

// Famous collisions: the film and the music chart both carry "billboard".
drop('billboards ebbing missouri')
drop('3 billboards outside ebbing missouri film')
drop('billboard 200')
drop('billboard hot 100')
keep('digital billboard')          // still our industry

// Brand is a separate test and must not be confused with relevance: our own
// name IS our industry, it just must never reach a finding.
if (!isBrand('moving walls malaysia')) fail('our name is brand')
else ok('our own name reads as brand, which is a different question from relevance')
if (isBrand('billboard advertising malaysia')) fail('a plain industry term is not brand')
else ok('a plain industry search is not brand')

console.log(bad ? `\n${bad} failing` : '\nall good — the word boundaries fire, and still refuse nomads')
if (bad) process.exit(1)
