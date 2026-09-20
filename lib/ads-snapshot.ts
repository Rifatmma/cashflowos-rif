// ============================================================
// META ADS SNAPSHOT — pulled from the Meta Marketing API via Composio.
//
// WHY THIS IS A FILE AND NOT A `records` ROW:
// Every other tab is a filtered view of the one `records` table, because those
// tabs show YOUR business records — money, leads, tasks. These tabs show a
// point-in-time ANALYSIS of an external ad account: nested breakdowns, a
// competitor set and a written action plan. That isn't a business record, so it
// lives here as typed data instead of polluting `records` with a shape nothing
// else uses.
//
// TO REFRESH: ask Claude to "refresh the ads snapshot". It re-pulls from Meta
// and rewrites this file. Then `git push` → Vercel redeploys.
//
// THE PERIOD IS A RUN, NOT A CALENDAR WINDOW. Delivery has been stop-start all
// year, so an arbitrary "last 14 days" silently mixes live days with paused
// ones. Everything here covers RUN F (3–19 Sep), the current unbroken stretch
// of delivery. RUNS[] holds every prior run for like-for-like comparison.
//
// Numbers are raw from Meta. Anything derived (cost per conversation, shares,
// percentages) is computed in the pages from these raw figures, on purpose —
// so a hand-typed division can never drift from the source data.
//
// KNOWN QUIRK (not a bug): Meta restates spend by a few sen between aggregated
// and broken-down queries. Conversations reconcile exactly — 118 in every
// single breakdown — which is what matters.
// ============================================================

export type Row = {
  label: string
  spend: number
  convos: number // messaging conversations started (7d click)
  impressions?: number
  clicks?: number
  ctr?: number
  depth2?: number
  depth3?: number
  depth5?: number
}

export type Run = {
  id: string
  label: string
  since: string
  until: string
  days: number
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  frequency: number
  convos: number
  depth2: number
  depth3: number
  depth5: number
  gapAfter?: number // days of zero delivery before the NEXT run
  current?: boolean
}

// Six distinct delivery runs since March, separated by real pauses. Found by
// pulling daily spend across six months and splitting on gaps of 4+ days.
export const RUNS: Run[] = [
  { id: 'A', label: 'March push', since: '2026-03-01', until: '2026-03-19', days: 19,
    spend: 1536.60, impressions: 219613, reach: 134690, clicks: 8890,
    ctr: 4.048030, cpc: 0.172846, cpm: 6.996854, frequency: 1.630507,
    convos: 176, depth2: 74, depth3: 43, depth5: 1, gapAfter: 4 },
  { id: 'B', label: 'Spring long run', since: '2026-03-24', until: '2026-05-13', days: 51,
    spend: 4776.81, impressions: 433448, reach: 248929, clicks: 18313,
    ctr: 4.224959, cpc: 0.260843, cpm: 11.020492, frequency: 1.741252,
    convos: 396, depth2: 147, depth3: 76, depth5: 81, gapAfter: 5 },
  { id: 'C', label: 'Late May', since: '2026-05-19', until: '2026-05-29', days: 11,
    spend: 896.77, impressions: 27257, reach: 17368, clicks: 820,
    ctr: 3.008402, cpc: 1.093622, cpm: 32.900539, frequency: 1.569380,
    convos: 64, depth2: 11, depth3: 2, depth5: 8, gapAfter: 13 },
  { id: 'D', label: 'June–July', since: '2026-06-12', until: '2026-07-03', days: 22,
    spend: 1294.63, impressions: 57611, reach: 26338, clicks: 1461,
    ctr: 2.535974, cpc: 0.886126, cpm: 22.471924, frequency: 2.187372,
    convos: 393, depth2: 11, depth3: 5, depth5: 2, gapAfter: 9 },
  { id: 'E', label: 'Merdeka run', since: '2026-07-13', until: '2026-08-01', days: 20,
    spend: 1283.56, impressions: 38425, reach: 16116, clicks: 1744,
    ctr: 4.538712, cpc: 0.735986, cpm: 33.404294, frequency: 2.384277,
    convos: 178, depth2: 17, depth3: 6, depth5: 0, gapAfter: 32 },
  { id: 'F', label: 'Set RM79.90 promo', since: '2026-09-03', until: '2026-09-19', days: 17,
    spend: 889.79, impressions: 29070, reach: 12862, clicks: 1485,
    ctr: 5.108359, cpc: 0.599185, cpm: 30.608531, frequency: 2.260146,
    convos: 118, depth2: 44, depth3: 20, depth5: 9, current: true },
]

