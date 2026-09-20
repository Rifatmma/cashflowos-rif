// ============================================================
// META ADS SNAPSHOT — pulled from the Meta Marketing API via Composio.
//
// WHY THIS IS A FILE AND NOT A `records` ROW:
// Every other tab is a filtered view of the one `records` table, because those
// tabs show YOUR business records — money, leads, tasks. This tab shows a
// point-in-time ANALYSIS of an external ad account: nested breakdowns, a
// benchmark set and a written action plan. That isn't a business record, so it
// lives here as typed data instead of polluting `records` with a shape nothing
// else uses.
//
// TO REFRESH: ask Claude to "refresh the ads snapshot". It re-pulls from Meta
// and rewrites this file. Then `git push` → Vercel redeploys.
// If you'd rather refresh WITHOUT a deploy, say so — we move this into
// `records` under category 'ads_report' with everything in `meta` jsonb.
//
// Numbers are raw from Meta. Anything derived (cost per conversation, shares,
// percentages) is computed in the page from these raw figures, on purpose —
// so a hand-typed division can never drift from the source data.
//
// KNOWN DISCREPANCY (not a bug): the headline query returns spend 751.79 while
// every breakdown query sums to 752.21 — 42 sen. Meta restates spend slightly
// between aggregated and broken-down queries. Conversations reconcile exactly
// (81 in every single breakdown), which is what actually matters here.
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

