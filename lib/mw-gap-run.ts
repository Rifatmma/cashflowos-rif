import 'server-only'
// 👉 Pulling and storing the content gap. Quarterly.
//
// Competitors are NAMED BY THE TEAM, not guessed. Semrush's own suggestions
// for India included iabseaindia.com and ioaa.co.in — both industry
// associations, neither a company we lose a deal to — and for Malaysia it
// offered moving-walls.com, which is a near-miss of our own name. The
// seeded list is a starting point the market lead is expected to correct
// (owner, 29 Sep 2026).

import { supabase, supabaseConfigured } from './supabase'
import { COUNTRIES, dbOf, type Country } from './mw-markets'
import { fetchGap } from './mw-semrush'
import { cleanGap, cluster, worthWriting, type GapCluster, type GapRow } from './mw-gap'

/** e.g. "2026-Q3" — the gap's own cycle, slower than the monthly plan. */
export function quarterOf(d = new Date()): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`
}

/**
 * Semrush's suggestion per market, as a starting point only.
 *
 * Empty for a market means nobody has named anyone yet, and the gap pull
 * skips it rather than inventing rivals.
 */
export const RIVAL_SEED: Record<string, string[]> = {
  india: ['gohoardings.com', 'shubindiaadworks.com', 'trzy.in', 'oapindia.com'],
  malaysia: ['outofhome.com.my', 'skybluemedia.my', 'ledscreenads.com', 'digitalbillboard.com.my'],
  philippines: ['dooh.ph', 'oohphilippines.com', 'strongmediainc.com', 'billboard-advertising.ph'],
  australia: ['caasie.co', 'civicoutdoor.com.au', 'captivevision.com.au', 'mccordmedia.com'],
}

export type RivalMap = Record<string, string[]>

/** The named rivals per country, seeded once then edited in the dashboard. */
export async function getRivals(): Promise<RivalMap> {
  if (!supabaseConfigured) return { ...RIVAL_SEED }
  const { data } = await supabase.from('mw_settings')
    .select('value').eq('key', 'market_rivals').maybeSingle()
  if (!data?.value) {
    await supabase.from('mw_settings')
      .upsert({ key: 'market_rivals', value: RIVAL_SEED }, { onConflict: 'key' })
    return { ...RIVAL_SEED }
  }
  return data.value as RivalMap
}

export async function setRivals(country: string, rivals: string[]): Promise<void> {
  const all = await getRivals()
  all[country] = rivals.map(r => r.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean)
  await supabase.from('mw_settings').upsert({ key: 'market_rivals', value: all }, { onConflict: 'key' })
}

export type GapRun = {
  ok: boolean
  quarter: string
  message: string
  notes: string[]
}

/**
 * Pull the gap for every country with named rivals, clean it, cluster it and
 * store it. Never throws: a market that fails is reported and the rest run.
 */
export async function refreshGaps(opts: { only?: string; limit?: number } = {}): Promise<GapRun> {
  const quarter = quarterOf()
  const notes: string[] = []
  try {
    const rivals = await getRivals()
    const targets = COUNTRIES
      .map(({ country, market }) => ({ country, market, db: dbOf(country), rivals: rivals[country.key] ?? [] }))
      .filter(t => t.db && t.rivals.length && (!opts.only || t.country.key === opts.only))

    if (!targets.length) {
      return { ok: false, quarter, notes, message: 'no market has rivals named yet — name them on /mw/gaps first' }
    }

    let written = 0
    for (const t of targets) {
      try {
        const { rows, raw } = await fetchGap('movingwalls.com', t.db!, t.rivals, opts.limit ?? 60)
        const mine = await ourKeywords(t.country)
        const kept = cleanGap(rows as GapRow[], mine)
        const clusters = cluster(kept).filter(worthWriting)
        await saveGap(quarter, t.country, t.market.key, t.db!, t.rivals, clusters, raw, kept.length)
        written++
        notes.push(`${t.country.label}: ${raw} rows → ${kept.length} relevant → ${clusters.length} topics`)
      } catch (e: any) {
        notes.push(`${t.country.label} failed: ${String(e?.message ?? e).slice(0, 100)}`)
      }
    }

    return { ok: written > 0, quarter, notes, message: `gap ${quarter}: ${written} of ${targets.length} markets pulled` }
  } catch (e: any) {
    return { ok: false, quarter, notes, message: `gap failed: ${String(e?.message ?? e).slice(0, 160)}` }
  }
}

/**
 * What we already rank for in this country, from our own most recent pull.
 *
 * The gap report and our own keyword pull disagree on some rows — "ooh
 * advertising" came back as a gap in India while our own pull has us at #26 —
 * so our own data wins when they conflict. Better to miss a real gap than to
 * send a lead to write a page we already have.
 */
async function ourKeywords(country: Country): Promise<string[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_market_seo')
    .select('keywords').eq('country', country.key).order('cycle', { ascending: false }).limit(1).maybeSingle()
  const ks = (data?.keywords ?? []) as { q?: string }[]
  return ks.map(k => String(k.q ?? '')).filter(Boolean)
}

async function saveGap(
  quarter: string, country: Country, market: string, db: string,
  rivals: string[], clusters: GapCluster[], raw: number, kept: number,
): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase.from('mw_market_gaps').upsert({
    quarter, country: country.key, market, db, rivals,
    clusters, raw_count: raw, kept_count: kept, pulled_at: new Date().toISOString(),
  }, { onConflict: 'quarter,country' })
  if (error) throw new Error(`saving gap: ${error.message}`)
}

// ------------------------------------------------------------------- read
export type CountryGap = {
  country: string
  market: string
  rivals: string[]
  clusters: GapCluster[]
  rawCount: number
  keptCount: number
  quarter: string
}

export async function latestQuarter(): Promise<string | null> {
  if (!supabaseConfigured) return null
  const { data } = await supabase.from('mw_market_gaps')
    .select('quarter').order('quarter', { ascending: false }).limit(1).maybeSingle()
  return data?.quarter ?? null
}

export async function getGaps(quarter?: string): Promise<CountryGap[]> {
  if (!supabaseConfigured) return []
  const q = quarter ?? (await latestQuarter())
  if (!q) return []
  const { data } = await supabase.from('mw_market_gaps').select('*').eq('quarter', q)
  return (data ?? []).map((r: any) => ({
    country: String(r.country), market: String(r.market),
    rivals: Array.isArray(r.rivals) ? r.rivals : [],
    clusters: Array.isArray(r.clusters) ? r.clusters : [],
    rawCount: Number(r.raw_count ?? 0), keptCount: Number(r.kept_count ?? 0),
    quarter: String(r.quarter),
  }))
}