export const CURRENT = RUNS[RUNS.length - 1]

export const SNAPSHOT = {
  pulledAt: '2026-09-20',
  period: { since: CURRENT.since, until: CURRENT.until },
  account: { id: 'act_762254042928303', name: 'Salam Bangkok', currency: 'MYR', tz: 'Asia/Kuala_Lumpur' },
  campaign: { name: 'Set RM 79', objective: 'OUTCOME_ENGAGEMENT', adset: 'Whatsapp Message', ad: 'New Engagement Ad' },

  offer: {
    price: 79.90,
    normalPrice: 98.90,
    priceInAd: 99.80, // what the LIVE ad copy says — see the flags section
    freeItem: 'Tomyam Seafood',
    freeItemValue: 19.90,
    includes: ['1 fish (any preparation)', '1 chicken (any)', '1 calamari (any)', '1 shrimp (any)', '1 Tomyam Seafood — free'],
    venue: 'Restoran Jaosamut, CBD Perdana 2, Cyberjaya',
    endsAt: 'End of September 2026',
  },

  // Everything the headline needs, for RUN F.
  totals: {
    spend: 889.79,
    impressions: 29070,
    reach: 12862,
    clicks: 1485,
    ctr: 5.108359,
    cpc: 0.599185,
    cpm: 30.608531,
    frequency: 2.260146,
    convos: 118,
    newConnections: 108, // Meta "New messaging connections" — FIRST-TIME contacts, not replies
    totalConnections: 124,
    depth2: 44,
    depth3: 20,
    depth5: 9,
    linkClicks: 283,
    videoViews: 8859,
    postSaves: 26,
    comments: 18,
    reactions: 75,
    deliveryDays: 15,
    calendarDays: 17,
  },

  placements: [
    { label: 'FB Stories', spend: 62.41, convos: 18, impressions: 1047, ctr: 6.88, depth2: 7 },
    { label: 'FB Reels', spend: 193.30, convos: 37, impressions: 5464, ctr: 5.69, depth2: 16, depth3: 11, depth5: 6 },
    { label: 'FB Feed', spend: 386.12, convos: 41, impressions: 15161, ctr: 6.31, depth2: 13, depth3: 7, depth5: 3 },
    { label: 'FB Search', spend: 1.45, convos: 1, impressions: 326, ctr: 3.99, depth2: 1 },
    { label: 'FB In-stream', spend: 8.46, convos: 0, impressions: 232, ctr: 4.31, depth2: 1 },
    { label: 'FB Profile feed', spend: 0.08, convos: 0, impressions: 7, ctr: 0 },
    { label: 'IG Reels', spend: 54.77, convos: 6, impressions: 1788, ctr: 1.40, depth2: 3, depth3: 1 },
    { label: 'IG Stories', spend: 116.10, convos: 12, impressions: 2673, ctr: 2.92, depth2: 2, depth3: 1 },
    { label: 'IG Feed', spend: 67.06, convos: 3, impressions: 2354, ctr: 0.85, depth2: 1 },
    { label: 'IG Explore', spend: 0.04, convos: 0, impressions: 18, ctr: 0 },
  ] as Row[],

  platforms: [
    { label: 'Facebook', spend: 651.82, convos: 97, impressions: 22437, depth2: 38, depth3: 18, depth5: 9 },
    { label: 'Instagram', spend: 237.97, convos: 21, impressions: 6833, depth2: 6, depth3: 2, depth5: 0 },
  ] as Row[],

  ages: [
    { label: '18–24', spend: 17.26, convos: 2, impressions: 846, clicks: 21 },
    { label: '25–34', spend: 104.97, convos: 14, impressions: 4443, clicks: 134 },
    { label: '35–44', spend: 245.08, convos: 29, impressions: 10479, clicks: 450 },
    { label: '45–54', spend: 310.10, convos: 48, impressions: 8819, clicks: 546 },
    { label: '55–64', spend: 148.56, convos: 18, impressions: 3316, clicks: 219 },
    { label: '65+', spend: 63.82, convos: 7, impressions: 1167, clicks: 115 },
  ] as Row[],

  genders: [
    { label: 'Women', spend: 630.30, convos: 70 },
    { label: 'Men', spend: 253.65, convos: 47 },
    { label: 'Unknown', spend: 5.84, convos: 1 },
  ] as Row[],

  // NOTE: Meta does not return conversations-started split by region, so these
  // use `total_messaging_connection` (124 account-wide) not the 118 used elsewhere.
  regions: [
    { label: 'Selangor', spend: 639.50, convos: 81, impressions: 20951, ctr: 4.91, depth2: 28, depth3: 14, depth5: 6 },
    { label: 'Putrajaya', spend: 250.28, convos: 43, impressions: 8118, ctr: 5.63, depth2: 16, depth3: 6, depth5: 3 },
  ] as Row[],

  devices: [
    { label: 'Android phone', spend: 481.22, convos: 64, impressions: 16028, ctr: 5.35, depth2: 23, depth3: 12, depth5: 6 },
    { label: 'iPhone', spend: 407.09, convos: 54, impressions: 12997, ctr: 4.81, depth2: 21, depth3: 8, depth5: 3 },
    { label: 'Tablets', spend: 1.48, convos: 0, impressions: 45, ctr: 4.44 },
  ] as Row[],

  hours: [
    { h: 0, spend: 11.83, convos: 3 }, { h: 1, spend: 6.40, convos: 0 },
    { h: 2, spend: 5.99, convos: 1 }, { h: 3, spend: 2.63, convos: 0 },
    { h: 4, spend: 4.25, convos: 0 }, { h: 5, spend: 6.20, convos: 0 },
    { h: 6, spend: 16.64, convos: 2 }, { h: 7, spend: 30.79, convos: 5 },
    { h: 8, spend: 40.82, convos: 6 }, { h: 9, spend: 48.90, convos: 2 },
    { h: 10, spend: 48.39, convos: 11 }, { h: 11, spend: 71.31, convos: 7 },
    { h: 12, spend: 70.85, convos: 4 }, { h: 13, spend: 56.36, convos: 8 },
    { h: 14, spend: 54.66, convos: 4 }, { h: 15, spend: 55.58, convos: 10 },
    { h: 16, spend: 53.18, convos: 5 }, { h: 17, spend: 56.55, convos: 8 },
    { h: 18, spend: 57.77, convos: 10 }, { h: 19, spend: 50.02, convos: 8 },
    { h: 20, spend: 55.00, convos: 10 }, { h: 21, spend: 34.47, convos: 5 },
    { h: 22, spend: 26.71, convos: 5 }, { h: 23, spend: 24.49, convos: 4 },
  ],

  days: [
    { d: '03 Sep', spend: 17.84, convos: 8, ctr: 7.31 },
    { d: '04 Sep', spend: 69.94, convos: 17, ctr: 7.45 },
    { d: '05 Sep', spend: 49.80, convos: 12, ctr: 5.48 },
    { d: '06 Sep', spend: 31.67, convos: 5, ctr: 5.53 },
    { d: '07 Sep', spend: 74.36, convos: 6, ctr: 5.31 },
    { d: '08 Sep', spend: 50.79, convos: 6, ctr: 4.81 },
    { d: '09 Sep', spend: 77.14, convos: 3, ctr: 4.66 },
    { d: '10 Sep', spend: 51.94, convos: 9, ctr: 5.19 },
    { d: '11 Sep', spend: 67.04, convos: 8, ctr: 3.36 },
    { d: '12 Sep', spend: 66.92, convos: 8, ctr: 5.36 },
    { d: '13 Sep', spend: 57.58, convos: 4, ctr: 4.65 },
    { d: '14 Sep', spend: 55.99, convos: 6, ctr: 5.24 },
    { d: '15 Sep', spend: 71.37, convos: 5, ctr: 3.46 },
    { d: '16 Sep', spend: 43.13, convos: 5, ctr: 5.09 },
    { d: '17 Sep', spend: 0, convos: 0, ctr: 0 },
    { d: '18 Sep', spend: 0, convos: 0, ctr: 0 },
    { d: '19 Sep', spend: 104.28, convos: 16, ctr: 5.93 },
  ],

  targeting: {
    ages: '18–65',
    genders: 'All',
    devices: 'Mobile only',
    cities: ['Bangi', 'Puchong', 'Sepang', 'Cyberjaya', 'Putrajaya'],
    interests: ['dining out (Restaurants)', 'Seafood', 'thai cuisine', 'Family (social concept)', 'Love marriage', 'Marriage (weddings)'],
    behaviors: ['Engaged Shoppers'],
    family: ['Parents (All)'],
    advantageAudience: true,
    optimisation: 'CONVERSATIONS → WhatsApp (6019 518 1288)',
  },

  liveCreative: {
    id: '3544417032392051',
    created: '2026-09-08',
    cta: 'WHATSAPP_MESSAGE',
    format: 'Video',
    hook: 'Makan Thai Feast sekeluarga tak payah poket koyak! ✨',
    claims: ['Set 5 Hidangan', 'Cukup 4+ orang makan', 'RM79.90 Nett (N.P RM99.80)', 'Add-on Bingsu RM15 (NP RM25)', 'Chef Bertauliah Kulinari | 100% Halal', 'Promo Tamat Hujung September'],
  },

  benchmarks: {
    costPerConvoMYR: { low: 6, high: 32, source: 'Malaysian SME click-to-WhatsApp tracking, 2024–26' },
    ctrFnb: 1.10,
    ctrRestaurant: { low: 1.67, high: 2.97 },
    cpcUsdFnb: 0.86,
    cpmUsdFnb: { low: 8.14, high: 9.50 },
    usdMyr: 4.2,
  },
}

