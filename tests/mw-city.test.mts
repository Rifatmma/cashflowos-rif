// The city pages: does the audit say only what it can show?
//   npx -y tsx --conditions=react-server tests/mw-city.test.mts
//
// Written from the real audit of all 38. The temptation here is to hand every
// market lead a task by declaring the quiet pages broken. They are not: they
// run 750-1,270 words, share only their footer with each other, and are all
// linked from their country page. Inventing a fault for them would be the same
// mistake as the keyword-string and "urbanization rate" false positives —
// a measure standing in for a judgement.

import { readCity, readCities, misrouted, nearMisses, citySummary, expectedCtr, type CityFacts } from '../lib/mw-city'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const city = (o: Partial<CityFacts>): CityFacts => ({
  url: '/locations/india/mumbai', city: 'Mumbai', countryUrl: '/locations/india',
  countryLabel: 'India', market: 'india', words: 1065, title: 'Outdoor Advertising in Mumbai',
  ranked: [], paid: [], ...o,
})

// ── the finding that is costed and certain ──────────────────────────────────
{
  const mumbai = city({
    ranked: [{ q: 'moving walls india private limited', pos: 74, vol: 590 }],
    paid: [
      { q: 'advertising agency ooh mumbai', cost: 31.92, clicks: 17, conv: 0, lands: '/locations/india' },
      { q: 'ooh advertising mumbai', cost: 14.39, clicks: 11, conv: 0, lands: '/locations/india' },
    ],
  })
  const f = readCity(mumbai)!
  is(f.kind === 'misrouted', 'paid clicks landing on the country page is the headline finding')
  is(/S\$46\.31/.test(f.says), 'and it is costed, not described')
  is(/already exists/.test(f.says), 'and says the city page is already there, which is what makes it absurd')
  is(/None of them converted/.test(f.says), 'zero conversions is stated rather than left to be noticed')
  is(f.cost === 46.31 && f.clicks === 28, 'the money and the clicks are summed across the terms')
}
{
  // Clicks that DO reach the city page are not a problem.
  const f = readCity(city({ paid: [{ q: 'billboard mumbai', cost: 9, clicks: 4, conv: 1, lands: '/locations/india/mumbai' }] }))!
  is(f.kind !== 'misrouted', 'a city page that receives its own paid clicks is not reported as misrouted')
  is(misrouted(city({ paid: [{ q: 'x', cost: 9, clicks: 4, conv: 0, lands: '/locations/india/mumbai/' }] })).clicks === 0,
     'and a trailing slash does not make a page look like a different page')
}

