// What is actually missing from every market page — the reading pass.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/page-briefs.mts
//
// Prints one brief per page so the proposals that follow are written from
// measurements rather than from the shape of the last one. Writes nothing.

import { createClient } from '@supabase/supabase-js'
import { readPage, type PageFacts, type PaidTerm, type OrganicTerm } from '../lib/mw-page-gaps'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// ── paid, from the newest Google Ads snapshot ───────────────────────────────
const { data: snaps } = await db.from('mw_snapshots').select('data').order('pulled_at', { ascending: false }).limit(1)
const sem: any = (snaps?.[0] as any)?.data?.sem ?? {}
const adUrl = new Map<string, string>()
for (const a of sem.adUrls ?? []) adUrl.set(String(a.ag), String(a.u))
const paidBy = new Map<string, PaidTerm[]>()
for (const k of sem.keywords ?? []) {
  const u = adUrl.get(String(k.agid)); if (!u) continue
  const key = u.replace(/\/$/, '')
  const list = paidBy.get(key) ?? []
  list.push({ q: String(k.k), cost: Number(k.cost) || 0, clicks: Number(k.clicks) || 0, conv: Number(k.conv) || 0, quality: k.qPage ?? null })
  paidBy.set(key, list)
}

// ── organic, from the newest Semrush cycle ──────────────────────────────────
const { data: seo } = await db.from('mw_market_seo').select('cycle, keywords')
const cycle = (seo ?? []).map((r: any) => String(r.cycle)).sort().pop()
const orgBy = new Map<string, OrganicTerm[]>()
for (const r of (seo ?? []) as any[]) {
  if (String(r.cycle) !== cycle) continue
  for (const k of r.keywords ?? []) {
    const u = String(k?.url ?? '').replace(/\/$/, ''); if (!u) continue
    const list = orgBy.get(u) ?? []
    if (!list.some(t => t.q === k.q)) list.push({ q: String(k.q), pos: Number(k.pos) || 0, vol: Number(k.vol) || 0 })
    orgBy.set(u, list)
  }
}

// ── the pages to look at: everything with an open health action, plus the
//    paid landing pages, which are not all the same set.
const { data: acts } = await db.from('mw_actions').select('id, market, how')
  .eq('active', true).like('id', 'mkt-%health%')
const urls = new Set<string>()
for (const a of (acts ?? []) as any[]) {
  const u = a.how?.url ?? a.how?.page
  if (u) urls.add(`https://www.movingwalls.com${String(u).replace(/\/$/, '')}`)
}
for (const u of paidBy.keys()) urls.add(u)

const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

async function facts(url: string): Promise<PageFacts | null> {
  try {
    const r = await fetch(url + '/', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; CashflowOS)' }, signal: AbortSignal.timeout(25_000) })
    if (!r.ok) { console.log(`\n### ${url}\n  !! HTTP ${r.status}`); return null }
    const h = await r.text()
    return {
      url,
      title: clean((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '') || null,
      metaDescription: (h.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i) ?? [])[1] ?? null,
      h1: [...h.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => clean(m[1])).filter(Boolean),
      h2: [...h.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => clean(m[1])).filter(Boolean),
      copy: clean(h.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')),
    }
  } catch (e: any) { console.log(`\n### ${url}\n  !! ${String(e?.message ?? e).slice(0, 60)}`); return null }
}

const list = [...urls].sort()
console.log(`${list.length} pages · Semrush ${cycle}\n${'='.repeat(70)}`)

for (const u of list) {
  const f = await facts(u)
  if (!f) continue
  const v = readPage(f, paidBy.get(u) ?? [], orgBy.get(u) ?? [])
  console.log(`\n### ${u.replace('https://www.movingwalls.com', '')}`)
  console.log(`  title  : ${f.title ?? '(none)'}`)
  console.log(`  meta   : ${f.metaDescription ? f.metaDescription.slice(0, 95) + '…' : '(none)'}`)
  console.log(`  h1     : ${f.h1.join(' / ') || '(none)'}`)
  console.log(`  words  : ${f.copy.split(' ').length}   price words: ${v.hasPrice ? 'yes' : 'NO'}   FAQ: ${v.hasFaq ? 'yes' : 'NO'}`)
  console.log(`  paid   : S$${v.spend.toFixed(2)}, ${v.clicks} clicks, ${v.conv} conv, ${v.belowAverage} kw rated below-average`)
  if (v.tail) console.log(`  title tail (spendable): "${v.tail.tail}"  [keep: "${v.tail.head}"]`)
  if (v.vague.length) console.log(`  vague H2: ${v.vague.join(' | ')}`)
  console.log(`  H2s    : ${f.h2.join(' | ').slice(0, 220)}`)
  for (const g of v.gaps) {
    const top = [...g.paid].sort((a, b) => b.cost - a.cost).slice(0, 4).map(p => `${p.q} (S$${p.cost.toFixed(2)}/${p.clicks}c/${p.conv}cv)`)
    const org = g.organic.slice(0, 3).map(o => `${o.q} #${o.pos}`)
    console.log(`  GAP ${g.kind.padEnd(8)} S$${g.cost.toFixed(2)} ${g.clicks}c ${g.conv}cv  ${top.join('; ')}${org.length ? ' || organic: ' + org.join('; ') : ''}`)
  }
}
