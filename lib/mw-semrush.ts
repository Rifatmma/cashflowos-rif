import 'server-only'
// 👉 Semrush, read straight from api.semrush.com with our own key.
//
// WHY NOT COMPOSIO. The Composio connection reports active but the stored
// Semrush key is rejected (`ERROR 120 :: WRONG KEY`), and there is no way to
// fix that from here. So this takes the same road as the Meta system token:
// one env var, a direct call, and an honest error when it is missing. Set
// SEMRUSH_API_KEY in Vercel (Semrush → Profile → Subscription info → API).
//
// WHY SEMRUSH AND NOT SEARCH CONSOLE. Search Console would be better -- it is
// our own data -- but the connected Google account gets 403 on the property
// and only a person with owner rights can fix that. Semrush needs nobody's
// permission, covers all ten markets on day one, and gives three things GSC
// does not: search volume, keyword difficulty, and what competitors rank for.
// When Search Console is connected the two can be merged; nothing here blocks
// that (owner, 29 Sep 2026).
//
// UNITS COST REAL MONEY. domain_ranks is ~310 units for every market at once;
// each per-market keyword pull is ~150. So the run asks domain_ranks first and
// only pulls keywords for databases that actually have some.

const API = 'https://api.semrush.com/'

export type SemrushDbRow = {
  db: string
  rank: number
  keywords: number
  traffic: number
  cost: number
}

export type SemrushKeyword = {
  q: string
  pos: number
  /**
   * Position at the previous pull. Semrush sends 0 for a keyword that is
   * genuinely new. -1 means WE DID NOT ASK — the column was absent from the
   * response, so nothing is known either way. The two must never be conflated:
   * treating "unknown" as "new" turned whole markets into lists of fake wins
   * on the momentum board (owner, 29 Sep 2026).
   */
  prev: number
  vol: number
  cpc: number
  url: string
  traffic: number
  kd: number
  /** Semrush intent: 0 commercial, 1 informational, 2 navigational, 3 transactional. */
  intent: number
}

export type SemrushCompetitor = { domain: string; common: number; keywords: number; traffic: number }

function key(): string {
  const k = process.env.SEMRUSH_API_KEY?.trim()
  if (!k) throw new Error('SEMRUSH_API_KEY is not set — add it in Vercel (Semrush → Subscription info → API)')
  return k
}

/**
 * Semrush answers in semicolon-separated CSV with a header row, and reports
 * failure as a bare `ERROR nnn :: text` body with HTTP 200 — so the status code
 * cannot be trusted and the body has to be read.
 */
type Row = Record<string, string>

/**
 * Rows are keyed by the HEADER Semrush sends, never by column position. The
 * short export_columns codes are easy to get subtly wrong -- `Tr` means
 * traffic in one report and traffic share in another, and `Np` and `Or` are
 * neighbours in the competitor report. A silent off-by-one column would put
 * believable wrong numbers in front of the team; reading the header turns a
 * bad code into a missing field instead of a plausible lie.
 */
async function call(type: string, params: Record<string, string>): Promise<Row[]> {
  const q = new URLSearchParams({ type, key: key(), ...params })
  const res = await fetch(`${API}?${q}`, { signal: AbortSignal.timeout(30_000) })
  const body = (await res.text()).trim()
  if (/^ERROR\s/i.test(body)) {
    if (/NOTHING FOUND/i.test(body)) return []
    throw new Error(`semrush ${type}: ${body.slice(0, 120)}`)
  }
  if (!res.ok) throw new Error(`semrush ${type}: HTTP ${res.status}`)
  const lines = body.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean)
  if (lines.length < 2) return []
  const head = lines[0].split(';').map(h => h.trim().toLowerCase())
  return lines.slice(1).map(l => {
    const cells = l.split(';')
    const row: Row = {}
    head.forEach((h, i) => { row[h] = String(cells[i] ?? '').trim() })
    return row
  })
}

const n = (v: string | undefined) => {
  const x = Number(String(v ?? '').trim())
  return Number.isFinite(x) ? x : 0
}

/** First header that exists, so a renamed column degrades to 0 rather than shifting everything. */
const col = (r: Row, ...names: string[]) => names.map(x => r[x]).find(v => v !== undefined)

/** Every regional database we appear in, in one call. The cheapest overview there is. */
export async function fetchDbRanks(domain: string): Promise<SemrushDbRow[]> {
  const rows = await call('domain_ranks', {
    domain,
    export_columns: 'Db,Dn,Rk,Or,Ot,Oc',
    display_limit: '200',
  })
  return rows
    .map(r => ({
      db: String(col(r, 'database') ?? '').trim(),
      rank: n(col(r, 'rank')),
      keywords: n(col(r, 'organic keywords')),
      traffic: n(col(r, 'organic traffic')),
      cost: n(col(r, 'organic cost')),
    }))
    .filter(r => r.db)
}

