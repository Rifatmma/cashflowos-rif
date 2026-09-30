// The market planner, against a fixture. No network.
//   npx -y tsx --conditions=react-server tests/mw-plan.test.mts
//
// What matters here is not that it produces tasks, but that every task a market
// lead opens tells them what to do: a target URL, numbered steps, the keywords
// with their positions, and a line saying when it is finished. A market with no
// data must produce nothing invented.
import { MARKETS, MARKET } from '../lib/mw-markets'
import { buildPlan, tasksFor, pick, loadByOwner, upside, ctrAt, type MarketRow, type PlanInput } from '../lib/mw-plan'

let bad = 0
const fail = (m: string) => { console.log(`FAIL ${m}`); bad++ }
const ok = (m: string) => console.log(`ok   ${m}`)

const row = (o: Partial<MarketRow>): MarketRow => ({
  query: 'dooh advertising', page: 'https://www.movingwalls.com/locations/india',
  country: 'IND', visits: 0, volume: 100, ctr: 0, position: 12, ...o,
})

const input: PlanInput = {
  cycle: '2026-W40',
  markets: MARKETS,
  pages: ['/locations/india', '/locations/uae', '/blog/dooh-india-guide', '/locations/malaysia'],
  ga4: [
    { country: 'India', sessions: 1200, users: 900, leads: 14 },
    { country: 'Japan', sessions: 80, users: 70, leads: 0 },
    { country: 'Australia', sessions: 40, users: 35, leads: 0 },
  ],
  rows: [
    // India — a striking-distance cluster on the market page
    row({ query: 'dooh advertising india', position: 11, volume: 900, visits: 4, ctr: 0.004 }),
    row({ query: 'programmatic dooh india', position: 14, volume: 480, visits: 1, ctr: 0.002 }),
    row({ query: 'digital billboard advertising india', position: 9, volume: 300, visits: 6, ctr: 0.02 }),
    // India — already won, and OUTSIDE striking distance, so it is ground to
    // hold rather than a target. Without a row like this there is nothing for
    // the "do not lose these" list to carry.
    row({ query: 'ooh advertising india', position: 2, volume: 640, visits: 180, ctr: 0.28 }),
    row({ query: 'billboard company india', position: 3, volume: 210, visits: 44, ctr: 0.21 }),
    // India — a city with demand and no page
    row({ query: 'billboard advertising bengaluru', position: 17, volume: 260, visits: 0, ctr: 0 }),
    row({ query: 'dooh bengaluru cost', position: 19, volume: 90, visits: 0, ctr: 0 }),
    // India — a blog that ranks on its own
    row({ query: 'diwali advertising', page: 'https://www.movingwalls.com/blog/dooh-india-guide', position: 8, volume: 700, visits: 9, ctr: 0.013 }),
    // MENA — lots of impressions, almost no visits: a title problem
    ...Array.from({ length: 4 }, (_, i) => row({
      query: `dooh dubai ${i}`, country: 'ARE', page: 'https://www.movingwalls.com/locations/uae',
      position: 7, volume: 400, visits: 1, ctr: 0.0025,
    })),
    // Philippines — real demand, and no page exists for it at all
    row({ query: 'ooh advertising philippines', country: 'PHL', page: 'https://www.movingwalls.com/', position: 15, volume: 350, visits: 2, ctr: 0.006 }),
    row({ query: 'billboard manila', country: 'PHL', page: 'https://www.movingwalls.com/', position: 22, volume: 180, visits: 0, ctr: 0 }),
  ],
}

// ── the shape every task must have ───────────────────────────────────────────
const plan = buildPlan(input)
for (const t of plan) {
  const missing = [
    !t.title && 'title', !t.why && 'why', !t.steps?.length && 'steps',
    !t.url && 'url', !t.size && 'size', !t.doneWhen && 'doneWhen', !t.id && 'id',
  ].filter(Boolean)
  if (missing.length) fail(`${t.id || '(no id)'} is missing ${missing.join(', ')}`)
  if (t.steps.some(s => !s || s.length < 10)) fail(`${t.id} has an empty or stub step`)
  if (!['S', 'M', 'L'].includes(t.size)) fail(`${t.id} has size "${t.size}"`)
}
if (!bad) ok(`all ${plan.length} tasks carry a title, why, steps, url, size and doneWhen`)

// -- a rewrite must be told what the page already wins ----------------------
// Adding keywords to a page and quietly losing the ones it already ranks for
// is the classic way this work goes backwards.
const rewrites = plan.filter(t => t.kind === 'strike' || t.kind === 'no-clicks')
const withHolds = rewrites.filter(t => t.holds.length > 0)
if (!rewrites.length) fail('no rewrite tasks in the fixture to check')
else if (!withHolds.length) fail('no rewrite task lists the rankings its page already holds')
else ok(`${withHolds.length} of ${rewrites.length} rewrite tasks name the top-ten rankings they must protect`)

