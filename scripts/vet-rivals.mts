// 👉 Is this domain actually an out-of-home business?
//
// Ranking for an OOH phrase is not the same as selling OOH, and taking the one
// for the other is how three markets ended up measured against the wrong
// companies. saranromgroup.com ranks top in Thailand for ป้ายโฆษณา and out of
// home is a sliver of what they do; sph.com.sg ranks because it is Singapore's
// newspaper publisher. Both were used as competitors.
//
//   "You need to make sure first whether the competitor is an actual OOH
//    player in the market. I don't care if they're media owners, or agencies.
//    If they have OOH service and they have enough inventory... their OOH
//    presence is strong, they have a lot of inventories and many pages
//    mentioned OOH."                                   (owner, 14 Oct 2026)
//
// So the test is their own site, not their ranking: how much of it is about
// out of home, and how many pages are inventory. Both are countable.
//
//   npx tsx --env-file=.env scripts/vet-rivals.mts domain.com other.com ...
//
// Reads each site's homepage and sitemap. No Semrush, no API units, no model.

const OOH = /\b(?:billboard|hoarding|out[- ]?of[- ]?home|ooh|dooh|outdoor advertis|outdoor media|unipole|bus shelter|transit (?:media|advertis)|digital signage|led screen|street furniture|gantry|lamp ?post|billboards?)\b/gi

/** The same, in the languages our markets actually use. */
const OOH_LOCAL = /屋外広告|看板|サイネージ|戶外廣告|户外广告|廣告牌|广告牌|옥외광고|전광판|ป้ายโฆษณา|สื่อโฆษณา|إعلان الخارجي|لوحات إعلانية|iklan luar|papan iklan|reklame|baliho|publicidad exterior|espectacular|mídia exterior|midia exterior|outdoor em|Außenwerbung|aussenwerbung|plakat|publicité extérieure|buitenreclame|quảng cáo ngoài trời/gi

/** A URL that looks like a piece of inventory rather than a brochure page. */
const INVENTORY = /\/(?:billboard|hoarding|site|location|media|inventor|format|ooh|dooh|screen|panel|asset|space|spot|rate)/i

/** Other trades that rank for our words. Presence here is not disqualifying on
 *  its own — a full-service agency is fine if its OOH presence is strong — but
 *  it is reported so a human can weigh it. */
const OTHER_TRADE = /\b(?:newspaper|classified|obituary|matrimonial|press release|printing|print shop|signage fabrication|web design|seo services|social media marketing|influencer|public relations)\b/gi

type Verdict = {
  domain: string
  ok: boolean
  oohMentions: number
  localMentions: number
  pages: number
  inventoryPages: number
  inventoryShare: number
  oohUrls: number
  otherTrade: string[]
  why: string
  error?: string
}

const get = async (url: string, ms = 12000): Promise<string> => {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, {
      signal: c.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; CashflowOS rival check)' },
    })
    return r.ok ? await r.text() : ''
  } catch { return '' } finally { clearTimeout(t) }
}

const text = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')

