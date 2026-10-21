// The SEO planner on Telegram: commands, reply tags, suggestion buttons. No network.
//   npx -y tsx --conditions=react-server tests/mw-seo-telegram.test.mts
import { parseSeo, stepFromReply, stepCard, stepButtons, resultMessage, resultButtons, cleanNext, tagOf } from '../lib/mw-seo-telegram'
import { STEPS, STEP } from '../lib/mw-seo-plan'
import { buildContext, contextSummary, CONTEXT_CAP } from '../lib/mw-seo-context'

let bad = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }

check(parseSeo('/seo')?.kind === 'card', '/seo shows the card')
check(parseSeo('/seo go')?.kind === 'go' && parseSeo('/SEO Go')?.kind === 'go', '/seo go sends the step')
check(parseSeo('/seo@JarvisBot status')?.kind === 'status', '/seo@bot status works in a mention')
const pr = parseSeo('/seo check why pune dropped')
check(pr?.kind === 'prompt' && (pr as any).text === 'check why pune dropped', 'free text after /seo is a prompt')
check(parseSeo('/seofoo') === null && parseSeo('hello') === null, 'only /seo itself is matched')

check(stepFromReply(`blah\n${tagOf('leak-sea')}`) === 'leak-sea', 'a reply finds its step from the card footer')
check(stepFromReply('no tag here') === null, 'a reply to anything else is not an SEO prompt')

// every callback fits Telegram's 64-byte limit
const longest = STEPS.reduce((a, s) => (s.id.length > a.length ? s.id : a), '')
const btns = stepButtons(longest, true, 'https://x.test/mw/seo')
check(btns.flat().every(b => !('callback_data' in b) || Buffer.byteLength(String(b.callback_data)) <= 64), 'every button fits the 64-byte callback limit')

const card = stepCard({
  step: STEP['leak-sea'], position: { index: 0, total: 5, focus: true }, gain: { clicks: 0, leads: 5.9, rows: 1, basis: '~5.9 leads/mo' },
  stage: 'Not started', week: { done: 0, total: 9 }, whole: { done: 0, total: 32 },
  latest: { id: 7, status: 'done', result: 'Found <script> in the CTA' },
})
check(card.includes(tagOf('leak-sea')), 'the card carries its reply tag')
check(!card.includes('<script>') && card.includes('&lt;script&gt;'), 'model output is escaped in Telegram HTML')

const next = cleanNext([
  { label: 'Prepare the H2 for Dinesh', prompt: 'Prepare the H2 change as a proposal.' },
  { label: 'Ship it', prompt: 'Publish it to the live site now.' },
  { label: '', prompt: 'no label' },
  { label: 'Re-check in 14 days', prompt: 'Re-pull positions in 14 days.' },
  { label: 'Fourth', prompt: 'x' }, { label: 'Fifth', prompt: 'y' },
])
check(next.length === 3 && !next.some(n => /publish/i.test(n.prompt)), 'suggestions: max three, never "publish to the site", never blank')
check(cleanNext('nope').length === 0, 'junk in result_links.next is ignored')

const res = { id: 12, status: 'done', step: STEP['leak-sea'], result: 'Done.', error: null, next }
const rb = resultButtons(res)
check(rb.length === 4 && String((rb[0][0] as any).callback_data) === 'seo:n:12:0', 'each suggestion is a button that sends that prompt')
check(rb[3].some(b => (b as any).callback_data === 'seo:w:leak-sea'), 'there is always a "write my own" button')
check(resultMessage(res).includes(tagOf('leak-sea')), 'a result can be replied to, too')
check(resultMessage({ ...res, status: 'failed', error: 'timeout', next: [] }).includes('did not finish'), 'a failure says so')

// context pack
const pack = buildContext({
  step: STEP['protect-india-fix'], prompt: 'Do it', gain: null,
  gsc: Array.from({ length: 400 }, (_, i) => ({ q: `outdoor advertising in india ${i}`, url: 'https://www.movingwalls.com/locations/india', country: 'india', pos: 5, impr: 400 - i, clicks: 1 })),
  ranked: new Map([['https://www.movingwalls.com/locations/india', [
    { q: 'outdoor advertising in india', pos: 5, vol: 0, traffic: 1 }, { q: 'far away term', pos: 55, vol: 0, traffic: 0 },
  ]]]),
  funnel: [], linked: [], proposals: [], previous: [], owners: {}, builtAt: '2026-10-20T00:00:00Z',
})
check(pack.guardrails.length >= 8 && /guardrails/i.test(pack.task), 'the pack always carries the guardrails')
check(pack.protected.some(p => p.q === 'outdoor advertising in india') && !pack.protected.some(p => p.q === 'far away term'), 'protected terms are Locked/Protect only')
check(pack.gsc.length <= 15, 'GSC rows are capped per URL')
check(JSON.stringify(pack).length <= CONTEXT_CAP, 'the pack fits the size cap')
check(pack.step.apply !== null, 'a website step carries its applier prompt')
check(contextSummary(pack).length >= 2, 'the card can summarise what Claude will be told')

console.log(bad ? `\n${bad} FAILED` : '\nall passed')
process.exit(bad ? 1 : 0)
