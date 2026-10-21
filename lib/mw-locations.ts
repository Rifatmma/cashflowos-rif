import 'server-only'
import { articleUrl } from './mw-article'

// 👉 Reading a movingwalls.com/locations page for its inventory.
//
// The same reader as the mw-location-video skill's read_location.py, so a
// video made in the Studio and one made by the skill feature the same sites
// with the same numbers.
//
// The pages are Next.js: what a site card says on screen is also in the
// page's data stream, as JSON, along with things the screen hides (collapsed
// FAQ answers — "71 active sites across 78 screens"). Reading the data is
// both more complete and more exact than scraping the HTML.
//
// A country page is read with every city page it links to; a city page with
// its country page, whose inventory carousel often holds more sites in that
// city. Only sites with a photo, reach AND impressions are kept, and a site
// whose card contradicts its own description (a network total on a card,
// the site's figure underneath) is set aside with the reason — a number that
// is wrong on the page would be wrong in the video.

export type Site = {
  id: string
  name: string
  /** As the page gives it: "Kuala Lumpur", "Petaling, Selangor", "From Dutamas / Selayang - KL". */
  area: string
  /** The city page it belongs to (slug), or its own place for sites with no city page. */
  city: string
  reach: number
  impressions: number
  /** Published photo (cdn.sanity.io), never altered. */
  image: string
  /** Which page and which part of it. */
  source: string
  page: string
}

export type LocationPage = { url: string; kind: 'country' | 'city'; country: string; city: string; title: string; text: string }

export type LocationRead = {
  url: string
  pages: LocationPage[]
  /** Sites by city slug, city pages first, in page order. */
  cities: { city: string; label: string; sites: Site[] }[]
  doubtful: { name: string; why: string }[]
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

/** "587,921" → 587921 · "1.35 M" → 1350000 (and says it was rounded). */
function num(s: unknown): { v: number; rounded: boolean } | null {
  const m = /^([\d.]+)\s*([MK]?)$/i.exec(String(s ?? '').replace(/,/g, '').trim())
  if (!m) return null
  const k = { '': 1, K: 1e3, M: 1e6 }[m[2].toUpperCase() as '' | 'K' | 'M']
  return { v: Math.round(parseFloat(m[1]) * k), rounded: !!m[2] }
}

function arrayAfter(data: string, key: string): any[] {
  const i = data.indexOf(`"${key}":[`)
  if (i < 0) return []
  // Walk to the matching bracket, minding strings.
  const from = i + key.length + 3          // the opening [
  let depth = 0, inStr = false, esc = false
  for (let k = from; k < data.length; k++) {
    const c = data[k]
    if (esc) { esc = false; continue }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '[') depth++
    else if (c === ']' && --depth === 0) {
      try { return JSON.parse(data.slice(from, k + 1)) } catch { return [] }
    }
  }
  return []
}

function visibleText(html: string): string {
  const lines = html
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .split('\n').map(l => l.trim()).filter(Boolean)
  const out: string[] = []
  for (const l of lines) if (out[out.length - 1] !== l) out.push(l)
  const cut = out.indexOf('Trusted Globally by Marketers')       // the footer and menus repeat on every page
  return (cut > 0 ? out.slice(0, cut) : out).join('\n')
}

