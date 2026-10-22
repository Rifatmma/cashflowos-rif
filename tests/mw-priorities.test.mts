// The one ranked list: value maths, the 80/20 cut, capacity, focus markets, declines.
//   npx -y tsx --conditions=react-server tests/mw-priorities.test.mts
import { rank, forPerson, FOCUS_SHARE, type Candidate } from '../lib/mw-priorities'
import { gapCandidates, paidCandidates, salesCandidates, trackingCandidates, taskValue, rankChance, marketTaskCandidates, ruledOutPhrases, TRACKING_IDS } from '../lib/mw-priority-sources'
import { PEOPLE_SEED, personByName, personByActor, parsePeople } from '../lib/mw-people'

let bad = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }

const c = (id: string, o: Partial<Candidate>): Candidate => ({
  id, source: 'seo-step', channel: 'SEO', title: id, why: 'w', owner: 'Rif', market: 'india',
  effortHours: 1, value: 1, valueLabel: '', confidence: 1, doneWhen: 'd', stage: 'not_started', ...o,
})
const opts = { focusMarkets: ['india', 'sea', 'americas'], capacity: { Rif: 4, Dinesh: 5, Sukrithi: 1 }, defaultHours: 1 }

// ── ranking and the cut
{
  const q = rank([c('a', { value: 10 }), c('b', { value: 1 }), c('c', { value: 5, effortHours: 5 }), c('d', { value: 0 })], opts)
  check(q.items[0].id === 'a', 'highest value per hour first')
  check(q.items.findIndex(x => x.id === 'c') > q.items.findIndex(x => x.id === 'b'), 'same value at five times the hours ranks lower')
  check(q.share >= FOCUS_SHARE && !q.focus.includes('d'), 'the cut reaches 80% and never includes a zero-value item')
  const lastless = q.focus.slice(0, -1).reduce((t, id) => t + q.items.find(x => x.id === id)!.value, 0)
  check(lastless / q.totalValue < FOCUS_SHARE, 'the cut is the shortest run that reaches 80%')
}

// ── prerequisites
{
  const q = rank([c('fix', { value: 0.1, unlocks: ['big'], effortHours: 3 }), c('big', { value: 8 })], opts)
  check(q.items[0].id === 'fix', 'a fix goes before the work it unlocks')
  check(q.items[0].total > 0.1, 'and inherits a share of its value')
}

// ── focus markets
{
  const q = rank([
    c('m1', { market: 'mena', value: 3 }), c('m2', { market: 'mena', value: 2 }), c('m3', { market: 'mena', value: 1 }),
    c('i1', { market: 'india', value: 1 }), c('i2', { market: 'india', value: 0.5 }),
  ], opts)
  check(q.items.filter(x => x.market === 'mena').length === 1 && q.items.some(x => x.id === 'm1'), 'a maintenance market contributes only its best task')
  check(q.items.filter(x => x.market === 'india').length === 2, 'a focus market keeps all of its tasks')
}

// ── capacity
{
  const q = rank([
    c('s1', { owner: 'Sukrithi', value: 5 }), c('s2', { owner: 'Sukrithi', value: 4 }),
    c('d1', { owner: 'Dinesh', value: 30, effortHours: 8 }), c('d2', { owner: 'Dinesh', value: 2, effortHours: 1 }),
  ], opts)
  const w = (id: string) => q.items.find(x => x.id === id)!.when
  check(w('s1') === 'now' && w('s2') === 'later', 'a lead with one hour gets one task this week; the next waits')
  check(w('d1') === 'now', "a person's first task always fits, even if it is bigger than the week")
  check(w('d2') === 'later' && q.load.Dinesh.waiting === 1, 'and the overflow is counted as waiting')
  check(forPerson(q, 'Sukrithi')[0].id === 's1', "a person's view lists this week first")
}

// ── declines
{
  const q = rank([
    c('no', { stage: 'declined', declined: { reason: 'not relevant', reopen: false } }),
    c('back', { stage: 'declined', declined: { reason: 'too early', reopen: true } }),
    c('gone', { stage: 'done' }),
  ], opts)
  check(!q.items.some(x => x.id === 'no'), 'a declined task stays out')
  check(q.items.some(x => x.id === 'back' && /too early/.test(x.reraised ?? '')), 'unless its data moved — and then it says why it was declined')
  check(!q.items.some(x => x.id === 'gone'), 'done work leaves the list')
}

