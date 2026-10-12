// Measuring what a page is missing — and not inventing gaps that aren't there.
//   npx -y tsx --conditions=react-server tests/mw-page-gaps.test.mts
//
// Every case below is a false positive this module actually produced against
// the live site before it was caught. Both were the same mistake: a blunt text
// match standing in for a judgement, confident and wrong.

import { unanswered, distinctive, hasPricing, gapsOf, vagueHeadings, titleTail, type PageFacts, type PaidTerm } from '../lib/mw-page-gaps'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const page = (copy: string, h2: string[] = []): PageFacts =>
  ({ url: 'https://x/', title: null, metaDescription: null, h1: [], h2, copy })
const pt = (q: string, cost = 10, clicks = 5): PaidTerm => ({ q, cost, clicks, conv: 0, quality: 'BELOW_AVERAGE' })

// ── false positive #1: keyword strings are not prose ────────────────────────
// Reported S$169 of "unanswered" city searches on /locations/india — a page
// that names eleven Indian cities and links a dedicated page to each.
{
  const india = page('Explore by City. Bengaluru Mumbai Chennai Delhi Nagpur Pune Hyderabad ' +
    'Jaipur Kolkata Ahmedabad Kerala. Hoarding advertising agency across India.')
  is(unanswered([pt('advertising agency ooh mumbai')], india).length === 0,
     'a city the page names is not an unanswered search, whatever the keyword string looks like')
  is(unanswered([pt('billboard companies bangalore')], india).length === 1,
     'but Bangalore spelled differently to Bengaluru IS flagged — it is a real wording gap')
  is(unanswered([pt('hoardings in indore')], india).length === 1,
     'and a city that genuinely is not there is still caught')
  is(distinctive('advertising agency ooh mumbai').join() === 'mumbai',
     'the OOH vocabulary is stripped, leaving only what distinguishes the search')
  is(distinctive('billboard advertising cost').length === 0,
     'a search with nothing distinctive left is not evidence of anything')
  is(unanswered([pt('billboard advertising cost')], india).length === 0,
     'so it does not get reported as unanswered')
}

// ── false positive #2: "rate" is not a price ────────────────────────────────
// Marked /locations/malaysia as having pricing content on the strength of
// "the urbanization rate in Malaysia is about 76%", suppressing the pricing
// section on seven pages.
{
  is(!hasPricing('The urbanization rate in Malaysia is about 76%, reflecting a high concentration.'),
     'a demographic rate is not pricing content')
  is(!hasPricing('Our platform 2024 release brings new formats.'),
     'and "platform 2024" is not a money figure — the currency codes need a word boundary')
  is(!hasPricing('We offer cost-effective, high-impact outdoor advertising.'),
     'nor is "cost-effective" marketing copy')
  is(hasPricing('Static billboards start from RM 8,000 a month.'), 'a real figure counts')
  is(hasPricing('Download our rate card'), 'so does a rate card')
  is(hasPricing('Billboard advertising costs vary by site.'), 'and a price word bound to what is sold')
  is(hasPricing('Berapa harga sewa billboard?'), 'a non-English price word is never incidental')
  is(hasPricing('How much does a billboard cost?'), 'and the question itself counts')
}

// ── the gaps that drive a proposal ──────────────────────────────────────────
{
  const p = page('Billboard advertising in Indonesia. Jakarta and Surabaya. Our platform.')
  const gaps = gapsOf(
    [pt('harga sewa billboard', 23.44, 35), pt('sewa billboard', 19.68, 26), pt('videotron jakarta', 5.27, 7)],
    [], p)
  is(gaps.some(g => g.kind === 'price'), 'no pricing copy plus people searching prices is a price gap')
  is(gaps.some(g => g.kind === 'language'), 'and paid searches in another language are a gap of their own')
  const lang = gaps.find(g => g.kind === 'language')!
  is(lang.cost > 40, 'sized by what it is costing, which is what makes it worth acting on')
  is(!gaps.some(g => g.paid.some(t => t.q === 'videotron jakarta' && g.kind === 'place')),
     'Jakarta is named on the page, so it is not also reported as a place gap')
}
{
  const priced = page('Billboard advertising costs from RM 8,000. Kuala Lumpur.')
  is(!gapsOf([pt('billboard price malaysia')], [], priced).some(g => g.kind === 'price'),
     'a page that does state prices gets no price gap')
}

// ── headings and titles ─────────────────────────────────────────────────────
{
  is(vagueHeadings(['Media Types Available', 'Explore by City', 'Market Landscape']).length === 2,
     'deck labels are picked out and real headings left alone')
  is(vagueHeadings(['Billboard Advertising in Malaysia']).length === 0, 'a heading that says something is kept')
}
{
  const t = titleTail('Out of Home Advertising Malaysia: Maximize Your Brand Visibility')
  is(t?.head === 'Out of Home Advertising Malaysia', 'the subject half of a title is identified')
  is(t?.tail === 'Maximize Your Brand Visibility', 'and the marketing half, which is the part that can be spent')
  is(titleTail('Billboard Advertising Singapore') === null,
     'a title with no obvious split returns null rather than inventing one and cutting the wrong half')
  is(titleTail(null) === null, 'and a missing title is not a crash')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