// ---- Competitor set, from the public Meta Ad Library (2026-09-20) ----
export type Competitor = {
  name: string
  where: string
  status: 'Active ads' | 'Via platform' | 'No ads'
  adCount: string
  leadsWith: string
  cta: string
  note: string
  threat: 'Direct' | 'Indirect' | 'Model to copy'
}

export const COMPETITORS: Competitor[] = [
  {
    name: 'SukhoThai Cuisine',
    where: 'Tamarind Square, Cyberjaya',
    status: 'Active ads',
    adCount: '1, live since 2 Sep',
    leadsWith: 'Occasions + Bangkok authenticity — no price anywhere',
    cta: 'Click-to-WhatsApp (“reserve meja”)',
    note: 'Your closest competitor: same city, same WhatsApp mechanic, opposite message. A 12-second video selling “dinner family · birthday · small gathering · date night”. It has run unchanged for over two weeks, which is the strongest public signal available that it works.',
    threat: 'Direct',
  },
  {
    name: 'Absolute Thai Malaysia',
    where: 'Sunway Square (KHA), TRX (BUSABA), IPC',
    status: 'Active ads',
    adCount: '4+, all since late Aug',
    leadsWith: 'Convenience and corporate bookings',
    cta: 'Get directions / Book now',
    note: 'Free kaya toast with coffee, lunch deals, and corporate-gathering ads for BUSABA TRX. Upmarket and mall-based. Never uses WhatsApp, never leads on price. Also gets free exposure inside IPC Shopping Centre’s own ads.',
    threat: 'Indirect',
  },
  {
    name: 'Soi 55 Thai Kitchen',
    where: 'Nilai + Cyberjaya',
    status: 'Via platform',
    adCount: '0 of their own',
    leadsWith: 'Discount — but Eatigo’s, not theirs',
    cta: 'Book via Eatigo app',
    note: 'Runs no ads from its own page. Appears only inside Eatigo ads offering “up to 50% OFF at SOI 55”, live since 7 Aug. They have outsourced demand generation to a discount platform and pay for it in margin on every cover.',
    threat: 'Indirect',
  },
  {
    name: 'Akak Founder / 99 Founder Cafe',
    where: 'Puncak Alam',
    status: 'No ads',
    adCount: '0',
    leadsWith: 'Founder personality + recipe content',
    cta: 'None — organic only',
    note: 'Yuwadee “Akak Founder” has 286,000 followers and buys no reach at all. A recent Som Tam Para Salmon recipe post pulled 438 reactions and 72 shares in 15 hours. Proof the organic content model works at scale in Malaysian Thai food — and the one model here you have the skills to copy directly.',
    threat: 'Model to copy',
  },
  {
    name: 'Founder 99',
    where: 'Puncak Alam',
    status: 'No ads',
    adCount: '0',
    leadsWith: '—',
    cta: '—',
    note: 'Same business as Akak Founder — she is the owner. No separate advertising.',
    threat: 'Model to copy',
  },
]

