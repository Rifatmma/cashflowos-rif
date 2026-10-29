// The money searches each market is judged on: 30–50 per market, chosen by
// Claude (owner, 28 Oct 2026: "Claude decides"). Home and To do show how many
// sit in the top 10, week by week.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/buyer-searches.mts [--save]
//
// A money search is what someone types when they want to BUY outdoor media:
// a format or an agency, usually with a place — "billboard advertising mumbai",
// "hoarding advertising agency", "digital screen singapore". Not a question
// ("what is dooh" is a blog topic), not our brand, not off-topic.
//
// Candidates come from two places, so a market we don't rank in yet still gets
// a list: our own Search Console impressions (last 16 weeks) and the searches
// rivals win in the quarterly content gap (Semrush volume). Re-run quarterly;
// a search is only dropped when a better one replaces it.

import { createClient } from '@supabase/supabase-js'
import { MARKETS, COUNTRIES, isBrand, isRelevant } from '../lib/mw-markets'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const save = process.argv.includes('--save')
const PER_MARKET = 40, MIN = 30

// Formats and buying words, in the languages our markets search in.
const BUY = /billboard|hoarding|unipole|gantry|bus (shelter|stop|wrap|advertis)|transit|airport advertis|mall advertis|metro advertis|digital (screen|signage|billboard)|led (screen|billboard|display)|\b(d?ooh)\b|out[- ]of[- ]home|outdoor (advertis|media|marketing|ad)|advertising (agency|company|companies|cost|price|rates?)|media (buying|owner)|programmatic|papan iklan|baliho|reklame|iklan luar|videotron|看板|廣告|广告|広告|戶外|户外|โฆษณา|ป้าย|إعلان|لوحات|اعلانات|publicidad exterior|vallas|panneau|affichage|plakatwerbung|außenwerbung/i
const QUESTION = /^(what|how|why|which|who|is|are|can|does|do|meaning|define|definition)\b|\bmeaning\b|\bvs\b|\bexamples?\b|\bjobs?\b|\bsalary\b|\bcareer|\bcourse\b|\bpdf\b|\bfree\b|\btemplate|\badalah\b|\banalysis\b|とは|是什麼|是什么|คืออะไร|ما هو|ما هي/i
// Not a buyer, whatever the words: the film, the music chart, display stands, a rival's brand.
const NOISE = /three billboards|3 billboards|missouri|human billboard|funny|creative|dwell time|\blaws?\b|regulation|条例|規制|billboard (hot|chart|music|award|magazine|top|song|200|100)|\bkpop\b|ooh ?!? ?media|jcdecaux|lamar|clear channel|outfront|stand|acrylic|اكريليك|ستاند|応援|อาหาร/i
// A general "advertising" word in a non-Latin script only counts with an outdoor word beside it.
const GENERIC = /広告|廣告|广告|โฆษณา|إعلان|الإعلان|اعلانات|دعاية/
const OUTDOOR = /屋外|交通|看板|戶外|户外|戸外|公車|捷運|地鐵|地铁|サイネージ|電視牆|led|ป้าย|กลางแจ้ง|บิลบอร์ด|لوحات|بيلبورد|شاشات|خارجي|طرق/i

const isoToMarket = new Map(COUNTRIES.map(c => [c.country.iso3.toLowerCase(), c.market.key]))
const keyToIso = new Map(COUNTRIES.map(c => [c.country.key, c.country.iso3.toLowerCase()]))

type Cand = { market: string; query: string; country: string; impr: number; vol: number; pos: number | null }
const cands = new Map<string, Cand>()
const take = (market: string, query: string, country: string, impr: number, vol: number, pos: number | null) => {
  const q = query.toLowerCase().trim().replace(/\s+/g, ' ')
  if (!q || q.length > 70 || isBrand(q) || !isRelevant(q) || QUESTION.test(q) || NOISE.test(q) || !BUY.test(q)) return
  if (GENERIC.test(q) && !OUTDOOR.test(q)) return
  // One Latin word ("ooh", "billboards") says nothing about buying.
  if (/^[a-z-]+$/.test(q)) return
  const k = `${market}\u0000${q}`
  const c = cands.get(k) ?? { market, query: q, country, impr: 0, vol: 0, pos: null }
  // The country with the most signal names where the position is read.
  if (impr + vol > c.impr + c.vol) c.country = country
  c.impr += impr
  c.vol = Math.max(c.vol, vol)
  if (pos !== null && (c.pos === null || pos < c.pos)) c.pos = pos
  cands.set(k, c)
}

// ── our own Search Console, last 16 weeks
const { data: latestRow } = await db.from('mw_gsc_qweek').select('week').order('week', { ascending: false }).limit(1).maybeSingle()
let gscRows = 0
if (latestRow?.week) {
  for (let off = 0; ; off += 1000) {
    const { data } = await db.from('mw_gsc_qweek').select('country, query, impr, pos').range(off, off + 999)
    for (const r of (data ?? []) as any[]) {
      const m = isoToMarket.get(String(r.country))
      if (m) take(m, String(r.query), String(r.country), Number(r.impr) || 0, 0, Number(r.pos) || null)
    }
    gscRows += data?.length ?? 0
    if (!data || data.length < 1000) break
  }
}

// ── what rivals win, from the latest content gap
const { data: gaps } = await db.from('mw_market_gaps').select('quarter, country, clusters')
const quarter = (gaps ?? []).map((g: any) => String(g.quarter)).sort().pop()
for (const g of (gaps ?? []).filter((x: any) => String(x.quarter) === quarter) as any[]) {
  const iso = keyToIso.get(String(g.country))
  const m = iso ? isoToMarket.get(iso) : null
  if (!iso || !m) continue
  for (const c of (g.clusters ?? []) as any[]) for (const k of (c.keywords ?? []) as any[]) take(m, String(k.q ?? ''), iso, 0, Number(k.vol) || 0, null)
}

// Monthly impressions (16 weeks ≈ 3.7 months) and a share of search volume on
// one scale: what we already see, plus what we could see.
const score = (c: Cand) => c.impr / 3.7 + c.vol / 10
const rows: { market: string; query: string; country: string; why: string }[] = []
for (const m of MARKETS) {
  const mine = [...cands.values()].filter(c => c.market === m.key).sort((a, b) => score(b) - score(a))
  const pick = mine.slice(0, PER_MARKET)
  console.log(`${m.key.padEnd(12)} ${String(mine.length).padStart(4)} candidates → ${pick.length}${pick.length < MIN ? ' (fewer than 30: all there is)' : ''}`)
  for (const c of pick.slice(0, 5)) console.log(`   ${c.query} · ${c.country} · ${Math.round(c.impr / 3.7)} impr/mo · vol ${c.vol} · ${c.pos ? '#' + Math.round(c.pos) : 'not ranking'}`)
  for (const c of pick) rows.push({
    market: m.key, query: c.query, country: c.country,
    why: [c.impr ? `${Math.round(c.impr / 3.7)} impressions a month` : '', c.vol ? `${c.vol} searches a month (Semrush)` : ''].filter(Boolean).join(' · '),
  })
}
console.log(`\n${rows.length} money searches from ${gscRows} Search Console rows and the ${quarter} content gap`)

if (save) {
  await db.from('mw_buyer_searches').delete().neq('market', '')
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('mw_buyer_searches').insert(rows.slice(i, i + 500))
    if (error) { console.error(error.message); process.exit(1) }
  }
  console.log('saved')
} else console.log('dry run — add --save to write')
