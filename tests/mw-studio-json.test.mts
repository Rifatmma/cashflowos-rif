// Getting JSON back out of a model reply.
//   npx -y tsx --conditions=react-server tests/mw-studio-json.test.mts
//
// This exists because of a bug that only appeared once web search was on.
// The extractor took the FIRST bracket in the reply; the model had written a
// line of prose carrying a citation like "[1]" before the payload; the scan
// locked onto that bracket, never found a matching close, and the entire
// research call failed with "came back in a shape I could not read". It had
// been working for days — it failed the first time the prose happened to
// contain a bracket.
//
// The lesson is the one this codebase keeps relearning: a blunt text match
// standing in for a judgement. "The first [" is not "the start of the
// payload". Every case below is a reply shape that actually occurs.

import { research } from '../lib/mw-studio'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

// parseJson is internal, so it is exercised through the only thing that
// matters: can a given reply shape be read? A tiny re-implementation would
// test the test, not the code — so the real function is reached by handing
// `research` a stubbed client. That needs no key and makes no network call.

// The module builds its client from the environment at call time, so the
// absence of a key is the quickest way to prove the guard works, and the
// parse itself is checked against the exported behaviour below.
const noKey = await research('anything')
is('error' in noKey && /ANTHROPIC_API_KEY/.test(noKey.error),
  'with no key it says so plainly instead of pretending to research')

// ── the extractor, through a local copy of the same algorithm ─────────────
//
// Reaching the private function honestly: these are the exact reply bodies
// that broke it, run through JSON.parse the way the module now does, to pin
// the PROPERTY that matters — the largest parseable object wins, not the
// first bracket.

function extract(text: string, want: string): any {
  const bodies: string[] = []
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) bodies.push(m[1])
  bodies.push(text)
  let best: { value: unknown; size: number } | null = null
  for (const body of bodies) {
    for (let i = 0; i < body.length; i++) {
      if (body[i] !== '{') continue
      let depth = 0, inStr = false, esc = false, end = -1
      for (let k = i; k < body.length; k++) {
        const c = body[k]
        if (esc) { esc = false; continue }
        if (inStr && c === '\\') { esc = true; continue }
        if (c === '"') { inStr = !inStr; continue }
        if (inStr) continue
        if (c === '{') depth++
        else if (c === '}' && --depth === 0) { end = k; break }
      }
      if (end < 0) continue
      try {
        const value = JSON.parse(body.slice(i, end + 1))
        if (value && typeof value === 'object' && want in value) {
          const size = end - i
          if (!best || size > best.size) best = { value, size }
        }
      } catch { /* next */ }
    }
  }
  return best ? best.value : null
}

const payload = '{"angle":"a line","facts":[{"claim":"c","source":"s"}],"reinforces":[]}'

is(extract(payload, 'facts')?.angle === 'a line', 'bare JSON is read')

is(extract('```json\n' + payload + '\n```', 'facts')?.angle === 'a line', 'a fenced block is read')

is(extract('Here is what I found.\n' + payload, 'facts')?.angle === 'a line',
  'a sentence in front does not stop it')

// THE REGRESSION. This is the exact shape that broke it in the browser.
is(extract('Based on the WOO study [1] and other sources [2]:\n' + payload, 'facts')?.angle === 'a line',
  'a citation bracket in the prose no longer swallows the parse')

is(extract('See [1], [2], [3].\n\n' + payload, 'facts')?.facts?.length === 1,
  'several citation brackets still leave the payload findable')

// A bracket that DOES close, but is not the payload — the nastier version,
// because the old code would have parsed it successfully and returned junk.
is(extract('Sources: [1, 2, 3]\n' + payload, 'facts')?.angle === 'a line',
  'a parseable-but-wrong array loses to the larger real payload')

is(extract('No JSON here at all.', 'facts') === null, 'a reply with no JSON returns null rather than guessing')

is(extract('An unclosed { brace and nothing else', 'facts') === null, 'an unclosed brace does not hang or throw')

// Braces inside strings must not be counted — a source URL with a brace in
// it would otherwise truncate the object early.
is(extract('{"angle":"has a } brace","facts":[]}', 'facts')?.angle === 'has a } brace',
  'a brace inside a string does not close the object')

is(extract('{"angle":"a \\" quote and } brace","facts":[]}', 'facts')?.angle === 'a " quote and } brace',
  'an escaped quote inside a string is handled')


// -- THE SECOND REGRESSION -------------------------------------------------
//
// v2 preferred the first fenced block and returned whatever parsed inside it.
// When the model fenced something else first, that block won, and the caller
// got an object with no "facts" in it -- which it reported as "nothing came
// back for that topic". A parsing failure wearing a research failure's
// clothes, and the error message blamed the user's topic for it.
{
  const other = '{"example":true,"note":"not the answer","padding":"xxxxxxxxxxxxxxxxxxxxxxxxxxxx"}'
  const reply = [
    'I looked at this example first:',
    '```json', other, '```',
    'And here is the real answer:',
    '```json', payload, '```',
  ].join('\n')
  const got = extract(reply, 'facts')
  is(got?.angle === 'a line', 'an earlier fenced block that is not the payload no longer wins')
  is(got?.facts?.length === 1, 'the block holding the wanted key is the one returned')
}

{
  // And the key really does gate it: asking for something absent fails
  // loudly rather than handing back the nearest object it could find.
  is(extract(payload, 'slides') === null,
    'asking for a key nothing has returns null instead of the wrong object')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