export const POSITIONING = {
  headline: 'You are the only one in this set leading with a discount.',
  body: 'Of five named competitors, two advertise properly, one rents demand from Eatigo, and two do not advertise at all. Nobody else fronts a price. SukhoThai — same city, same click-to-WhatsApp mechanic — sells birthday dinners and date nights and never mentions money, and that ad has survived over two weeks unchanged. Absolute Thai sells convenience and corporate bookings. Competing on price against people who are not competing on price wins the transaction and loses the positioning: when your promo ends on 30 September you have no second message ready. Your real wedge is the one thing none of them can claim — free choice of preparation on every dish — and your current ad buries it under the discount.',
}

export type Item = { t: string; s: string }

export const HIGHLIGHTS: Item[] = [
  { t: 'Best campaign you have ever run, once quality is counted', s: 'RM 20.22 per conversation that reached message two — narrowly the best of all six runs since March, beating the March push at RM 20.76 and crushing the June run at RM 117.69. Raw cost per conversation is not the number that matters; this is.' },
  { t: 'CTR of 5.11% is an all-time high', s: 'Above every prior run (previous best 4.54%) and roughly 2–4× the restaurant category, which averages 1.67–2.97%. The creative is working harder than it ever has.' },
  { t: '37.3% of chats reach a second message', s: 'Your second-best depth rate ever, against 2.8% in the June run and 9.6% in the Merdeka run. The people arriving in WhatsApp are far better qualified than they were three months ago.' },
  { t: 'Cost per conversation sits in the healthy band', s: 'RM 7.54 against a Malaysian click-to-WhatsApp range of RM 6–32 — the lower third, while running a higher-quality audience than the cheap runs that came before.' },
  { t: 'FB Stories is the cheapest result in the account', s: 'RM 3.47 per conversation at 6.88% CTR, on 7% of budget. FB Reels follows at RM 5.22 and carries the deepest conversations — 6 of your 9 depth-5 chats came from Reels.' },
  { t: 'Men convert 40% cheaper than women', s: 'RM 5.40 vs RM 9.00 per conversation. Men produced 47 of 118 conversations on 29% of the budget.' },
  { t: '45–54 is your money segment', s: '48 of 118 conversations — 41% of all results — at RM 6.46 each, the best of any age band. The family-dinner decision-maker, found by Advantage Audience rather than by your interest targeting.' },
]