export const SNAPSHOT = {
  pulledAt: '2026-09-20',
  period: { since: '2026-09-06', until: '2026-09-19' },
  priorPeriod: { since: '2026-08-23', until: '2026-09-05' },
  account: { id: 'act_762254042928303', name: 'Salam Bangkok', currency: 'MYR', tz: 'Asia/Kuala_Lumpur' },
  campaign: { name: 'Set RM 79', objective: 'OUTCOME_ENGAGEMENT', adset: 'Whatsapp Message', ad: 'New Engagement Ad' },

  // The promo being advertised (from you, 2026-09-20).
  offer: {
    price: 79.90,
    normalPrice: 98.90,
    priceInAd: 99.80, // what the LIVE ad copy actually says — see the flags section
    freeItem: 'Tomyam Seafood',
    freeItemValue: 19.90,
    includes: ['1 fish (any preparation)', '1 chicken (any)', '1 calamari (any)', '1 shrimp (any)', '1 Tomyam Seafood — free'],
    venue: 'Restoran Jaosamut, CBD Perdana 2, Cyberjaya',
    endsAt: 'End of September 2026',
  },

  // ---- Headline, this period ----
  totals: {
    spend: 751.79,
    impressions: 24920,
    reach: 11814,
    clicks: 1215,
    ctr: 4.875602,
    cpc: 0.618757,
    cpm: 30.168138,
    frequency: 2.109362,
    convos: 81,
    newConnections: 75, // Meta's "New messaging connections" — FIRST-TIME contacts, not replies
    totalConnections: 87,
    depth2: 31,
    depth3: 16,
    depth5: 9,
    linkClicks: 214,
    videoViews: 7407,
  },

  prior: {
    spend: 137.58,
    impressions: 4108,
    reach: 2676,
    clicks: 269,
    ctr: 6.548199,
    cpc: 0.51145,
    convos: 37,
    linkClicks: 69,
    videoViews: 1435,
  },

  // ---- Where the money went ----
  placements: [
    { label: 'FB Stories', spend: 56.91, convos: 15, impressions: 949, ctr: 6.64 },
    { label: 'FB Reels', spend: 160.23, convos: 25, impressions: 4544, ctr: 5.59 },
    { label: 'FB Feed', spend: 320.44, convos: 27, impressions: 12871, ctr: 6.01 },
    { label: 'FB Search', spend: 1.42, convos: 1, impressions: 299, ctr: 4.35 },
    { label: 'FB In-stream video', spend: 8.14, convos: 0, impressions: 209, ctr: 4.31 },
    { label: 'FB Profile feed', spend: 0.08, convos: 0, impressions: 7, ctr: 0 },
    { label: 'IG Reels', spend: 48.02, convos: 5, impressions: 1615, ctr: 1.42 },
    { label: 'IG Stories', spend: 98.95, convos: 6, impressions: 2364, ctr: 2.54 },
    { label: 'IG Feed', spend: 57.55, convos: 2, impressions: 2044, ctr: 0.93 },
    { label: 'IG Explore', spend: 0.04, convos: 0, impressions: 18, ctr: 0 },
  ] as Row[],

  platforms: [
    { label: 'Facebook', spend: 547.66, convos: 68, impressions: 18922, depth2: 26, depth3: 14, depth5: 9 },
    { label: 'Instagram', spend: 204.55, convos: 13, impressions: 6039, depth2: 5, depth3: 2, depth5: 0 },
  ] as Row[],

  ages: [
    { label: '18–24', spend: 14.83, convos: 1, impressions: 752, clicks: 17 },
    { label: '25–34', spend: 91.89, convos: 9, impressions: 4050, clicks: 118 },
    { label: '35–44', spend: 219.23, convos: 20, impressions: 9370, clicks: 394 },
    { label: '45–54', spend: 260.80, convos: 33, impressions: 7388, clicks: 430 },
    { label: '55–64', spend: 116.12, convos: 12, impressions: 2548, clicks: 161 },
    { label: '65+', spend: 49.34, convos: 6, impressions: 853, clicks: 96 },
  ] as Row[],

  genders: [
    { label: 'Women', spend: 529.67, convos: 48 },
    { label: 'Men', spend: 217.96, convos: 32 },
    { label: 'Unknown', spend: 4.58, convos: 1 },
  ] as Row[],

  // NOTE: Meta did not return conversations-started split by region, so these
  // use `total_messaging_connection` (87 account-wide) instead of the 81
  // conversations-started used everywhere else. Close, but not the same metric.
  regions: [
    { label: 'Selangor', spend: 542.05, convos: 58, impressions: 18085, ctr: 4.74, depth2: 19, depth3: 12, depth5: 6 },
    { label: 'Putrajaya', spend: 210.16, convos: 29, impressions: 6876, ctr: 5.21, depth2: 12, depth3: 4, depth5: 3 },
  ] as Row[],

  devices: [
    { label: 'Android phone', spend: 397.53, convos: 43, impressions: 13513, ctr: 5.15, depth2: 15 },
    { label: 'iPhone', spend: 353.64, convos: 38, impressions: 11412, ctr: 4.55, depth2: 16 },
    { label: 'Tablets', spend: 1.04, convos: 0, impressions: 36, ctr: 2.78 },
  ] as Row[],

  // Hour of day, advertiser timezone (Asia/Kuala_Lumpur).
  hours: [
    { h: 0, spend: 8.21, convos: 2 }, { h: 1, spend: 4.64, convos: 0 },
    { h: 2, spend: 3.69, convos: 1 }, { h: 3, spend: 1.31, convos: 0 },
    { h: 4, spend: 3.26, convos: 0 }, { h: 5, spend: 2.62, convos: 0 },
    { h: 6, spend: 11.30, convos: 1 }, { h: 7, spend: 22.21, convos: 2 },
    { h: 8, spend: 34.14, convos: 3 }, { h: 9, spend: 38.23, convos: 2 },
    { h: 10, spend: 42.10, convos: 7 }, { h: 11, spend: 66.70, convos: 4 },
    { h: 12, spend: 66.59, convos: 4 }, { h: 13, spend: 50.75, convos: 7 },
    { h: 14, spend: 46.94, convos: 4 }, { h: 15, spend: 46.66, convos: 7 },
    { h: 16, spend: 46.65, convos: 4 }, { h: 17, spend: 49.38, convos: 7 },
    { h: 18, spend: 50.66, convos: 8 }, { h: 19, spend: 43.31, convos: 6 },
    { h: 20, spend: 43.26, convos: 7 }, { h: 21, spend: 29.02, convos: 1 },
    { h: 22, spend: 20.69, convos: 3 }, { h: 23, spend: 19.89, convos: 1 },
  ],

  days: [
    { d: '09-06', spend: 31.67, convos: 5, ctr: 5.53 }, { d: '09-07', spend: 74.36, convos: 6, ctr: 5.31 },
    { d: '09-08', spend: 50.79, convos: 6, ctr: 4.81 }, { d: '09-09', spend: 77.14, convos: 3, ctr: 4.66 },
    { d: '09-10', spend: 51.94, convos: 9, ctr: 5.19 }, { d: '09-11', spend: 67.04, convos: 8, ctr: 3.36 },
    { d: '09-12', spend: 66.92, convos: 8, ctr: 5.36 }, { d: '09-13', spend: 57.58, convos: 4, ctr: 4.65 },
    { d: '09-14', spend: 55.99, convos: 6, ctr: 5.24 }, { d: '09-15', spend: 71.37, convos: 5, ctr: 3.46 },
    { d: '09-16', spend: 43.13, convos: 5, ctr: 5.09 }, { d: '09-17', spend: 0, convos: 0, ctr: 0 },
    { d: '09-18', spend: 0, convos: 0, ctr: 0 }, { d: '09-19', spend: 103.86, convos: 16, ctr: 5.93 },
  ],

  // ---- What the ad set is actually set to ----
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

  // ---- Published category benchmarks (NOT competitor data — see the tab) ----
  benchmarks: {
    costPerConvoMYR: { low: 6, high: 32, source: 'Malaysian SME click-to-WhatsApp tracking, 2024–26' },
    ctrFnb: 1.10,
    ctrRestaurant: { low: 1.67, high: 2.97 },
    cpcUsdFnb: 0.86,
    cpmUsdFnb: { low: 8.14, high: 9.50 },
    usdMyr: 4.2, // rough, for putting USD benchmarks in the same units
  },
}

