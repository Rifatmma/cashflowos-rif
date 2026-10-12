// Crawl the blog so a task can name the posts worth linking from.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/blog-index.mts
//
// 289 fetches, so this is a scheduled job and never a page load. Stores the
// title, an opening slice of the body and every /locations/* link each post
// already makes — that last one is what lets a task say "these already link to
// the country page but not to the city one".

import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const SITE = 'https://www.movingwalls.com'
const BODY_CHARS = 3000

const clean = (s: string) => s
  .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&rsquo;/g, "'")
  .replace(/\s+/g, ' ').trim()

const sm = await (await fetch(`${SITE}/sitemap.xml`, { headers: { 'user-agent': 'Mozilla/5.0' } })).text()
const blogs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => m[1].replace(/\/$/, ''))
  .filter(u => /\/blog\//.test(u))
console.log(`${blogs.length} blog posts in the sitemap`)

type Row = { url: string; title: string | null; words: number; text: string; links: string[]; crawled_at: string }
const rows: Row[] = []
let failed = 0

for (let i = 0; i < blogs.length; i += 8) {
  await Promise.all(blogs.slice(i, i + 8).map(async u => {
    try {
      const r = await fetch(u + '/', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; CashflowOS)' }, signal: AbortSignal.timeout(25_000) })
      if (!r.ok) { failed++; return }
      const h = await r.text()
      const body = clean(h)
      rows.push({
        url: u.replace(SITE, ''),
        title: clean((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '') || null,
        words: body.split(' ').length,
        // The opening is what says whether a post is about the topic; the tail
        // is footer and related-posts on every one of them.
        text: body.slice(0, BODY_CHARS),
        links: [...new Set([...h.matchAll(/href="([^"]*\/locations\/[^"#?]*)"/gi)]
          .map(m => m[1].replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '')))],
        crawled_at: new Date().toISOString(),
      })
    } catch { failed++ }
  }))
  if ((i / 8) % 5 === 0) console.error(`  ${Math.min(i + 8, blogs.length)}/${blogs.length}`)
}

console.log(`crawled ${rows.length}, failed ${failed}`)

// NAV LINKS ARE NOT EDITORIAL LINKS, and the first run did not know the
// difference: /locations/africa, /locations/americas, /locations/india,
// /locations/japan, /locations/malaysia and /locations/singapore appear on all
// 289 posts because they are in the menu. Counting those as "this post already
// links there" would have told every task there was nothing to add.
//
// Found by frequency rather than by parsing the nav: anything on more than
// half the posts is chrome, whatever markup it sits in.
const freq = new Map<string, number>()
for (const r of rows) for (const l of r.links) freq.set(l, (freq.get(l) ?? 0) + 1)
const nav = new Set([...freq.entries()].filter(([, n]) => n > rows.length / 2).map(([l]) => l))
console.log(`${nav.size} links are site navigation (on >50% of posts): ${[...nav].join(', ')}`)
for (const r of rows) r.links = r.links.filter(l => !nav.has(l))

for (let i = 0; i < rows.length; i += 100) {
  const { error } = await db.from('mw_blog_index').upsert(rows.slice(i, i + 100), { onConflict: 'url' })
  if (error) { console.error('save failed:', error.message); process.exit(1) }
}
console.log(`saved ${rows.length} posts`)

const linking = rows.filter(r => r.links.length).length
console.log(`${linking} of ${rows.length} make an EDITORIAL link to a /locations page`)
const cities = rows.filter(r => r.links.some(l => /\/locations\/[^/]+\/[^/]+/.test(l))).length
console.log(`${cities} link to a city page`)