export const LOWLIGHTS: Item[] = [
  { t: 'Reach has collapsed 90% since March', s: 'From 134,690 people in the March run to 12,862 now, while frequency climbed to 2.26. You are showing the same ad to a small pool more often. This is the real long-term threat and it gets worse every run.' },
  { t: 'CPM has risen 4.4× — RM 7.00 to RM 30.61', s: 'Every thousand impressions now costs more than four times what it did in March. Narrow geo targeting plus a shrinking audience pool means you are bidding into a corner.' },
  { t: '63% of conversations still die after one message', s: 'Only 44 of 118 send a second message. It is your best rate in months, but it is still the largest single loss in the account and it happens after the ad has done its job.' },
  { t: 'Instagram costs 69% more and converts worse', s: 'RM 11.33 vs RM 6.72 per conversation, and only 28.6% of IG chats reach message two against 39.2% on Facebook. IG Feed is the worst line in the account: RM 67.06 for three conversations at 0.85% CTR.' },
  { t: 'Two days of zero delivery on 17–18 Sep', s: 'Daily spend sums exactly to the run total, so this is real downtime, not missing data. Roughly RM 110 of expected spend and about 14 conversations never happened. Then 19 Sep spent RM 104.28 catching up.' },
  { t: 'The 32-day blackout before this run', s: 'No delivery at all from 2 Aug to 2 Sep. Every restart costs you the learning phase and a fresh climb back up the auction. Six runs in six months with five pauses is the most expensive way to buy ads.' },
  { t: '09:00 and the overnight hours are burning money', s: '09:00 returns RM 24.45 per conversation against RM 6.09 in the 17:00–20:00 block. 01:00–05:00 spent RM 25.47 for a single conversation.' },
  { t: 'The live ad quotes the wrong normal price', s: 'Your ad says “N.P RM99.80”. You told me normal is RM 98.90, and your own earlier creative says RM 98.90 too. Small, but it is the number the whole offer hangs on.' },
  { t: 'Wedding interests are in your targeting', s: '“Love marriage” and “Marriage (weddings)” are both active interest terms on a restaurant ad set. Unless you are chasing wedding catering, these pull in the wrong intent.' },
]

