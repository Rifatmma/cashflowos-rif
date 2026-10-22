// Ava's voice for the brand video: English-only en-US, acronyms letter by letter.
//   npx -y tsx --conditions=react-server tests/mw-brandfilm-voice.test.mts
//
// Rif heard a Japanese and other non-American accents: the Multilingual voice
// guessed the language phrase by phrase. And the English-only voice says "LMX"
// as "lemex" unless it is given the letters.

import { AVA, spoken, refold } from '../lib/mw-brandfilm-voice.ts'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m)
    : (bad++, console.log(`FAIL ${m}\n       got    ${JSON.stringify(a)}\n       wanted ${JSON.stringify(b)}`))

eq(/^en-US-/.test(AVA) && !/Multilingual/.test(AVA), true, `Ava is an English-only en-US voice (${AVA})`)
eq(spoken('Higher CPMs with LMX and MW Science.'), 'Higher C P Ms with L M X and M W Science.', 'acronyms go to the voice as letters')
eq(spoken("AirAsia's rollout in Kuala Lumpur."), "AirAsia's rollout in Kuala Lumpur.", 'ordinary words are left alone')
eq(refold('Higher CPMs with LMX.', [['Higher', .1], ['C', .5], ['P', .7], ['Ms', .9], ['with', 1.1], ['L', 1.3], ['M', 1.5], ['X', 1.7]]),
  [['Higher', .1], ['CPMs', .5], ['with', 1.1], ['LMX', 1.3]], 'letter timings fold back to the written acronym at its first letter')
eq(refold('No acronyms here.', [['No', .1], ['acronyms', .3], ['here', .8]]), [['No', .1], ['acronyms', .3], ['here', .8]], 'nothing to fold, nothing changes')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
