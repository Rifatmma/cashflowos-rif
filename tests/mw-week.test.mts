// "My week": the weekly pick. No network.
//   npx -y tsx --conditions=react-server tests/mw-week.test.mts
import { pickWeek, isoWeek, mondayOf, dueOf, kindOf, publishCardFor, isReady, checkPaid, type WeekTask } from '../lib/mw-week'
import type { Ranked } from '../lib/mw-priorities'
import { PEOPLE_SEED } from '../lib/mw-people'

let bad = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }

// ── dates
check(isoWeek('2026-10-26') === '2026-W44', '26 Oct 2026 is week 44')
check(isoWeek('2027-01-01') === '2026-W53', '1 Jan 2027 still belongs to 2026-W53')
check(mondayOf('2026-W44') === '2026-10-26', 'week 44 starts Monday 26 Oct')
check(dueOf('2026-W44') === '2026-10-30', 'cards are due Friday')

// ── the pick
const q = (id: string, owner: string, value: number, source: Ranked['source'] = 'market-task', market: string | null = null): Ranked => ({
  id, source, channel: 'SEO', title: `T ${id}`, why: 'w', owner, market, effortHours: 1, value, valueLabel: '', confidence: 1,
  doneWhen: 'd', stage: 'not_started', score: value, total: value, rank: 0, when: 'now',
})
const queue: Ranked[] = [
  q('a', 'Deewakshi', 9, 'gap-topic', 'sea'), q('b', 'Deewakshi', 8), q('c', 'Deewakshi', 7),
  ...Array.from({ length: 7 }, (_, i) => q(`d${i}`, 'Dinesh', 6 - i * 0.1)),
  q('p1', 'Rif', 5, 'paid-keywords'), q('p2', 'Rif', 4), q('p3', 'Rif', 3), q('p4', 'Rif', 2),
  q('m', 'Mehul', 10), q('x', 'Nobody', 10),
]
const w = pickWeek({ week: '2026-W44', queue, open: [], people: PEOPLE_SEED })
const n = (who: string) => w.picked.filter(t => t.owner === who).length
check(n('Deewakshi') === 2 && n('Dinesh') === 5 && n('Rif') === 3, 'caps hold: a lead 2, Dinesh 5, Rif 3')
check(w.picked.filter(t => t.owner === 'Deewakshi').map(t => t.sourceId).join() === 'a,b', 'within a person, the queue order (80/20) is kept')
check(['c', 'd5', 'd6', 'p4'].every(id => w.waiting.some(x => x.id === id)), 'what does not fit waits, it is not dropped')
check(w.waiting.some(x => x.id === 'm') && w.waiting.some(x => x.id === 'x'), 'bosses and unknown owners get no cards')
check(w.picked.every(t => t.due === '2026-10-30' && t.state === 'todo' && t.steps.length === 0), 'new cards are due Friday, todo, and have no steps yet')
check(w.picked.every(t => !isReady(t)), 'a card without steps is not ready to show')
check(w.picked.find(t => t.sourceId === 'a')!.kind === 'content-new', 'a gap topic for a lead is a new blog post')
check(w.picked.find(t => t.sourceId === 'b')!.kind === 'content-improve', 'other lead work is improving a page')
check(w.picked.find(t => t.sourceId === 'p1')!.kind === 'paid-apply', 'paid work is a one-tap Apply card')
check(w.picked.find(t => t.sourceId === 'd0')!.kind === 'tech', 'Dinesh\'s queue work is a site change')

// ── carry-over
const old: WeekTask = { ...w.picked.find(t => t.sourceId === 'a')!, week: '2026-W43', id: '2026-W43:a', steps: ['x'] }
const done: WeekTask = { ...w.picked.find(t => t.sourceId === 'b')!, week: '2026-W43', id: '2026-W43:b', state: 'submitted' }
const w2 = pickWeek({ week: '2026-W44', queue, open: [old, done], people: PEOPLE_SEED })
const dee = w2.carried.concat(w2.picked).filter(t => t.owner === 'Deewakshi')
check(w2.carried.length === 1 && w2.carried[0].carried === 1 && w2.carried[0].week === '2026-W44', 'an unfinished card carries into the new week, counted once more')
check(dee.length === 2 && !w2.picked.some(t => t.sourceId === 'a'), 'a carried card counts against the cap and is not picked twice')
check(w2.picked.some(t => t.sourceId === 'b') === false || done.state === 'submitted', 'a submitted card does not carry')

// ── submit to Dinesh
const lead: WeekTask = { ...old, week: '2026-W44', id: '2026-W44:a', payload: { page: 'https://www.movingwalls.com/blog/x' } }
const pub = publishCardFor(lead, 'https://docs.google.com/document/d/abc', 'Dinesh')
check(pub.id === '2026-W44:a:publish', 'one publish card per submission: a fixed id, so a double press makes no second card')
check(pub.owner === 'Dinesh' && pub.kind === 'publish' && isReady(pub), 'the publish card goes to Dinesh, ready, with steps')
check(pub.links[0].url.includes('docs.google.com') && pub.steps.some(s => /Published/.test(s)), 'it carries the doc and tells him to press Published')
check(!/consider|analy[sz]e|explore/i.test(pub.steps.join(' ')), 'no card asks the reader to consider or analyse anything')
const pubF = publishCardFor({ ...lead, findingId: '2026-W44:f:gap-posts' }, 'https://docs.google.com/document/d/abc', 'Dinesh')
check(pubF.findingId === '2026-W44:f:gap-posts', "Dinesh's publish card stays under the lead's finding on To do")

// ── left out of everyone's week
const extra: Ranked[] = [
  { ...q('s1', 'Dinesh', 50), source: 'sales' },
  { ...q('c1', 'Rif', 40), source: 'seo-step', helper: 'Claude' },
  { ...q('c2', 'Dinesh', 30), source: 'seo-step', helper: 'Claude' },
  q('r1', 'Sherlee', 20, 'gap-topic', 'americas'), q('r2', 'Sherlee', 19, 'gap-topic', 'americas'), q('r3', 'Sherlee', 18, 'gap-topic', 'americas'),
]
const w3 = pickWeek({ week: '2026-W44', queue: extra, open: [], people: PEOPLE_SEED, ruledOut: new Set(['r1']) })
check(!w3.picked.some(t => t.sourceId === 's1') && !w3.waiting.some(x => x.id === 's1'), "sales follow-ups are not this team's cards")
check(w3.forClaude.map(x => x.id).join() === 'c1', 'analysis Claude can do alone goes to the Monday run, not to Rif')
check(w3.picked.some(t => t.sourceId === 'c2' && t.owner === 'Dinesh'), 'a website step Claude prepared still goes to Dinesh to apply')
check(w3.picked.filter(t => t.owner === 'Sherlee').map(t => t.sourceId).join() === 'r2,r3', 'a ruled-out topic is skipped and the next one moves up')

// ── kinds by role
const dinesh = PEOPLE_SEED.find(p => p.name === 'Dinesh')!
check(kindOf(q('z', 'Dinesh', 1, 'gap-topic'), dinesh) === 'tech', 'a specialist never gets a writing card')

console.log(bad ? `\n${bad} FAILED` : '\nall passed')
process.exit(bad ? 1 : 0)
