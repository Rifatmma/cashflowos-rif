// 👉 Content gap: searches our competitors win and we do not.
//
// Pure module — the clustering is the whole value here and it has to be
// testable without a network call.
//
// WHY CLUSTERING. A flat gap list is a data dump a market lead will ignore.
// Semrush returned 30 rows for India and the top ones by volume were
// "mahamaya flyover" (60,500), "dnd flyway" (22,200) and "new bus stop" —
// hoarding sites rank for local landmarks incidentally and none of it is a
// buyer. What a lead can act on is a page-sized topic: "these seven searches
// are one page we have not written" (owner, 29 Sep 2026).

import { isBrand, isRelevant } from './mw-markets'

export type GapRow = {
  q: string
  vol: number
  cpc: number
  kd: number
  /** Best position any rival holds, and which one. */
  theirBest: number
  rival: string
}

export type GapCluster = {
  /** The phrase the topic is named after. */
  head: string
  keywords: GapRow[]
  /** Total monthly searches across the cluster. */
  vol: number
  /** Median rival difficulty, 0-100. */
  kd: number
  /** Best CPC in the cluster — what a click is worth to buy. */
  cpc: number
  rivals: string[]
}

// Words that carry no topic. Kept short on purpose: an aggressive stop list
// merges topics that should stay apart.
const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'in', 'on', 'at', 'to', 'with',
  'is', 'are', 'my', 'we', 'you', 'your', 'near', 'me', 'best', 'top', 'list',
  'com', 'www',
])

const tokens = (q: string) =>
  String(q || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t.length > 2 && !STOP.has(t))

/**
 * Drop everything that is not a search for something we sell.
 *
 * Three filters, in order of how much they remove:
 *   1. not our industry — kills the flyovers, bus stops and shopping malls
 *   2. our own name — a gap on our own brand is a nonsense
 *   3. we already rank — the gap report disagrees with our own keyword pull
 *      on some rows, and our own pull is the one to believe about us
 */
export function cleanGap(rows: GapRow[], weAlreadyRank: Iterable<string>, theyMustBeatPos = 20): GapRow[] {
  const mine = new Set([...weAlreadyRank].map(q => q.toLowerCase().trim()))
  return rows.filter(r =>
    r.q &&
    isRelevant(r.q) &&
    !isBrand(r.q) &&
    !mine.has(r.q.toLowerCase().trim()) &&
    // 4. the rival has to actually be winning it. Semrush counts anything in
    //    the top 100 as "they rank", so a competitor sitting at #48 turns up
    //    as a gap -- but nobody is losing business to page five. Without this
    //    India produced nineteen "topics", half of them rivals ranking in
    //    the thirties and forties for terms nobody clicks.
    r.theirBest > 0 && r.theirBest <= theyMustBeatPos)
}

/**
 * Group the survivors into page-sized topics.
 *
 * Greedy, highest volume first, and a cluster is defined by its most
 * DISTINCTIVE word rather than by how many words two searches share.
 *
 * Counting shared words alone does not work here, and the failure is not
 * subtle: "billboard advertising agency" and "airport advertising agency"
 * share two of three words, so a naive rule merges them — and an airport
 * advertising page is not a billboard agency page. Weighting by how often a
 * word appears across the whole set fixes it: "advertising" and "agency" turn
 * up everywhere and carry no topic, while "billboard" and "airport" each
 * define one (owner, 29 Sep 2026).
 */
export function cluster(rows: GapRow[], minShared = 2): GapCluster[] {
  const left = [...rows].sort((a, b) => b.vol - a.vol)
  const out: GapCluster[] = []

  // How many searches each word appears in. Rare word, strong signal.
  const df = new Map<string, number>()
  for (const r of rows) for (const t of new Set(tokens(r.q))) df.set(t, (df.get(t) ?? 0) + 1)
  // The rarest word in a search, longest first on a tie — the topic word.
  const pivotOf = (q: string) => tokens(q)
    .sort((a, b) => (df.get(a) ?? 0) - (df.get(b) ?? 0) || b.length - a.length)[0]

  while (left.length) {
    const seed = left.shift()!
    const seedT = new Set(tokens(seed.q))
    const pivot = pivotOf(seed.q)
    const members: GapRow[] = [seed]

    for (let i = left.length - 1; i >= 0; i--) {
      const t = tokens(left[i].q)
      // The topic word has to be there at all. Without it these are two
      // different pages however many filler words they have in common.
      if (pivot && !t.includes(pivot)) continue
      const shared = t.filter(x => seedT.has(x)).length
      // A short search only has to match what it has; a long one has to
      // share two, or every keyword containing "advertising" becomes one page.
      const need = Math.min(minShared, Math.max(1, Math.min(t.length, seedT.size)))
      if (shared >= need) members.push(...left.splice(i, 1))
    }

    members.sort((a, b) => b.vol - a.vol)
    const kds = members.map(m => m.kd).filter(n => n > 0).sort((a, b) => a - b)
    out.push({
      head: seed.q,
      keywords: members,
      vol: members.reduce((t, m) => t + m.vol, 0),
      kd: kds.length ? kds[Math.floor(kds.length / 2)] : 0,
      cpc: Math.max(...members.map(m => m.cpc), 0),
      rivals: [...new Set(members.map(m => m.rival).filter(Boolean))],
    })
  }

  return out.sort((a, b) => b.vol - a.vol)
}

/** Worth a page of its own: real demand, and more than one way of asking. */
export const worthWriting = (c: GapCluster) => c.vol >= 200 || c.keywords.length >= 3

/** How hard this topic is, in words a person can act on. */
export function effortOf(c: GapCluster): { size: 'S' | 'M' | 'L'; says: string } {
  if (c.kd >= 50) return { size: 'L', says: `difficulty ${c.kd} — a strong page and some links, not a quick write` }
  if (c.kd >= 30) return { size: 'M', says: `difficulty ${c.kd} — a proper page will compete` }
  return { size: 'S', says: `difficulty ${c.kd} — low competition, a good page should rank` }
}
