// What does the research call ACTUALLY return?
//   node --env-file=.env node_modules/.bin/tsx scripts/studio-diag.mts "<topic>"
//
// Written because the Studio was being debugged through the browser: type a
// topic, wait fifty seconds, read a one-line error, guess. Two rounds of that
// produced two different failures from the same code, because the thing on
// the other end is not deterministic. This prints the raw reply so the shape
// can be looked at instead of inferred.

import Anthropic from '@anthropic-ai/sdk'

const topic = process.argv[2] ?? 'digital billboard adoption in Southeast Asia'
const key = process.env.ANTHROPIC_API_KEY?.trim()
if (!key) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1) }

const a = new Anthropic({ apiKey: key })

const prompt = `You are researching a topic for a Moving Walls social post. Moving Walls is an
out-of-home (OOH) advertising measurement and technology company operating across South and
Southeast Asia and the Middle East.

TOPIC: ${topic}

Find 4 to 6 specific, checkable facts about this topic — figures, dated events, named studies.
Prefer the last 18 months. Every fact MUST carry a real, named source. If you cannot find a
source for a claim, drop the claim. Never invent a publication, a report name or a statistic.

These are the movingwalls.com pages Google shows most often. If the topic genuinely relates to
any of them, list those URLs under "reinforces" so the post can support a page that already
exists. If none relate, return an empty list rather than forcing a match:
  /locations/singapore
  /locations/indonesia

Reply with JSON only:
{"angle":"one sentence on the most interesting line to take",
 "facts":[{"claim":"...","source":"publication or dataset name","url":"https://..."}],
 "reinforces":["/locations/..."]}`

const res = await a.messages.create({
  model: 'claude-sonnet-5-5',
  max_tokens: 3000,
  tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as any],
  messages: [{ role: 'user', content: prompt }],
})

console.log('stop_reason:', res.stop_reason)
console.log('block types:', res.content.map(b => b.type).join(', '))
const text = res.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n')
console.log('--- joined text blocks, %d chars ---', text.length)
console.log(text)
console.log('--- end ---')