// ---- Competitor set, from the public Meta Ad Library (2026-09-20) ----
// WHAT THIS IS AND IS NOT: the Ad Library shows what a competitor is RUNNING —
// creative, copy, CTA, and how long an ad has been live. It does NOT show
// spend, CTR, or cost per result; that data is private to each account and no
// tool can get it. Ad longevity is the only public signal of what is working:
// nobody keeps paying for an ad that doesn't.
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
  { t: 'CTR of 4.88% — roughly 2–4× the restaurant category', s: 'F&B averages 1.10% and restaurants run 1.67–2.97%. Your creative stops the scroll. This is the single strongest number in the account and it is not luck: it held across every placement on Facebook.' },
  { t: 'Cost per conversation sits in the healthy band', s: 'RM 9.28 against a Malaysian click-to-WhatsApp range of RM 6–32. You are in the lower third while spending 5.5× more than the prior fortnight — scaling without blowing up efficiency.' },
  { t: 'CPC of RM 0.62 is far under category', s: 'Category CPC runs about RM 3.00–3.60 equivalent. Some of that gap is Malaysia being a cheaper market than the US accounts these benchmarks come from, but not five times cheaper. You are genuinely buying clicks well.' },
  { t: 'FB Stories is your best placement and is being starved', s: 'RM 3.79 per conversation at 6.64% CTR — the cheapest result in the account — on just 7.6% of budget. Nothing else comes close on efficiency.' },
  { t: 'Men convert 38% cheaper than women', s: 'RM 6.81 vs RM 11.03 per conversation. Men produced 32 of 81 conversations on 29% of the budget.' },
  { t: '45–54 is your money segment', s: '33 of 81 conversations — 41% of all results — at RM 7.90 each. This is the family-dinner decision-maker and Meta found them despite your interest targeting pointing elsewhere.' },
]