/** The keywords one market ranks for, strongest traffic first. */
export async function fetchKeywords(domain: string, db: string, limit = 120): Promise<SemrushKeyword[]> {
  const rows = await call('domain_organic', {
    domain,
    database: db,
    display_limit: String(limit),
    display_sort: 'tr_desc',
    export_columns: 'Ph,Po,Pp,Nq,Cp,Ur,Tr,Kd,In',
  })
  return rows.map(r => ({
    q: String(col(r, 'keyword') ?? '').trim(),
    pos: n(col(r, 'position')),
    prev: col(r, 'previous position') === undefined ? -1 : n(col(r, 'previous position')),
    vol: n(col(r, 'search volume')),
    cpc: n(col(r, 'cpc')),
    url: String(col(r, 'url') ?? '').trim(),
    traffic: n(col(r, 'traffic')),
    kd: n(col(r, 'keyword difficulty')),
    intent: n(col(r, 'intents', 'intent')),
  })).filter(k => k.q)
}

/** Who else ranks for the same searches in this market. */
export async function fetchCompetitors(domain: string, db: string, limit = 10): Promise<SemrushCompetitor[]> {
  const rows = await call('domain_organic_organic', {
    domain,
    database: db,
    display_limit: String(limit),
    export_columns: 'Dn,Cr,Np,Or,Ot',
  })
  return rows
    .map(r => ({
      domain: String(col(r, 'domain') ?? '').trim(),
      common: n(col(r, 'common keywords')),
      keywords: n(col(r, 'organic keywords')),
      traffic: n(col(r, 'organic traffic')),
    }))
    .filter(c => c.domain && c.domain !== domain)
}

/**
 * What a competitor ranks for that we do not. Semrush has no single "gap"
 * endpoint on this plan, so it is their keywords minus ours -- which is the
 * same answer and costs one call per competitor.
 */
export async function fetchRivalKeywords(rival: string, db: string, limit = 100): Promise<SemrushKeyword[]> {
  return fetchKeywords(rival, db, limit)
}

// ------------------------------------------------------------------- brand
// One definition, in lib/mw-markets.ts, so the chart and the planner can
// never disagree about what counts as our own name.
export { isBrand } from './mw-markets'
import { isBrand } from './mw-markets'

export function brandSplit(kws: SemrushKeyword[]): { brand: number; nonBrand: number; brandTraffic: number; nonBrandTraffic: number } {
  let b = 0, nb = 0
  for (const k of kws) (isBrand(k.q) ? (b += k.traffic) : (nb += k.traffic))
  const total = b + nb
  return {
    brand: total ? Math.round((b / total) * 1000) / 10 : 0,
    nonBrand: total ? Math.round((nb / total) * 1000) / 10 : 0,
    brandTraffic: b,
    nonBrandTraffic: nb,
  }
}

// --------------------------------------------------------------------- gap
/**
 * Searches the rivals rank for and we do not, in one call per market.
 *
 * `domain_domains` takes up to five domains with sign operators: `-` on us
 * means "exclude anything movingwalls ranks for", `+` on each rival means
 * "include anything they rank for". The result is the gap.
 *
 * THIS IS THE EXPENSIVE CALL. Thirty rows for one market cost 2,400 units,
 * against ~150 for a whole keyword pull, which is why the gap runs quarterly
 * and everything else monthly (owner, 29 Sep 2026).
 */
export async function fetchGap(
  domain: string,
  db: string,
  rivals: string[],
  limit = 60,
): Promise<{ rows: { q: string; vol: number; cpc: number; kd: number; theirBest: number; rival: string }[]; raw: number }> {
  const use = rivals.filter(Boolean).slice(0, 4)
  if (!use.length) return { rows: [], raw: 0 }

  const domains = [
    { sign: '-', type: 'organic', domain },
    ...use.map(r => ({ sign: '+', type: 'organic', domain: r })),
  ]
  // position_domain_1 is us and is always absent by construction, so only the
  // rival columns are asked for.
  const cols = ['keyword', ...use.map((_, i) => `position_domain_${i + 2}`), 'volume', 'cpc', 'keyword_difficulty']

  const rows = await call('domain_domains', {
    database: db,
    domains: JSON.stringify(domains),
    display_limit: String(limit),
    display_sort: 'volume_desc',
    export_columns: cols.join(','),
  })

  const out = rows.map(r => {
    // Each rival's column is headed with its domain name.
    let theirBest = 999, rival = ''
    for (const d of use) {
      const p = n(r[d.toLowerCase()])
      if (p > 0 && p < theirBest) { theirBest = p; rival = d }
    }
    return {
      q: String(col(r, 'keyword') ?? '').trim(),
      vol: n(col(r, 'search volume')),
      cpc: Number(col(r, 'cpc') ?? 0),
      kd: n(col(r, 'keyword difficulty')),
      theirBest: theirBest === 999 ? 0 : theirBest,
      rival,
    }
  }).filter(r => r.q)

  return { rows: out, raw: rows.length }
}
