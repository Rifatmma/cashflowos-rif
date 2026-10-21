// 👉 One list of what to do next, across every channel, ranked on one scale.
//
//   "use an 80/20 rule to prioritize the task, make sure prioritization is set
//    up properly in the card ... I need everything to be 100% efficient for me
//    and my team and every action is driven by data."    (owner, 21 Oct 2026)
//
// Before this the app had six separate rankings that never met: the market
// planner's scores (in clicks, impressions and audit points, compared only
// within a market), the paid keyword worklist (in dollars), the auction
// verdicts (in share points), the SEO planner (in enquiries), the content gap
// (in search volume) and nothing at all for sales. A paid fix and a blog post
// could not be compared, so nobody knew which came first.
//
// Everything is now a Candidate valued in ONE currency — expected enquiries a
// month — and ranked by value × confidence ÷ hours. Paid waste is converted at
// the account's own cost per lead and labelled in dollars, never set against
// organic. Fixes that make other numbers trustworthy (tracking) inherit a
// share of what they unlock, which is why they rise to the top.
//
// Then three rules keep it humane:
//  • focus markets (India, SEA, Americas) count in full; a maintenance market
//    contributes only its single best task
//  • nobody gets more hours of tasks this week than they have (Dinesh 5, a
//    market lead 1); the rest waits, visibly, for next week
//  • a declined task stays out until its data changes, and comes back with the
//    reason it was declined
//
// Pure: data in, ranking out. Tested in tests/mw-priorities.test.mts.

import type { Stage } from './mw-status'

export type Channel = 'Tracking' | 'Paid' | 'SEO' | 'Content' | 'Sales'

export type Candidate = {
  /** Stable across days: `<source>:<key>`. Progress is stored against it. */
  id: string
  source: 'tracking' | 'seo-step' | 'market-task' | 'paid-keywords' | 'paid-auction' | 'gap-topic' | 'proposal' | 'sales'
  channel: Channel
  title: string
  /** One sentence, with the number that makes it matter. */
  why: string
  /** Person name from the directory (lib/mw-people.ts). */
  owner: string
  /** Who prepares it, when that is not the owner (e.g. Claude drafts, Dinesh publishes). */
  helper?: string
  market: string | null
  effortHours: number
  /** Expected enquiries a month, or lead-equivalents for paid savings. */
  value: number
  /** How the value reads on the card: "≈ 5.9 enquiries / mo", "≈ S$270 / mo at stake". */
  valueLabel: string
  /** 1 measured, 0.6 modelled, 0.35 new content not yet ranking. */
  confidence: number
  /** Candidate ids this makes possible or trustworthy. */
  unlocks?: string[]
  doneWhen: string
  stage: Stage
  /** A decline, and whether the data has since moved enough to raise it again. */
  declined?: { reason: string | null; reopen: boolean } | null
  /** Where the work happens in the app. */
  href?: string
  /** What Claude is asked, when Claude can help. */
  prompt?: string
}

export type Ranked = Candidate & {
  score: number
  /** Value after unlock inheritance. */
  total: number
  rank: number
  /** This week, or waiting for capacity. */
  when: 'now' | 'later'
  /** Why it was raised again, if it was declined before. */
  reraised?: string | null
}

export type Queue = {
  items: Ranked[]
  /** The shortest run of top items reaching FOCUS_SHARE of the total value. */
  focus: string[]
  share: number
  totalValue: number
  /** Hours planned this week per person. */
  load: Record<string, { planned: number; cap: number; waiting: number }>
}

export const FOCUS_SHARE = 0.8
/** How much of what it unlocks a prerequisite inherits. */
export const UNLOCK_SHARE = 0.2
/** A task under this many hours still counts as this much, so tiny tasks can't score infinitely. */
export const MIN_HOURS = 0.25

export type RankOptions = {
  focusMarkets: string[]
  /** Weekly hours per person name. Missing people get `defaultHours`. */
  capacity: Record<string, number>
  defaultHours?: number
}

const isClosed = (s: Stage) => s === 'done' || s === 'moot'

