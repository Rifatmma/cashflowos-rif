// Build a proposal for every market page.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/proposals-all.mts
//
// Malaysia is skipped: it was written by hand first, to set the standard these
// have to meet, and docs/proposals/locations-malaysia-proposal.html stands.
//
// A page with no measured gap gets NO proposal rather than a thin one. That is
// a result, not a failure — it says the page is answering what it is paid for.

import { writeFileSync, mkdirSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { buildProposal, type ProtectedTerm } from '../lib/mw-page-proposal'
import { readPage, type PageFacts, type PaidTerm, type OrganicTerm } from '../lib/mw-page-gaps'
import { changesFor } from '../lib/mw-page-changes'
import { saveProposals, reopenStale } from '../lib/mw-proposals'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const SITE = 'https://www.movingwalls.com'
const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim()

// Currency per market, for the empty brackets. Guessing one is worse than
// showing the local symbol people actually quote in.
const CURRENCY: Record<string, string> = {
  india: '₹', indonesia: 'Rp', philippines: '₱', singapore: 'S$', japan: '¥',
  'hong-kong': 'HK$', 'south-korea': '₩', china: '¥', australia: 'A$',
  uae: 'AED', 'saudi-arabia': 'SAR', qatar: 'QAR', 'united-kingdom': '£',
  germany: '€', europe: '€', africa: 'US$', americas: 'US$', malaysia: 'RM',
}
const PLACE: Record<string, string> = {
  uae: 'the UAE', 'united-kingdom': 'the UK', 'saudi-arabia': 'Saudi Arabia',
  'south-korea': 'South Korea', 'hong-kong': 'Hong Kong', americas: 'the Americas',
  philippines: 'the Philippines',
}

// ── paid ────────────────────────────────────────────────────────────────────
const { data: snaps } = await db.from('mw_snapshots').select('data').order('pulled_at', { ascending: false }).limit(1)
const sem: any = (snaps?.[0] as any)?.data?.sem ?? {}
const adUrl = new Map<string, string>()
for (const a of sem.adUrls ?? []) adUrl.set(String(a.ag), String(a.u).replace(/\/$/, ''))
const paidBy = new Map<string, PaidTerm[]>()
for (const k of sem.keywords ?? []) {
  const u = adUrl.get(String(k.agid)); if (!u) continue
  const list = paidBy.get(u) ?? []
  list.push({ q: String(k.k), cost: Number(k.cost) || 0, clicks: Number(k.clicks) || 0, conv: Number(k.conv) || 0, quality: k.qPage ?? null })
  paidBy.set(u, list)
}

// ── organic, and the protection list ────────────────────────────────────────
const { data: seo } = await db.from('mw_market_seo').select('cycle, keywords')
const cycle = (seo ?? []).map((r: any) => String(r.cycle)).sort().pop()
const orgBy = new Map<string, OrganicTerm[]>()
for (const r of (seo ?? []) as any[]) {
  if (String(r.cycle) !== cycle) continue
  for (const k of r.keywords ?? []) {
    const u = String(k?.url ?? '').replace(/\/$/, ''); if (!u) continue
    const list = orgBy.get(u) ?? []
    const pos = Number(k.pos) || 0
    const seen = list.find(t => t.q === k.q)
    if (seen) { if (pos > 0 && (seen.pos === 0 || pos < seen.pos)) seen.pos = pos }
    else list.push({ q: String(k.q), pos, vol: Number(k.vol) || 0 })
    orgBy.set(u, list)
  }
}
const bandOf = (pos: number): ProtectedTerm['band'] => (pos > 0 && pos <= 10 ? 'locked' : pos > 10 && pos <= 30 ? 'protect' : 'watch')

// ── which pages ─────────────────────────────────────────────────────────────
const { data: acts } = await db.from('mw_actions').select('how').eq('active', true).like('id', 'mkt-%health%')
const urls = new Set<string>()
for (const a of (acts ?? []) as any[]) {
  const u = a.how?.url ?? a.how?.page
  if (u) urls.add(SITE + String(u).replace(/\/$/, ''))
}
for (const u of paidBy.keys()) urls.add(u)
urls.delete(`${SITE}/locations/malaysia`)     // done by hand, and it stands

mkdirSync('docs/proposals', { recursive: true })
const index: string[] = []
const redirects: string[] = []
const done = new Set<string>()
let made = 0, skipped = 0, blockedTotal = 0

for (const requested of [...urls].sort()) {
  let html = ''
  let url = requested
  try {
    const r = await fetch(requested + '/', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; CashflowOS proposal)' }, signal: AbortSignal.timeout(25_000) })
    if (!r.ok) { console.log(`!! ${requested} HTTP ${r.status}`); continue }
    // Ads point at /market/singapore and /market/japan, which REDIRECT to
    // /locations/*. Without following that we wrote two identical proposals
    // for one page. Keyed on where the page actually lives.
    const landed = r.url.replace(/\/$/, '')
    if (landed && landed !== requested) {
      redirects.push(`${requested.replace(SITE, '')} → ${landed.replace(SITE, '')}`)
      url = landed
    }
    if (done.has(url)) { console.log(`=  ${requested.replace(SITE, '')} redirects to one already done`); continue }
    done.add(url)
    html = await r.text()
  } catch (e: any) { console.log(`!! ${requested} ${String(e?.message ?? e).slice(0, 50)}`); continue }

  const h2 = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => clean(m[1])).filter(Boolean)
  const h3 = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].map(m => clean(m[1])).filter(Boolean)
  const facts: PageFacts = {
    url,
    title: clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '') || null,
    metaDescription: (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i) ?? [])[1] ?? null,
    h1: [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => clean(m[1])).filter(Boolean),
    h2,
    copy: clean(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')),
  }
  const v = readPage(facts, paidBy.get(url) ?? [], orgBy.get(url) ?? [])
  const slug = url.replace(`${SITE}/locations/`, '').replace(`${SITE}/`, '').replace(/\//g, '-')
  const place = PLACE[slug] ?? (slug.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || 'This Market')

  const changes = changesFor({
    v, title: facts.title ?? '', place, slug,
    ctaAnchor: h2.find(h => /^(ready to|looking for|boost your|get in touch|start |let'?s )/i.test(h)) ?? null,
    faqAnchor: h2.find(h => /frequently asked|faq/i.test(h)) ?? null,
    vague: v.vague[0] ?? null,
    // The H3s that follow the vague heading are the formats it should name.
    formats: h3.filter(x => x.length < 40).slice(0, 6),
    currency: CURRENCY[slug] ?? 'US$',
  })

  if (!changes.length) {
    skipped++
    console.log(`—  ${url.replace(SITE, '')}  no measured gap, no proposal`)
    continue
  }
  // Paid terms are attributed to the URL the ad names, which may be the one
  // that redirected here.
  if (url !== requested) for (const t of paidBy.get(requested) ?? []) (paidBy.get(url) ?? []).push(t)

  const terms: ProtectedTerm[] = (orgBy.get(url) ?? []).map(t => ({ q: t.q, pos: t.pos, band: bandOf(t.pos) }))
  const p = buildProposal({ url: url + '/', liveHtml: html, changes, terms, generatedOn: new Date().toISOString().slice(0, 10) })
  writeFileSync(`docs/proposals/${p.filename}`, p.html, 'utf8')
  made++; blockedTotal += p.blocked

  // Keep them, so a suggestion has a history and a decision survives the next run.
  const reopened = await reopenStale(slug, new Map(changes.map(c => [`${slug}:${c.id}`, c.evidence ?? {}])))
  for (const r of reopened) console.log(`   ↻ re-raised ${r}`)
  await saveProposals({
    url, slug, cycle: cycle ?? null, html: p.html, filename: p.filename,
    changes: changes.map(c => ({ change: c, blocked: false })),
  })
  index.push(`| [${url.replace(SITE, '')}](${p.filename}) | ${changes.length} | ${p.blocked} | S$${v.spend.toFixed(2)} | ${v.clicks} | ${v.conv} | ${v.hasPrice ? '—' : 'no price copy'} |`)
  console.log(`✓  ${url.replace(SITE, '')}  ${changes.length} changes, ${p.blocked} blocked  → ${p.filename}`)
}

writeFileSync('docs/proposals/README.md', [
  '# Page proposals',
  '',
  `*Generated ${new Date().toISOString().slice(0, 10)} · Semrush ${cycle} · ${made} pages with a proposal, ${skipped} with no measured gap.*`,
  '',
  'Each file is a mirror of the live page with the proposed changes outlined in place',
  'and a change list at the top. **Open them in a browser** — they load the site\'s own',
  'stylesheets, so they look like the real page.',
  '',
  'Malaysia was written by hand first and is not regenerated by the script.',
  '',
  '| Page | Changes | Blocked | Paid/mo | Clicks | Conv | Note |',
  '|---|---:|---:|---:|---:|---:|---|',
  `| [/locations/malaysia](locations-malaysia-proposal.html) | 5 | 0 | S$61.53 | 86 | 1 | written by hand |`,
  ...index,
  '',
  ...(redirects.length ? [
    '',
    '## Ads pointing at a redirect',
    '',
    'These landing pages are not the page that loads. Every paid click pays for an',
    'extra hop before it sees anything:',
    '',
    ...redirects.map(r => `- \`${r}\``),
    '',
    'Worth pointing the ads straight at the destination.',
  ] : []),
  '',
  '**Blocked** means the change would delete a phrase the page already ranks for',
  '(docs/SEO-RANKING-PROTECTION.md). Blocked changes are still shown, struck through,',
  'so the trade-off is visible rather than hidden.',
  '',
  'Every price in every proposal is an empty bracket. Those come from the rate card,',
  'not from an ad report.',
].join('\n'), 'utf8')

console.log(`\n${made} proposals written, ${skipped} pages had no measured gap, ${blockedTotal} changes blocked by the ranking rule`)
