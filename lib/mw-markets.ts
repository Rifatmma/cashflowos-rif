// 👉 The ten Moving Walls markets, the countries inside each, and who owns them.
// Pure data — no server imports, so the planner can be tested without network.
//
// OWNERS are the DRIs from the September Marketwise plan: the marketer who
// writes the page, not the regional sales lead (owner, 29 Sep 2026). The sheet
// left Philippines and ANZ blank; he assigned them to Deewakshi and Sumaiya.
//
// THE SHAPE FOLLOWS THE SITE, not a tidy idea of regions. movingwalls.com is
// organised by COUNTRY (/locations/india, /locations/uae) with cities beneath
// (/locations/india/bengaluru), so that is what a task has to talk about. A
// market is just the grouping that decides whose name goes on the work.
//
// `page` is where that country's page SHOULD live. Whether it exists is read
// from sitemap.xml at run time — that difference is itself a task.

export type Country = {
  key: string          // the /locations/<key> slug
  label: string
  iso3: string         // as Search Console reports it
  ga4: string          // as GA4 names it
  /** Cities worth their own page in this country, whether or not one exists. */
  cities: string[]
}

/**
 * People who work across every market rather than inside one.
 *
 * `pages` builds new pages and owns on-page SEO on them -- meta title, meta
 * description, schema markup, internal links, submission -- so a "there is no
 * page for this country" task is his, not the market DRI's. The DRI still
 * supplies the local proof point, and rides on the task as `support`
 * (Dinesh, added by the owner 29 Sep 2026).
 */
export type Specialists = { pages: string | null }
export const SPECIALIST_SEED: Specialists = { pages: 'Dinesh' }

export type Market = {
  key: string
  label: string
  owner: string | null
  lead: string | null
  countries: Country[]
}

const c = (key: string, label: string, iso3: string, ga4: string, cities: string[] = []): Country =>
  ({ key, label, iso3, ga4, cities })

