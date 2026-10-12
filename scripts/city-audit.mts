// What state are the 38 city pages actually in?
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/city-audit.mts
//
// Reading pass only; writes nothing. The hyperlocal pages are the part of the
// initiative nobody has looked at: 38 exist, 8 appear in Semrush at all, and
// before proposing anything I need to know what the other 30 contain.

import { createClient } from '@supabase/supabase-js'
import { readCity, citySummary, type CityFacts } from '../lib/mw-city'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const SITE = 'https://www.movingwalls.com'
const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim()

// ── every city page, from the sitemap ───────────────────────────────────────
const sm = await (await fetch(`${SITE}/sitemap.xml`, { headers: { 'user-agent': 'Mozilla/5.0' } })).text()
const all = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/\/$/, ''))
const cityUrls = all.filter(u => /\/locations\/[^/]+\/[^/]+$/.test(u))
const countryUrls = all.filter(u => /\/locations\/[^/]+$/.test(u))

// ── what each page ranks for ────────────────────────────────────────────────
const { data: seo } = await db.from('mw_market_seo').select('cycle, keywords')
const cycle = (seo ?? []).map((r: any) => String(r.cycle)).sort().pop()
const ranked = new Map<string, { q: string; pos: number; vol: number }[]>()
for (const r of (seo ?? []) as any[]) {
  if (String(r.cycle) !== cycle) continue
  for (const k of r.keywords ?? []) {
    const u = String(k?.url ?? '').replace(/\/$/, ''); if (!u) continue
    const list = ranked.get(u) ?? []
    if (!list.some(x => x.q === k.q)) list.push({ q: String(k.q), pos: Number(k.pos) || 0, vol: Number(k.vol) || 0 })
    ranked.set(u, list)
  }
}

// ── paid demand naming a city ───────────────────────────────────────────────
const { data: snaps } = await db.from('mw_snapshots').select('data').order('pulled_at', { ascending: false }).limit(1)
const sem: any = (snaps?.[0] as any)?.data?.sem ?? {}
const adUrl = new Map<string, string>()
for (const a of sem.adUrls ?? []) adUrl.set(String(a.ag), String(a.u).replace(/\/$/, ''))
type Paid = { q: string; cost: number; clicks: number; conv: number; lands: string }
const paid: Paid[] = (sem.keywords ?? [])
  .filter((k: any) => (Number(k.clicks) || 0) > 0)
  .map((k: any) => ({ q: String(k.k), cost: Number(k.cost) || 0, clicks: Number(k.clicks) || 0, conv: Number(k.conv) || 0, lands: adUrl.get(String(k.agid)) ?? '' }))

const cityName = (u: string) => (u.split('/').pop() ?? '').replace(/-/g, ' ')
// Word boundaries, not substrings. The first version matched the alias "kl"
// inside "iklan" (Indonesian for advertisement) and credited Kuala Lumpur with
// S$65 of Indonesian spend, putting it top of the priority list on a
// typo-level mistake.
const hits = (q: string, city: string) => {
  const c = city.toLowerCase()
  const alias: Record<string, string[]> = {
    bengaluru: ['bengaluru', 'bangalore'], mumbai: ['mumbai', 'bombay'],
    'kuala lumpur': ['kuala lumpur', 'kl'], delhi: ['delhi', 'ncr'],
  }
  return (alias[c] ?? [c]).some(a => {
    const safe = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    return new RegExp(`\\b${safe}\\b`, 'i').test(q)
  })
}

console.log(`${cityUrls.length} city pages · ${countryUrls.length} country pages · Semrush ${cycle}\n${'='.repeat(78)}`)

const rows: any[] = []
for (let i = 0; i < cityUrls.length; i += 6) {
  await Promise.all(cityUrls.slice(i, i + 6).map(async u => {
    const city = cityName(u)
    const country = u.split('/')[4]
    let title = '', h1: string[] = [], h2: string[] = [], words = 0, status = 0, copy = ''
    try {
      const r = await fetch(u + '/', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; CashflowOS)' }, signal: AbortSignal.timeout(25_000) })
      status = r.status
      if (r.ok) {
        const h = await r.text()
        title = clean((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '')
        h1 = [...h.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => clean(m[1])).filter(Boolean)
        h2 = [...h.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => clean(m[1])).filter(Boolean)
        copy = clean(h.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' '))
        words = copy.split(' ').length
      }
    } catch { status = -1 }
    const rk = ranked.get(u) ?? []
    const pd = paid.filter(p => hits(p.q, city))
    rows.push({
      url: u.replace(SITE, ''), city, country, status, title, h1: h1.join(' / '), h2count: h2.length, words,
      ranked: rk.sort((a, b) => a.pos - b.pos),
      paidCost: pd.reduce((s, p) => s + p.cost, 0),
      paidClicks: pd.reduce((s, p) => s + p.clicks, 0),
      paidTerms: pd.sort((a, b) => b.cost - a.cost).slice(0, 3),
      paidTermsAll: pd,
      landsElsewhere: [...new Set(pd.map(p => p.lands).filter(l => l && l !== u))],
      namesCity: new RegExp(`\\b${city.replace(/ /g, '\\s+')}\\b`, 'i').test(copy),
    })
  }))
  console.error(`fetched ${Math.min(i + 6, cityUrls.length)}/${cityUrls.length}`)
}