async function readPage(url: string) {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; MovingWallsStudio)' }, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(`${url} came back ${r.status}`)
  const html = await r.text()
  let data = ''
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try { data += JSON.parse(`"${m[1]}"`) } catch { /* a chunk that is not a string */ }
  }
  const parts = new URL(url).pathname.split('/').filter(Boolean)   // locations, country[, city]
  const kind: LocationPage['kind'] = parts.length >= 3 ? 'city' : 'country'
  let text = visibleText(html)
  const extra = [...new Set([...data.matchAll(/"text":"((?:[^"\\]|\\.){60,})"/g)].map(m => { try { return JSON.parse(`"${m[1]}"`) as string } catch { return '' } }))]
    .filter(s => s && !text.includes(s))
  if (extra.length) text += '\n\nFrom the page data (FAQ answers and other collapsed text):\n' + extra.join('\n')
  const title = (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, '').trim()
  const page: LocationPage = { url, kind, country: parts[1] ?? '', city: kind === 'city' ? parts[2] : '', title, text: text.slice(0, 16_000) }

  const base = /cdn\.sanity\.io\/images\/([a-z0-9]+)\/([a-z0-9_-]+)\//.exec(data)
  const sites: Omit<Site, 'city' | 'id'>[] = [], doubtful: LocationRead['doubtful'] = []
  // 1. the page's featured cards
  for (const b of arrayAfter(data, 'highVisibilityBillboards')) {
    const rch = num(b?.reach), imp = num(b?.impressions), image = String(b?.image ?? '').split('?')[0]
    const said = [...String(b?.description ?? '').matchAll(/\b(\d{5,})\b/g)].map(m => Number(m[1]))
    const name = String(b?.name ?? '').trim()
    if (!name) continue
    if (!rch || !imp || !image) { doubtful.push({ name, why: 'missing a photo, reach or impressions' }); continue }
    if (rch.rounded || imp.rounded || (said.length && !said.includes(rch.v))) {
      doubtful.push({ name, why: `the card says ${b.reach} / ${b.impressions}, its description says ${said.join(', ') || 'nothing'}` })
      continue
    }
    sites.push({ name, area: String(b?.location ?? '').trim(), reach: rch.v, impressions: imp.v, image, source: `${kind} page · featured`, page: url })
  }
  // 2. the inventory carousel
  const re = /"caption":"Billboard Name: (.*?), Reach: (\d+), Impressions: (\d+), (.*?)\.?","image":\{"_type":"image","asset":\{"_ref":"image-([0-9a-f]+)-(\d+x\d+)-(\w+)"/g
  for (const m of data.matchAll(re)) {
    if (!base || sites.some(s => s.name === m[1])) continue
    sites.push({
      name: m[1].trim(), area: m[4].trim(), reach: Number(m[2]), impressions: Number(m[3]),
      image: `https://cdn.sanity.io/images/${base[1]}/${base[2]}/${m[5]}-${m[6]}.${m[7]}`, source: `${kind} page · inventory carousel`, page: url,
    })
  }
  const links = arrayAfter(data, 'cities').filter(c => c?.href).map(c => ({ city: String(c.city ?? ''), url: new URL(c.href, url).toString() }))
  return { page, sites, doubtful, links }
}

/** Only /locations/ pages on our own site. */
export function locationUrl(input: string): string | null {
  const u = articleUrl(input)
  if (!u) return null
  const p = new URL(u)
  const parts = p.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'locations' || parts.length < 2 || parts.length > 3) return null
  p.search = ''
  return p.toString().replace(/\/$/, '')
}

export async function readLocation(input: string): Promise<LocationRead | { error: string }> {
  const url = locationUrl(input)
  if (!url) return { error: 'That needs to be a movingwalls.com/locations/… page — a country or a city.' }
  let first
  try { first = await readPage(url) } catch (e: any) { return { error: `Could not read that page: ${String(e?.message ?? e).slice(0, 140)}` } }
  const more = first.page.kind === 'country'
    ? first.links.slice(0, 8).map(l => l.url)
    : [url.replace(/\/[^/]+$/, '')]
  const rest = await Promise.all(more.map(u => readPage(u).catch(() => null)))
  const all = [first, ...rest.filter((x): x is NonNullable<typeof x> => !!x)]

  // City pages first, so a site featured on its city page is filed there.
  all.sort((p, q) => Number(p.page.kind !== 'city') - Number(q.page.kind !== 'city'))
  const cityPages = all.filter(p => p.page.kind === 'city')
  const groups = new Map<string, { label: string; sites: Site[] }>()
  const seen = new Set<string>()
  for (const p of all) {
    for (const s of p.sites) {
      if (seen.has(s.name.toLowerCase())) continue
      seen.add(s.name.toLowerCase())
      // A country carousel site goes to the city page whose name is in its
      // place ("Petaling, Selangor" → Selangor), else to its own place.
      const home = p.page.kind === 'city' ? p.page
        : cityPages.find(c => s.area.toLowerCase().includes(c.page.city.replace(/-/g, ' ')))?.page
      const city = home ? home.city : slug(s.area.split(',')[0])
      if (!groups.has(city)) groups.set(city, { label: home ? titleCase(city.replace(/-/g, ' ')) : s.area.split(',')[0].trim(), sites: [] })
      groups.get(city)!.sites.push({ ...s, city, id: slug(s.name) })
    }
  }
  const cities = [...groups.entries()].map(([city, g]) => ({ city, label: g.label, sites: g.sites }))
  if (!cities.length) return { error: 'No site on that page has a photo, reach and impressions together.' }
  return { url, pages: all.map(p => p.page), cities, doubtful: all.flatMap(p => p.doubtful) }
}

const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())
