// 👉 Content-gap files into mw_market_gaps.
//
// Two shapes arrive, because there are two ways to get the data and both are
// still needed:
//
//   WEB EXPORT (comma)  Keyword,Intents,Volume,Keyword Difficulty,CPC,
//                       Competition Density,movingwalls.com,<rival>,
//                       movingwalls.com (pages),<rival> (pages),Results
//     Semrush's own Keyword Gap export. Carries the rival's PAGE, which is
//     what makes a task actionable -- "beat this exact page" rather than
//     "rank better somehow".
//
//   API PULL (semicolon) Keyword;<rival1>;<rival2>;Search Volume;CPC;
//                        Keyword Difficulty
//     The domain_domains report. No page column, but no browser either, and
//     it can union several rivals in one call.
//
// Both reduce to GapRow and go through cleanGap + cluster, which is where the
// judgement lives: a raw gap list is landmarks and film titles. Malaysia's
// biggest "gap" is `taman tun dr ismail` at 33,100 searches, which is a
// suburb, and Australia's includes `3 billboards outside ebbing missouri`.
//
//   npx tsx --conditions=react-server --env-file=.env scripts/gap-import.mts <file> <country> [--save]
//
// Without --save it prints what it would write and touches nothing.

import { readFileSync } from 'fs'
import { cleanGap, cluster, worthWriting, effortOf, ourPositions, gapVerdict, type GapRow } from '../lib/mw-gap'
import { COUNTRIES, dbOf } from '../lib/mw-markets'
import { supabase, supabaseConfigured } from '../lib/supabase'

const [file, countryKey] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const save = process.argv.includes('--save')
if (!file || !countryKey) {
  console.error('usage: gap-import.mts <file> <country-key> [--save]')
  process.exit(1)
}

const found = COUNTRIES.find(c => c.country.key === countryKey)
if (!found) { console.error(`no market owns "${countryKey}"`); process.exit(1) }
const { country, market } = found

const text = readFileSync(file, 'utf8').replace(/^﻿/, '')
const lines = text.split(/\r?\n/).filter(l => l.trim())
const sep = lines[0].includes(';') ? ';' : ','