// ── sources
{
  const g = gapCandidates([{ country: 'india', market: 'india', clusters: [
    { head: 'digital billboard advertising', keywords: [{ q: 'a' }, { q: 'b' }, { q: 'c' }] as any, vol: 2400, kd: 25, cpc: 1, rivals: ['x.com'] } as any,
  ] }], new Map(), PEOPLE_SEED)
  check(g.length === 1 && g[0].value > 0, 'new content is valued above zero (the old blind spot)')
  check(g[0].owner === 'Sukrithi' && g[0].helper === 'Claude' && /blog/i.test(g[0].title), 'a gap topic is a blog brief for the market lead, drafted by Claude')
  check(rankChance(60) < rankChance(20), 'harder topics are less likely to rank')
  check(g[0].value < 1, 'a new blog post is valued modestly (blog readers rarely enquire)')
  const ruled = gapCandidates([{ country: 'india', market: 'india', clusters: [
    { head: 'advertisement near me', keywords: [{ q: 'advertisement near me' }, { q: 'b' }, { q: 'c' }] as any, vol: 9000, kd: 20, cpc: 1, rivals: [] } as any,
  ] }], new Map(), PEOPLE_SEED, 3, ruledOutPhrases(['Make /locations/india rank for “advertisement near me”']))
  check(ruled.length === 0, 'a search declined anywhere is never suggested again as content')

  const p = paidCandidates({ cpl: 65, monthKey: '2026-10', keywords: [
    { text: 'harga sewa billboard', matchType: 'PHRASE', campaign: 'SEA - Market Venues', adGroup: 'a', cost: 70, clicks: 99, conversions: 0, impressions: 900, ctr: 0.1, qs: 5, adRelevance: 'AVERAGE', landingPage: 'AVERAGE', expectedCtr: 'AVERAGE', landingUrl: null } as any,
    { text: 'billboard bangalore', matchType: 'PHRASE', campaign: 'T1-India-Geofence-KW', adGroup: 'b', cost: 25, clicks: 17, conversions: 3, impressions: 300, ctr: 0.05, qs: 7, adRelevance: 'AVERAGE', landingPage: 'AVERAGE', expectedCtr: 'AVERAGE', landingUrl: null } as any,
  ] }, new Map())
  check(p.length === 1 && p[0].market === 'sea' && /S\$70/.test(p[0].title), 'paid: one decision per campaign, converting keywords never flagged')
  check(Math.abs(p[0].value - 70 / 65) < 1e-9 && /S\$70/.test(p[0].valueLabel), 'paid waste is valued at the account cost per lead, labelled in dollars')

  const now = Date.parse('2026-10-21T00:00:00Z')
  const s = salesCandidates([
    { owner_name: 'Sukriti Taneja', owner_email: 'sukriti.taneja@movingwalls.com', created_time: '2026-10-19T00:00:00Z', first_response_at: null, suspect_import: false },
    { owner_name: 'Rukshana Rizwie', owner_email: 'rukshana@movingwalls.com', created_time: '2026-10-19T00:00:00Z', first_response_at: null, suspect_import: true },
    { owner_name: 'Sukriti Taneja', owner_email: 'sukriti.taneja@movingwalls.com', created_time: '2026-09-01T00:00:00Z', first_response_at: null, suspect_import: false },
    { owner_name: 'Dineshgandhi S', owner_email: 'dinesh@movingwalls.com', created_time: '2026-10-20T00:00:00Z', first_response_at: null, suspect_import: false },
    { owner_name: 'Dinesh Kumar', owner_email: 'other.dinesh@movingwalls.com', created_time: '2026-10-20T00:00:00Z', first_response_at: null, suspect_import: false },
  ], PEOPLE_SEED, now)
  const suk = s.find(x => x.owner === 'Sukrithi')
  check(!!suk && /1 enquiry/.test(suk.title), 'sales: recent unanswered enquiries per person; batch imports and old leads excluded')
  check(/lead queue/.test(s.find(x => x.owner === 'Dinesh')?.title ?? ''), 'people are matched by email, and the lead queue says it is the queue')
  check(s.length === 2, 'a CRM owner not in the directory is never guessed from a first name')

  const t = trackingCandidates({ utmFill: 0.9, semrushAgeDays: 10, marketsWithoutRivals: 0 }, new Map(), { ga4: ['x'], zoho: [], semrush: [] })
  check(t.find(x => x.id === TRACKING_IDS.zoho)?.stage === 'done', 'the Zoho fix closes itself once 80% of leads carry a source')
  check(!t.some(x => x.id === TRACKING_IDS.semrush), 'a fresh Semrush import raises no task')

  check(taskValue({ id: 'x', title: '', owner: null, market: 'india', size: 'S', status: 'not', decision: null,
    how: { kind: 'strike', keywords: [{ q: 'a', pos: 8, vol: 1000, visits: 0 }] } }) > 0, 'a striking-distance task has value')
  const mt = marketTaskCandidates([{ id: 't1', title: 'x', owner: 'Sukrithi', market: 'india', size: 'S', status: 'not', decision: { choice: 'reject', reason: 'not relevant' },
    how: { kind: 'strike', url: 'https://www.movingwalls.com/locations/india', keywords: [] } }], new Set(['/blog/x']), PEOPLE_SEED)
  check(mt[0].stage === 'declined' && mt[0].declined?.reason === 'not relevant', "a lead's decline is carried with its reason")
  check(marketTaskCandidates([{ id: 't2', title: 'x', owner: null, market: 'india', size: 'S', status: 'not', decision: null,
    how: { kind: 'strike', url: 'https://www.movingwalls.com/locations/india/hyderabad', keywords: [] } }], new Set(['/locations/india/hyderabad']), PEOPLE_SEED).length === 0,
    'a market task that repeats a curated step on the same page is dropped')
}

// ── people
check(personByName(PEOPLE_SEED, 'Rifat')?.name === 'Rif', '"Rifat" on old tasks is Rif')
check(personByActor(PEOPLE_SEED, 'SUKRITI.TANEJA@movingwalls.com')?.name === 'Sukrithi', 'a guest is matched by email, any case')
check(personByActor(PEOPLE_SEED, 'owner')?.name === 'Rif', 'the owner session is Rif')
check(parsePeople('junk') === PEOPLE_SEED && parsePeople([{ name: 'X', email: 'x@y', role: 'market', markets: ['india'], hours: 2 }])[0].hours === 2, 'a bad stored directory falls back to the seed')

console.log(bad ? `\n${bad} FAILED` : '\nall passed')
process.exit(bad ? 1 : 0)
