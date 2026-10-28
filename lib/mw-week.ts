// 👉 "My week": the few finished tasks each person gets on Monday.
//
//   "I need everyone to know what they have to do and how to do them. Use 80/20
//    rules and prioritize the tasks. I need the solution to be provided on the
//    dashboard itself so the person in charge can know what they have to do. It
//    needs to be direct and clear tell them exactly what to do don't give them
//    concepts."                                              (owner, 26 Oct 2026)
//
// The ranked queue (lib/mw-priorities.ts) answers "what matters most". This
// answers "what does each person do THIS week": a hard COUNT cap per person
// (market lead 2, Dinesh 5, Rif 3 — owner's choice), last week's unfinished
// cards first, then the queue in order. Hours were the old cap; nobody reads
// "3.0 h" and plans around it, but "2 tasks" is a promise a person can keep.
//
// Selection is code, so it is tested and the same every Monday. The words on
// each card — numbered steps, the draft, the exact text to paste — are written
// by the Monday run (.claude/skills/mw-week-build) and saved with the card. A
// card is not shown until it has steps: a title with no steps is the thing the
// owner called useless.
//
// Pure: no server imports.

import type { Ranked } from './mw-priorities'
import type { Person, Role } from './mw-people'

export type WeekKind =
  | 'content-new'      // a market lead edits Claude's draft of a new blog post, then submits to Dinesh
  | 'content-improve'  // a market lead edits Claude's rewrite of an existing page/post, then submits to Dinesh
  | 'publish'          // Dinesh publishes what a lead submitted
  | 'tech'             // Dinesh changes the site (schema, titles, tracking)
  | 'paid-apply'       // Rif applies a prepared Google Ads change with one tap
  | 'facts'            // a market lead answers a short factual question about their market
  | 'check'            // Rif checks or decides something only he can

export type WeekState = 'todo' | 'submitted' | 'done' | 'cant'

export type WeekLink = { label: string; url: string }

export type WeekTask = {
  id: string
  week: string
  owner: string
  kind: WeekKind
  market: string | null
  title: string
  why: string
  /** Numbered, imperative. Empty until the Monday run writes them — and then the card is not shown. */
  steps: string[]
  links: WeekLink[]
  doneWhen: string
  due: string
  /** Expected enquiries a month, from the queue. Only orders the cards. */
  value: number
  state: WeekState
  reason?: string | null
  /** Kind-specific: the doc a lead submitted, the Google Ads operations, the page to publish. */
  payload?: Record<string, unknown> | null
  /** The queue candidate this came from, so a carried card is never picked twice. */
  sourceId: string | null
  /** Weeks this card has been carried over unfinished. */
  carried: number
}

/** Tasks a person gets per week (owner, 26 Oct 2026). */
export const WEEK_CAP: Record<Role, number> = { market: 2, specialist: 5, lead: 3, boss: 0, viewer: 0 }

// ─────────────────────────────────────────────────────────────── dates

/** ISO week of a YYYY-MM-DD date, as "2026-W44". */
export function isoWeek(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const y = d.getUTCFullYear()
  const w = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7)
  return `${y}-W${String(w).padStart(2, '0')}`
}

/** Monday of an ISO week, YYYY-MM-DD. */
export function mondayOf(week: string): string {
  const [y, w] = week.split('-W').map(Number)
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const mon = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86_400_000 + (w - 1) * 7 * 86_400_000)
  return mon.toISOString().slice(0, 10)
}

/** Friday of an ISO week: when a card is due. */
export const dueOf = (week: string) =>
  new Date(Date.parse(`${mondayOf(week)}T00:00:00Z`) + 4 * 86_400_000).toISOString().slice(0, 10)

// ─────────────────────────────────────────────────────────── selection

/** What kind of card a queue item becomes, given who owns it. */
export function kindOf(c: Ranked, owner: Person): WeekKind {
  if (c.source === 'paid-keywords' || c.source === 'paid-auction') return 'paid-apply'
  if (owner.role === 'market') {
    if (c.source === 'gap-topic') return 'content-new'
    return 'content-improve'
  }
  if (owner.role === 'specialist') return 'tech'
  return 'check'
}

export type Pick = {
  /** New cards for this week, steps still empty. */
  picked: WeekTask[]
  /** Last week's unfinished cards, moved into this week. */
  carried: WeekTask[]
  /** Queue items that did not fit anyone's week, in rank order. */
  waiting: Ranked[]
  /** Steps Claude does itself in the Monday run — they never become anyone's card. */
  forClaude: Ranked[]
  /** Cards and cap per person. */
  load: Record<string, { cards: number; cap: number }>
}