export const LOWLIGHTS: Item[] = [
  { t: '62% of conversations die after the first message', s: '81 people opened a chat, only 31 sent a second one. You are paying RM 9.28 to start conversations that mostly go nowhere. This is the biggest single loss in the account and it happens after the ad has done its job.' },
  { t: 'Instagram costs 2× Facebook for the same outcome', s: 'RM 15.73 vs RM 8.05 per conversation. IG Feed is the worst line in the account: RM 57.55 spent, 0.93% CTR, two conversations — RM 28.78 each.' },
  { t: 'Two days of zero delivery on 17–18 Sep', s: 'Daily spend sums exactly to the period total, so this is real downtime, not missing data. Roughly RM 110 of expected spend and about 12 conversations never happened. Then 19 Sep spent RM 103.86 catching up.' },
  { t: '11:00–12:00 is burning money', s: 'RM 133.29 spent across those two hours for 8 conversations — RM 16.66 each, more than double your evening rate. It is 18% of budget delivering 10% of results.' },
  { t: 'The live ad quotes the wrong normal price', s: 'Your ad says "N.P RM99.80". You told me normal is RM 98.90, and your own earlier creative says RM 98.90 too. Small, but it is the number the whole offer hangs on.' },
  { t: 'Wedding interests are in your targeting', s: '"Love marriage" and "Marriage (weddings)" are both active interest terms on a restaurant ad set. Unless you are chasing wedding catering, these are pulling in the wrong intent.' },
  { t: 'The free tomyam never appears in the live ad', s: 'Your strongest hook — FREE Tomyam Seafood worth RM 19.90 — is listed as a line item inside the set, not as the headline. An earlier Merdeka ad led with it. This one does not.' },
]

export const ACTIONS = [
  { p: 'Now', t: 'Fix the WhatsApp opener', s: 'The 62% drop-off is worth more than every ad change combined. Your auto-reply should ask ONE closing question — "Berapa orang dan pukul berapa?" — not send a menu. Reclaiming even half of the 50 lost conversations is worth about RM 2,000 in sets at no extra ad spend.', impact: 'Highest' },
  { p: 'Now', t: 'Shift budget into FB Stories and Reels', s: 'Stories delivers at RM 3.79 and Reels at RM 6.41. Feed is RM 11.87 and holds 43% of spend. Move roughly RM 100 from Feed into Stories and Reels and hold everything else constant.', impact: 'High' },
  { p: 'Now', t: 'Turn off IG Feed', s: 'RM 57.55 for two conversations at 0.93% CTR. There is no reading of that data where it earns its place. Keep IG Stories on probation.', impact: 'High' },
  { p: 'Now', t: 'Add a dayparting schedule', s: 'Run 10:00–20:00 and stop overnight. Your 17:00–20:00 block delivers RM 6.66 per conversation; 01:00–06:00 delivered one conversation on RM 15.52. Moving the 11:00–12:00 spend into the evening block alone is worth roughly 12 extra conversations for the same money.', impact: 'High' },
  { p: 'Now', t: 'Correct the normal price in the ad', s: 'Change "N.P RM99.80" to RM 98.90, or drop the promo price to RM 79 so the free-tomyam claim and the RM 19.90 value line up exactly.', impact: 'Medium' },
  { p: 'This week', t: 'Narrow the age floor to 25', s: '18–24 produced one conversation on RM 14.83 and 25–34 runs above your account average. 45–54 is doing the work. Set the range to 25–65 and let Advantage Audience expand from there.', impact: 'Medium' },
  { p: 'This week', t: 'Strip the wedding interests', s: 'Remove "Love marriage" and "Marriage (weddings)". Keep dining out, Seafood, thai cuisine, Family, Parents, Engaged Shoppers.', impact: 'Medium' },
  { p: 'This week', t: 'Find out why delivery stopped on 17–18 Sep', s: 'Budget exhausted, payment failure, or a manual pause. Whatever it was, it cost about RM 110 of delivery. Set a billing alert so it cannot repeat silently.', impact: 'Medium' },
  { p: 'This week', t: 'Write the post-promo ad now, before 30 September', s: 'Your promo ends in ten days and every ad you run leads on the discount. SukhoThai has run an occasion-led ad for over two weeks with no price in it at all. Build one ad that sells free choice of preparation — the thing none of your competitors can claim — so you have something to run on 1 October that is not another discount.', impact: 'High' },
  { p: 'Ongoing', t: 'Start the Akak Founder play', s: 'A competitor in your category built 286,000 followers on founder-led Thai recipe content and buys no ads at all. You have the shooting and editing skills to run that model. Two recipe or kitchen posts a week on the page, organically, alongside the paid promo — it compounds while ad costs do not.', impact: 'Compounding' },
  { p: 'Ongoing', t: 'Label every WhatsApp chat', s: 'Genuine / booked / showed up / price shopper / wrong intent / no reply. Labels live on the phone and cannot be read by API, but the counts take thirty seconds to read off and turn cost-per-conversation into cost-per-diner — the only number that actually matters.', impact: 'Compounding' },
]