export function rank(cands: Candidate[], opts: RankOptions): Queue {
  // 1. What is still on the table. Declines stay out unless the data moved.
  const open = cands.filter(c => !isClosed(c.stage) && !(c.stage === 'declined' && !c.declined?.reopen))

  // 2. Maintenance markets contribute only their best task.
  const bestInMarket = new Map<string, Candidate>()
  for (const c of open) {
    if (!c.market || opts.focusMarkets.includes(c.market)) continue
    const had = bestInMarket.get(c.market)
    const v = (x: Candidate) => (x.value * x.confidence) / Math.max(MIN_HOURS, x.effortHours)
    if (!had || v(c) > v(had)) bestInMarket.set(c.market, c)
  }
  const kept = open.filter(c => !c.market || opts.focusMarkets.includes(c.market) || bestInMarket.get(c.market) === c)

  // 3. Prerequisites inherit a share of what they unlock (only what is still open).
  const byId = new Map(kept.map(c => [c.id, c]))
  const total = (c: Candidate) =>
    c.value + UNLOCK_SHARE * (c.unlocks ?? []).reduce((t, id) => t + (byId.get(id)?.value ?? 0), 0)

  const scored = kept.map((c, i) => {
    const t = total(c)
    return { c, t, score: (t * c.confidence) / Math.max(MIN_HOURS, c.effortHours), i }
  }).sort((a, b) => b.score - a.score || a.i - b.i)

  // 4. A prerequisite goes before anything it unlocks, whatever the scores say.
  const order = scored.map(s => s.c.id)
  for (let pass = 0; pass < order.length; pass++) {
    let moved = false
    for (const s of scored) {
      const deps = (s.c.unlocks ?? []).filter(id => order.includes(id))
      if (!deps.length) continue
      const first = Math.min(...deps.map(id => order.indexOf(id)))
      const at = order.indexOf(s.c.id)
      if (at > first) { order.splice(at, 1); order.splice(first, 0, s.c.id); moved = true }
    }
    if (!moved) break
  }
  const sById = new Map(scored.map(s => [s.c.id, s]))

  // 5. Capacity: fill each person's week in rank order. Their first task
  //    always fits, even if it is bigger than the week, or nothing big would
  //    ever start.
  const load: Queue['load'] = {}
  const items: Ranked[] = order.map((id, k) => {
    const s = sById.get(id)!
    const who = s.c.owner
    const cap = opts.capacity[who] ?? opts.defaultHours ?? 1
    const l = load[who] ?? (load[who] = { planned: 0, cap, waiting: 0 })
    const fits = l.planned === 0 || l.planned + s.c.effortHours <= cap
    if (fits) l.planned += s.c.effortHours
    else l.waiting++
    const reraised = s.c.stage === 'declined' && s.c.declined?.reopen
      ? `Declined before${s.c.declined.reason ? `: “${s.c.declined.reason}”` : ''} — raised again because the numbers changed.`
      : null
    return { ...s.c, score: s.score, total: s.t, rank: k + 1, when: fits ? 'now' : 'later', reraised }
  })

  // 6. The 80/20 cut, over the ranked order.
  const totalValue = items.reduce((t, x) => t + x.value, 0)
  const focus: string[] = []
  let acc = 0
  for (const x of items) {
    if (!totalValue || acc / totalValue >= FOCUS_SHARE) break
    if (x.value <= 0 && !(x.unlocks?.length)) continue
    focus.push(x.id)
    acc += x.value
  }
  return { items, focus, share: totalValue ? Math.min(1, acc / totalValue) : 0, totalValue, load }
}

/** One person's view: their tasks in rank order, this week first. */
export function forPerson(q: Queue, name: string): Ranked[] {
  return q.items.filter(x => x.owner === name || x.helper === name)
    .sort((a, b) => (a.when === b.when ? a.rank - b.rank : a.when === 'now' ? -1 : 1))
}

/** Rough hours for a plan size. */
export const hoursOf = (size: 'S' | 'M' | 'L' | null | undefined) => (size === 'L' ? 8 : size === 'M' ? 3 : 1)

export const enquiries = (v: number) => (v >= 10 ? `≈ ${Math.round(v)}` : `≈ ${v.toFixed(1)}`) + ' enquiries / mo'
export const dollars = (v: number) => `≈ S$${Math.round(v).toLocaleString('en-US')} / mo at stake`