async function vet(domain: string): Promise<Verdict> {
  const d = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  let home = await get(`https://${d}/`)
  if (!home) home = await get(`https://www.${d}/`)
  if (!home) {
    return { domain: d, ok: false, oohMentions: 0, localMentions: 0, pages: 0, inventoryPages: 0,
      inventoryShare: 0, oohUrls: 0, otherTrade: [], why: 'site could not be read', error: 'unreachable' }
  }

  const body = text(home)
  const oohMentions = (body.match(OOH) ?? []).length
  const localMentions = (body.match(OOH_LOCAL) ?? []).length
  const otherTrade = [...new Set((body.match(OTHER_TRADE) ?? []).map(s => s.toLowerCase()))]

  // The sitemap tells us how much of the site is inventory. Most OOH sellers
  // have one page per site or format, and that is exactly what "a lot of
  // inventory" looks like from outside.
  let urls: string[] = []
  for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml']) {
    const xml = await get(`https://${d}${path}`, 9000)
    if (!xml) continue
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
    // A sitemap index points at more sitemaps; follow the first few.
    const nested = locs.filter(u => /\.xml$/i.test(u)).slice(0, 4)
    if (nested.length) {
      for (const n of nested) {
        const inner = await get(n, 9000)
        urls.push(...[...inner.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]))
      }
    }
    urls.push(...locs.filter(u => !/\.xml$/i.test(u)))
    if (urls.length) break
  }
  urls = [...new Set(urls)]
  const inventoryPages = urls.filter(u => INVENTORY.test(u)).length
  // PAGES WHOSE URL IS ABOUT OUT OF HOME. This is the owner's "many pages
  // mentioned OOH", counted, and it rescues two kinds of real business the
  // home page alone misjudges: a listed company whose front page is written
  // for investors (vgi.co.th says almost nothing about billboards), and one
  // whose inventory lives under paths this script did not guess.
  const oohUrls = urls.filter(u => OOH.test(u) || OOH_LOCAL.test(decodeURIComponent(u))).length
  OOH.lastIndex = 0; OOH_LOCAL.lastIndex = 0
  const inventoryShare = urls.length ? inventoryPages / urls.length : 0

  // THE RULE, in the owner's terms: strong OOH presence on the page, and real
  // inventory behind it. Either signal alone can be faked by a brochure site
  // or by a directory; together they are hard to fake.
  // TWO INDEPENDENT WAYS TO SHOW IT, either of which is enough.
  //
  // A: the home page is substantially about out of home.
  // B: a real number of pages across the site are about out of home.
  //
  // Requiring both rejected signaturemedia.co.th (83 mentions, inventory under
  // paths this did not guess) and vgi.co.th (a listed operator whose home page
  // talks to shareholders). Requiring neither would admit sph.com.sg.
  const talk = oohMentions + localMentions
  const byTalk = talk >= 8
  // SHARE, NOT COUNT. saranromgroup.com has 35 pages about out of home —
  // enough to pass any absolute threshold — out of 7,563. That is 0.46% of
  // their site, which is the owner's "1% of all their service", and it is why
  // comparing against them filled Thailand's gap with somebody else's trade.
  //
  // On a small site a count is fine; on a large one only the share means
  // anything.
  const oohShare = urls.length ? (oohUrls + inventoryPages) / urls.length : 0
  const bigSite = urls.length > 200
  const byPages = (oohUrls >= 10 || inventoryPages >= 15) && (!bigSite || oohShare >= 0.03)
  const dead = talk < 3 && oohUrls < 5

  // A diversified group passes only if out of home is a real part of the site,
  // never because it is big enough to have a few pages about everything.
  // A SLIVER, OR JUST A SITE THAT DOES NOT PUT WORDS IN ITS URLS.
  //
  // Japanese and Korean sites number their pages rather than naming them, so
  // tokai-ad.co.jp scores 0% OOH pages across 206 URLs while its home page is
  // fourteen mentions deep in 屋外広告. Rejecting it would throw away a real
  // operator over a URL convention.
  //
  // So the sliver test needs the site to be thin on out of home AND either
  // quiet about it on the page or very large — the shape of a conglomerate
  // with a billboards department, which is what this is for.
  const slivered = oohShare < 0.03 && (talk < 8 || urls.length > 800)
  // A PRINT-FIRST BUSINESS THAT ALSO SELLS BILLBOARDS.
  //
  // buymediaspace.com talks about out of home on its home page — 24 mentions,
  // enough to pass on talk alone — and sells newspaper classifieds, matrimonial
  // and obituary notices across 252 pages of which 0.4% are OOH. India's gap
  // was pulled against it, and came back offering `name change advertisement in
  // newspaper mumbai` at 20,040 a month.
  //
  // Those four trades are the tell. Any of them, plus a thin OOH share, means
  // the billboards are a line item. Only applied where there is a sitemap to
  // measure the share from.
  const PRINT_FIRST = ['newspaper', 'classified', 'matrimonial', 'obituary']
  const printFirst = urls.length > 50 && oohShare < 0.10 &&
    otherTrade.some(t => PRINT_FIRST.some(p => t.includes(p)))

  const ok = !dead && !slivered && !printFirst && (byTalk || byPages)
  const why = printFirst
    ? `sells ${otherTrade.filter(t => PRINT_FIRST.some(p => t.includes(p))).join(' and ')}; out of home is ${(oohShare * 100).toFixed(1)}% of the site`
    : slivered
    ? `out of home is ${(oohShare * 100).toFixed(1)}% of a ${urls.length}-page site — a sliver of what they sell`
    : dead
    ? `${talk} OOH mentions and ${oohUrls} OOH pages — this is not an out-of-home business`
    : byPages
      ? `${talk} OOH mentions, ${oohUrls} OOH pages and ${inventoryPages} inventory pages of ${urls.length}`
      : urls.length === 0
        ? `${talk} OOH mentions; no sitemap, judged on the page alone`
        : `${talk} OOH mentions but only ${oohUrls} OOH pages of ${urls.length}`

  return { domain: d, ok, oohMentions, localMentions, pages: urls.length, inventoryPages,
    inventoryShare: Math.round(inventoryShare * 100) / 100, otherTrade, why, oohUrls }
}

const domains = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!domains.length) { console.error('usage: vet-rivals.mts domain.com other.com ...'); process.exit(1) }

const out: Verdict[] = []
for (const d of domains) out.push(await vet(d))

const pad = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n)
console.log('\n  use  domain                           OOH  local  pages  inv   why')
for (const v of out.sort((a, b) => Number(b.ok) - Number(a.ok) || b.oohUrls - a.oohUrls)) {
  console.log(
    `  ${v.ok ? ' ✓ ' : ' ✗ '} ${pad(v.domain, 32)} ${String(v.oohMentions).padStart(4)} ${String(v.localMentions).padStart(6)} ` +
    `${String(v.pages).padStart(6)} ${String(v.oohUrls).padStart(5)}   ${v.why}`)
  if (v.otherTrade.length) console.log(`      also sells: ${v.otherTrade.join(', ')}`)
}
// UNREACHABLE IS NOT A VERDICT. adquick.com, hivestack.com and
// pattisonoutdoor.com all refuse this fetch; filing them under "not an OOH
// business" would be a claim the evidence does not support.
const unreachable = out.filter(v => v.error)
const good = out.filter(v => v.ok && !v.error)
const bad = out.filter(v => !v.ok && !v.error)
console.log(`\n  USE (${good.length}): ${good.map(v => v.domain).join(', ')}`)
if (bad.length) console.log(`\n  DO NOT USE (${bad.length}): ${bad.map(v => v.domain).join(', ')}`)
if (unreachable.length) {
  console.log(`\n  COULD NOT CHECK (${unreachable.length}): ${unreachable.map(v => v.domain).join(', ')}`)
  console.log(`  These block automated reads — judge them by hand; several are major operators.`)
}
console.log('')