export const AUDIENCES = [
  { t: 'Men 35–64, Cyberjaya + Putrajaya', s: 'Men convert at RM 6.81 against RM 11.03 for women, yet take 29% of budget. Split them into their own ad set so the algorithm stops under-bidding on them.', why: 'From your data' },
  { t: '45–54 as a standalone ad set', s: '41% of all conversations at RM 7.90. Currently buried inside an 18–65 range where budget leaks to ages that do not convert.', why: 'From your data' },
  { t: 'Putrajaya-weighted split', s: 'Putrajaya returns RM 7.25 per connection against Selangor at RM 9.35, and its chats go deeper — 41.4% reach message two vs 32.8%. Closer to the restaurant, more likely to actually come.', why: 'From your data' },
  { t: 'Office-worker lunch crowd', s: 'Cyberjaya is dense with MSC-status offices. Target work-location radius 3km, weekdays 10:00–14:00, with a lunch-set angle rather than the family-feast angle.', why: 'New test' },
  { t: 'Engaged couples and small-group planners', s: 'You already pay for wedding interests by accident. Either commit — a proper 6–10 pax group-booking ad — or cut them. Do not keep paying for them by default.', why: 'New test' },
  { t: 'Lookalike from WhatsApp openers', s: 'Upload the phone numbers of people who reached message 3+ as a custom audience, then build a 1% lookalike. Your single highest-value targeting asset and it costs nothing.', why: 'New test' },
  { t: 'Video-view retargeting', s: '7,407 video views this period. Retarget the 50%+ watchers with a short urgency cut — promo ends end of September. Warm, cheap, and currently unused.', why: 'New test' },
]

export const ABTESTS = [
  { t: 'Free tomyam as the headline', a: 'Current: "Makan Thai Feast sekeluarga tak payah poket koyak"', b: 'Test: "FREE Tomyam Seafood RM19.90 — bila order Set RM79.90"', m: 'CTR and cost per conversation', why: 'Your best hook is currently buried as a line item. The Merdeka ad led with it.' },
  { t: 'Free-choice angle vs set-menu angle', a: 'Current: lists the five dishes', b: 'Test: "Pilih SENDIRI cara masak setiap lauk" — lead on choosing any preparation', m: 'CTR, then message depth', why: 'Free choice is a genuine differentiator and the current ad barely mentions it.' },
  { t: 'Price framing', a: 'Current: RM79.90 Nett, N.P RM99.80', b: 'Test: "Jimat RM19 — bayar RM79.90, bukan RM98.90"', m: 'Cost per conversation', why: 'Saving framed as a number beats a struck-through price for value-led audiences.' },
  { t: 'Opening message in WhatsApp', a: 'Current: whatever the auto-reply sends now', b: 'Test: one question only — "Berapa orang & pukul berapa?"', m: 'Depth-2 rate (currently 38%)', why: 'The highest-leverage test in the account. Nothing else touches the 62% drop-off.' },
  { t: 'Scarcity vs abundance', a: 'Current: "Promo tamat hujung September"', b: 'Test: "Tinggal X hari" with a real countdown', m: 'Cost per conversation in the final week', why: 'A dated deadline outperforms a vague one, and yours genuinely expires soon.' },
  { t: 'Placement concentration', a: 'Current: all placements on', b: 'Test: FB Stories + Reels only', m: 'Blended cost per conversation', why: 'Stories at RM 3.79 is being averaged down by Feed at RM 11.87.' },
  { t: 'Occasion framing vs price framing', a: 'Current: RM79.90 and the discount lead the ad', b: 'Test: “Birthday? Family dinner? Date night?” with the price only at the end', m: 'Cost per conversation, and depth-2 rate', why: 'SukhoThai in Cyberjaya has run exactly this angle unchanged since 2 Sep with no price at all. Worth knowing whether it beats discount-led in your own account before your promo ends.' },
]