// ── on page two ─────────────────────────────────────────────────────────────
{
  const bengaluru = city({
    url: '/locations/india/bengaluru', city: 'Bengaluru',
    ranked: [
      { q: 'advertising boards near me', pos: 14, vol: 110 },
      { q: 'billboards near me', pos: 15, vol: 210 },
      { q: 'moving walls india private limited', pos: 45, vol: 590 },
    ],
  })
  const f = readCity(bengaluru)!
  is(f.kind === 'near', 'a page ranking 4-20 is a push, not a rebuild')
  is(/#14/.test(f.says) && /advertising boards near me/.test(f.says), 'named by its best position and the search behind it')
  is(nearMisses(bengaluru).length === 2, 'and #45 is not counted as a near miss')
}
{
  const delhi = city({ url: '/locations/india/delhi', city: 'Delhi', ranked: [{ q: 'delhi hoardings', pos: 4, vol: 110 }] })
  is(readCity(delhi)!.kind === 'near', '#4 is still a push — top three is the prize, not top ten')
}

// ── the quiet ones, where the honest answer is "we cannot see" ──────────────
{
  const f = readCity(city({ url: '/locations/japan/osaka', city: 'Osaka', words: 753 }))!
  is(f.kind === 'quiet', 'no ranking and no spend is its own category')
  // Wording changed when Search Console was connected: the honest line used to
  // be "not proof it is failing, proof we cannot see it". Now we can see, so it
  // says what it sees — but still never blames the page.
  is(/neither Semrush nor Search Console/.test(f.says), 'with no data from either source, it says exactly that')
  is(/753 words/.test(f.says) && /linked from/.test(f.says),
     'it states what was actually checked — length and linking — rather than guessing')
  // Word boundaries. Without them /thin/ matched "no(thin)g is being spent" —
  // the fourth substring false positive in this project today, this time in a
  // test written to catch exactly that class of mistake.
  is(!/(thin|duplicate|broken|rewrite|poor|weak)/i.test(f.says),
     'and never invents a content fault to manufacture a task')
  is(f.cost === 0, 'with no money on it, so it sorts below the real problems')
}

// ── ordering and the headline ───────────────────────────────────────────────
{
  const all = readCities([
    city({ url: '/locations/japan/osaka', city: 'Osaka' }),
    city({ url: '/locations/india/delhi', city: 'Delhi', ranked: [{ q: 'delhi hoardings', pos: 4, vol: 110 }] }),
    city({ paid: [{ q: 'ooh mumbai', cost: 46.31, clicks: 28, conv: 0, lands: '/locations/india' }] }),
  ])
  is(all.map(f => f.kind).join() === 'misrouted,near,quiet', 'money first, then winnable, then unknown')
  const s = citySummary(all)
  is(/1 are being paid for and bypassed/.test(s) || /being paid for and bypassed/.test(s), 'the summary leads with the money')
  is(/barely shown at all/.test(s), 'and the quiet ones are described by how little Google shows them')
}

// A page that ranks, just not close enough to push, must not read as "no
// position". /locations/uae/dubai is #23 for "billboard advertising" (210 a
// month), which the first version reported as nothing at all.
{
  const dubai = city({
    url: '/locations/uae/dubai', city: 'Dubai', market: 'mena',
    ranked: [{ q: 'billboard advertising', pos: 23, vol: 210 }],
  })
  const f = readCity(dubai)!
  is(f.kind === 'quiet', '#23 is not a push — it sits below the near-miss band')
  is(/#23/.test(f.says) && /billboard advertising/.test(f.says), 'but the position it does hold is stated')
  is(!/no position/.test(f.says), 'and it is never described as having no position')
  is(f.pos === 23, 'the position is carried through for ordering')
}

// ── what Search Console changed ────────────────────────────────────────────
// Before it was connected the only honest verdict for 29 of the 38 was "we
// cannot see". Google's own numbers say almost none of them were dead, and
// they split into three different jobs for three different people.
{
  // Hyderabad: #8.8, 646 impressions, 5 clicks. The ranking is fine; the
  // listing is losing. A title and a description, no content work at all.
  const f = readCity(city({
    url: '/locations/india/hyderabad', city: 'Hyderabad',
    gsc: { impressions: 646, clicks: 5, ctr: 0.0077, position: 8.77 },
  }))!
  is(f.kind === 'lowctr', 'ranking well with nobody clicking is its own finding')
  is(/The ranking is fine/.test(f.says), 'and it says so, so nobody rewrites a page that is working')
  is(/0\.77%/.test(f.says), 'with the actual click rate in it')
  is(/about 3%/.test(f.says), 'against what that position normally returns — #8.8 falls in the 10-and-above band')
}
{
  // Ras Al Khaimah: 236 impressions, zero clicks, #26. Real demand, buried.
  const f = readCity(city({
    url: '/locations/uae/ras-al-khaimah', city: 'Ras Al Khaimah',
    gsc: { impressions: 236, clicks: 0, ctr: 0, position: 26.16 },
  }))!
  is(f.kind === 'deep', 'plenty of impressions from page three is a different job again')
  is(/no clicks at all/.test(f.says), 'and zero clicks is stated plainly')
  is(/demand is real/.test(f.says), 'the demand is credited and the position blamed')
}
{
  // Jaipur: 15 impressions. Genuinely almost nobody sees it.
  const f = readCity(city({
    url: '/locations/india/jaipur', city: 'Jaipur', words: 854,
    gsc: { impressions: 15, clicks: 0, ctr: 0, position: 16.87 },
  }))!
  is(f.kind === 'quiet', 'below the impression floor stays quiet rather than inventing a job')
  is(/the page is not the problem/.test(f.says), 'and still refuses to blame the page')
  is(/15 times/.test(f.says), 'but now says how little it was shown, which it could not say before')
}
{
  const f = readCity(city({
    gsc: { impressions: 383, clicks: 4, ctr: 0.0104, position: 20.47 },
    paid: [{ q: 'ooh mumbai', cost: 46.31, clicks: 28, conv: 0, lands: '/locations/india' }],
  }))!
  is(f.kind === 'misrouted', 'paid clicks going to the wrong page still outrank everything Google says')
}
{
  is(expectedCtr(1) > expectedCtr(5) && expectedCtr(5) > expectedCtr(20), 'expected CTR falls with position')
  const fine = readCity(city({ gsc: { impressions: 1000, clicks: 40, ctr: 0.04, position: 8 } }))!
  is(fine.kind !== 'lowctr', 'a listing performing at its position is not reported as a problem')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
