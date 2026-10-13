// Two of our pages in ONE country's results — and nothing else.
//   npx -y tsx --conditions=react-server tests/mw-contested.test.mts
//
// The first version of this grouped by market and told the pages specialist to
// pick one owner for "billboard advertising" across Indonesia, the Philippines
// and the UAE. The owner stopped it on the first card he read, and the data he
// was looking at proves him right:
//
//   /locations/indonesia    #9   in INDONESIA
//   /locations/philippines  #23  in the PHILIPPINES
//   /locations/uae/dubai    #24  in the UAE
//
// Three countries, three pages, each serving its own searchers. That is
// correct targeting, not cannibalisation.

import { clashes, clashTitle, clashWhy, clashSteps, isNested, countryName, type GeoRow } from '../lib/mw-contested'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const row = (page: string, country: string, position: number, impressions = 30, query = 'billboard advertising'): GeoRow =>
  ({ query, page, country, position, impressions })

// ── the false positive this exists to stop ─────────────────────────────────
{
  const found = clashes([
    row('/locations/indonesia', 'IDN', 9, 22),
    row('/locations/philippines', 'PHL', 23, 24),
    row('/locations/uae/dubai', 'ARE', 24, 28),
    row('/locations/australia', 'AUS', 36, 18),
  ])
  is(found.length === 0,
     'one page per country for the same phrase is correct targeting, not a clash')
}

// ── the real ones, from the same pull ──────────────────────────────────────
{
  const found = clashes([
    row('/locations/indonesia', 'IDN', 9, 22),
    row('/locations/philippines', 'PHL', 23, 24),
    row('/locations/indonesia/jakarta', 'PHL', 18, 2),   // a Jakarta page, in the Philippines
  ])
  is(found.length === 1, 'two different pages in ONE country is a clash')
  const c = found[0]
  is(c.country === 'PHL', 'reported against the country whose results they share')
  is(c.owner === '/locations/indonesia/jakarta', 'the better-placed page is proposed as the one to keep')
  is(!c.nested, 'two unrelated pages are not a hierarchy')
  is(/Philippines/.test(clashTitle(c)), 'the title names the country, not a market')
  is(/other countries ranking for it separately is correct/.test(clashWhy(c)),
     'and it says outright that other countries are left alone')
  is(clashSteps(c).some(s => /Leave every other country alone/.test(s)),
     'the steps repeat it where somebody acting on it will read it')
}

// ── a page and the page beneath it ─────────────────────────────────────────
{
  // Both inside the top thirty on purpose. In the live pull the real pair was
  // /locations/india at #71 against /locations/india/delhi at #8 — and #71 is
  // correctly NOT a clash, because a page nobody sees is not competing for
  // anything. That rule is checked below.
  const found = clashes([
    row('/locations/india', 'IND', 22, 30),
    row('/locations/india/delhi', 'IND', 8, 40),
  ])
  is(found.length === 1, 'a country page and its own city page in one country is reported')
  is(found[0].nested, 'but marked as a hierarchy')
  is(/outranking/.test(clashTitle(found[0])), 'and titled as one level outranking another')
  is(!clashSteps(found[0]).some(s => /take the phrase out of the title/.test(s)),
     'never told to strip the phrase — that is bad advice for a parent and its child')
  is(clashSteps(found[0]).some(s => /A city page answering a city search is right/.test(s)),
     'it asks which LEVEL should answer instead')
  is(isNested('/locations/india/delhi', '/locations/india'), 'nesting is detected either way round')
  is(!isNested('/locations/indonesia', '/locations/india'), 'and a shared prefix is not nesting')
}

// ── the thresholds ─────────────────────────────────────────────────────────
{
  is(clashes([row('/a', 'IDN', 5, 2), row('/b', 'IDN', 9, 3)]).length === 0,
     'five impressions between them is not worth anyone opening a page')
  is(clashes([row('/a', 'IDN', 5, 40), row('/b', 'IDN', 44, 40)]).length === 0,
     'a page past #30 is absent from the results, not competing in them')
  is(clashes([row('/locations/india', 'IND', 71, 40), row('/locations/india/delhi', 'IND', 8, 40)]).length === 0,
     'which is why the live India pair — #71 against #8 — is correctly not raised')
  is(clashes([row('/a', 'IDN', 5, 40), row('/a', 'IDN', 7, 40)]).length === 0,
     'the same page twice is one page')
  const two = clashes([
    row('/a', 'IDN', 5, 40), row('/b', 'IDN', 9, 40),
    row('/c', 'MYS', 4, 400, 'other search'), row('/d', 'MYS', 6, 400, 'other search'),
  ])
  is(two.length === 2 && two[0].country === 'MYS', 'findings are ordered by how many people see them')
}
{
  is(countryName('PHL') === 'the Philippines' && countryName('ARE') === 'the UAE',
     'countries read as a person would say them')
  is(countryName('XYZ') === 'XYZ', 'and an unknown code is passed through rather than guessed')
}

// clashes() is pure and does not know whose site this is, so brand filtering
// is the caller's job and happens in mw-plan. Noted here because dropping that
// filter in the rewrite produced eight findings and every one of them was our
// own company name.
{
  const brandish = clashes([
    row('/locations/india', 'IND', 4, 200, 'moving walls'),
    row('/locations/india/delhi', 'IND', 9, 200, 'moving walls'),
  ])
  is(brandish.length === 1, 'clashes() does not judge the query — the caller filters brand terms first')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
