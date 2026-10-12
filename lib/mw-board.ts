import 'server-only'
// 👉 The top of /mw/plan: what is wrong, and what is there to win.
//
// The page used to open with a task list, which answers "what am I doing"
// without ever answering "why is this the list". The owner asked for both,
// in that order (12 Oct 2026):
//
//   "1. Identify the issue and list them down
//    2. Identify the opportunity and list them down
//    3. give suggestion on how to solve all the issues and how to capture
//       opportunities in a full page render so it is easy to know what to do.
//    4. keeping track of what's done and not done."
//
// So: issues and opportunities are READ-ONLY summaries of evidence already
// gathered elsewhere — the city audit, the page proposals, the planner's own
// tasks. Nothing is computed twice and nothing new is invented here. Each one
// points at the work that answers it, which is the list below it.

import { supabase, supabaseConfigured } from './supabase'

export type CityRow = {
  url: string; city: string; country_url: string; market: string
  kind: 'misrouted' | 'near' | 'lowctr' | 'deep' | 'quiet'
  says: string; cost: number; clicks: number; pos: number | null
  terms: string[]; words: number | null; title: string | null; lands_on: string[]
  status: 'not_started' | 'in_progress' | 'done'
  status_by: string | null; status_at: string | null
}

export type BoardItem = {
  id: string
  /** One line, with the number in it. */
  headline: string
  /** The evidence, in the owner's own units. */
  detail: string
  /** Money a month riding on it. 0 when it is not a spend problem. */
  cost: number
  /** Where the work lives, so a reader can get from the issue to the task. */
  anchor?: string
  /** Who it belongs to, when it is one market's problem. */
  market?: string
}

const money = (n: number) => `S$${n.toFixed(2)}`

export async function cityRows(): Promise<CityRow[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_city_audit').select('*').order('cost', { ascending: false })
  return (data ?? []) as CityRow[]
}

/**
 * What is wrong, biggest first.
 *
 * Only things with evidence attached. A page nobody can see is NOT an issue —
 * that is the mistake the city audit was careful not to make, and repeating it
 * here would put 29 invented problems at the top of the board.
 */
export function issuesFrom(cities: CityRow[], proposals: { slug: string; url: string; kind: string; status: string; evidence: any }[]): BoardItem[] {
  const out: BoardItem[] = []

  const mis = cities.filter(c => c.kind === 'misrouted' && c.status !== 'done')
  if (mis.length) {
    const cost = mis.reduce((s, c) => s + Number(c.cost), 0)
    const clicks = mis.reduce((s, c) => s + c.clicks, 0)
    out.push({
      id: 'misrouted',
      headline: `${money(cost)} a month of ads is sent to the wrong page`,
      detail:
        `${clicks} clicks on ${mis.length} ${mis.length === 1 ? 'city' : 'cities'} land on the country page, while the city page ` +
        `for that exact city already exists and is written for those searches. Not one paid click reaches a city page. ` +
        `Biggest: ${mis.slice(0, 3).map(c => `${c.city} ${money(Number(c.cost))}`).join(', ')}. ` +
        `This is an ad destination change, not a writing job — the pages are already there.`,
      cost, anchor: '#cities',
    })
  }

  // A page bought for price searches that states no price. Counted from the
  // proposals already raised, not recomputed.
  const priced = proposals.filter(p => p.kind === 'section' && p.status === 'open' && /pricing|price/i.test(p.slug + JSON.stringify(p.evidence ?? {})))
  const pricePages = [...new Set(priced.map(p => p.url))]
  if (pricePages.length) {
    const cost = priced.reduce((s, p) => s + (p.evidence?.paid ?? []).reduce((t: number, x: any) => t + (Number(x.cost) || 0), 0), 0)
    out.push({
      id: 'no-price',
      headline: `${pricePages.length} pages take price searches and state no price`,
      detail: `${money(cost)} a month of clicks asks what something costs and lands on a page that never says. ` +
        `Google rates most of these landing pages below average, which is the same observation from its side.`,
      cost, anchor: '#work',
    })
  }

  return out.sort((a, b) => b.cost - a.cost)
}