/**
 * The week.
 *
 * 1. Every unfinished card from earlier weeks carries over first and counts
 *    against the cap — finishing beats starting.
 * 2. Then the queue, in its 80/20 order, fills each person up to their cap.
 *    Items owned by someone not in the directory, or by a boss, wait.
 * 3. Within a person, cards keep queue order: their most valuable first.
 *
 * Left out of everyone's week:
 *  • sales follow-ups — the sales team answers enquiries, not this team
 *    (owner, 26 Oct 2026: leads do content, Dinesh the site, Rif paid)
 *  • analysis Claude can do on its own (SEO steps owned by Rif with Claude as
 *    helper) — the Monday run does them and puts any outcome on a card
 *  • anything ruled out before: a card someone answered "Can't" to, or a
 *    topic the Monday run rejected, stays out until the queue item changes id
 */
export function pickWeek(o: {
  week: string
  queue: Ranked[]
  open: WeekTask[]
  people: Person[]
  caps?: Partial<Record<Role, number>>
  /** Queue ids answered "Can't", or rejected by the Monday run, in any earlier week. */
  ruledOut?: Set<string>
}): Pick {
  const caps = { ...WEEK_CAP, ...(o.caps ?? {}) }
  const byName = new Map(o.people.map(p => [p.name, p]))
  const load: Pick['load'] = {}
  const slot = (p: Person) => load[p.name] ?? (load[p.name] = { cards: 0, cap: caps[p.role] ?? 0 })

  const carried: WeekTask[] = []
  const taken = new Set<string>()
  for (const t of o.open) {
    if (t.state === 'done' || t.state === 'cant' || t.state === 'submitted') continue
    const p = byName.get(t.owner)
    if (!p) continue
    slot(p).cards++
    if (t.sourceId) taken.add(t.sourceId)
    carried.push(t.week === o.week ? t : { ...t, week: o.week, due: dueOf(o.week), carried: t.carried + 1 })
  }

  const picked: WeekTask[] = []
  const waiting: Ranked[] = []
  const forClaude: Ranked[] = []
  for (const c of o.queue) {
    if (taken.has(c.id) || o.ruledOut?.has(c.id) || c.source === 'sales') continue
    const p = byName.get(c.owner)
    if (c.source === 'seo-step' && c.helper === 'Claude' && p?.role === 'lead') { forClaude.push(c); continue }
    if (!p || p.role === 'boss' || p.role === 'viewer') { waiting.push(c); continue }
    const s = slot(p)
    if (s.cards >= s.cap) { waiting.push(c); continue }
    s.cards++
    taken.add(c.id)
    picked.push({
      id: `${o.week}:${c.id}`,
      week: o.week,
      owner: p.name,
      kind: kindOf(c, p),
      market: c.market,
      title: c.title,
      why: c.why,
      steps: [],
      links: c.href ? [{ label: 'Open in the app', url: c.href }] : [],
      doneWhen: c.doneWhen,
      due: dueOf(o.week),
      value: c.value,
      state: 'todo',
      reason: null,
      payload: null,
      sourceId: c.id,
      carried: 0,
    })
  }
  return { picked, carried, waiting, forClaude, load }
}

/** A card can be shown only once the Monday run has written its steps. */
export const isReady = (t: WeekTask) => t.steps.length > 0 && !!t.doneWhen

/**
 * The card Dinesh gets when a lead submits. One per submission: its id is the
 * lead's card id with a `:publish` suffix, so a double press makes no second card.
 */
export function publishCardFor(lead: WeekTask, doc: string, dinesh: string): WeekTask {
  const page = String(lead.payload?.page ?? '')
  return {
    id: `${lead.id}:publish`,
    week: lead.week,
    owner: dinesh,
    kind: 'publish',
    market: lead.market,
    title: lead.kind === 'content-new' ? `Publish: ${stripVerb(lead.title)}` : `Update the live page: ${stripVerb(lead.title)}`,
    why: `${lead.owner} finished and submitted it. It is ready to go live.`,
    steps: lead.kind === 'content-new'
      ? [
          `Open ${lead.owner}'s doc (link below) and read the "For Dinesh" box at the top.`,
          'Create a new blog post in the CMS. Copy the title, meta description and body from the doc exactly; keep every heading level.',
          'Add the internal links listed in the doc.',
          'Publish, open the live page, and check the headings, links and images show.',
          'Press "Published" here and paste the live URL.',
        ]
      : [
          `Open ${lead.owner}'s doc (link below) and read the "For Dinesh" box at the top.`,
          `Open ${page || 'the page named in the doc'} in the CMS.`,
          'Apply each change in the doc in order — every change says what to replace and where. Do not touch anything the doc does not mention.',
          'Publish, open the live page, and check each change is there.',
          'Press "Published" here and paste the live URL.',
        ],
    links: [{ label: `${lead.owner}'s doc`, url: doc }, ...(page ? [{ label: 'Live page', url: page }] : [])],
    doneWhen: 'The page is live with the changes in the doc, and you pressed Published.',
    due: lead.due,
    value: lead.value,
    state: 'todo',
    reason: null,
    payload: { doc, page: page || null, from: lead.id },
    sourceId: null,
    carried: 0,
  }
}

