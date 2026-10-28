// Fill each market's "who ranks against us" from the content-gap pull.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/rivals-from-gaps.mts [--save]
//
// The quarterly gap pull (.claude/skills/mw-content-gap) already finds each
// market's real competitors from its own Google results and records, per gap
// search, which rival ranks and where. serp_rivals was only ever filled for
// Malaysia, so every other market tab said "no rivals" while the data sat in
// mw_market_gaps (28 Oct 2026). This turns those rows into the same Rival
// shape the SEO tab and planner read. A country that already has SERP-based
// rivals is left alone.

import { createClient } from '@supabase/supabase-js'
import type { Rival } from '../lib/mw-serp-rivals'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const save = process.argv.includes('--save')

const { data: gaps } = await db.from('mw_market_gaps').select('quarter, country, clusters')
const quarter = (gaps ?? []).map((g: any) => String(g.quarter)).sort().pop()
const { data: seo } = await db.from('mw_market_seo').select('cycle, country, serp_rivals')
const cycle = (seo ?? []).map((r: any) => String(r.cycle)).sort().pop()

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0 }

for (const g of (gaps ?? []).filter((x: any) => String(x.quarter) === quarter) as any[]) {
  const row = (seo ?? []).find((r: any) => String(r.cycle) === cycle && r.country === g.country) as any
  if (!row) { console.log(`${g.country}: no ${cycle} row, skipped`); continue }
  if (Array.isArray(row.serp_rivals) && row.serp_rivals.length) { console.log(`${g.country}: has SERP rivals (${row.serp_rivals.length}), kept`); continue }

  const by = new Map<string, { pos: number[]; pages: Set<string>; searches: string[] }>()
  for (const c of (g.clusters ?? []) as any[]) {
    for (const k of (c.keywords ?? []) as any[]) {
      const d = String(k.rival ?? '').trim()
      const pos = Number(k.theirBest)
      if (!d || !Number.isFinite(pos) || pos <= 0) continue
      const e = by.get(d) ?? { pos: [], pages: new Set<string>(), searches: [] }
      e.pos.push(pos)
      if (k.theirUrl) e.pages.add(String(k.theirUrl))
      if (e.searches.length < 8) e.searches.push(String(k.q))
      by.set(d, e)
    }
  }
  const rivals: Rival[] = [...by.entries()].map(([domain, e]) => ({
    domain,
    appearances: e.pos.length,
    best: Math.min(...e.pos),
    median: median(e.pos),
    score: e.pos.reduce((t, p) => t + 1 / Math.max(1, p), 0),
    pages: [...e.pages].slice(0, 5),
    queries: e.searches,
  } satisfies Rival)).sort((a, b) => b.score - a.score).slice(0, 8)

  console.log(`${g.country}: ${rivals.length} rivals — ${rivals.slice(0, 4).map(r => `${r.domain} (${r.appearances})`).join(', ')}`)
  if (save && rivals.length) {
    const { error } = await db.from('mw_market_seo').update({ serp_rivals: rivals }).eq('cycle', cycle).eq('country', g.country)
    if (error) console.log(`  save failed: ${error.message}`)
  }
}
console.log(save ? 'saved' : 'dry run — add --save to write')