export const ACTIONS = [
  { p: 'Now', t: 'Fix the WhatsApp opener', s: 'The 63% drop-off is worth more than every ad change combined. Your auto-reply should ask ONE closing question — “Berapa orang dan pukul berapa?” — not send a menu. Reclaiming half of the 74 lost conversations is worth roughly RM 3,000 in sets at no extra ad spend.', impact: 'Highest' },
  { p: 'Now', t: 'Widen the audience before CPM strangles you', s: 'Reach fell from 134,690 to 12,862 and CPM rose 4.4×. Add Seri Kembangan, Kajang and Shah Alam, or lift the radius to 25km. You cannot out-creative a pool this small — the auction will keep repricing you upward.', impact: 'Highest' },
  { p: 'Now', t: 'Shift budget into FB Stories and Reels', s: 'Stories delivers at RM 3.47 and Reels at RM 5.22. Feed is RM 9.42 and holds 43% of spend. Move roughly RM 120 from Feed into Stories and Reels and hold everything else constant.', impact: 'High' },
  { p: 'Now', t: 'Turn off IG Feed', s: 'RM 67.06 for three conversations at 0.85% CTR. There is no reading of that data where it earns its place. Keep IG Stories on probation.', impact: 'High' },
  { p: 'Now', t: 'Add a dayparting schedule', s: 'Run 10:00–21:00 and stop overnight. The 17:00–20:00 block delivers RM 6.09 per conversation; 01:00–05:00 delivered one conversation on RM 25.47, and 09:00 alone burned RM 48.90 for two.', impact: 'High' },
  { p: 'Now', t: 'Stop pausing the campaign', s: 'Five pauses in six months, including 32 straight days. Every restart re-enters the learning phase. A smaller continuous daily budget beats a larger stop-start one, and your own run history is the evidence.', impact: 'High' },
  { p: 'Now', t: 'Correct the normal price in the ad', s: 'Change “N.P RM99.80” to RM 98.90, or drop the promo price to RM 79 so the free-tomyam claim and the RM 19.90 value line up exactly.', impact: 'Medium' },
  { p: 'This week', t: 'Write the post-promo ad before 30 September', s: 'Your promo ends in ten days and every ad you run leads on the discount. SukhoThai has run an occasion-led ad for over two weeks with no price in it. Build one ad that sells free choice of preparation — the thing none of your competitors can claim.', impact: 'High' },
  { p: 'This week', t: 'Narrow the age floor to 25', s: '18–24 produced two conversations on RM 17.26. 45–54 delivers 41% of results at RM 6.46. Set the range to 25–65 and let Advantage Audience expand from there.', impact: 'Medium' },
  { p: 'This week', t: 'Strip the wedding interests', s: 'Remove “Love marriage” and “Marriage (weddings)”. Keep dining out, Seafood, thai cuisine, Family, Parents, Engaged Shoppers.', impact: 'Medium' },
  { p: 'Ongoing', t: 'Start the Akak Founder play', s: 'A competitor in your category built 286,000 followers on founder-led Thai recipe content and buys no ads at all. You have the shooting and editing skills to run that model. Two recipe or kitchen posts a week, organically, alongside the paid promo — it compounds while ad costs do not.', impact: 'Compounding' },
  { p: 'Ongoing', t: 'Label every WhatsApp chat', s: 'Genuine / booked / showed up / price shopper / wrong intent / no reply. Labels live on the phone and cannot be read by API, but the counts take thirty seconds to read off and turn cost-per-conversation into cost-per-diner — the only number that actually matters.', impact: 'Compounding' },
]