export const MARKETS: Market[] = [
  {
    key: 'mena', label: 'MENA', owner: 'Rukshana', lead: 'NM',
    countries: [
      c('uae', 'UAE', 'ARE', 'United Arab Emirates', ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah']),
      c('saudi-arabia', 'Saudi Arabia', 'SAU', 'Saudi Arabia', ['Riyadh', 'Jeddah', 'Dammam']),
      c('qatar', 'Qatar', 'QAT', 'Qatar', ['Doha']),
      c('oman', 'Oman', 'OMN', 'Oman', ['Muscat']),
      c('kuwait', 'Kuwait', 'KWT', 'Kuwait', []),
      c('bahrain', 'Bahrain', 'BHR', 'Bahrain', []),
    ],
  },
  {
    key: 'europe', label: 'Europe', owner: 'Sumaiya', lead: 'Venkat',
    countries: [
      c('united-kingdom', 'United Kingdom', 'GBR', 'United Kingdom', ['London', 'Manchester', 'Birmingham', 'Glasgow', 'Leeds']),
      c('germany', 'Germany', 'DEU', 'Germany', ['Berlin', 'Munich', 'Hamburg']),
      c('france', 'France', 'FRA', 'France', ['Paris']),
      c('netherlands', 'Netherlands', 'NLD', 'Netherlands', ['Amsterdam']),
      c('switzerland', 'Switzerland', 'CHE', 'Switzerland', ['Zurich']),
      c('czech-republic', 'Czech Republic', 'CZE', 'Czechia', ['Prague']),
      c('romania', 'Romania', 'ROU', 'Romania', ['Bucharest']),
      c('europe', 'Europe (regional)', 'ESP', 'Spain', []),
    ],
  },
  {
    key: 'africa', label: 'Sub-Saharan Africa', owner: 'Savita', lead: 'Nelen',
    countries: [
      c('south-africa', 'South Africa', 'ZAF', 'South Africa', ['Johannesburg', 'Cape Town', 'Durban']),
      c('nigeria', 'Nigeria', 'NGA', 'Nigeria', ['Lagos', 'Abuja']),
      c('kenya', 'Kenya', 'KEN', 'Kenya', ['Nairobi']),
      c('ghana', 'Ghana', 'GHA', 'Ghana', ['Accra']),
      c('uganda', 'Uganda', 'UGA', 'Uganda', ['Kampala']),
      c('africa', 'Africa (regional)', 'TZA', 'Tanzania', []),
    ],
  },
  {
    key: 'americas', label: 'Americas', owner: 'Sherlee', lead: 'Eric, Marucio',
    countries: [
      c('united-states', 'United States', 'USA', 'United States', ['New York', 'Los Angeles', 'Chicago', 'Miami']),
      c('canada', 'Canada', 'CAN', 'Canada', ['Toronto', 'Vancouver']),
      c('brazil', 'Brazil', 'BRA', 'Brazil', ['Sao Paulo']),
      c('mexico', 'Mexico', 'MEX', 'Mexico', ['Mexico City']),
      c('americas', 'Americas (regional)', 'ARG', 'Argentina', []),
    ],
  },
  {
    key: 'japan', label: 'Japan', owner: 'Sherlee', lead: 'Yoshi San',
    countries: [c('japan', 'Japan', 'JPN', 'Japan', ['Tokyo', 'Osaka', 'Nagoya', 'Fukuoka'])],
  },
  {
    key: 'india', label: 'India', owner: 'Sukrithi', lead: 'NM',
    countries: [
      c('india', 'India', 'IND', 'India',
        ['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Kerala',
          'Ahmedabad', 'Jaipur', 'Nagpur', 'Lucknow']),
    ],
  },
  {
    key: 'north-asia', label: 'North Asia', owner: 'Sai', lead: 'Manson',
    countries: [
      c('china', 'China', 'CHN', 'China', ['Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou']),
      c('hong-kong', 'Hong Kong', 'HKG', 'Hong Kong', []),
      c('south-korea', 'South Korea', 'KOR', 'South Korea', ['Seoul', 'Busan']),
      c('taiwan', 'Taiwan', 'TWN', 'Taiwan', ['Taipei']),
    ],
  },
  {
    key: 'philippines', label: 'Philippines', owner: 'Deewakshi', lead: 'Norman',
    countries: [c('philippines', 'Philippines', 'PHL', 'Philippines', ['Manila', 'Cebu', 'Davao'])],
  },
  {
    key: 'anz', label: 'ANZ', owner: 'Sumaiya', lead: 'Quentin',
    countries: [
      c('australia', 'Australia', 'AUS', 'Australia', ['Sydney', 'Melbourne', 'Brisbane', 'Perth']),
      c('new-zealand', 'New Zealand', 'NZL', 'New Zealand', ['Auckland']),
    ],
  },
  {
    key: 'sea', label: 'SEA', owner: 'Deewakshi', lead: 'Derek',
    countries: [
      c('malaysia', 'Malaysia', 'MYS', 'Malaysia', ['Kuala Lumpur', 'Selangor', 'Johor Bahru', 'Penang']),
      c('singapore', 'Singapore', 'SGP', 'Singapore', []),
      c('thailand', 'Thailand', 'THA', 'Thailand', ['Bangkok', 'Phuket']),
      c('indonesia', 'Indonesia', 'IDN', 'Indonesia', ['Jakarta', 'Surabaya']),
      c('vietnam', 'Vietnam', 'VNM', 'Vietnam', ['Ho Chi Minh City', 'Hanoi']),
      c('sri-lanka', 'Sri Lanka', 'LKA', 'Sri Lanka', ['Colombo']),
    ],
  },
]

/**
 * Semrush regional database codes. They are ISO-3166 alpha-2 in lower case with
 * exceptions that bite: the United Kingdom is "uk", not "gb", and mainland
 * China and Tanzania have no database at all. A country with no code here gets
 * no Semrush data and says so -- it is a gap, not an error.
 */
const SEMRUSH_DB: Record<string, string> = {
  ARE: 'ae', SAU: 'sa', QAT: 'qa', OMN: 'om', KWT: 'kw', BHR: 'bh',
  GBR: 'uk', DEU: 'de', FRA: 'fr', NLD: 'nl', CHE: 'ch', CZE: 'cz', ROU: 'ro', ESP: 'es',
  ZAF: 'za', NGA: 'ng', KEN: 'ke', GHA: 'gh', UGA: 'ug',
  USA: 'us', CAN: 'ca', BRA: 'br', MEX: 'mx', ARG: 'ar',
  JPN: 'jp', IND: 'in', HKG: 'hk', KOR: 'kr', TWN: 'tw', PHL: 'ph',
  AUS: 'au', NZL: 'nz',
  MYS: 'my', SGP: 'sg', THA: 'th', IDN: 'id', VNM: 'vn', LKA: 'lk',
}

/**
 * A search is "brand" when it names us. He chose company name only: product
 * names (MW Planner and the rest) deliberately count as NON-brand, because he
 * wants the strictest honest read of what we earn from people who do not
 * already know us (owner, 29 Sep 2026).
 *
 * This matters beyond a chart. We rank #1 for our own name everywhere, so a
 * brand search looks like a wonderful opportunity to any rule that only reads
 * position and volume -- and chasing it would be work that changes nothing.
 */
// Our own people count too. With the company name filtered, the first clean
// run still raised "Two of our pages compete for srikanth ramachandran in
// India" — our founder. Nobody is competing with us for his name either, and
// the pages that rank for it are a press release and a profile, which is
// correct (14 Oct 2026).
const BRAND = /mov(?:ing|ng|nig)?\s*-?\s*wall|movingwall|srikanth\s*ramachandran|location\s*media\s*xchange|lmx\b/i
export const isBrand = (q: string) => BRAND.test(String(q || ''))

/**
 * Is this search our business at all?
 *
 * "Moving Walls" is an unfortunate name for SEO: the homepage ranks for
 * "how to clean fungus from walls", "best color curtains for cream walls" and
 * "termites in brick walls" -- hundreds of searches a month of pure noise.
 * To a rule that only reads position and volume those look like the biggest
 * opportunities on the board, and a market lead would waste a week on them.
 *
 * So a search has to name something we sell. This is deliberately a list of
 * our industry rather than a list of junk: new nonsense appears constantly,
 * new ways to say "billboard" do not (owner, 29 Sep 2026).
 */
// WRITTEN AS REGEXES, NOT STRINGS, AND THAT IS THE WHOLE POINT.
//
// These were quoted strings, and three of them contained `\b` — which inside a
// JavaScript string literal is a BACKSPACE character, not a word boundary. So
// `'\bads?\b'` compiled to <BS>ads?<BS> and matched nothing, ever. Silently:
// the regex was valid, it just could not fire.
//
// What that cost, measured on Malaysian market demand 13 Oct 2026:
//
//   malaysia ads     1,000 searches a month   dropped as "not our industry"
//   outdoor ads                               dropped
//   ad space                                  dropped
//
// Every relevance decision in every market ran through this — the gap cleaner,
// the city audit, the opportunity list, the SERP seeds. scripts/fix-control-chars.mjs
// could not catch it either: the file holds a backslash and a `b`, two ordinary
// characters, and only becomes a control character when the string is parsed.
//
// Regex literals cannot have this bug. `/\bads?\b/` means what it looks like.
const INDUSTRY_PARTS = [
  /billboard/, /hoarding/, /bigboard/, /unipole/, /signage/, /banner/,
  /ooh/, /dooh/, /pdooh/, /out.?of.?home/, /outdoor advert/, /outdoor ads?\b/,
  /advertis/, /\bads?\b/, /\bad (?:space|board|network)/, /media (?:owner|buying|planning)/,
  /programmatic/, /digital screen/, /led screen/, /audience measurement/,
  /campaign/, /bus shelter/, /transit media/, /mrt ads/, /retail media/,
]
const INDUSTRY = new RegExp(INDUSTRY_PARTS.map(r => r.source).join('|'), 'i')

/**
 * Things that carry an industry word and are not our industry.
 *
 * "billboard" is three different famous nouns. Without this, Australia's gap
 * offered a topic called "billboards" worth 8,320 searches a month, of which
 * 1,300 was `billboards ebbing missouri` -- the Martin McDonagh film -- and
 * 1,900 was `billboard 200`, the music chart. A market lead planning against
 * that number is planning against a fifth fiction.
 *
 * Deliberately short and specific. A long exclusion list starts eating real
 * searches, and a gap topic wrongly deleted is invisible, where a junk one
 * merely wastes a reading.
 */
// Regex literals, for the reason given above INDUSTRY: the third entry here
// was `'\bbillboard (?:top|charts)\b'`, whose \b were backspace characters, so
// it had never matched anything. It only looked like it worked because the
// line above it catches "billboard charts" on the word "chart".
const NOT_OURS_PARTS = [
  /ebbing/,                        // Three Billboards Outside Ebbing, Missouri
  /billboard (?:200|hot ?100|chart|music|magazine|awards)/,
  /\bbillboard (?:top|charts)\b/,

  // OTHER PEOPLE'S CHANNELS.
  //
  // Reading competitors off the search results brings in full-service
  // agencies, because they rank for the same searches we do. Comparing against
  // advertising.com.my — Malaysia's leader, and an agency — put "youtube
  // advertising" (590/mo) and "social media advertising agency malaysia" into
  // the content gap as things we should write about. We sell out of home. A
  // task telling a market lead to go after YouTube is worse than no task.
  //
  // Cinema is deliberately NOT here: it is bought out of the same budget and
  // sits in the same plan, and UAE already earns impressions for it.
  /\b(?:youtube|radio|television|\btv\b|newspaper|print|podcast|email|sms|whatsapp)\s+(?:advertis|ads?\b|marketing)/,
  /social media (?:advertis|marketing|agency)/,
  /(?:facebook|instagram|tiktok|google|linkedin|twitter)\s+ads?\b/,

  // SOMEONE ELSE'S COMPANY NAME.
  //
  // Pulling the gap against four rivals surfaced their rivals in turn, and
  // Malaysia's biggest "topic" came back worth 4,080 searches a month with
  // `mo advertising sdn bhd` (260) and `oyes advertising` inside it. A person
  // typing a company's registered name is looking for that company, not for a
  // billboard — the click cannot be won and would not convert if it were.
  //
  // Matched on the legal suffix only, which is a fact rather than a guess. A
  // bare trading name like "wan advertising" is indistinguishable from a real
  // service search without a company list, so those still get through; the
  // suffix catches the clearest cases without inventing a rule.
  /\b(?:sdn\.?\s*bhd|pte\.?\s*ltd|pvt\.?\s*ltd|co\.?\s*ltd|berhad)\b/,

  // PRESS AND CLASSIFIED ADVERTISING.
  //
  // Several of the agencies that rank for outdoor terms in India also place
  // newspaper classifieds, so the gap came back offering `name change
  // advertisement in newspaper mumbai` (20,040 a month) and `advertisement in
  // marathi`. These are real, large searches and they are somebody else's
  // business entirely — a legal notice in a newspaper is not out of home.
  //
  // Caught by the medium wherever it appears, rather than only before the word
  // "advertising", because Indian phrasing puts it after.
  /\bnewspaper\b/,
  /\bclassified(?:s|\s+ad)/,
  /\b(?:matrimonial|obituary)\b/,
  /\bname change\b/,
  /\btender notice\b/,
]
const NOT_OURS = new RegExp(NOT_OURS_PARTS.map(r => r.source).join('|'), 'i')

export const isRelevant = (q: string) =>
  INDUSTRY.test(String(q || '')) && !NOT_OURS.test(String(q || ''))

/**
 * A Google search for this phrase, as run from that country.
 *
 * Rif's point: a task that says "read how gohoardings.com answers it" is
 * telling rather than showing. A link to the actual result page shows who
 * ranks, what their title says and how they framed it — in one click, for
 * every search on every task (owner, 30 Sep 2026).
 *
 * `gl` is an ISO-3166 alpha-2 country, which is the Semrush database code
 * everywhere except the United Kingdom: Semrush calls it "uk", Google wants
 * "gb", and getting that wrong silently returns US results.
 */
export function serpUrl(q: string, co?: Country | null): string {
  const db = co ? dbOf(co) : null
  const gl = db === 'uk' ? 'gb' : db
  const p = new URLSearchParams({ q: String(q || '') })
  if (gl) p.set('gl', gl)
  p.set('num', '20')
  return `https://www.google.com/search?${p}`
}

/** The Semrush database for a country, or null where Semrush has none. */
export const dbOf = (co: Country): string | null => SEMRUSH_DB[co.iso3] ?? null

/** Country by Semrush database code, with the market it sits in. */
export function marketOfDb(db: string): { country: Country; market: Market } | null {
  const d = String(db || '').toLowerCase()
  return COUNTRIES.find(x => dbOf(x.country) === d) ?? null
}

export const MARKET = Object.fromEntries(MARKETS.map(m => [m.key, m])) as Record<string, Market>

/** Every country, with the market it belongs to. */
export const COUNTRIES: { country: Country; market: Market }[] =
  MARKETS.flatMap(m => m.countries.map(country => ({ country, market: m })))

/** Where a country's page belongs, whether or not it has been built. */
export const pageFor = (country: Country) => `/locations/${country.key}`
export const cityPageFor = (country: Country, city: string) =>
  `/locations/${country.key}/${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

export function marketOfCountry(iso3: string): { country: Country; market: Market } | null {
  const c3 = String(iso3 || '').toUpperCase()
  return COUNTRIES.find(x => x.country.iso3 === c3) ?? null
}

export function marketOfGa4(name: string): { country: Country; market: Market } | null {
  const n = String(name || '').trim().toLowerCase()
  return COUNTRIES.find(x => x.country.ga4.toLowerCase() === n) ?? null
}

/** Owners are editable in the dashboard (mw_settings.market_owners), not in code. */
export function withOwners(overrides: Record<string, { owner?: string | null; lead?: string | null }> = {}): Market[] {
  return MARKETS.map(m => {
    const o = overrides[m.key]
    return o ? { ...m, owner: o.owner ?? m.owner, lead: o.lead ?? m.lead } : m
  })
}

export const OWNER_SEED = Object.fromEntries(MARKETS.map(m => [m.key, { owner: m.owner, lead: m.lead }]))

/** Same rule as owners: a name change is a settings edit, not a deploy. */
export function withSpecialists(overrides: Partial<Specialists> = {}): Specialists {
  return { pages: overrides.pages !== undefined ? overrides.pages : SPECIALIST_SEED.pages }
}
