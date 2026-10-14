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
  /**
   * The rival's page that holds that position, when we know it.
   *
   * The gap report returns positions but no URLs, so this is filled in by a
   * second pull of the rival's own keywords. Worth the call: a task that
   * links to the page you are trying to beat is one a lead can act on
   * immediately (owner, 30 Sep 2026).
   */
  theirUrl?: string
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
  /**
   * Which kind of page could answer this.
   *
   * `english` means the pages we already have can carry it — a section on
   * /locations/hong-kong, today. `local` means it would need a page in the
   * market's language, which we do not have anywhere and which is a bigger
   * decision than a content brief.
   *
   * Both are real gaps and the distinction is not a ranking of them; it is
   * what tells a lead which ones they can act on this month. Pulling Japan,
   * Hong Kong, Korea and Taiwan against local-language rivals ALONE produced
   * boards that were 39 of 40 local, which read as though the English
   * opportunity had vanished (owner, 14 Oct 2026).
   */
  lang: 'english' | 'local'
}

const NON_LATIN = /[一-鿿぀-ヿ가-힯฀-๿؀-ۿऀ-ॿЀ-ӿ]/

/** A topic is local if most of what it is made of is not written in Latin script. */
export function langOf(keywords: { q: string; vol: number }[]): 'english' | 'local' {
  const total = keywords.reduce((t, k) => t + (k.vol || 0), 0)
  const local = keywords.filter(k => NON_LATIN.test(k.q)).reduce((t, k) => t + (k.vol || 0), 0)
  if (total > 0) return local / total > 0.5 ? 'local' : 'english'
  return keywords.filter(k => NON_LATIN.test(k.q)).length > keywords.length / 2 ? 'local' : 'english'
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
 * WHAT COUNTS AS A GAP, corrected 13 Oct 2026. This used to drop any search we
 * ranked for at all, which is too strict by a mile:
 *
 *   "Gap is only for what competitors have and we don't have, or we have but
 *    we're not even nearly there yet."                           (owner)
 *
 * Ranking #45 for something a competitor holds at #2 is not "we have that
 * covered" -- it is the clearest kind of gap there is, and the old rule threw
 * every one of them away. Malaysia is the case in point: we sit between #8 and
 * #24 across that market, so almost everything worth chasing was being deleted
 * for the crime of appearing somewhere in the top 100.
 *
 * Where we already rank well, the gap is the wrong tool and the plan already
 * has a better one: a strike task on the page that ranks, and the Search
 * Console positions on the market plan and the SEO tab. So `weAreFineAt` is
 * the only thing subtracted now -- page one, where the work is improving what
 * exists rather than answering something we never answered.
 *
 * Filters, in order of how much they remove:
 *   1. not our industry — kills the flyovers, toll plazas and shopping malls
 *   2. our own name — a gap on our own brand is a nonsense
 *   3. the rival is not actually winning it
 *   4. we are already on page one for it — that is a position job, not a gap
 */
export function cleanGap(
  rows: GapRow[],
  /**
   * Where WE rank. A Map gives the position and is what the caller should
   * pass; a bare list of phrases is still accepted and read as "on page one",
   * which keeps the old callers behaving as they did.
   */
  ours: Iterable<string> | Map<string, number>,
  opts: { theyMustBeatPos?: number; weAreFineAt?: number } = {},
): GapRow[] {
  const { theyMustBeatPos = 20, weAreFineAt = 10 } = opts
  const mine = new Map<string, number>()
  if (ours instanceof Map) {
    for (const [q, pos] of ours) mine.set(String(q).toLowerCase().trim(), pos)
  } else {
    for (const q of ours) mine.set(String(q).toLowerCase().trim(), 1)
  }

  return rows.filter(r => {
    if (!r.q || !isRelevant(r.q) || isBrand(r.q)) return false
    // The rival has to actually be winning it. Semrush counts anything in the
    // top 100 as "they rank", so a competitor sitting at #48 turns up as a gap
    // -- but nobody is losing business to page five. Without this India
    // produced nineteen "topics", half of them rivals in the thirties and
    // forties for terms nobody clicks.
    if (!(r.theirBest > 0 && r.theirBest <= theyMustBeatPos)) return false

    const at = mine.get(r.q.toLowerCase().trim())
    // Not ranked at all, or ranked and nowhere near: both are gaps.
    if (at === undefined || !(at > 0)) return true
    return at > weAreFineAt
  })
}

/** Where we rank, for every search, so the gap can tell "nowhere near" from "nearly there". */
export function ourPositions(keywords: { q?: string; pos?: number }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const k of keywords) {
    const q = String(k?.q ?? '').toLowerCase().trim()
    const pos = Number(k?.pos) || 0
    if (!q || !(pos > 0)) continue
    out.set(q, Math.min(out.get(q) ?? 9999, pos))
  }
  return out
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
      lang: langOf(members),
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

// ---------------------------------------------------------- why it is empty
//
// AN EMPTY GAP IS AN ANSWER, AND IT HAS TO SAY WHICH ANSWER.
//
// Malaysia returned 66 missing keywords and zero writable topics, and the
// market simply went quiet — no task, no note, nothing on the board. Read one
// way that says "Malaysia is finished". Read correctly it says every one of
// those 66 was a landmark on a rival's inventory pages (taman tun dr ismail,
// toll plazas, highways) while we already rank 8th to 14th for every
// commercial term there. Malaysia has a POSITION problem, and writing pages
// would not have touched it.
//
//   "if such a scenario where you detect that any market gap isn't the content
//    gap then perhaps give a clear explanation"          (owner, 13 Oct 2026)
//
// So the gap always produces a verdict, and silence is never one of them.

export type GapVerdictKind = 'content' | 'position' | 'inventory' | 'unseen' | 'none'

export type GapVerdict = {
  kind: GapVerdictKind
  /** One line, for a card or a heading. */
  headline: string
  /** The evidence, in a sentence or two. */
  why: string
  /** What to do instead. Never "write more pages" unless that is truly it. */
  doThis: string
}

/** A rival whose ranking pages nearly all sit under one path is running inventory. */
export function looksLikeInventory(urls: string[]): { yes: boolean; prefix: string; share: number } {
  const paths = urls.map(u => String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\//, ''))
    .filter(Boolean)
  if (paths.length < 5) return { yes: false, prefix: '', share: 0 }
  const heads = new Map<string, number>()
  for (const p of paths) {
    const head = p.split('/')[0]
    // A one-segment path is a page, not a folder of them.
    if (!head || !p.includes('/')) continue
    heads.set(head, (heads.get(head) ?? 0) + 1)
  }
  const best = [...heads.entries()].sort((a, b) => b[1] - a[1])[0]
  if (!best) return { yes: false, prefix: '', share: 0 }
  const share = best[1] / paths.length
  return { yes: share >= 0.5, prefix: '/' + best[0], share: Math.round(share * 100) / 100 }
}

export function gapVerdict(input: {
  country: string
  raw: GapRow[]
  kept: GapRow[]
  clusters: GapCluster[]
  /** Our own positions on non-brand, on-topic searches in this country. */
  ourCommercial: { q: string; pos: number }[]
  /** The rival pages behind the missing keywords, when the export carried them. */
  rivalPages?: string[]
}): GapVerdict {
  const { country, raw, kept, clusters, ourCommercial, rivalPages = [] } = input
  const writable = clusters.filter(worthWriting)
  const onBoard = ourCommercial.filter(k => k.pos >= 1 && k.pos <= 30)
  const closeIn = ourCommercial.filter(k => k.pos >= 4 && k.pos <= 20)

  if (writable.length) {
    const vol = writable.reduce((t, c) => t + c.vol, 0)
    return {
      kind: 'content',
      headline: `${writable.length} topic${writable.length === 1 ? '' : 's'} our competitors answer and we do not`,
      why: `${raw.length} searches came back that rivals rank for and we do not. ${kept.length} survived the clean, ` +
        `and they group into ${writable.length} page-sized topic${writable.length === 1 ? '' : 's'} worth ${Math.round(vol).toLocaleString('en-US')} searches a month.`,
      doThis: 'Add a section to the page that should own each topic. No new pages.',
    }
  }

  // Nothing to write. Now say why, in order of how often it is the real reason.
  if (closeIn.length >= 3) {
    const sample = [...closeIn].sort((a, b) => a.pos - b.pos).slice(0, 3)
    return {
      kind: 'position',
      headline: `Not a content gap — ${country} is a position problem`,
      why: `There is nothing worth writing: we already rank for the commercial searches in ${country}, just not high enough. ` +
        `${sample.map(k => `“${k.q}” at #${Math.round(k.pos)}`).join(', ')}. ` +
        `Of ${ourCommercial.length} on-topic searches we hold, ${closeIn.length} sit between #4 and #20 — on the board, off the first screen.`,
      doThis: `Improve the pages that already rank rather than writing new ones. Moving one of these onto page one is worth more than any page we could add.`,
    }
  }

  const inv = looksLikeInventory(rivalPages)
  if (inv.yes) {
    return {
      kind: 'inventory',
      headline: `Not a content gap — the rival is ranking on inventory, not writing`,
      why: `${Math.round(inv.share * 100)}% of the rival pages behind these searches sit under \`${inv.prefix}\` — one page per site or location, ` +
        `earning landmark searches rather than buying intent. That is a different site structure, not an article we are missing.`,
      doThis: `Do not copy the page farm. Decide separately whether a location directory is worth building; it is a structural choice with a real cost, ` +
        `and the traffic it wins is people looking for a place, not a media buyer.`,
    }
  }

  if (raw.length < 10 || !onBoard.length) {
    return {
      kind: 'unseen',
      headline: `No usable gap for ${country} — the comparison itself is thin`,
      why: `Only ${raw.length} missing search${raw.length === 1 ? '' : 'es'} came back${onBoard.length ? '' : ' and we hold no on-topic ranking there'}. ` +
        `That is too little to conclude anything: it more likely means Semrush does not track this market well than that there is nothing to win.`,
      doThis: `Use Search Console for this market instead — it records what we are actually shown for, in every language. ` +
        `Re-run the gap against competitors taken from the search results rather than from shared keywords.`,
    }
  }

  return {
    kind: 'none',
    headline: `Nothing worth writing for ${country} this quarter`,
    why: `${raw.length} missing searches came back and ${kept.length} were on-topic, but none group into a topic big enough to justify a page.`,
    doThis: 'Leave it. Re-check next quarter.',
  }
}