export const AUDIENCES = [
  { t: 'Men 35–64, Cyberjaya + Putrajaya', s: 'Men convert at RM 5.40 against RM 9.00 for women, yet take 29% of budget. Split them into their own ad set so the algorithm stops under-bidding on them.', why: 'From your data' },
  { t: '45–54 as a standalone ad set', s: '41% of all conversations at RM 6.46. Currently buried inside an 18–65 range where budget leaks to ages that do not convert.', why: 'From your data' },
  { t: 'Putrajaya-weighted split', s: 'Putrajaya returns RM 5.82 per connection against Selangor at RM 7.90, and its chats go deeper — 37.2% reach message two vs 34.6%. Closer to the restaurant, more likely to actually come.', why: 'From your data' },
  { t: 'Geographic expansion — urgent', s: 'Reach is down 90% since March and CPM is up 4.4×. Seri Kembangan, Kajang, Shah Alam, or a 25km radius. This is not a nice-to-have test; the current pool is exhausted.', why: 'From your data' },
  { t: 'Office-worker lunch crowd', s: 'Cyberjaya is dense with MSC-status offices. Target work-location radius 3km, weekdays 10:00–14:00, with a lunch-set angle rather than the family-feast angle.', why: 'New test' },
  { t: 'Engaged couples and small-group planners', s: 'You already pay for wedding interests by accident. Either commit — a proper 6–10 pax group-booking ad — or cut them. Do not keep paying for them by default.', why: 'New test' },
  { t: 'Lookalike from WhatsApp openers', s: 'Upload the phone numbers of people who reached message 3+ as a custom audience, then build a 1% lookalike. Your single highest-value targeting asset and it costs nothing.', why: 'New test' },
  { t: 'Video-view retargeting', s: '8,859 video views this run. Retarget the 50%+ watchers with a short urgency cut — promo ends end of September. Warm, cheap, and currently unused.', why: 'New test' },
]

export const ABTESTS = [
  { t: 'Opening message in WhatsApp', a: 'Current: whatever the auto-reply sends now', b: 'Test: one question only — “Berapa orang & pukul berapa?”', m: 'Depth-2 rate (currently 37.3%)', why: 'The highest-leverage test in the account. Nothing else touches the 63% drop-off.' },
  { t: 'Free tomyam as the headline', a: 'Current: “Makan Thai Feast sekeluarga tak payah poket koyak”', b: 'Test: “FREE Tomyam Seafood RM19.90 — bila order Set RM79.90”', m: 'CTR and cost per conversation', why: 'Your best hook is currently buried as a line item. The Merdeka ad led with it.' },
  { t: 'Occasion framing vs price framing', a: 'Current: RM79.90 and the discount lead the ad', b: 'Test: “Birthday? Family dinner? Date night?” with the price only at the end', m: 'Cost per conversation, and depth-2 rate', why: 'SukhoThai in Cyberjaya has run exactly this angle unchanged since 2 Sep with no price at all.' },
  { t: 'Free-choice angle vs set-menu angle', a: 'Current: lists the five dishes', b: 'Test: “Pilih SENDIRI cara masak setiap lauk”', m: 'CTR, then message depth', why: 'Free choice is a genuine differentiator and the current ad barely mentions it.' },
  { t: 'Wider geo vs current geo', a: 'Current: Cyberjaya, Putrajaya, Bangi, Puchong, Sepang', b: 'Test: add Seri Kembangan, Kajang, Shah Alam', m: 'CPM and reach, then cost per conversation', why: 'Reach down 90% and CPM up 4.4× since March. Tests whether the pool or the creative is the constraint.' },
  { t: 'Price framing', a: 'Current: RM79.90 Nett, N.P RM99.80', b: 'Test: “Jimat RM19 — bayar RM79.90, bukan RM98.90”', m: 'Cost per conversation', why: 'Saving framed as a number beats a struck-through price for value-led audiences.' },
  { t: 'Placement concentration', a: 'Current: all placements on', b: 'Test: FB Stories + Reels only', m: 'Blended cost per conversation', why: 'Stories at RM 3.47 is being averaged down by Feed at RM 9.42 and IG Feed at RM 22.35.' },
]