for (const t of withHolds) {
  if (t.holds.some(h => h.pos > 10)) { fail(`${t.id} lists a position outside the top ten as "already winning"`); break }
  if (t.holds.some(h => /moving ?walls?/i.test(h.q))) { fail(`${t.id} lists a brand search as something to protect`); break }
}
if (withHolds.every(t => t.holds.every(h => h.pos <= 10 && !/moving ?walls?/i.test(h.q)))) {
  ok('protected rankings are all top ten and none of them are our own name')
}

// A keyword must never be listed as both "push this up" and "do not lose this".
const contradictory = withHolds.filter(t => {
  const target = new Set(t.keywords.map(k => k.q.toLowerCase()))
  return t.holds.some(h => target.has(h.q.toLowerCase()))
})
if (contradictory.length) fail(`${contradictory.map(t => t.id).join(', ')} list the same search as both a target and something to protect`)
else ok('no search is listed as both a target and something to protect')

if (withHolds.some(t => !t.steps.some(s => /already wins|already ranks/i.test(s)))) {
  fail('a task lists rankings to protect but never says so in the steps')
} else ok('the steps tell the lead in words, not just in a table')

// -- at most three FINDINGS per market, strongest first ----------------------
// The cap is on findings, not tasks: one missing page is one thing to decide,
// even though it lands as a copy task and a build task on two people.
for (const m of MARKETS) {
  const mine = plan.filter(t => t.market === m.key)
  const findings = new Set(mine.map(t => t.group ?? t.id))
  if (findings.size > 3) fail(`${m.label} got ${findings.size} findings, cap is 3`)
  for (let i = 1; i < mine.length; i++) {
    if (mine[i - 1].score < mine[i].score) fail(`${m.label} tasks are not ranked (${mine[i - 1].score} before ${mine[i].score})`)
  }
}
ok('no market exceeds three findings, and each market is ranked by upside')

// ── a new page is two tasks: the lead writes, the specialist builds ───────
const BUILD = new Set(['page-build', 'city-build'])
const builds = plan.filter(t => BUILD.has(t.kind))
if (!builds.length) fail('no page-build tasks in the fixture to check against')
else if (builds.some(t => t.owner !== 'Dinesh')) fail('a page build is not owned by the pages specialist')
else ok(`${builds.length} page builds owned by Dinesh, each an hour of templated work`)

// Every build has its copy task, owned by the market lead, still in the plan.
for (const b of builds) {
  const copy = plan.find(t => t.id === b.blockedBy?.id)
  if (!copy) { fail(`${b.id} waits on a copy task that was trimmed out of the plan`); break }
  if (copy.owner === 'Dinesh') { fail(`${copy.id} should belong to the market lead, not the builder`); break }
  if (copy.group !== b.group) { fail(`${b.id} and ${copy.id} are not paired`); break }
}
if (builds.every(b => { const c = plan.find(t => t.id === b.blockedBy?.id); return c && c.owner !== 'Dinesh' && c.group === b.group })) {
  ok('every build is paired with a copy task owned by that market’s lead')
}

// The copy has to come first, or the build is unstartable.
const misordered = builds.filter(b => plan.indexOf(b) < plan.findIndex(t => t.id === b.blockedBy?.id))
if (misordered.length) fail(`build listed before its copy: ${misordered.map(t => t.id).join(', ')}`)
else ok('the copy task is always listed before the build it unblocks')

// Content and linking stay with the market, not the specialist.
const kept = plan.filter(t => t.kind === 'strike' || t.kind === 'orphan')
if (kept.some(t => t.owner === 'Dinesh')) fail('content tasks wrongly routed to the pages specialist')
else ok(`${kept.length} content and linking tasks stay with the market lead`)

// With nobody named, the work must not fall in a hole.
const solo = buildPlan({ ...input, specialists: { pages: null } })
if (solo.filter(t => BUILD.has(t.kind)).some(t => !t.owner)) fail('build tasks lose their owner when no specialist is named')
else ok('with no specialist named, builds fall back to the market lead')

// ── every task has an owner, because every market has one ────────────────────
const orphanTasks = plan.filter(t => !t.owner)
if (orphanTasks.length) fail(`${orphanTasks.length} tasks have no owner: ${orphanTasks.map(t => t.market).join(', ')}`)
else ok('every task carries an owner')

// ── India: the cluster, the city and the blog all surface ────────────────────
const india = plan.filter(t => t.market === 'india')
if (!india.some(t => t.kind === 'strike' && t.keywords.length >= 3)) fail('India has no striking-distance task')
else ok('India: striking-distance cluster found, with its keywords attached')

const bengaluru = tasksFor(MARKET.india, input).find(t => t.kind === 'city')
if (!bengaluru || !bengaluru.url.includes('bengaluru')) fail('India: the Bengaluru city gap was not spotted')
else if (!bengaluru.steps.join(' ').includes('/locations/india/bengaluru')) fail('India: the city task does not name the URL to create')
else ok(`India: city gap -> ${bengaluru.url}`)

