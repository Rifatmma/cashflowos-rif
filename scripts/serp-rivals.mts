// 👉 Who we actually compete with in a market, read off the search results.
//
// Two steps, because the SERP itself comes from the Semrush MCP connector,
// which lives in a Claude session and not in this process:
//
//   1. pick the searches
//      npx tsx --conditions=react-server --env-file=.env scripts/serp-rivals.mts malaysia --queries
//
//      Prints the searches worth reading the results for: our own non-brand,
//      on-topic searches in that country, biggest first. Our own demand, not a
//      guess at what matters.
//
//   2. read who ranks, then count
//      npx tsx --conditions=react-server --env-file=.env scripts/serp-rivals.mts malaysia --serps serps.json [--save]
//
//      serps.json is [{ "query": "...", "rows": [{ "pos": 1, "domain": "...", "url": "..." }] }]
//      which is what phrase_organic returns, one call per search.
//
// Replaces the shared-keyword competitor report, which could only find rivals
// in proportion to how much we already ranked -- so it was least useful in the
// markets that needed it most. See lib/mw-serp-rivals.ts for what that cost us.

import { readFileSync } from 'fs'
import { rankRivals, ourPlaces, type Serp } from '../lib/mw-serp-rivals'
import { COUNTRIES, isBrand, isRelevant, dbOf } from '../lib/mw-markets'
import { supabase, supabaseConfigured } from '../lib/supabase'

const args = process.argv.slice(2)
const countryKey = args.find(a => !a.startsWith('--'))
const save = args.includes('--save')
const wantQueries = args.includes('--queries')
const serpsAt = args[args.indexOf('--serps') + 1]

const found = COUNTRIES.find(c => c.country.key === countryKey)
if (!found) { console.error('usage: serp-rivals.mts <country-key> --queries | --serps <file> [--save]'); process.exit(1) }
const { country, market } = found

if (wantQueries) {
  // WHICH SEARCHES TO READ THE RESULTS FOR MUST COME FROM THE MARKET, NOT US.
  //
  // The first version took them from our own Search Console impressions. That
  // is the same circularity the shared-keyword competitor report had, one step
  // earlier: Search Console only holds searches we ALREADY appear for, so a
  // term we are invisible on never enters the list, and the market's biggest
  // commercial search can be missing from the very list meant to find it.
  //
  //   "getting demand from the search console is wrong. The search console
  //    should act as an identifier of where we are ranked as of now."
  //                                                 (owner, 13 Oct 2026)
  //
  // So demand comes from Semrush keyword research for that country -- what
  // people search there, whether or not we rank -- and Search Console is used
  // below for the one thing it actually knows: where we sit today.
  const at = args[args.indexOf('--queries') + 1]
  if (!at || at.startsWith('--')) {
    console.error('usage: --queries <market-keywords.tsv>   (keyword<TAB>volume, from Semrush keyword research for this country)')
    process.exit(1)
  }
  const picked = readFileSync(at, 'utf8').split(/\r?\n/)
    .map(l => l.split('\t'))
    .map(([q, v]) => ({ q: String(q ?? '').trim().toLowerCase(), vol: Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0 }))
    .filter(r => r.q && !isBrand(r.q) && isRelevant(r.q))
    .sort((a, b) => b.vol - a.vol)
    .slice(0, 12)

  // Where we rank today, so the SERP read can be checked against it rather
  // than guessed at from how deep the pull happened to go.
  const mine = new Map<string, number>()
  if (supabaseConfigured) {
    const { data } = await supabase.from('mw_market_seo')
      .select('keywords, gsc_keywords').eq('country', country.key)
      .order('cycle', { ascending: false }).limit(1).maybeSingle()
    for (const k of [...((data?.gsc_keywords ?? []) as any[]), ...((data?.keywords ?? []) as any[])]) {
      const q = String(k.q ?? '').trim().toLowerCase()
      const pos = Number(k.pos) || 0
      if (q && pos > 0) mine.set(q, Math.min(mine.get(q) ?? 999, pos))
    }
  }

  console.log(`# ${country.label} — Semrush database "${dbOf(country) ?? '?'}"`)
  console.log(`# Read the organic results for each, in that database.`)
  console.log(`# "we" is where Search Console says we sit today — read at least that deep.
`)
  for (const r of picked) {
    const p = mine.get(r.q)
    console.log(`${r.q}\t${r.vol}\twe ${p ? '#' + Math.round(p) : '—'}`)
  }
  process.exit(0)
}

if (!serpsAt) { console.error('need --queries or --serps <file>'); process.exit(1) }
const serps = JSON.parse(readFileSync(serpsAt, 'utf8')) as Serp[]
const rivals = rankRivals(serps)
const us = ourPlaces(serps)

console.log(`${country.label} (${market.label}) — ${serps.length} searches read\n`)
console.log('  rival                              seen  best  median  score')
for (const r of rivals.slice(0, 12)) {
  console.log(`  ${r.domain.padEnd(34)} ${String(r.appearances).padStart(4)} ${String(r.best).padStart(5)} ${String(r.median).padStart(7)} ${String(r.score).padStart(6)}`)
}

console.log('\n  where we came in:')
for (const m of us) {
  console.log(`    ${m.pos ? '#' + Math.round(m.pos) : `not in the top ${m.depth} read`}  ${m.query}`)
}
if (us.some(m => !m.pos)) {
  console.log(`
    Absent above means absent from the rows read, NOT absent from Google.`)
  console.log(`    Read deeper before concluding we do not rank.`)
}

const top = rivals[0]
if (top) {
  console.log(`\n  ${top.domain} ranks for ${top.appearances} of the ${serps.length}, best #${top.best}. Its pages:`)
  for (const p of top.pages) console.log(`    ${p}`)
}

if (!save) { console.log('\n  dry run — nothing written. Add --save.'); process.exit(0) }
if (!supabaseConfigured) { console.error('no database configured'); process.exit(1) }

const cycle = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
const { data: existing } = await supabase.from('mw_market_seo')
  .select('*').eq('cycle', cycle).eq('country', country.key).maybeSingle()

// Its own column, like every other source here: a SERP read must not blank
// what Semrush or Search Console put in the row.
const { error } = await supabase.from('mw_market_seo').upsert({
  ...(existing ?? { ga4_sessions: 0, ga4_leads: 0 }),
  cycle, country: country.key, market: market.key,
  serp_rivals: rivals.slice(0, 20),
  serp_queries: serps.map(s => s.query),
  serp_pulled_at: new Date().toISOString(),
  pulled_at: new Date().toISOString(),
} as any, { onConflict: 'cycle,country' })
if (error) { console.error('\n  save failed: ' + error.message); process.exit(1) }
console.log(`\n  saved ${Math.min(rivals.length, 20)} rivals for ${country.label} into ${cycle}`)
