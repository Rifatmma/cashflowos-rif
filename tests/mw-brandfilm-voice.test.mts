// Ava's voice for the brand video: English-only en-US, acronyms letter by letter.
//   npx -y tsx --conditions=react-server tests/mw-brandfilm-voice.test.mts
//
// Rif heard a Japanese and other non-American accents: the Multilingual voice
// guessed the language phrase by phrase. And the English-only voice says "LMX"
// as "lemex" unless it is given the letters.

import { AVA, XIAOXIAO, spoken, refold, ssmlSafe } from '../lib/mw-brandfilm-voice.ts'
import { resolveFilm, estimateSeconds } from '../lib/mw-brandfilm.ts'

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

// The Chinese video (owner, 28 Oct 2026): Xiaoxiao, and cues found inside runs of Chinese.
eq(XIAOXIAO, 'zh-CN-XiaoxiaoNeural', 'the Mandarin voice is Xiaoxiao')
const zhLine = { text: '中国品牌正在出海，户外广告是第一站。', dur: 4,
  words: [['中国', 0.1], ['品牌', 0.5], ['正在', 0.9], ['出海', 1.3], ['户外', 2.0], ['广告', 2.4], ['是', 2.8], ['第一站', 3.0]] as [string, number][] }
const film = resolveFilm({ title: 't', lines: [zhLine.text], scenes: [
  { kind: 'cover', line: 0, text: [{ s: '出海', st: 'h', on: '出海' }, { s: '户外广告', st: 's', on: '户外广告' }, { s: '第一', st: 's', on: '一站' }] },
] } as any, [zhLine])
// The line starts half a beat in; text lands 0.3s ahead of its word.
const ts = film.scenes[0].text.map((t: any) => +(t.t - 0.5 + 0.3).toFixed(3))
eq(ts[1], 2.0, 'a cue spanning two service words lands on the first of them')
eq(ts[2], 3.0, 'a cue inside a longer service word lands on that word')
eq(estimateSeconds(['中国品牌正在出海，户外广告是第一站。']) >= 5, true, 'Chinese length is counted by the character')
eq(ssmlSafe('Menara Tan & Tan <KL>'), 'Menara Tan &amp; Tan &lt;KL&gt;', 'an ampersand cannot break the voice request')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
