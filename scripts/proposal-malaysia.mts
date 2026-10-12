// Build the proposal for /locations/malaysia and write it to docs/proposals/.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/proposal-malaysia.mts
//
// The first page done end to end, so the owner can judge the format before it
// runs across every market (owner, 12 Oct 2026).
//
// THE CHANGES ARE WRITTEN HERE, BY HAND, FROM THE REAL NUMBERS. That is
// deliberate for the first one: it sets the standard the generated ones have
// to meet. Every claim below traces to a query against mw_snapshots (paid) or
// mw_market_seo (organic), quoted in the `why`.

import { writeFileSync, mkdirSync } from 'fs'
import { buildProposal, type Change, type ProtectedTerm } from '../lib/mw-page-proposal'

const URL_ = 'https://www.movingwalls.com/locations/malaysia/'

// ── What the page already ranks for (mw_market_seo, cycle 2026-09) ──────────
// Straight out of docs/SEO-RANKING-PROTECTION.md. Only the binding bands.
const TERMS: ProtectedTerm[] = [
  { q: 'out of home media malaysia', pos: 8, band: 'locked' },
  { q: 'billboard price malaysia', pos: 8, band: 'locked' },
  { q: 'out of home advertising malaysia', pos: 11, band: 'protect' },
  { q: 'out of home', pos: 11, band: 'protect' },
  { q: 'billboard advertising malaysia', pos: 13, band: 'protect' },
  { q: 'digital billboard advertising malaysia', pos: 14, band: 'protect' },
  { q: 'digital billboard malaysia', pos: 16, band: 'protect' },
  { q: 'wilayah advertising', pos: 19, band: 'protect' },
  { q: 'billboard malaysia', pos: 21, band: 'protect' },
  { q: 'out of home advertising', pos: 21, band: 'protect' },
  { q: 'highway billboard advertising malaysia', pos: 22, band: 'protect' },
  { q: 'out of home media sdn bhd', pos: 26, band: 'protect' },
]