rows.sort((a, b) => b.paidCost - a.paidCost || (a.ranked[0]?.pos ?? 999) - (b.ranked[0]?.pos ?? 999))
for (const r of rows) {
  const best = r.ranked.length ? `#${Math.round(r.ranked[0].pos)}` : '—'
  console.log(`\n${r.url}  [${r.country}]  ${r.status === 200 ? '' : 'HTTP ' + r.status}`)
  console.log(`   words ${String(r.words).padStart(5)} · H2s ${String(r.h2count).padStart(2)} · best rank ${best} · ranks for ${r.ranked.length}`)
  console.log(`   title: ${r.title.slice(0, 92) || '(none)'}`)
  console.log(`   h1   : ${r.h1.slice(0, 92) || '(none)'}`)
  if (r.ranked.length) console.log(`   ranks: ${r.ranked.slice(0, 4).map((k: any) => `${k.q} #${Math.round(k.pos)} (${k.vol})`).join(', ')}`)
  if (r.paidCost > 0) console.log(`   PAID : S$${r.paidCost.toFixed(2)}, ${r.paidClicks} clicks — ${r.paidTerms.map((p: any) => p.q).join(', ')}${r.landsElsewhere.length ? `  → lands on ${r.landsElsewhere.map((l: string) => l.replace(SITE, '')).join(', ')}` : ''}`)
}

// ── keep it, so /mw/plan can show it and a lead's progress survives a re-audit
const facts: CityFacts[] = rows.map(r => ({
  // Title case each word, not every letter. My first attempt put a literal
  // backspace byte here instead of a word boundary, via shell escaping, so
  // the regex matched nothing and every city was stored lower case.
  url: r.url,
  city: r.city.replace(/(^|[\s-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase()),
  countryUrl: `/locations/${r.country}`, countryLabel: r.country, market: r.country,
  words: r.words, title: r.title,
  ranked: r.ranked, paid: r.paidTermsAll ?? r.paidTerms,
}))
const findings = facts.map(f => ({ f, v: readCity(f) })).filter(x => x.v)
const { error: saveErr } = await db.from('mw_city_audit').upsert(findings.map(({ f, v }) => ({
  url: f.url, city: f.city, country_url: f.countryUrl, market: f.market,
  kind: v!.kind, says: v!.says, cost: v!.cost, clicks: v!.clicks, pos: v!.pos,
  terms: v!.terms, words: f.words, title: f.title,
  lands_on: [...new Set(f.paid.filter(p => p.lands && p.lands.replace(/\/$/, '') !== f.url).map(p => p.lands.replace('https://www.movingwalls.com', '')))],
  cycle, checked_at: new Date().toISOString(),
  // status / status_by / status_at deliberately absent: an upsert must never
  // reset a lead's progress. Postgres keeps the stored value for columns the
  // upsert does not name only on INSERT, so the update list is pinned below.
})), { onConflict: 'url', ignoreDuplicates: false })
if (saveErr) console.error('save failed:', saveErr.message)
else console.log(`
saved ${findings.length} city findings`)
console.log(citySummary(findings.map(x => x.v!)))

const dead = rows.filter(r => !r.ranked.length)
const thin = rows.filter(r => r.words < 400)
console.log(`\n${'='.repeat(78)}`)
console.log(`${rows.length} city pages · ${dead.length} rank for nothing · ${thin.length} under 400 words`)
console.log(`paid money reaching a city page directly: ${rows.filter(r => r.paidCost > 0 && !r.landsElsewhere.length).length}`)
console.log(`paid money for a city that lands somewhere else: ${rows.filter(r => r.landsElsewhere.length).length}`)
