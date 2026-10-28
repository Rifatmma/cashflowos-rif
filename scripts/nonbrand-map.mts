// Non-brand map: which page owns each non-brand search, per market.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/nonbrand-map.mts
//
// Writes docs/proposals/nonbrand-map.md with:
//  • India: every non-brand, on-topic search with impressions → the page that
//    ranks → the page that should own it (planner step nb-india-map)
//  • every market's non-brand share from Search Console, and for any market
//    near 0%, one search its country page could own (step nb-zero-markets)
// Search Console is the source: Semrush's brand split is blank this cycle.

import { writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { isBrand, isRelevant, MARKETS } from '../lib/mw-markets'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await db.from('mw_market_seo').select('cycle, market, country, gsc_keywords')
const cycle = (data ?? []).map((r: any) => String(r.cycle)).sort().pop()
const rows = (data ?? []).filter((r: any) => String(r.cycle) === cycle) as any[]
type K = { q: string; pos: number; impr: number; clicks: number; url: string; country: string; market: string }
const all: K[] = rows.flatMap(r => (r.gsc_keywords ?? []).map((k: any) => ({
  q: String(k.q ?? '').toLowerCase().trim(), pos: Number(k.pos) || 0, impr: Number(k.impr) || 0, clicks: Number(k.clicks) || 0,
  url: String(k.url ?? '').replace(/^https?:\/\/(www\.)?movingwalls\.com/i, '') || '/', country: r.country, market: r.market,
})))

const CITIES = ['mumbai', 'delhi', 'bengaluru', 'bangalore', 'chennai', 'hyderabad', 'pune', 'kolkata', 'ahmedabad', 'jaipur', 'nagpur', 'kerala', 'kochi', 'lucknow', 'noida', 'gurgaon', 'gurugram']
const cityPage = (c: string) => `/locations/india/${c === 'bangalore' ? 'bengaluru' : c === 'gurgaon' || c === 'gurugram' || c === 'noida' ? 'delhi' : c === 'kochi' ? 'kerala' : c}`
const QUESTION = /^(what|how|why|which|is|are|can|does|meaning|define)\b|\bmeaning\b|\bvs\b|\bexamples?\b/

const ELSEWHERE = /\b(usa|us|uk|united states|america|australia|singapore|malaysia|dubai|uae|japan|europe|canada|london|new york)\b/
function owner(k: K): string {
  if (ELSEWHERE.test(k.q)) return k.url // not an India search; leave where it ranks
  if (QUESTION.test(k.q) && k.url.startsWith('/blog/')) return k.url
  const city = CITIES.find(c => k.q.includes(c))
  if (city) return cityPage(city)
  if (QUESTION.test(k.q)) return 'a blog post'
  if (/india|indian/.test(k.q)) return '/locations/india'
  return k.url.startsWith('/locations/india') || k.url.startsWith('/blog/') ? k.url : '/locations/india'
}

// ── India
const india = all.filter(k => k.country === 'india' && !isBrand(k.q) && isRelevant(k.q) && k.impr >= 10)
const best = new Map<string, K>()
for (const k of india) { const b = best.get(k.q); if (!b || k.pos < b.pos) best.set(k.q, { ...k, impr: (b?.impr ?? 0) + k.impr }) }
const map = [...best.values()].sort((a, b) => b.impr - a.impr).slice(0, 60)
const fix = map.filter(k => owner(k) !== 'a blog post' && owner(k) !== k.url)
const blog = map.filter(k => owner(k) === 'a blog post' && !k.url.startsWith('/blog/'))

// ── share by market
const share = MARKETS.map(m => {
  const ks = all.filter(k => k.market === m.key)
  const tot = ks.reduce((t, k) => t + k.impr, 0)
  const nb = ks.filter(k => !isBrand(k.q)).reduce((t, k) => t + k.impr, 0)
  const nbClicks = ks.filter(k => !isBrand(k.q)).reduce((t, k) => t + k.clicks, 0)
  const own = new Set([m.key, ...ks.map(k => k.country)])
  const cands = ks.filter(k => !isBrand(k.q) && isRelevant(k.q) && own.has(k.url.split('/')[2] ?? '') && k.url.startsWith('/locations/') && k.pos >= 4 && k.pos <= 40)
    .sort((a, b) => b.impr - a.impr)
  return { m, tot, pct: tot ? Math.round((nb / tot) * 1000) / 10 : 0, nbClicks, target: cands[0] ?? null }
})
const zero = share.filter(s => s.nbClicks === 0)

const L: string[] = []
L.push(`# Non-brand map (${cycle}, Search Console)`, '', `Built ${new Date().toISOString().slice(0, 10)} by scripts/nonbrand-map.mts. Brand searches and off-topic searches are excluded.`, '')
L.push('## Non-brand share by market', '', '| Market | Impressions | Non-brand share | Non-brand clicks | One search to own |', '|---|---:|---:|---:|---|')
for (const s of share) L.push(`| ${s.m.label} | ${s.tot.toLocaleString('en-US')} | ${s.pct}% | ${s.nbClicks} | ${s.target ? `"${s.target.q}" (#${s.target.pos.toFixed(0)}, ${s.target.impr} impr) on ${s.target.url}` : '—'} |`)
L.push('', `**Markets with no non-brand clicks:** ${zero.length ? zero.map(s => s.m.label).join(', ') : 'none'}. Each has its one target search in the table, a search its own country page already ranks for, to aim the next page improvement at.`, '')
L.push('## India: every non-brand search with 10+ impressions, and who should own it', '', '| Search | Impressions | Position | Ranks on | Should own it |', '|---|---:|---:|---|---|')
for (const k of map) L.push(`| ${k.q} | ${k.impr} | ${k.pos.toFixed(1)} | ${k.url} | ${owner(k) === k.url ? '✓ same page' : owner(k)} |`)
L.push('', `**${fix.length} searches rank on the wrong page.** The page that should own them is named above. That's an internal-link or heading fix on the right page, never a new page.`)
L.push(`**${blog.length} question searches have no blog post ranking.** These are blog-post candidates only: ${blog.slice(0, 8).map(k => `"${k.q}"`).join(', ') || 'none'}.`)
writeFileSync('docs/proposals/nonbrand-map.md', L.join('\n') + '\n')
console.log(`india ${map.length} searches, ${fix.length} on the wrong page, ${blog.length} blog candidates; zero-clicks markets: ${zero.map(s => s.m.key).join(', ') || 'none'}`)
for (const s of share) console.log(`  ${s.m.key.padEnd(12)} ${String(s.pct).padStart(5)}%  nbClicks ${s.nbClicks}  target: ${s.target ? s.target.q + ' #' + s.target.pos.toFixed(0) + ' ' + s.target.url : '-'}`)