const stripVerb = (t: string) => t.replace(/^(edit and submit|edit|write|improve|update)\s*:\s*/i, '')

// ─────────────────────────────────────────────────────── paid: Apply
//
// A `paid-apply` card carries the exact Google Ads change, prepared by the
// Monday run, and Rif applies it with one tap (owner, 26 Oct 2026). The tap
// can only ever do the kinds of change Rif already approved by hand on
// 26 Oct — add a negative keyword, pause or re-enable a keyword or ad group,
// add a keyword. Budgets, bidding, campaigns, ads and anything that removes
// are refused here, whatever the card says: a card is data written by a run,
// and this is the line between a suggestion and the account.

export const ADS_CUSTOMER = '3759727500'

export type PaidPayload = {
  customerId: string
  /** GOOGLEADS_BATCH_MUTATE mutate_operations, exactly as sent. */
  operations: Record<string, any>[]
  /** One plain line per operation, shown on the card before Apply. */
  summary: string[]
}

const resOf = (r: unknown) => String(r ?? '')
const inAccount = (r: unknown, cust: string) => resOf(r).startsWith(`customers/${cust}/`)
const PHRASES = new Set(['EXACT', 'PHRASE', 'BROAD'])

/** Why an operation may not be applied, or null if it may. */
function refuse(op: Record<string, any>, cust: string): string | null {
  const keys = Object.keys(op)
  if (keys.length !== 1) return 'one operation family per item'
  const [fam] = keys
  const body = op[fam] ?? {}
  if (body.remove) return 'nothing is ever removed from the account by Apply'

  if (fam === 'campaign_criterion_operation') {
    const c = body.create
    if (!c) return 'campaign criteria: only creating a negative keyword is allowed'
    if (c.negative !== true || !c.keyword?.text || !PHRASES.has(String(c.keyword?.match_type ?? c.keyword?.matchType))) return 'campaign criteria: only negative keywords'
    if (!inAccount(c.campaign, cust)) return 'campaign is not in this account'
    return null
  }
  if (fam === 'ad_group_criterion_operation') {
    if (body.create) {
      const c = body.create
      if (!c.keyword?.text || !PHRASES.has(String(c.keyword?.match_type ?? c.keyword?.matchType))) return 'ad group criteria: only keywords'
      if (c.cpc_bid_micros !== undefined || c.cpcBidMicros !== undefined) return 'no bids'
      if (!inAccount(c.ad_group, cust)) return 'ad group is not in this account'
      return null
    }
    if (body.update) {
      const u = body.update
      const fields = Object.keys(u).filter(k => k !== 'resource_name' && k !== 'resourceName')
      if (fields.length !== 1 || fields[0] !== 'status' || !['PAUSED', 'ENABLED'].includes(u.status)) return 'keywords: only pausing or re-enabling'
      if (!inAccount(u.resource_name ?? u.resourceName, cust)) return 'keyword is not in this account'
      return null
    }
    return 'ad group criteria: create or update only'
  }
  if (fam === 'ad_group_operation') {
    const u = body.update
    if (!u) return 'ad groups: only pausing or re-enabling'
    const fields = Object.keys(u).filter(k => k !== 'resource_name' && k !== 'resourceName')
    if (fields.length !== 1 || fields[0] !== 'status' || !['PAUSED', 'ENABLED'].includes(u.status)) return 'ad groups: only pausing or re-enabling'
    if (!inAccount(u.resource_name ?? u.resourceName, cust)) return 'ad group is not in this account'
    return null
  }
  return `${fam} is not something Apply may change (budgets, bidding, campaigns and ads are yours alone)`
}

/** Check a paid card's change before anything reaches Google Ads. */
export function checkPaid(payload: unknown): { ok: true; payload: PaidPayload } | { ok: false; errors: string[] } {
  const p = payload as Partial<PaidPayload> | null
  const errors: string[] = []
  if (!p || typeof p !== 'object') return { ok: false, errors: ['no change on this card'] }
  if (p.customerId !== ADS_CUSTOMER) errors.push(`wrong Google Ads account (${p.customerId ?? 'none'})`)
  const ops = Array.isArray(p.operations) ? p.operations : []
  if (!ops.length) errors.push('no operations')
  if (ops.length > 50) errors.push('more than 50 operations — split the card')
  if (!Array.isArray(p.summary) || p.summary.length !== ops.length) errors.push('every operation needs one summary line')
  ops.forEach((op, i) => { const why = refuse(op ?? {}, ADS_CUSTOMER); if (why) errors.push(`#${i + 1}: ${why}`) })
  return errors.length ? { ok: false, errors } : { ok: true, payload: p as PaidPayload }
}
