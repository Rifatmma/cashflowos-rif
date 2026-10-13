// 👉 The keywords a page already ranks for — the do-not-remove list.
//
// Born out of a mistake I made and nearly shipped (12 Oct 2026). Asked to
// improve /locations/malaysia for paid search, I proposed rewriting its title
// from "Out of Home Advertising Malaysia: Maximize Your Brand Visibility" to
// something built around "billboard rental". That page ranks at position 11 for
// `out of home advertising malaysia` — one place off page one — and the phrase
// is IN the title I wanted to throw away. The rewrite would have deleted a term
// it already earns traffic from, to chase one it does not.
//
//   "don't rewrite for the sakes of paid search only. We have SEO initiative
//    perhaps the current page is already doing well in SEO for some keywords
//    and you removed those and the ranking drop that could be possible"
//                                                      (owner, 12 Oct 2026)
//
// So the constraint stops being something to remember and becomes something to
// check against. This module turns the ranking data into one document, per
// page, that says: these words already work, do not take them away.
//
// PURE. No network, no database — rows in, Markdown out — so the banding and
// the wording can be tested without a Semrush pull.

export type RankedTerm = {
  q: string
  pos: number
  vol: number
  traffic: number
  market?: string
  country?: string
}

export type PageRanks = {
  url: string
  terms: RankedTerm[]
  /** The page's visible copy, when it could be fetched. null = not checked. */
  copy?: string | null
}

/** How binding the term is. */
export type Band = 'locked' | 'protect' | 'watch'

/**
 * Page one is traffic you can measure losing. 11-30 is one good edit away from
 * page one, so removing the term throws away work already done. Past 30 the
 * term is listed for completeness and binds nothing — a protection list where
 * everything is protected protects nothing.
 */
export function bandOf(t: RankedTerm): Band {
  if (t.pos > 0 && t.pos <= 10) return 'locked'
  if (t.pos > 10 && t.pos <= 30) return 'protect'
  return 'watch'
}

export const BAND_LABEL: Record<Band, string> = {
  locked: '🔒 Locked — page one. Do not remove these words.',
  protect: '⚠️ Protect — close to page one. Do not remove without saying why.',
  watch: '👁 Watch — ranked but distant. Listed, not binding.',
}

/** Loose containment: the term's words appear, in order, in the page copy. */
export function appearsIn(term: string, copy: string): boolean {
  const flat = (s: string) => ' ' + s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '
  const needle = flat(term)
  return needle.trim().length > 0 && flat(copy).includes(needle)
}

const esc = (s: string) => s.replace(/\|/g, '\\|')
const n = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—')

function pageBlock(p: PageRanks): string {
  const sorted = [...p.terms].sort((a, b) => a.pos - b.pos || b.vol - a.vol)
  const best = sorted.length ? sorted[0].pos : 0
  const visits = sorted.reduce((s, t) => s + (t.traffic || 0), 0)
  const path = p.url.replace(/^https?:\/\/(www\.)?movingwalls\.com/i, '') || '/'

  const out: string[] = []
  out.push(`### \`${path}\``)
  out.push('')
  out.push(`${sorted.length} term${sorted.length === 1 ? '' : 's'} · best position ${best || '—'} · ~${n(visits)} visits a month`)
  out.push('')

  for (const band of ['locked', 'protect', 'watch'] as Band[]) {
    const rows = sorted.filter(t => bandOf(t) === band)
    if (!rows.length) continue
    out.push(`**${BAND_LABEL[band]}**`)
    out.push('')
    // The "on the page" column is the point of the whole document: it names the
    // words an edit can actually destroy. A term that ranks but appears nowhere
    // in the copy is ranking on something else, and rewriting the copy cannot
    // take it away — so those are not what a proposal has to tiptoe around.
    const checked = p.copy != null
    out.push(checked ? '| Term | Pos | Volume | On the page |' : '| Term | Pos | Volume |')
    out.push(checked ? '|---|---:|---:|---|' : '|---|---:|---:|')
    for (const t of rows) {
      const where = !checked ? null
        : appearsIn(t.q, p.copy as string)
          ? '**yes — these words must survive any edit**'
          : 'no — ranks without the phrase being on it'
      out.push(`| ${esc(t.q)} | ${t.pos || '—'} | ${n(t.vol)} |` + (where ? ` ${where} |` : ''))
    }
    out.push('')
  }
  if (p.copy == null) {
    out.push('> The page could not be fetched, so nothing here is cross-checked against its copy.')
    out.push('')
  }
  return out.join('\n')
}

/** The whole document. `cycle` is the Semrush pull these numbers came from. */
export function protectionDoc(pages: PageRanks[], cycle: string, generatedOn: string): string {
  const live = pages.filter(p => p.terms.length).sort((a, b) => {
    const rank = (p: PageRanks) => Math.min(...p.terms.map(t => t.pos || 999))
    return rank(a) - rank(b)
  })
  const allTerms = live.flatMap(p => p.terms)
  const locked = allTerms.filter(t => bandOf(t) === 'locked').length
  const protect = allTerms.filter(t => bandOf(t) === 'protect').length

  return [
    '# Keywords we already rank for — the do-not-remove list',
    '',
    `*Semrush cycle **${cycle}** · generated ${generatedOn} · ${live.length} pages, ${allTerms.length} terms ` +
      `(${locked} on page one, ${protect} close behind).*`,
    '',
    '## What this is for',
    '',
    'Before proposing any change to a page — a new title, a reworded heading, a',
    'rewritten section — look the page up here first. **Anything in the Locked or',
    'Protect band is traffic the page already earns, and a rewrite that removes',
    'those words is a loss dressed up as an improvement.**',
    '',
    '**Brand terms are not in here.** Nothing is going to outrank us for our own',
    'name, so "protecting" it is advice nobody needs — and a list full of brand',
    'terms buries the non-brand ones that are the real constraint.',
    '',
    'This file exists because I nearly caused exactly that. Asked to improve',
    '`/locations/malaysia` for paid search, I proposed a new title built around',
    '"billboard rental". The current title carries *out of home advertising',
    'malaysia*, which that page ranks at **position 11** for — one place off page',
    'one — and my rewrite deleted it. The owner caught it:',
    '',
    '> "don\'t rewrite for the sakes of paid search only. We have SEO initiative',
    '> perhaps the current page is already doing well in SEO for some keywords and',
    '> you removed those and the ranking drop that could be possible as well."',
    '',
    '## The rule',
    '',
    '1. A proposed change **may not remove** a Locked or Protect term that appears',
    '   in the page copy. Not "should avoid" — may not.',
    '2. If removing one is genuinely right, it is proposed as an explicit **trade**,',
    '   with the organic traffic at risk and the paid spend to be won both stated.',
    '   Never slipped in.',
    '3. Adding is always safe. The best changes **add** a paid term to a heading',
    '   that carries none, leaving the ranking phrase intact.',
    '',
    '## How to refresh it',
    '',
    '```bash',
    'npx -y tsx --conditions=react-server --env-file=.env scripts/seo-protect.mts',
    '```',
    '',
    'Reads the newest Semrush cycle, re-fetches every page, rewrites this file.',
    'Run it after each Semrush pull: a term that climbs onto page one is a new',
    'thing to protect, and a stale file is worse than none, because it is trusted.',
    '',
    '---',
    '',
    '## Pages',
    '',
    ...live.map(pageBlock),
  ].join('\n')
}
