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
const BRAND = /mov(?:ing|ng|nig)?\s*-?\s*wall|movingwall/i
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
const INDUSTRY = new RegExp([
  'billboard', 'hoarding', 'bigboard', 'unipole', 'signage', 'banner',
  'ooh', 'dooh', 'pdooh', 'out.?of.?home', 'outdoor advert', 'outdoor ads?',
  'advertis', 'ads?', 'ad (?:space|board|network)', 'media (?:owner|buying|planning)',
  'programmatic', 'digital screen', 'led screen', 'audience measurement',
  'campaign', 'bus shelter', 'transit media', 'mrt ads', 'retail media',
].join('|'), 'i')

export const isRelevant = (q: string) => INDUSTRY.test(String(q || ''))

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
