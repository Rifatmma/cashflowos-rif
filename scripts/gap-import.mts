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
import { cleanGap, cluster, worthWriting, effortOf, type GapRow } from '../lib/mw-gap'
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

if (!rivalCols.length) { console.error('no rival column found in: ' + head.join(' | ')); process.exit(1) }
console.log(`${file}\n  ${country.label} (${market.label}) · rivals: ${rivalCols.map(r => r.h).join(', ')}`)

const rows: GapRow[] = []
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
  if (!theirBest) continue

  const pageAt = pageCols.get(rival)
  rows.push({
    q, vol: num(c[iVol]), cpc: num(c[iCpc]), kd: num(c[iKd]),
    theirBest, rival,
    theirUrl: pageAt !== undefined ? (c[pageAt] ?? '').trim() || undefined : undefined,
  })
}

// What we already hold, so a gap we have already closed is not re-proposed.
let ours: string[] = []
if (supabaseConfigured) {
  const { data } = await supabase.from('mw_market_seo')
    .select('keywords, gsc_keywords').eq('country', country.key)
    .order('cycle', { ascending: false }).limit(1).maybeSingle()
  ours = [
    ...((data?.keywords ?? []) as { q?: string }[]),
    ...((data?.gsc_keywords ?? []) as { q?: string }[]),
  ].map(k => String(k.q ?? '')).filter(Boolean)
}

const kept = cleanGap(rows, ours)
const clusters = cluster(kept).filter(worthWriting)

console.log(`  ${rows.length} rows read · ${ours.length} of our own keywords to subtract · ${kept.length} survive the clean · ${clusters.length} writable topics\n`)
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

if (!save) { console.log('\n  dry run — nothing written. Add --save.'); process.exit(0) }

const quarter = `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`
const { error } = await supabase.from('mw_market_gaps').upsert({
  quarter, country: country.key, market: market.key, db: dbOf(country),
  rivals: rivalCols.map(r => r.h), clusters,
  raw_count: rows.length, kept_count: kept.length,
  pulled_at: new Date().toISOString(),
}, { onConflict: 'quarter,country' })
if (error) { console.error('\n  save failed: ' + error.message); process.exit(1) }
console.log(`\n  saved ${clusters.length} topics for ${country.label} into ${quarter}`)
