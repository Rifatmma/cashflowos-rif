// Regenerate docs/SEO-RANKING-PROTECTION.md from the newest Semrush cycle.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/seo-protect.mts
//
// Vercel's filesystem is read-only at runtime, so this cannot be a cron job —
// it is run in a session and the result is committed, the same arrangement as
// the Jarvis learning doc. Run it after every Semrush pull.
//
// Fetching the live pages is what makes the file worth having: it is the
// difference between "these terms rank" and "these words are ON the page, so
// an edit can delete them".

import { writeFileSync, mkdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { protectionDoc, type PageRanks, type RankedTerm } from '../lib/mw-seo-protect'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: rows, error } = await db.from('mw_market_seo').select('cycle, market, country, keywords')
if (error) { console.error('read failed:', error.message); process.exit(1) }

const cycle = (rows ?? []).map((r: any) => String(r.cycle)).sort().pop() ?? '—'
console.log(`newest cycle: ${cycle}`)

// Group every ranked term by the URL Semrush attributes it to.
const byUrl = new Map<string, RankedTerm[]>()
for (const r of (rows ?? []) as any[]) {
  if (String(r.cycle) !== cycle) continue
  for (const k of (Array.isArray(r.keywords) ? r.keywords : [])) {
    const u = String(k?.url ?? '').trim()
    const q = String(k?.q ?? '').trim()
    if (!u || !q) continue
    const list = byUrl.get(u) ?? []
    // The same term can arrive from several country pulls. Keep the best
    // position: that is the one with traffic to lose.
    const seen = list.find(t => t.q === q)
    const pos = Number(k.pos) || 0
    if (seen) {
      if (pos > 0 && (seen.pos === 0 || pos < seen.pos)) seen.pos = pos
      seen.traffic = Math.max(seen.traffic, Number(k.traffic) || 0)
      seen.vol = Math.max(seen.vol, Number(k.vol) || 0)
      continue
    }
    list.push({
      q, pos, vol: Number(k.vol) || 0, traffic: Number(k.traffic) || 0,
      market: r.market ? String(r.market) : undefined,
      country: r.country ? String(r.country) : undefined,
    })
    byUrl.set(u, list)
  }
}
console.log(`${byUrl.size} pages, ${[...byUrl.values()].flat().length} terms`)

/** Visible text of a page: no nav, no script, no markup. */
const visible = (html: string) =>
  html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim()

async function copyOf(u: string): Promise<string | null> {
  const full = /^https?:\/\//.test(u) ? u : `https://www.movingwalls.com${u.startsWith('/') ? '' : '/'}${u}`
  try {
    const res = await fetch(full, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; CashflowOS SEO check)' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) { console.warn(`  ${full} -> HTTP ${res.status}`); return null }
    return visible(await res.text())
  } catch (e: any) {
    console.warn(`  ${full} -> ${String(e?.message ?? e).slice(0, 70)}`)
    return null
  }
}

// Six at a time: enough to finish quickly, polite enough not to look like load.
const urls = [...byUrl.keys()]
const pages: PageRanks[] = []
for (let i = 0; i < urls.length; i += 6) {
  const batch = urls.slice(i, i + 6)
  const copies = await Promise.all(batch.map(copyOf))
  batch.forEach((u, j) => pages.push({ url: u, terms: byUrl.get(u) ?? [], copy: copies[j] }))
  console.log(`fetched ${Math.min(i + 6, urls.length)}/${urls.length}`)
}

const got = pages.filter(p => p.copy != null).length
const doc = protectionDoc(pages, cycle, new Date().toISOString().slice(0, 10))
mkdirSync('docs', { recursive: true })
writeFileSync('docs/SEO-RANKING-PROTECTION.md', doc, 'utf8')
console.log(`\nwrote docs/SEO-RANKING-PROTECTION.md — ${pages.length} pages, ${got} cross-checked against live copy`)
