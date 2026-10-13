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
  if (!supabaseConfigured) { console.error('no database configured'); process.exit(1) }
  const { data } = await supabase.from('mw_market_seo')
    .select('keywords, gsc_keywords').eq('country', country.key)
    .order('cycle', { ascending: false }).limit(1).maybeSingle()

  // Our own searches, biggest first. Brand is excluded because nobody
  // competes with us for our own name, so a SERP for it names no rivals.
  const rows = [
    ...((data?.gsc_keywords ?? []) as any[]).map(k => ({ q: String(k.q ?? ''), n: Number(k.impr) || 0 })),
    ...((data?.keywords ?? []) as any[]).map(k => ({ q: String(k.q ?? ''), n: Number(k.vol) || 0 })),
  ]
  const best = new Map<string, number>()
  for (const r of rows) {
    const q = r.q.trim().toLowerCase()
    if (!q || isBrand(q) || !isRelevant(q)) continue
    best.set(q, Math.max(best.get(q) ?? 0, r.n))
  }
  const picked = [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  console.log(`# ${country.label} — Semrush database "${dbOf(country) ?? '?'}"`)
  console.log(`# Read the organic results for each of these, in that database.\n`)
  for (const [q, n] of picked) console.log(`${q}\t${n}`)
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