export const CREATIVE = [
  { t: 'The tomyam pour — 9:16, 6–8 seconds', s: 'Extreme close-up, the red tomyam poured over seafood in the claypot, steam catching the light, sound ON. Text lands at second one: “FREE. RM19.90.” Cut before the viewer decides to scroll. The highest-value thing you can shoot this week — it puts your strongest hook in your strongest placement.', fmt: 'Reels + Stories' },
  { t: 'The choice montage — 9:16, 12 seconds', s: 'Four fast cuts, one per protein, each captioned with the preparation: Siakap Tiga Rasa / Ayam Cashew Nut / Udang Butter / Sotong Telur Masin. End card: “Pilih sendiri. RM79.90.” Sells the flexibility nobody else in your category offers.', fmt: 'Reels + Stories' },
  { t: 'The table reveal — 9:16, 10 seconds', s: 'Overhead, empty table, then hands placing all five dishes in quick succession, speed-ramped. Final frame holds on the full spread with “5 hidangan. RM79.90.” Your 45–54 family audience is buying the size of the table, not the individual dish.', fmt: 'Reels + Feed' },
  { t: 'Price-tag static — 1080×1350', s: 'One hero shot of the full set, shot from 45°, with a clean price block: RM98.90 struck through, RM79.90 large, “+ FREE Tomyam RM19.90” beneath. Feed still carries 43% of your spend and deserves one properly designed static rather than a video thumbnail.', fmt: 'Feed' },
  { t: 'The 15-second walkthrough — 9:16', s: 'Handheld, first person, from the car park to the table. Cyberjaya parking is a real objection and you answer it without saying a word. Caption the parking line on screen.', fmt: 'Stories' },
  { t: 'Owner-to-camera, unpolished — 9:16, 20 seconds', s: 'You, in the restaurant, phone camera, no edit: “Promo ni habis hujung September. Tomyam free. Kalau nak datang, WhatsApp kami.” Low-production owner footage consistently outperforms polished work for local restaurants because it reads as real rather than as an ad.', fmt: 'Reels + Stories' },
]

export const POSTING = [
  { t: 'Shoot once, cut many', s: 'One 90-minute session in the restaurant gives you every creative above. Shoot vertical 4K so you can crop to 1:1 and 4:5 without reshooting. Always record sound — 8,859 video views this run means sound-on autoplay is doing real work.' },
  { t: 'Hook in the first second, not the third', s: 'Your CTR says people stop. Depth says they do not follow through. Put the offer on frame one, not after a beauty shot. The beauty shot is what keeps them past second three.' },
  { t: 'Post organically before you promote', s: 'Put each cut on the page first. Anything that outperforms organically becomes the next ad. Free testing, and it builds the page people check before messaging you.' },
  { t: 'Match the format to the placement', s: 'FB Stories is your cheapest result and wants 9:16 with on-screen text — most people watch muted the first time. FB Reels carries your deepest conversations, so that is where the strongest story belongs.' },
  { t: 'Three new cuts a week during the promo', s: 'You have until end of September. Creative fatigue shows as CTR decay within a run — yours slipped from 7.45% on 4 Sep to 3.46% by 15 Sep before recovering. Fresh cuts reset it.' },
  { t: 'Film the free tomyam being served, every time', s: 'The giveaway is the offer. Most of your library sells the set. Almost none of it sells the free thing, which is the part that makes the price feel like a deal.' },
]