// ── MENA: seen a lot, clicked never ──────────────────────────────────────────
const mena = plan.filter(t => t.market === 'mena')
if (!mena.some(t => t.kind === 'no-clicks')) fail('MENA: the click-through problem was not spotted')
else ok('MENA: title and description task raised on high-volume, low-visit searches')

// ── Philippines: demand, no page ─────────────────────────────────────────────
const ph = tasksFor(MARKET.philippines, input)
if (!ph.length) fail('Philippines: demand exists but produced no task')
else ok(`Philippines: ${ph.length} task(s), owner ${ph[0].owner}`)

// ── a market with nothing must not be given invented work ────────────────────
const africa = tasksFor(MARKET.africa, input)
if (africa.some(t => t.kind !== 'blind')) fail('Africa has no data but was given real work')
else ok('Africa: no data, so it says so rather than inventing a task')

// ── the ranking maths ────────────────────────────────────────────────────────
if (!(ctrAt(2) > ctrAt(8) && ctrAt(8) > ctrAt(18))) fail('the click-through curve is not monotonic')
else if (!(upside({ volume: 1000, position: 15, ctr: 0.005 }) > upside({ volume: 100, position: 15, ctr: 0.005 }))) {
  fail('upside does not scale with search volume')
} else ok('upside ranks bigger opportunities higher')

// ── load per person adds up ──────────────────────────────────────────────────
// "Nothing to act on yet" is not work, so it must not show as load on anybody.
const load = loadByOwner(plan)
const real = plan.filter(t => t.kind !== 'blind')
const counted = load.reduce((t, l) => t + l.tasks, 0)
if (counted !== real.length) fail(`load per person counts ${counted} of ${real.length} real tasks`)
else if (load.some(l => l.weight < l.tasks)) fail('a task weighs less than one')
else ok(`load per person: ${load.map(l => `${l.owner} ${l.tasks} (${l.weight}pt)`).join(' · ')}`)

// ── running it twice changes nothing ─────────────────────────────────────────
const again = buildPlan(input)
if (JSON.stringify(again.map(t => t.id)) !== JSON.stringify(plan.map(t => t.id))) fail('ids are not stable between runs')
else ok('ids are stable, so a re-run updates rather than duplicates')

console.log(bad ? `\n${bad} failing` : `\nall good — ${plan.length} tasks across ${new Set(plan.map(t => t.market)).size} markets`)
process.exitCode = bad ? 1 : 0

// -- a source going dark must not retire the work it found last time --------
// Real incident: Semrush returned WRONG KEY while GA4 answered fine, and the
// run retired twenty tasks that were all still true.
{
  // A live page with real on-page faults — the audit needs no API, so it
  // must keep working when every keyword source is dark.
  const audited = {
    '/locations/india': {
      url: 'https://www.movingwalls.com/locations/india', ok: true, status: 200,
      title: 'x'.repeat(74), titleLen: 74, metaDesc: null, metaLen: 0,
      h1: ['DOOH India'], words: 900, schema: ['Organization'], canonical: null,
      ogImage: true, internalOut: 9, score: 58,
      faults: [
        { key: 'title-long', says: 'The title is 74 characters.', fix: 'Trim it.', weight: 12 },
        { key: 'desc-missing', says: 'There is no meta description.', fix: 'Write one.', weight: 18 },
      ],
    },
  } as any

  const blindToRankings = buildPlan({ ...input, rows: [], health: audited })
  const kinds = new Set(blindToRankings.map(t => t.kind))
  if (kinds.has('strike') || kinds.has('cannibal')) {
    fail('ranking tasks were produced with no ranking data')
  } else ok('with no ranking data, no ranking tasks are invented')

  // ...but the sources that DO still work must keep producing.
  if (!kinds.has('health')) fail('the page audit stopped producing when the keyword pull failed')
  else ok('page health still produces when the keyword source is dark — it needs no API')

  // The content gap comes from its own quarterly pull, so it must survive a
  // keyword outage too. It did not, and a Semrush 'WRONG KEY' quietly retired
  // every content brief on the board.
  const withGaps = buildPlan({
    ...input,
    rows: [],
    gaps: {
      india: [{
        head: 'billboard advertising', vol: 3500, kd: 28, cpc: 0.51,
        rivals: ['gohoardings.com'],
        keywords: [
          { q: 'billboard advertising', vol: 1900, kd: 30, cpc: 0.51, theirBest: 2, rival: 'gohoardings.com' },
          { q: 'billboard advertising cost', vol: 880, kd: 26, cpc: 0.44, theirBest: 9, rival: 'gohoardings.com' },
          { q: 'billboard advertising agency', vol: 720, kd: 28, cpc: 0.52, theirBest: 14, rival: 'gohoardings.com' },
        ],
      }],
    } as any,
  })
  if (!withGaps.some(t => t.kind === 'gap')) fail('the content gap stopped producing when the keyword pull failed')
  else ok('content briefs survive a keyword outage — they come from their own quarterly pull')
}
