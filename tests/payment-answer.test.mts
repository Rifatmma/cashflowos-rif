// Reading the owner's answer to "I found these payments in your email".
//   npx -y tsx --conditions=react-server tests/payment-answer.test.mts
//
// Written from how he ACTUALLY answers, not from the format the question asks
// for. On 8 Oct 2026 he wrote "1-11 file as owner's drawing the rest skip" and
// it worked -- 1 to 11 filed as drawings, 12 to 15 skipped -- but Jarvis still
// replied "I didn't understand: owner's", and a correct answer that is told it
// was wrong is indistinguishable from a wrong one:
//
//   "I was just frustrated that when I said line 1-11 file it the rest skip it
//    didn't recognize my instruction... It is saying please type 1: food,
//    2: packaging and so on so on. It is too much typing."

import { parseAnswer, looksLikeAnswer, plainAnswer } from '../lib/payment-answer'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m)
    : (bad++, console.log(`FAIL ${m}\n       got    ${JSON.stringify(a)}\n       wanted ${JSON.stringify(b)}`))

/** Compact view: which numbers got which type. */
const read = (text: string, max: number) => {
  const a = parseAnswer(text, max)
  const by: Record<string, number[]> = {}
  for (const [n, c] of Object.entries(a.choices)) (by[c.type] ??= []).push(Number(n))
  for (const k of Object.keys(by)) by[k].sort((x, y) => x - y)
  return { by, unknown: a.unknownWords, badNumbers: a.badNumbers }
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

// ── the exact sentence he wrote ─────────────────────────────────────────────
{
  const r = read("1-11 file as owner's drawing the rest skip", 15)
  eq(r.by.owner_drawings, range(1, 11), 'his own words file 1 to 11 as drawings')
  eq(r.by.skip, range(12, 15), 'and "the rest skip" catches 12 to 15')
  eq(r.unknown, [], "and “owner’s” is NOT reported as a word Jarvis didn't understand")
}

// ── a range written in words ────────────────────────────────────────────────
{
  const r = read('1 to 11 drawings, rest skip', 15)
  eq(r.by.owner_drawings, range(1, 11), '"1 to 11" is a range, not the numbers 1 and 11')
  eq(r.by.skip, range(12, 15), 'so the rest is 12 to 15, not 2 to 15')
}
{
  // This was silently wrong before: only #1 became drawings and 2-11 were
  // swept up by "rest", which is the worst kind of bug -- it files money.
  const r = read('1 hingga 4 food, rest skip', 6)
  eq(r.by.cogs_food, [1, 2, 3, 4], 'Malay "hingga" reads as a range too')
}

// ── the shapes the question suggests ────────────────────────────────────────
{
  const r = read('1 software, 2 drawings, 3 skip', 3)
  eq(r.by, { services: [1], owner_drawings: [2], skip: [3] }, 'one by one still works')
}
{
  const r = read('all drawings', 4)
  eq(r.by.owner_drawings, [1, 2, 3, 4], '"all drawings" takes everything')
}
{
  const r = read('1-3 drawings', 5)
  eq(r.by.owner_drawings, [1, 2, 3], 'a dash range')
  eq(Object.keys(r.by).length, 1, 'and says nothing about the others')
}

// ── the verbs and leftovers he reaches for ──────────────────────────────────
{
  eq(read('mark 1 2 drawings, put 3 food, others skip', 5).by,
    { owner_drawings: [1, 2], cogs_food: [3], skip: [4, 5] },
    'mark / put / others all read as instructions, not as unknown words')
}
{
  eq(read('1-2 marketing balance skip', 4).by,
    { marketing: [1, 2], skip: [3, 4] }, '"balance" means the rest')
}
{
  eq(read('1 drawings sisanya skip', 3).by,
    { owner_drawings: [1], skip: [2, 3] }, 'and so does Malay "sisanya"')
}

// ── things it must still refuse rather than guess ───────────────────────────
{
  const r = read('1 bananas, 2 drawings', 2)
  eq(r.by, { owner_drawings: [2] }, 'a word it does not know files nothing')
  eq(r.unknown, ['bananas'], 'and is reported, because #1 was left undecided')
}
{
  eq(read('9 drawings', 3).badNumbers, [9], 'a number not on the list is named back')
}

// ── the gate, and the no-numbers path ───────────────────────────────────────
{
  eq(looksLikeAnswer("1-11 file as owner's drawing the rest skip"), true, 'his answer reaches the parser at all')
  eq(looksLikeAnswer('what did we spend on udang'), false, 'an ordinary question does not')
}
{
  eq(plainAnswer("add it as owner's drawings"), { type: 'owner_drawings', saysAll: false },
    'a no-numbers reply still reads its category')
  eq(plainAnswer('1 drawings'), null, 'anything with a number belongs to the numbered parser')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