/** What there is to win — positions already earned that are nearly there. */
export function opportunitiesFrom(cities: CityRow[]): BoardItem[] {
  const out: BoardItem[] = []

  const near = cities.filter(c => c.kind === 'near' && c.status !== 'done')
  if (near.length) {
    out.push({
      id: 'near',
      headline: `${near.length} city ${near.length === 1 ? 'page is' : 'pages are'} on page two and one push from the first`,
      detail: near.map(c => `${c.city} #${Math.round(Number(c.pos))}${c.terms[0] ? ` for “${c.terms[0]}”` : ''}`).join(' · ') +
        '. These already rank, so the work is adding to them — never rewriting over the wording that earned the position.',
      cost: 0, anchor: '#cities',
    })
  }

  const ranking = cities.filter(c => c.kind === 'misrouted' && c.pos !== null && Number(c.pos) <= 20)
  if (ranking.length) {
    out.push({
      id: 'double',
      headline: `${ranking.length} city ${ranking.length === 1 ? 'page earns a ranking AND has its' : 'pages earn a ranking AND have their'} ads sent elsewhere`,
      detail: ranking.map(c => `${c.city} ranks #${Math.round(Number(c.pos))} organically`).join(' · ') +
        '. Pointing the ads at the page that is already winning is the cheapest change on this board.',
      cost: ranking.reduce((s, c) => s + Number(c.cost), 0), anchor: '#cities',
    })
  }

  // Google shows these pages and nobody clicks. The cheapest work on the
  // board after repointing the ads: a title and a description, no content.
  const low = cities.filter(c => c.kind === 'lowctr' && c.status !== 'done')
  if (low.length) {
    out.push({
      id: 'lowctr',
      headline: `${low.length} city ${low.length === 1 ? 'page ranks' : 'pages rank'} well and ${low.length === 1 ? 'is' : 'are'} not being clicked`,
      detail: low.map(c => `${c.city} #${Math.round(Number(c.pos))}`).join(' · ') +
        '. The ranking is already won — what people are declining is the title and the description. ' +
        'No content work, and the result shows up in days rather than months.',
      cost: 0, anchor: '#cities',
    })
  }

  const deep = cities.filter(c => c.kind === 'deep' && c.status !== 'done')
  if (deep.length) {
    out.push({
      id: 'deep',
      headline: `${deep.length} city ${deep.length === 1 ? 'page is' : 'pages are'} shown often and buried past page two`,
      detail: deep.map(c => `${c.city} #${Math.round(Number(c.pos))}`).join(' · ') +
        '. Google is matching real searches to them, so the demand is proven — these are the ones worth adding to.',
      cost: 0, anchor: '#cities',
    })
  }

  const quiet = cities.filter(c => c.kind === 'quiet')
  if (quiet.length) {
    out.push({
      id: 'unseen',
      headline: `${quiet.length} city pages are barely shown at all`,
      detail: `Search Console records under 100 impressions each in 28 days. They are not thin, not duplicates ` +
        `and not orphans — all are 750+ words and linked from their country page — so the page is not what is ` +
        `wrong. Either almost nobody searches for what they answer, or Google has not matched them yet. ` +
        `Worth leaving alone until one of the three above is cleared.`,
      cost: 0, anchor: '#cities',
    })
  }

  return out.sort((a, b) => b.cost - a.cost)
}

export const STATUS_LABEL: Record<CityRow['status'], string> = {
  not_started: 'Not started', in_progress: 'In progress', done: 'Done',
}

export async function setCityStatus(url: string, status: CityRow['status'], by: string, note?: string) {
  if (!supabaseConfigured) return
  await supabase.from('mw_city_audit').update({
    status, status_by: by.slice(0, 80), status_at: new Date().toISOString(),
    note: note?.trim() ? note.trim().slice(0, 400) : null,
  }).eq('url', url)
}