export const CREATIVE = [
  { t: 'The tomyam pour — 9:16, 6–8 seconds', s: 'Extreme close-up, the red tomyam poured over seafood in the claypot, steam catching the light, sound ON. Text lands at second one: "FREE. RM19.90." Cut before the viewer decides to scroll. This is the highest-value thing you can shoot this week — it puts your strongest hook in your strongest placement.', fmt: 'Reels + Stories' },
  { t: 'The choice montage — 9:16, 12 seconds', s: 'Four fast cuts, one per protein, each captioned with the preparation: Siakap Tiga Rasa / Ayam Cashew Nut / Udang Butter / Sotong Telur Masin. End card: "Pilih sendiri. RM79.90." Sells the flexibility nobody else in your category offers.', fmt: 'Reels + Stories' },
  { t: 'The table reveal — 9:16, 10 seconds', s: 'Overhead, empty table, then hands placing all five dishes in quick succession, speed-ramped. Final frame holds on the full spread with "5 hidangan. RM79.90." Your 45–54 family audience is buying the size of the table, not the individual dish.', fmt: 'Reels + Feed' },
  { t: 'Price-tag static — 1080×1350', s: 'One hero shot of the full set, shot from 45°, with a clean price block: RM98.90 struck through, RM79.90 large, "+ FREE Tomyam RM19.90" beneath. Feed still carries 43% of your spend and deserves one properly designed static rather than a video thumbnail.', fmt: 'Feed' },
  { t: 'The 15-second walkthrough — 9:16', s: 'Handheld, first person, from the car park to the table. Cyberjaya parking is a real objection and you answer it without saying a word. Caption the LRT/parking line on screen.', fmt: 'Stories' },
  { t: 'Owner-to-camera, unpolished — 9:16, 20 seconds', s: 'You, in the restaurant, phone camera, no edit: "Promo ni habis hujung September. Tomyam free. Kalau nak datang, WhatsApp kami." Low-production owner footage consistently outperforms polished work for local restaurants because it reads as real rather than as an ad.', fmt: 'Reels + Stories' },
]

export const POSTING = [
  { t: 'Shoot once, cut many', s: 'One 90-minute session in the restaurant gives you every creative above. Shoot vertical 4K so you can crop to 1:1 and 4:5 without reshooting. Always record sound — 7,407 video views this period means sound-on autoplay is doing real work.' },
  { t: 'Hook in the first second, not the third', s: 'Your CTR says people stop. Depth says they do not follow through. Put the offer on frame one, not after a beauty shot. The beauty shot is what keeps them past second three.' },
  { t: 'Post organically before you promote', s: 'Put each cut on the page first. Anything that outperforms organically becomes the next ad. Free testing, and it builds the page that people check before messaging you.' },
  { t: 'Match the format to the placement', s: 'FB Stories is your cheapest result and wants 9:16 with on-screen text — most people watch muted the first time. FB Feed wants a strong first frame because it competes in a scrolling column.' },
  { t: 'Three new cuts a week during the promo', s: 'You have until end of September. Creative fatigue shows up as CTR decay — yours already slipped from 6.55% to 4.88% between periods. Fresh cuts reset it.' },
  { t: 'Film the free tomyam being served, every time', s: 'The giveaway is the offer. Most of your library sells the set. Almost none of it sells the free thing, which is the part that makes the price feel like a deal.' },
]
