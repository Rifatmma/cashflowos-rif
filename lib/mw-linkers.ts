// 👉 Which pages we already own should link to the one we want to rank.
//
// The gap task used to say "link from two or three pages that already mention
// the topic" and leave the lead to find them. Then the owner asked whether a
// new blog post would help, I went looking, and the instruction turned out to
// be vaguer than it read:
//
//   289 blog posts. Plenty discussing billboards and DOOH at ~1,200 words
//   each. NOT ONE using the phrase "advertising boards", and none linking to
//   /locations/india/bengaluru with it.
//
// So the task names the posts now. An internal link mostly carries relevance —
// the anchor text and the sentence around it — and relevance is usually what
// moves a page already sitting at #14. A post that already has traffic passes
// more than one published this morning, which is the other reason to spend the
// posts we have before writing new ones.
//
// Pure: posts in, a ranked shortlist out.

export type BlogPost = {
  url: string
  title: string | null
  words: number
  /** Opening of the body, cleaned. Enough to judge what it is about. */
  text: string
  /** /locations/* pages it already links to. */
  links: string[]
  /** Search Console impressions, when known. A proxy for how much it can lend. */
  impressions?: number
}

export type Linker = {
  url: string
  title: string | null
  /** Why this one, in the lead's words. */
  why: string
  score: number
  /** It already links to the target: nothing to add. */
  alreadyLinks: boolean
}

const flat = (s: string) => ' ' + (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '
const countOf = (hay: string, needle: string) => {
  const n = flat(needle).trim()
  if (!n) return 0
  return flat(hay).split(' ' + n + ' ').length - 1
}

/** Words that are in every OOH page and so distinguish nothing. */
const GENERIC = new Set([
  'advertising', 'advertisement', 'ads', 'ad', 'ooh', 'dooh', 'outdoor', 'media',
  'marketing', 'campaign', 'brand', 'brands', 'the', 'a', 'an', 'in', 'of', 'for',
  'and', 'to', 'on', 'near', 'me', 'best', 'top', 'board', 'boards',
])
const distinctive = (s: string) => flat(s).trim().split(' ').filter(w => w.length > 2 && !GENERIC.has(w))

/**
 * Rank the posts worth adding a link from.
 *
 * Scored on three things, in the order they matter:
 *   · does it discuss the topic at all — the phrase, then its distinctive words
 *   · does it discuss the market, so the link reads naturally rather than bolted on
 *   · does anybody read it, because a post with traffic lends more than one without
 *
 * A post already linking to the target is returned but marked, so nobody is
 * sent to add a link that is there.
 */
export function rankLinkers(opts: {
  posts: BlogPost[]
  /** The phrase we want to rank, e.g. "advertising boards". */
  topic: string
  /** The page that should receive the link. */
  target: string
  /** Market words that make a link read naturally, e.g. ['India','Bengaluru']. */
  places?: string[]
  limit?: number
}): Linker[] {
  const { posts, topic, target, places = [], limit = 4 } = opts
  const words = distinctive(topic)
  const out: Linker[] = []

  for (const p of posts) {
    const hay = `${p.title ?? ''} ${p.text}`
    const phrase = countOf(hay, topic)
    const partial = words.reduce((s, w) => s + Math.min(countOf(hay, w), 4), 0)
    const place = places.reduce((s, q) => s + Math.min(countOf(hay, q), 3), 0)

    // A SHARED WORD IS NOT A SHARED SUBJECT. The first version accepted any
    // post containing a distinctive word, which offered a UAE DOOH guide and a
    // piece on African media owners as linkers for "billboards near me" on a
    // Bengaluru page — because all three say "billboard". Nobody would write
    // those links by hand, and a link nobody would write by hand is a link
    // Google discounts.
    //
    // So: either the post uses the phrase itself, or it covers the subject AND
    // names the place, which is what makes the sentence carrying the link
    // possible to write.
    if (!phrase && !(partial && place)) continue
    const reach = Math.log10(1 + (p.impressions ?? 0))
    const already = p.links.some(l => l.replace(/\/$/, '') === target.replace(/\/$/, ''))

    const score = phrase * 10 + partial * 3 + place * 2 + reach * 2 - (already ? 100 : 0)

    const bits: string[] = []
    if (phrase) bits.push(`uses "${topic}" ${phrase} time${phrase === 1 ? '' : 's'} already`)
    else if (partial) bits.push(`covers ${words.slice(0, 2).join(' and ')}`)
    if (place) bits.push('and names the market')
    if ((p.impressions ?? 0) > 0) bits.push(`${(p.impressions ?? 0).toLocaleString('en-US')} impressions a month`)
    if (already) bits.push('— but it already links there, so nothing to add')

    out.push({ url: p.url, title: p.title, why: bits.join(', '), score, alreadyLinks: already })
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** The step a lead reads, or null when nothing we own is close enough. */
export function linkStep(linkers: Linker[], topic: string, target: string): string | null {
  const usable = linkers.filter(l => !l.alreadyLinks)
  if (!usable.length) {
    return `Nothing we have published is close enough to link from naturally. Rather than forcing one, ` +
      `an explainer answering "${topic}" — what it is, the formats, how it is priced — would give ${target} ` +
      `a sensible place to be linked from. Write it to answer the question, NOT to rank for the phrase: ` +
      `if it competes with ${target} you have moved the problem rather than fixed it.`
  }
  return `Link to ${target} from ${usable.length === 1 ? 'this post' : `these ${usable.length} posts`}, ` +
    `using "${topic}" as the anchor text — ` +
    usable.map(l => `${l.url} (${l.why})`).join('; ') +
    `. This is an edit, not a new page, and it is the cheapest lever there is.`
}