const changes: Change[] = [
  {
    id: 'title',
    kind: 'title',
    where: 'The page title, in the browser tab and the Google result',
    anchor: null,
    mode: 'replace',
    was: 'Out of Home Advertising Malaysia: Maximize Your Brand Visibility',
    now: 'Out of Home Advertising Malaysia — Billboard Prices, Sites & Availability',
    why: 'The first half is kept untouched on purpose: <b>out of home advertising malaysia</b> ' +
      'is in it and the page ranks #11 for exactly that, one place off page one. ' +
      '“Maximize Your Brand Visibility” ranks for nothing and buys nothing, so that is the half ' +
      'that goes — replaced with the words people are actually searching and we are already paying for.',
    evidence: {
      paid: [
        { term: 'billboard price malaysia', cost: 19.47, clicks: 30, conv: 0, quality: 'BELOW_AVERAGE' },
        { term: 'billboard cost malaysia', cost: 3.15, clicks: 4, conv: 0, quality: 'BELOW_AVERAGE' },
      ],
      organic: [
        { term: 'out of home advertising malaysia', pos: 11, vol: 260 },
        { term: 'billboard price malaysia', pos: 8, vol: 90 },
      ],
    },
  },
  {
    id: 'meta',
    kind: 'meta',
    where: 'The grey description line under the title in Google',
    anchor: null,
    mode: 'replace',
    was: 'Reach your audience effectively with DOOH advertising in Malaysia. From digital billboards to outdoor campaigns, boost brand awareness and engagement',
    now: 'Billboard and DOOH advertising in Malaysia — see sites in Kuala Lumpur, Selangor, Penang and Johor, with indicative rates and availability. Out of home advertising planned, booked and measured in one place.',
    why: 'The current line describes a benefit. The new one answers the question being asked — ' +
      'where are the sites, and what do they cost — which is what decides whether somebody clicks ' +
      'a result they can already see.',
    evidence: {
      paid: [{ term: 'billboard kuala lumpur', cost: 3.85, clicks: 5, conv: 0, quality: 'BELOW_AVERAGE' }],
    },
  },
  {
    id: 'h2-landscape',
    kind: 'heading',
    where: 'H2 #5, about two-thirds down, currently “Market Landscape”',
    anchor: 'Market Landscape',
    mode: 'replace',
    was: 'Market Landscape',
    now: 'Billboard Advertising Across Malaysia: Kuala Lumpur, Penang and Johor',
    why: '“Market Landscape” is a label from an internal deck — nobody searches it and it tells a ' +
      'reader nothing. The section underneath is <i>already</i> about Kuala Lumpur, Penang, Johor Bahru ' +
      'and Kota Kinabalu, so this is naming what is there rather than changing it. No body copy moves.',
    evidence: {
      paid: [
        { term: 'billboard malaysia', cost: 12.74, clicks: 17, conv: 0, quality: 'BELOW_AVERAGE' },
        { term: 'billboard kuala lumpur', cost: 3.85, clicks: 5, conv: 0, quality: 'BELOW_AVERAGE' },
      ],
      organic: [{ term: 'billboard advertising malaysia', pos: 13, vol: 260 }],
    },
  },
  {
    id: 'pricing',
    kind: 'section',
    where: 'A NEW section, immediately ABOVE the blue “Looking for a Billboard in Malaysia?” call-to-action band',
    anchor: 'Looking for a Billboard in Malaysia?',
    mode: 'before-section',
    was: null,
    now: `
  <h2>What Billboard Advertising Costs in Malaysia</h2>
  <p>Rates depend on the format, the site and how long you run. These are indicative
     ranges for planning a budget — every site is quoted individually, and availability
     changes week to week.</p>
  <h3>Static billboards and hoardings</h3>
  <p>Large-format roadside sites on arterial routes such as the Federal Highway, LDP and
     NPE. Typically booked by the month.</p>
  <p><b>Indicative: RM&nbsp;[ ] – RM&nbsp;[ ] a month</b></p>
  <h3>Digital billboards (DOOH)</h3>
  <p>Full-motion screens sold by share of loop, with day-part scheduling and proof of play.
     Shorter minimum commitments than static.</p>
  <p><b>Indicative: RM&nbsp;[ ] – RM&nbsp;[ ] a week</b></p>
  <h3>Transit — LRT, MRT and bus</h3>
  <p>Station panels, concourse domination and in-train screens across the Klang Valley
     network, plus bus exteriors in Kuala Lumpur.</p>
  <p><b>Indicative: RM&nbsp;[ ] – RM&nbsp;[ ] a month</b></p>
  <h3>Malls and retail</h3>
  <p>Screens and panels at the point of decision inside shopping centres including
     1 Utama, Sunway Pyramid and JB City Square.</p>
  <p><b>Indicative: RM&nbsp;[ ] – RM&nbsp;[ ] a month</b></p>
  <p><a href="/contact/"><b>Get a quote for a specific site →</b></a></p>
  <div class="mwp-todo"><b>Every bracket above is empty on purpose.</b> I will not write a
     price onto a public page from an ad report. These must come from the Malaysia rate card
     before this section is published — a wrong number here is worse than no section.</div>`,
    why: '<b>This is the single biggest hole on the page.</b> “billboard price malaysia” is the top ' +
      'paid term for it — 30 clicks, 0 conversions — and the page ranks #8 for the same words organically, ' +
      'yet there is not one price, range or “from RM” anywhere on it. Google rates the landing page ' +
      '<b>below average</b> on nearly every keyword pointing here, and this is why. ' +
      'It goes immediately above the CTA so the reader meets the cost answer and the enquiry button together, ' +
      'at the point they are deciding.',
    evidence: {
      paid: [
        { term: 'billboard price malaysia', cost: 19.47, clicks: 30, conv: 0, quality: 'BELOW_AVERAGE' },
        { term: 'billboard cost malaysia', cost: 3.15, clicks: 4, conv: 0, quality: 'BELOW_AVERAGE' },
        { term: 'lrt advertising', cost: 3.05, clicks: 4, conv: 0, quality: 'BELOW_AVERAGE' },
        { term: 'mrt advertising malaysia', cost: 2.27, clicks: 3, conv: 0, quality: 'BELOW_AVERAGE' },
      ],
      organic: [{ term: 'billboard price malaysia', pos: 8, vol: 90 }],
      placeholders: ['the four RM ranges, from the Malaysia rate card'],
    },
  },
  {
    id: 'faq',
    kind: 'section',
    where: 'Four NEW questions for the existing FAQ, shown as a block directly BELOW it',
    anchor: 'Frequently Asked Questions',
    mode: 'after-section',
    was: null,
    now: `
  <h2>Four questions to add to the FAQ above</h2>
  <p><i>Shown separately here so you can read them. In the build they join the existing
     accordion as four more entries, in this order, after “How does data-driven advertising work?”.</i></p>
  <h3>How much does a billboard cost in Malaysia?</h3>
  <p>Static roadside sites are usually booked monthly and digital screens by share of loop,
     so the honest answer is a range per format — see the rates section above. Send us the
     city and the dates and we will quote the specific sites that are free.</p>
  <h3>Berapakah harga sewa papan iklan di Malaysia?</h3>
  <p>Harga bergantung pada lokasi, format dan tempoh kempen. Hubungi kami dengan bandar dan
     tarikh kempen anda untuk sebut harga bagi tapak yang masih kosong.</p>
  <h3>Can I advertise on the LRT or MRT in Kuala Lumpur?</h3>
  <p>Yes — station panels, concourse placements and in-train screens across the Klang Valley
     network, bookable alongside roadside and mall inventory in the same plan.</p>
  <h3>Which cities in Malaysia do you cover?</h3>
  <p>Kuala Lumpur and the wider Klang Valley, Selangor, Penang, Johor Bahru, Kota Kinabalu
     and Kuching.</p>
  <div class="mwp-todo"><b>Check the Malay before publishing.</b> I have written it, but a
     native speaker on the team should read it — this is customer-facing copy in a language
     I should not be the last reviewer of.</div>`,
    why: 'The existing FAQ has eight questions and <b>not one of them mentions price</b> — they are all ' +
      '“What is DOOH advertising?”, “Why invest in OOH”. They answer a student, not a buyer. ' +
      'These four answer the searches actually being bought, including ' +
      '<b>sewa papan iklan</b> — a Malay term we pay for while the page carries no Malay at all.',
    evidence: {
      paid: [
        { term: 'sewa papan iklan', cost: 2.78, clicks: 4, conv: 0, quality: 'BELOW_AVERAGE' },
        { term: 'lrt advertising', cost: 3.05, clicks: 4, conv: 0, quality: 'BELOW_AVERAGE' },
        { term: 'bus advertising kl', cost: 0.78, clicks: 1, conv: 0, quality: 'BELOW_AVERAGE' },
        { term: 'billboard company malaysia', cost: 2.96, clicks: 4, conv: 0, quality: null },
      ],
      placeholders: ['a native Malay speaker to check the Bahasa answer'],
    },
  },
]

const res = await fetch(URL_, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; CashflowOS proposal)' } })
if (!res.ok) { console.error(`could not fetch ${URL_}: HTTP ${res.status}`); process.exit(1) }
const liveHtml = await res.text()
console.log(`fetched ${URL_} — ${(liveHtml.length / 1024).toFixed(0)} KB`)

const p = buildProposal({
  url: URL_, liveHtml, changes, terms: TERMS,
  generatedOn: new Date().toISOString().slice(0, 10),
})

mkdirSync('docs/proposals', { recursive: true })
writeFileSync(`docs/proposals/${p.filename}`, p.html, 'utf8')
console.log(`\nwrote docs/proposals/${p.filename} (${(p.html.length / 1024).toFixed(0)} KB)`)
console.log(`${changes.length} changes, ${p.blocked} blocked by the ranking-protection rule\n`)
for (const s of p.summary) console.log(s)
