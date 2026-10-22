// What the Ava plan sanitizer must leave alone on screen.
//   npx -y tsx --conditions=react-server tests/mw-brandfilm-sanitize.test.mts
//
// Two things the 5-article audit test (22 Oct) put on screen wrong:
//  - the figure "30–50%" showed as "3050%": the number filter dropped the dash
//  - "pay more attention to their surroundings" showed as "…their su": labels
//    were cut at 30 characters, mid-word, though every art fits its labels

import { sanitizePlan } from '../lib/mw-brandfilm.ts'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m)
    : (bad++, console.log(`FAIL ${m}\n       got    ${JSON.stringify(a)}\n       wanted ${JSON.stringify(b)}`))

const panel = (art: string, ev: any) => ({ kind: 'panel', line: 1, bg: 'white', art, ev, text: [{ s: 'Head', st: 'h' }] })
const plan = (...scenes: any[]) => sanitizePlan({
  title: 't', lines: ['One.', 'Two.', 'Three.'],
  scenes: [{ kind: 'cover', line: 0, text: [{ s: 'Cover', st: 'h' }] }, ...scenes, { kind: 'end', line: 2, text: [] }],
}).plan
const ev = (p: any, art: string) => p.scenes.find((s: any) => s.art === art)?.ev

eq(ev(plan(panel('number', { value: '30–50%', unit: 'higher CPMs' })), 'number').value, '30–50%', 'a range keeps its en dash')
eq(ev(plan(panel('number', { value: '10-20%', unit: 'x' })), 'number').value, '10-20%', 'a range keeps its hyphen')
eq(ev(plan(panel('number', { value: '≈ $140B!', unit: 'x' })), 'number').value, '$140B', 'stray symbols around a figure still go')

eq(ev(plan(panel('donut', { value: 72, label: 'pay more attention to their surroundings' })), 'donut').label,
  'pay more attention to their surroundings', 'a 41-character label is kept whole')
const long = ev(plan(panel('donut', { value: 72, label: 'a very long label that keeps going well past anything a donut could ever hold' })), 'donut').label
eq(long.length <= 48 && !/\s/.test(long.slice(-1)) && 'a very long label that keeps going well past anything'.startsWith(long), true, `a runaway label is cut at a word: "${long}"`)

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
