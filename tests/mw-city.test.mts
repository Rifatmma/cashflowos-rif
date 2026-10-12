// The city pages: does the audit say only what it can show?
//   npx -y tsx --conditions=react-server tests/mw-city.test.mts
//
// Written from the real audit of all 38. The temptation here is to hand every
// market lead a task by declaring the quiet pages broken. They are not: they
// run 750-1,270 words, share only their footer with each other, and are all
// linked from their country page. Inventing a fault for them would be the same
// mistake as the keyword-string and "urbanization rate" false positives —
// a measure standing in for a judgement.

import { readCity, readCities, misrouted, nearMisses, citySummary, type CityFacts } from '../lib/mw-city'

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
  is(/not proof it is failing/.test(f.says), 'and it refuses to call an unseen page a failing page')
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
  is(/not the same as being broken/.test(s), 'and carries the caveat about the quiet ones into the headline')
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

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
