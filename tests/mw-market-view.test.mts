// Does a market page show exactly one market's work, and is the money real?
//   npx -y tsx --conditions=react-server tests/mw-market-view.test.mts
//
// Two things this has to get right, both of which it got wrong first:
//
//  1. WHOSE WORK IS IT. Filtering the old single page to the India lead still
//     showed her Dubai, Osaka and Johannesburg, because city pages and page
//     changes carry a URL rather than a market key and nothing resolved them.
//  2. HOW MUCH IS AT STAKE. Summing the evidence across changes counted one
//     keyword several times — SEA read S$265.31 against a real S$137.05.
//     A headline number twice the truth is worse than no headline number.

import { marketOfUrl, atRiskOf } from '../lib/mw-market-view'
import { stageOfAction, stageOfCity, stageOfProposal, rollup, rollupLine, isOpen } from '../lib/mw-status'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

// ── which market does this page belong to? ─────────────────────────────────
{
  is(marketOfUrl('/locations/india/mumbai') === 'india', 'a city page resolves to its market')
  is(marketOfUrl('/locations/india') === 'india', 'so does a country page')
  is(marketOfUrl('https://www.movingwalls.com/locations/uae/dubai') === 'mena',
     'a full URL resolves, and Dubai is MENA — not India, which is what the old filter leaked')
  is(marketOfUrl('/locations/malaysia') === 'sea', 'Malaysia is SEA')
  is(marketOfUrl('/locations/japan/osaka') === 'japan', 'Osaka is Japan')
  is(marketOfUrl('/locations/india/mumbai/') === 'india', 'a trailing slash does not break it')
  is(marketOfUrl('/blog/something') === null, 'a page outside /locations belongs to no market')
  is(marketOfUrl('/locations/atlantis') === null, 'and an unknown country is null rather than a guess')
}

// ── the money, counted once ────────────────────────────────────────────────
const ev = (...pairs: [string, number][]) => ({ paid: pairs.map(([term, cost]) => ({ term, cost, clicks: 1, conv: 0 })) })
{
  // The real shape: one keyword cited by the title change AND the pricing
  // section on the same page.
  const risk = atRiskOf([], [
    { status: 'open', evidence: ev(['billboard price malaysia', 19.47], ['billboard malaysia', 12.74]) },
    { status: 'open', evidence: ev(['billboard price malaysia', 19.47]) },
  ])
  is(risk === 32.21, 'a keyword cited by two changes is counted once, not twice')
}
{
  is(atRiskOf([], [{ status: 'rejected', evidence: ev(['x', 50]) }]) === 0, 'a rejected change is not money at risk')
  is(atRiskOf([], [{ status: 'approved', evidence: ev(['x', 50]) }]) === 0, 'nor is one already approved')
  is(atRiskOf([], []) === 0, 'nothing open is zero, not NaN')
}
{
  const cities = [{ status: 'not_started', cost: 46.31, terms: ['ooh mumbai'], kind: 'misrouted' }]
  is(atRiskOf(cities, []) === 46.31, 'a misrouted city counts on its own')
  is(atRiskOf(cities, [{ status: 'open', evidence: ev(['ooh mumbai', 31.92]) }]) === 31.92,
     'but not again when a page change already cites the same search')
  is(atRiskOf([{ ...cities[0], status: 'done' }], []) === 0, 'and a city marked done stops counting')
  is(atRiskOf([{ status: 'not_started', cost: 99, terms: [], kind: 'quiet' }], []) === 0,
     'a quiet page has no money on it, whatever cost field it carries')
}

// ── one vocabulary over three stores ───────────────────────────────────────
{
  is(stageOfAction('not', null) === 'not_started', 'a fresh task is not started')
  is(stageOfAction('part', null) === 'in_progress', 'the planner\'s "part" is in progress')
  is(stageOfAction('not', 'accept') === 'in_progress', 'and a lead accepting it is too')
  is(stageOfAction('done', null) === 'done' && stageOfAction('not', 'done') === 'done',
     'done from either side is done')
  is(stageOfAction('not', 'reject') === 'declined', 'a decline is its own state, not a failure to start')
  is(stageOfAction('moot', 'accept') === 'moot', 'no-longer-applies beats anything a lead said earlier')
}
{
  is(stageOfProposal('approved') === 'in_progress',
     'an approved page change is decided but not shipped, so it reads as in progress')
  is(stageOfProposal('rejected') === 'declined' && stageOfProposal('gone') === 'moot',
     'rejected and gone keep their meanings')
  is(stageOfCity('in_progress') === 'in_progress' && stageOfCity(null) === 'not_started',
     'city status maps straight through')
}
{
  const r = rollup(['not_started', 'in_progress', 'done', 'declined', 'moot'])
  is(r.open === 2, 'open counts the two that are still somebody\'s problem')
  is(r.done === 1 && r.declined === 2, 'and closed work is split between done and decided against')
  is(isOpen('declined') === false, 'a decline is closed, not outstanding')
  is(/2 open/.test(rollupLine(r)) && /1 done/.test(rollupLine(r)), 'the one-line summary reads naturally')
  is(/S\$46\.31/.test(rollupLine(r, 46.31)), 'and carries the money when there is any')
  is(rollupLine(rollup([])) === 'Nothing open', 'an empty market says so plainly')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