// Quoted fields only appear in the web export, and only around keywords with
// commas in them. Splitting naively would silently shift every column after it.
function cells(line: string): string[] {
  if (sep === ';') return line.split(';')
  const out: string[] = []
  let cur = '', q = false
  for (const ch of line) {
    if (ch === '"') { q = !q; continue }
    if (ch === ',' && !q) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}

const head = cells(lines[0]).map(h => h.trim())
const num = (s: string) => Number(String(s ?? '').replace(/[^0-9.\-]/g, '')) || 0

const iVol = head.findIndex(h => /^(search )?volume$/i.test(h))
const iCpc = head.findIndex(h => /^cpc$/i.test(h))
const iKd = head.findIndex(h => /keyword difficulty/i.test(h))
// Every column that is a bare domain and is not ours is a rival's position.
const rivalCols = head
  .map((h, i) => ({ h, i }))
  .filter(({ h, i }) =>
    i > 0 && /\./.test(h) && !/\(pages\)/i.test(h) && !/movingwalls\.com/i.test(h) &&
    i !== iVol && i !== iCpc && i !== iKd)
const pageCols = new Map(
  head.map((h, i) => [h.replace(/\s*\(pages\)\s*$/i, '').trim(), i] as const)
    .filter(([h, i]) => /\(pages\)/i.test(head[i])))

// OUR OWN COLUMN, when the export carries one.
//
// A Keyword Gap export has a position column for every domain compared,
// including ours — measured in the same pull, on the same day, for all of
// these searches. That is better evidence about us than the stored keyword
// list, which for Malaysia holds 84 searches against the export's 999. Using
// the database alone, a term we rank #3 for would be treated as "we do not
// rank" simply because nothing had recorded it yet, and proposed as a gap.
const usCol = head.findIndex((h, i) =>
  i > 0 && /movingwalls\.com/i.test(h) && !/\(pages\)/i.test(h))

if (!rivalCols.length) { console.error('no rival column found in: ' + head.join(' | ')); process.exit(1) }

// THE WRONG FILE IS THE EASIEST MISTAKE TO MAKE AND THE HARDEST TO SEE.
//
// Exports all land in Downloads as gap.keywords_<timestamp>.csv, so picking
// "the newest" gets the previous market whenever a download has not finished.
// That is not hypothetical: Germany was once saved with Malaysia's keywords,
// and nothing complained, because the file parsed perfectly well.
//
// --expect <domain> fails the import unless that domain is one of the rival
// columns. One flag, and the whole class of error is gone.
const expect = process.argv.includes('--expect')
  ? String(process.argv[process.argv.indexOf('--expect') + 1] ?? '').toLowerCase()
  : ''
if (expect && !rivalCols.some(r => r.h.toLowerCase().includes(expect))) {
  console.error(
    `
  WRONG FILE. Expected a column for "${expect}" and this export compares against:
` +
    `    ${rivalCols.map(r => r.h).join(', ')}
` +
    `  Nothing was written. The download probably had not finished when the file was picked.`)
  process.exit(1)
}
console.log(`${file}\n  ${country.label} (${market.label}) · rivals: ${rivalCols.map(r => r.h).join(', ')}`)

const rows: GapRow[] = []
const fromFile = new Map<string, number>()
for (const line of lines.slice(1)) {
  const c = cells(line)
  const q = (c[0] ?? '').trim()
  if (!q) continue

  // Best rival position, and WHICH rival holds it. Zero means that rival does
  // not rank at all -- it is not position zero, and treating it as the best
  // would make every row look like a rival at #1.
  let theirBest = 0, rival = ''
  for (const rc of rivalCols) {
    const p = num(c[rc.i])
    if (p > 0 && (theirBest === 0 || p < theirBest)) { theirBest = p; rival = rc.h }
  }
  if (usCol >= 0) {
    const mine = num(c[usCol])
    if (mine > 0) fromFile.set(q.toLowerCase().trim(), mine)
  }
  if (!theirBest) continue

  const pageAt = pageCols.get(rival)
  rows.push({
    q, vol: num(c[iVol]), cpc: num(c[iCpc]), kd: num(c[iKd]),
    theirBest, rival,
    theirUrl: pageAt !== undefined ? (c[pageAt] ?? '').trim() || undefined : undefined,
  })
}

// WHERE we rank, not merely whether. A gap is something a competitor holds
// and we do not — or hold so distantly it may as well be nothing. Only page
// one is subtracted; at #11 or #45 the search is still a gap, and pretending
// otherwise is what made Malaysia look finished.
let ours = new Map<string, number>()
if (supabaseConfigured) {
  const { data } = await supabase.from('mw_market_seo')
    .select('keywords, gsc_keywords').eq('country', country.key)
    .order('cycle', { ascending: false }).limit(1).maybeSingle()
  ours = ourPositions([
    ...((data?.keywords ?? []) as any[]),
    ...((data?.gsc_keywords ?? []) as any[]),
  ])
}
// The export's own reading of us wins where it has one: same pull, same day,
// and it covers every row rather than only what has been stored.
for (const [q, pos] of fromFile) ours.set(q, pos)

const kept = cleanGap(rows, ours)
const clusters = cluster(kept).filter(worthWriting)

// HOW MUCH OF THIS PULL WAS ACTUALLY OUR INDUSTRY.
//
// The signal that the rivals are wrong, and it was sitting in the output being
// ignored. Thailand returned 1,086 rows and 46 survived — 4% — and was
// reported as "Thailand: 4 topics", as though the market were small. It is
// not: saranromgroup.com ranks for an OOH phrase, but out of home is a sliver
// of what they do, so most of their keywords are somebody else's trade.
// Singapore was worse at 2%, carrying `straits times` and `联合早报`.
//
// Healthy markets run 20–60%. Under 8% means the comparison is wrong, not that
// the market is empty (owner, 14 Oct 2026).
const yieldPct = rows.length ? kept.length / rows.length : 0
const onPageOne = [...ours.values()].filter(p => p >= 1 && p <= 10).length
console.log(`  ${rows.length} rows read · we rank for ${ours.size}, ${onPageOne} of them on page one · ${kept.length} survive the clean · ${clusters.length} writable topics\n`)
for (const c of clusters) {
  const e = effortOf(c)
  console.log(`  "${c.head}" — ${c.keywords.length} searches, ${c.vol.toLocaleString('en-US')}/mo, KD ${c.kd}, ${e.size}`)
  console.log(`      ${c.keywords.slice(0, 6).map(k => `${k.q} (${k.vol})`).join(', ')}`)
}

const dropped = rows.filter(r => !kept.some(k => k.q === r.q))
  .sort((a, b) => b.vol - a.vol).slice(0, 6)
if (dropped.length) {
  console.log(`\n  dropped as not ours to chase: ${dropped.map(d => `${d.q} (${d.vol.toLocaleString('en-US')})`).join(', ')}`)
}

if (yieldPct < 0.08 && rows.length >= 100) {
  console.log(
    `\n  ONLY ${(yieldPct * 100).toFixed(0)}% OF THIS PULL IS OUR INDUSTRY (${kept.length} of ${rows.length}).\n` +
    `  A healthy market runs 20-60%. This usually means one of the rivals sells\n` +
    `  something else and most of their keywords are another trade. Check each of:\n` +
    `    ${rivalCols.map(r => r.h).join(', ')}\n` +
    `  and re-pull before trusting the topics below.`)
}

if (!save) { console.log('\n  dry run — nothing written. Add --save.'); process.exit(0) }

// A BROWSABLE NUMBER, NOT EVERY ONE.
//
// The United States, compared against four DOOH platforms, produces 4,566
// relevant searches we do not hold and 740 page-sized topics. That is an
// honest count and a useless list: nobody reads 740 of anything. The plan
// takes the strongest one per country anyway, so what the rest are for is a
// lead browsing /mw/gaps when they have capacity, and forty is as many as
// that ever needs. The full figure is kept beside it so the cap never reads
// as "this is all there is".
const CAP = 40
const TOP = clusters.slice(0, CAP)
if (clusters.length > CAP) {
  console.log(`
  storing the top ${CAP} of ${clusters.length} topics — the planner takes one, the rest are for browsing`)
}

const quarter = `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`
const { error } = await supabase.from('mw_market_gaps').upsert({
  quarter, country: country.key, market: market.key, db: dbOf(country),
  rivals: rivalCols.map(r => r.h), clusters: TOP,
  raw_count: rows.length, kept_count: kept.length,
  pulled_at: new Date().toISOString(),
}, { onConflict: 'quarter,country' })
if (error) { console.error('\n  save failed: ' + error.message); process.exit(1) }
console.log(`\n  saved ${TOP.length} topics for ${country.label} into ${quarter}`
  + (clusters.length > TOP.length ? ` — the strongest of ${clusters.length} found` : ''))
