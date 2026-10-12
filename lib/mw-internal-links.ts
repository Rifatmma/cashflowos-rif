// 👉 The links we already own and have not spent.
//
// Of 289 blog posts, 27 make an editorial link to a location page and 13 to a
// city page. The other 262 reach the money pages through the nav menu alone.
// Nothing on the board asked anyone to change that, and it is the cheapest
// lever there is: no new pages, nobody waiting on Dinesh, just edits to posts
// already written and already indexed.
//
//   "Yes turn that into tasks per market"              (owner, 13 Oct 2026)
//
// WHICH PAGES ARE WORTH LINKING TO. Not all of them. A page at #2 has little
// to gain and a page nobody searches for has nothing to gain. The ones that
// move are those already on the board and short of the first screen, where an
// internal link's relevance signal is usually what is missing.
//
// Pure: pages and posts in, a shortlist out.

import { rankLinkers, type BlogPost, type Linker } from './mw-linkers'

export type LinkTarget = {
  /** '/locations/india/bengaluru' */
  url: string
  /** The search it should win, and so the anchor text to use. */
  term: string
  /** Where it sits for that search today. */
  pos: number
  vol: number
}

export type LinkJob = {
  target: LinkTarget
  linkers: Linker[]
}

/** Below this there is nothing to push; above it, too far for a link to matter. */
export const PUSH_FROM = 4
export const PUSH_TO = 30

/**
 * Pages in this market worth sending links to, best opportunity first.
 *
 * One term per page: the one with the most volume in the push band. A page
 * wants one clear subject, and a task listing four anchor texts for one URL
 * produces four links that each say something different.
 */
export function targetsFor(pages: { url: string; terms: { q: string; pos: number; vol: number }[] }[]): LinkTarget[] {
  const out: LinkTarget[] = []
  for (const p of pages) {
    const best = p.terms
      .filter(t => t.pos >= PUSH_FROM && t.pos <= PUSH_TO && t.vol > 0)
      .sort((a, b) => b.vol - a.vol || a.pos - b.pos)[0]
    if (best) out.push({ url: p.url, term: best.q, pos: best.pos, vol: best.vol })
  }
  // Closest to the first screen first: those pay back soonest, which is what
  // keeps a lead doing the next one.
  return out.sort((a, b) => a.pos - b.pos || b.vol - a.vol)
}

/** Match each target with the posts that could link to it, dropping the hopeless. */
export function linkJobs(targets: LinkTarget[], posts: BlogPost[], places: string[], limit = 4): LinkJob[] {
  const jobs: LinkJob[] = []
  for (const target of targets) {
    const linkers = rankLinkers({ posts, topic: target.term, target: target.url, places, limit: 3 })
      .filter(l => !l.alreadyLinks)
    // No post of ours is about it: a forced link is worth nothing and reads as
    // spam. Say nothing rather than invent work.
    if (!linkers.length) continue
    jobs.push({ target, linkers })
  }
  return jobs.slice(0, limit)
}

/** How many separate edits the lead is being asked to make. */
export const editCount = (jobs: LinkJob[]) =>
  new Set(jobs.flatMap(j => j.linkers.map(l => l.url))).size

export function linkTaskSteps(jobs: LinkJob[], marketLabel: string): string[] {
  const edits = editCount(jobs)
  return [
    `This is ${edits} edit${edits === 1 ? '' : 's'} to posts we have already published. No new pages, nothing to build, ` +
    `nobody to wait for. Of our 289 posts, only 27 link to a location page at all outside the menu — the rest of that ` +
    `link equity is sitting unspent.`,
    ...jobs.map(j =>
      `Point at ${j.target.url} — it is #${Math.round(j.target.pos)} for "${j.target.term}" ` +
      `(${j.target.vol.toLocaleString('en-US')} searches a month). Add a link from ` +
      `${j.linkers.map(l => `${l.url} (${l.why})`).join(' and ')}, using "${j.target.term}" as the anchor text.`),
    `Write the link into a sentence that was going to be there anyway. A line added only to carry a link reads like ` +
    `one, and Google has been discounting those for years.`,
    `Do not link the same post to two different ${marketLabel} pages with similar anchor text — pick the page that ` +
    `should own the search and send it there.`,
    `Check the positions in six weeks. Internal links move a page that is already on the board; they will not rescue ` +
    `one that is not.`,
  ]
}
