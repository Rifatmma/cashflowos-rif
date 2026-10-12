// 👉 The city pages — the hyperlocal half of the plan, which nothing was
// looking at.
//
//   "I don't see you talk about pages beyond the country. You only talk about
//    /location/country but you never talk about locations/country/city which is
//    the heart of this hyperlocal landing page initiative also."
//                                                      (owner, 12 Oct 2026)
//
// What the audit of all 38 actually found, and it is not what I expected:
//
//   · They are NOT thin. Every one runs 750-1,270 words with 8-10 headings.
//   · They are NOT duplicates. Only 12% of sentences are shared between them,
//     and those are the footer.
//   · They are NOT orphans. All 38 are linked from their own country page.
//   · And 30 of the 38 rank for nothing Semrush can see.
//
// So the honest reading is that most of them are decent pages nobody has
// found yet, not broken ones. This module therefore refuses to invent a
// content fault for them. It raises only what can be SHOWN — chiefly the one
// finding that is costed and certain:
//
//   S$163 a month of paid clicks is bought on city searches and landed on the
//   COUNTRY page, while the city page for that exact city already exists.
//
// Pure: rows in, tasks out.

export type CityFacts = {
  /** '/locations/india/mumbai' */
  url: string
  city: string
  /** '/locations/india' */
  countryUrl: string
  countryLabel: string
  market: string
  words: number
  title: string
  /** Terms this page ranks for, any position. */
  ranked: { q: string; pos: number; vol: number }[]
  /** Paid searches naming this city, whatever page they land on. */
  paid: { q: string; cost: number; clicks: number; conv: number; lands: string }[]
}

export type CityFinding = {
  kind: 'misrouted' | 'near' | 'quiet'
  url: string
  city: string
  market: string
  /** What is true, in one sentence, with the number in it. */
  says: string
  /** Money a month riding on it, for ordering. */
  cost: number
  clicks: number
  /** Best organic position the page holds, if any. */
  pos: number | null
  terms: string[]
}

const money = (n: number) => `S$${n.toFixed(2)}`
const path = (u: string) => u.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '')

/** Paid clicks for this city that land anywhere other than its own page. */
export function misrouted(c: CityFacts): { cost: number; clicks: number; conv: number; lands: string[]; terms: string[] } {
  const away = c.paid.filter(p => path(p.lands) !== path(c.url))
  return {
    cost: away.reduce((s, p) => s + p.cost, 0),
    clicks: away.reduce((s, p) => s + p.clicks, 0),
    conv: away.reduce((s, p) => s + p.conv, 0),
    lands: [...new Set(away.map(p => path(p.lands)).filter(Boolean))],
    terms: [...away].sort((a, b) => b.cost - a.cost).map(p => p.q),
  }
}

/** Positions 4-20: on the board, off the first screen. */
export const nearMisses = (c: CityFacts) => c.ranked.filter(k => k.pos >= 4 && k.pos <= 20 && k.vol > 0)

/**
 * One finding per city page, or none.
 *
 * Order matters: a page whose traffic is being paid for and sent elsewhere is
 * a bigger and more certain problem than one that is merely quiet.
 */
export function readCity(c: CityFacts): CityFinding | null {
  const m = misrouted(c)
  if (m.clicks > 0) {
    return {
      kind: 'misrouted', url: c.url, city: c.city, market: c.market,
      says: `${money(m.cost)} a month and ${m.clicks} clicks are bought on ${c.city} searches and landed on ` +
        `${m.lands.join(' and ')}, while ${c.url} already exists and is written for exactly those searches. ` +
        `${m.conv === 0 ? 'None of them converted.' : `${m.conv} converted.`}`,
      cost: m.cost, clicks: m.clicks,
      pos: c.ranked.length ? Math.min(...c.ranked.map(k => k.pos)) : null,
      terms: m.terms.slice(0, 6),
    }
  }

  const near = nearMisses(c)
  if (near.length) {
    const best = near.sort((a, b) => a.pos - b.pos)[0]
    return {
      kind: 'near', url: c.url, city: c.city, market: c.market,
      says: `${c.url} ranks #${Math.round(best.pos)} for "${best.q}" (${best.vol} searches a month)` +
        `${near.length > 1 ? ` and is on the board for ${near.length - 1} more` : ''} — on page two, one push from the first.`,
      cost: 0, clicks: 0, pos: best.pos, terms: near.slice(0, 6).map(k => k.q),
    }
  }

  // NOT "this page is broken". Semrush showing nothing is not evidence of a
  // fault, and the audit ruled out the faults it could have been: the page is
  // long enough, it is not a duplicate, and it is linked. Saying more than
  // this would be inventing a problem to give somebody a task.
  return {
    kind: 'quiet', url: c.url, city: c.city, market: c.market,
    says: `${c.url} is ${c.words} words and linked from ${c.countryUrl}, and Semrush records no position for it. ` +
      `That is not proof it is failing — it is proof we cannot see it. Nothing is being spent on ${c.city} either.`,
    cost: 0, clicks: 0, pos: null, terms: [],
  }
}

export function readCities(cities: CityFacts[]): CityFinding[] {
  return cities.map(readCity).filter(Boolean as unknown as (f: CityFinding | null) => f is CityFinding)
    .sort((a, b) => {
      const rank = { misrouted: 0, near: 1, quiet: 2 } as const
      return rank[a.kind] - rank[b.kind] || b.cost - a.cost || (a.pos ?? 999) - (b.pos ?? 999)
    })
}

/** The headline for the whole hyperlocal programme, from the findings. */
export function citySummary(f: CityFinding[]): string {
  const mis = f.filter(x => x.kind === 'misrouted')
  const near = f.filter(x => x.kind === 'near')
  const quiet = f.filter(x => x.kind === 'quiet')
  const spend = mis.reduce((s, x) => s + x.cost, 0)
  const clicks = mis.reduce((s, x) => s + x.clicks, 0)
  const bits: string[] = [`${f.length} city pages`]
  if (mis.length) bits.push(`${mis.length} are being paid for and bypassed — ${money(spend)} a month, ${clicks} clicks, landing on the country page instead`)
  if (near.length) bits.push(`${near.length} rank on page two and could be pushed`)
  if (quiet.length) bits.push(`${quiet.length} have no position Semrush can see, which is not the same as being broken`)
  return bits.join(' · ')
}
