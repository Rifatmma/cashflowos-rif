// 👉 Turning every source of work into Candidates for the one ranked list.
//
// Each function takes data already loaded elsewhere and returns Candidates in
// the single currency of lib/mw-priorities.ts — expected enquiries a month.
// Pure: no server imports, so every conversion here is tested.
//
// The conversions, stated once so they can be argued with:
//   ranking work   impressions × (CTR at target − CTR now) × LEAD_RATE
//   funnel         sessions × LEAD_RATE − leads already won
//   new content    volume × CTR at #8 × LEAD_RATE × chance of ranking × ½
//                  (½ because a new post takes months to rank)
//   paid waste     spend with no lead ÷ the account's own cost per lead,
//                  shown in dollars and never set against organic
//   unanswered     each unanswered enquiry is half an enquiry at risk
//   tracking       worth a share of everything it unlocks (see UNLOCK_SHARE)

import type { Stage } from './mw-status'
import { ctrAt } from './mw-plan'
import { LEAD_RATE, STEPS, CHAPTERS, isDone, type PlanStep, type Scored, type StepProgress, type StepState } from './mw-seo-plan'
import { analyseKeywords, type KeywordRow } from './mw-keywords'
import { worthWriting, effortOf, type GapCluster } from './mw-gap'
import { ownerOfMarket, OWNER_NAME, type Person } from './mw-people'
import { hoursOf, enquiries, dollars, type Candidate } from './mw-priorities'

const DINESH = 'Dinesh'

/** Chance a new page ranks on page one, from difficulty. Rough on purpose. */
export const rankChance = (kd: number) => (kd >= 50 ? 0.15 : kd >= 30 ? 0.35 : 0.6)

/** A new post realistically reaches about #10 at best, and not for a giant head term. */
export const NEW_POST_VOLUME_CAP = 5000
/**
 * Blog readers enquire far less than people on a location page: they are
 * reading, not buying. A quarter of the site rate, until the landing-page
 * report (after the GA4 fix) measures the real figure.
 */
export const BLOG_FACTOR = 0.25

/** Expected enquiries a month from a new blog post on a topic we don't rank for yet. */
export const newContentValue = (vol: number, kd: number) =>
  Math.min(vol, NEW_POST_VOLUME_CAP) * ctrAt(10) * LEAD_RATE * BLOG_FACTOR * rankChance(kd) * 0.5

/** Searches already ruled out, quoted in declined task titles: “advertisement near me”. */
export function ruledOutPhrases(titles: string[]): string[] {
  const out: string[] = []
  for (const t of titles) for (const m of t.matchAll(/[“"]([^”"]{3,60})[”"]/g)) out.push(m[1].trim().toLowerCase())
  return [...new Set(out)]
}

/** Stage of an item the app owns (not a market task): stored in mw_seo_step_state. */
const ownStage = (own: Map<string, StepState>, id: string): Stage => own.get(id)?.stage ?? 'not_started'

// ─────────────────────────────────────────────────────────────── tracking

export type TrackingFacts = {
  /** Share of leads in the last 14 days that carry a UTM medium, 0–1. Null if no leads. */
  utmFill: number | null
  /** Days since the last Semrush import. */
  semrushAgeDays: number | null
  /** Markets with no named rivals. */
  marketsWithoutRivals: number
}

export const TRACKING_IDS = { ga4: 'trk:ga4-cross-domain', zoho: 'trk:zoho-hidden-fields', semrush: 'trk:semrush-import' }

/**
 * The fixes that make every other number trustworthy. They are worth little
 * on their own and a share of everything after them, so they rise to the top
 * and say what they unlock.
 */
export function trackingCandidates(f: TrackingFacts, own: Map<string, StepState>, unlocks: { ga4: string[]; zoho: string[]; semrush: string[] }): Candidate[] {
  const out: Candidate[] = []
  out.push({
    id: TRACKING_IDS.ga4, source: 'tracking', channel: 'Tracking', owner: OWNER_NAME, market: null,
    title: 'Fix lead tracking in GA4 so every page gets credit',
    why: 'The enquiry forms are on forms.zohopublic.com, so GA4 credits every lead to the form and every location page shows 0. Two settings fix it.',
    effortHours: 0.5, value: 0.5, valueLabel: `unlocks ${unlocks.ga4.length} tasks`, confidence: 1, unlocks: unlocks.ga4,
    doneWhen: 'Landing pages show key events again in GA4 (check 48 hours after the change).',
    stage: ownStage(own, TRACKING_IDS.ga4),
    prompt: 'Give me click-by-click steps for GA4 property 342007847: cross-domain measurement for movingwalls.com, forms.zohopublic.com and forms.zoho.com, and unwanted referrals for zohopublic.com and zoho.com. Then how to confirm it worked. Read-only — I make the change.',
  })
  const zohoDone = f.utmFill !== null && f.utmFill >= 0.8
  out.push({
    id: TRACKING_IDS.zoho, source: 'tracking', channel: 'Tracking', owner: OWNER_NAME, market: null,
    title: 'Make the Zoho forms record where each lead came from',
    why: f.utmFill === null
      ? 'No recent leads to check. The CRM cannot yet say which channel a lead came from.'
      : `${Math.round(f.utmFill * 100)}% of recent CRM leads carry a source. Hidden fields on the forms fill the rest, so every lead shows its channel.`,
    effortHours: 1, value: 0.5, valueLabel: `unlocks ${unlocks.zoho.length} tasks`, confidence: 1, unlocks: unlocks.zoho,
    doneWhen: '80% of new CRM leads carry a source (checked automatically every day).',
    stage: zohoDone ? 'done' : ownStage(own, TRACKING_IDS.zoho),
    prompt: 'Give me step-by-step instructions to add hidden fields to our Zoho Forms (utm_source, utm_medium, utm_campaign, landing page, country) that map into the CRM lead, so every webform lead records its source. Read-only — I make the change.',
  })
  if (f.semrushAgeDays === null || f.semrushAgeDays > 35) {
    out.push({
      id: TRACKING_IDS.semrush, source: 'tracking', channel: 'Tracking', owner: OWNER_NAME, market: null,
      title: "Import this month's Semrush export",
      why: f.semrushAgeDays === null ? 'No Semrush data has been imported.' : `The last import is ${f.semrushAgeDays} days old, so search volume and difficulty are blank and new content can't be valued well.`,
      effortHours: 0.5, value: 0.2, valueLabel: `unlocks ${unlocks.semrush.length} tasks`, confidence: 1, unlocks: unlocks.semrush,
      doneWhen: 'Keyword volume is filled for the focus markets.', stage: ownStage(own, TRACKING_IDS.semrush),
      href: '/mw/settings',
    })
  }
  return out
}

// ───────────────────────────────────────────────────────────── SEO steps

/** Steps that a tracking candidate now covers, or that live elsewhere in the queue. */
const SUPERSEDED = new Set(['leak-tracking', 'blind-semrush-import', 'rhythm-review'])

const STEP_HOURS = { S: 1, M: 3, L: 8 } as const

export function seoStepCandidates(steps: PlanStep[], scored: Map<string, Scored>, prog: Map<string, StepProgress>, people: Person[]): Candidate[] {
  return steps.filter(s => !SUPERSEDED.has(s.id) && !s.links).map(s => {
    const g = scored.get(s.id)?.gain
    const p = prog.get(s.id)
    const website = s.website || s.who === 'Dinesh'
    const owner = s.who === 'Rif' ? OWNER_NAME
      : s.who === 'Market lead' ? (ownerOfMarket(people, s.funnel?.[0])?.name ?? OWNER_NAME)
      : website ? DINESH
      : OWNER_NAME                                  // Claude's own steps are Rif's to send
    const market = s.funnel?.[0] ?? null
    const ch = CHAPTERS.find(c => c.n === s.chapter)
    const channel = s.chapter === 5 ? 'SEO' : s.chapter === 7 ? 'Content' : 'SEO'
    return {
      id: `seo:${s.id}`, source: 'seo-step', channel, owner,
      helper: s.who === 'Claude' || s.who === 'Claude in Chrome' || website ? 'Claude' : undefined,
      market, title: s.title, why: s.why,
      effortHours: STEP_HOURS[s.size], value: g?.leads ?? 0,
      valueLabel: g && g.leads > 0 ? enquiries(g.leads) : ch?.title ?? '',
      confidence: g && g.rows > 0 ? 0.6 : 0.35, doneWhen: s.doneWhen,
      stage: p ? (isDone(p) ? 'done' : p.stage) : 'not_started',
      href: `/mw/seo?cut=all&step=${s.id}#planner`, prompt: s.go,
      unlocks: (s.unblocks ?? []).map(id => `seo:${id}`),
    } satisfies Candidate
  })
}

// ──────────────────────────────────────────────────────────── market tasks

export type TaskRow = {
  id: string
  title: string
  owner: string | null
  market: string | null
  size: 'S' | 'M' | 'L' | null
  status: string
  how: { kind?: string; url?: string; doneWhen?: string; keywords?: { q: string; pos: number; vol: number; visits: number }[] } | null
  decision: { choice: string | null; reason: string | null } | null
}

const taskStage = (status: string, choice: string | null): Stage =>
  status === 'moot' ? 'moot' : status === 'done' || choice === 'done' ? 'done'
    : choice === 'reject' ? 'declined' : status === 'part' || choice === 'accept' ? 'in_progress' : 'not_started'

/** Expected enquiries from a generated market task, by what kind of work it is. */
export function taskValue(t: TaskRow): number {
  const kw = t.how?.keywords ?? []
  const lift = (to: number) => kw.reduce((s, k) => s + (k.vol || 0) * Math.max(0, ctrAt(to) - ctrAt(k.pos || 50)), 0)
  switch (t.how?.kind) {
    case 'strike': case 'city': case 'city-build': return lift(3) * LEAD_RATE
    case 'no-clicks': return kw.reduce((s, k) => s + (k.vol || 0) * ctrAt(k.pos || 50) * 0.5, 0) * LEAD_RATE
    case 'gap': return newContentValue(kw.reduce((s, k) => s + (k.vol || 0), 0), 30)
    case 'cannibal': return lift(3) * 0.5 * LEAD_RATE
    case 'links': case 'orphan': return kw.reduce((s, k) => s + (k.vol || 0), 0) * 0.002 * LEAD_RATE
    case 'health': return 0.1
    default: return 0
  }
}

/**
 * Generated market tasks. Ones that repeat a curated SEO step (same page) are
 * dropped: the step is the better-written version of the same work.
 */
export function marketTaskCandidates(rows: TaskRow[], stepUrls: Set<string>, people: Person[]): Candidate[] {
  const out: Candidate[] = []
  for (const t of rows) {
    const kind = t.how?.kind ?? ''
    if (!kind || kind === 'blind') continue
    const url = String(t.how?.url ?? '').replace(/^https?:\/\/[^/]+/, '')
    if (url && [...stepUrls].some(u => url.startsWith(u))) continue
    const choice = t.decision?.choice ?? null
    const stage = taskStage(t.status, choice)
    const v = taskValue(t)
    const owner = t.owner && people.some(p => p.name === t.owner) ? t.owner : (ownerOfMarket(people, t.market)?.name ?? OWNER_NAME)
    out.push({
      id: `task:${t.id}`, source: 'market-task',
      channel: kind === 'gap' || kind === 'orphan' || kind === 'links' ? 'Content' : 'SEO',
      owner, market: t.market || null, title: t.title,
      why: v > 0 ? `${kw(t)} searches in play on ${url || 'the page'}.` : 'Housekeeping that keeps the page eligible to rank.',
      effortHours: hoursOf(t.size), value: v, valueLabel: v > 0 ? enquiries(v) : 'page standard',
      confidence: kind === 'gap' ? 0.35 : 0.6,
      doneWhen: t.how?.doneWhen ?? 'Marked done by its owner.', stage,
      declined: stage === 'declined' ? { reason: t.decision?.reason ?? null, reopen: false } : null,
      href: t.market ? `/mw/people/${encodeURIComponent(owner)}` : undefined,
    })
  }
  return out
}
const kw = (t: TaskRow) => (t.how?.keywords ?? []).length

// ──────────────────────────────────────────────────────────────── paid

export type PaidFacts = {
  keywords: KeywordRow[]
  /** Account cost per lead this month (Google Ads count). */
  cpl: number
  monthKey: string
}

/**
 * One candidate per campaign: the keywords that have had a fair test and
 * produced nothing. Grouped, because "77 keywords" is one decision for the
 * person who runs the account, not 77 tasks. Rif decides; this only shows
 * the evidence and the money.
 */
export function paidCandidates(f: PaidFacts, own: Map<string, StepState>): Candidate[] {
  const verdicts = analyseKeywords(f.keywords).filter(v => v.verdict !== 'converting' && v.verdict !== 'watch' && v.wasted > 0)
  const byCamp = new Map<string, typeof verdicts>()
  for (const v of verdicts) byCamp.set(v.row.campaign, [...(byCamp.get(v.row.campaign) ?? []), v])
  const out: Candidate[] = []
  for (const [camp, vs] of byCamp) {
    const wasted = vs.reduce((s, v) => s + v.wasted, 0)
    if (wasted < 20) continue
    const top = [...vs].sort((a, b) => b.wasted - a.wasted).slice(0, 3)
    const id = `paid:${camp}:${f.monthKey}`
    out.push({
      id, source: 'paid-keywords', channel: 'Paid', owner: OWNER_NAME, market: marketOfCampaign(camp),
      title: `${shortCamp(camp)}: ${vs.length} keyword${vs.length === 1 ? '' : 's'} spent S$${Math.round(wasted)} with no lead`,
      why: `Top: ${top.map(v => `“${v.row.text}” S$${Math.round(v.row.cost)} / ${v.row.clicks} clicks`).join(', ')}. Your call: pause, rework the page or ad, or keep testing.`,
      effortHours: 0.5, value: f.cpl > 0 ? wasted / f.cpl : 0, valueLabel: dollars(wasted), confidence: 0.6,
      doneWhen: 'Each keyword is paused, reworked, or kept on purpose.', stage: ownStage(own, id),
      declined: own.get(id)?.stage === 'declined' ? { reason: own.get(id)?.reason ?? null, reopen: false } : null,
      href: '/mw/paid',
    })
  }
  return out
}

export function marketOfCampaign(name: string): string | null {
  const n = name.toLowerCase()
  if (/\bsea\b|malaysia|\bkl\b|selangor|singapore|\bsg\b|indonesia|jakarta|thailand|vietnam/.test(n)) return 'sea'
  if (/india|mumbai|delhi|bangalore|bengaluru|t1-/.test(n)) return 'india'
  if (/japan/.test(n)) return 'japan'
  if (/\bus\b|usa|america|canada|mexico|brazil/.test(n)) return 'americas'
  return null
}
const shortCamp = (n: string) => (marketOfCampaign(n) === 'sea' ? 'SEA' : marketOfCampaign(n) === 'india' ? 'India' : n)

// ───────────────────────────────────────────────────────────── content gap

export type GapRow = { country: string; market: string; clusters: GapCluster[] }

/**
 * New content, valued — the blind spot of the old planner, which gave a topic
 * nobody ranks for yet exactly zero. Blog posts only: never a new page for a
 * keyword. The market lead reviews a brief Claude drafts; Dinesh publishes.
 */
export function gapCandidates(rows: GapRow[], own: Map<string, StepState>, people: Person[], perMarket = 3, declined: string[] = []): Candidate[] {
  const byMarket = new Map<string, { row: GapRow; c: GapCluster; v: number }[]>()
  const ruledOut = declined.map(d => d.toLowerCase()).filter(Boolean)
  const isRuledOut = (c: GapCluster) => ruledOut.some(d =>
    c.head.toLowerCase().includes(d) || (c.keywords ?? []).some((k: any) => String(k?.q ?? '').toLowerCase() === d))
  for (const row of rows) {
    for (const c of row.clusters.filter(worthWriting)) {
      if (isRuledOut(c)) continue
      const v = newContentValue(c.vol, c.kd)
      byMarket.set(row.market, [...(byMarket.get(row.market) ?? []), { row, c, v }])
    }
  }
  const out: Candidate[] = []
  for (const [market, list] of byMarket) {
    for (const { row, c, v } of list.sort((a, b) => b.v - a.v).slice(0, perMarket)) {
      const id = `gap:${row.country}:${slug(c.head)}`
      const owner = ownerOfMarket(people, market)?.name ?? OWNER_NAME
      out.push({
        id, source: 'gap-topic', channel: 'Content', owner, helper: 'Claude', market,
        title: `Blog brief: “${c.head}” (${label(row.country)})`,
        why: `${c.rivals.slice(0, 2).join(' and ') || 'Rivals'} rank for ${c.keywords.length} searches worth ${Math.round(c.vol).toLocaleString('en-US')} a month; we don't. ${effortOf(c).says}.`,
        effortHours: 1, value: v, valueLabel: enquiries(v), confidence: 0.35,
        doneWhen: 'The post is live and linked from the country page.', stage: ownStage(own, id),
        href: `/mw/gaps?c=${row.country}`,
        prompt: `Write a blog brief (not a new location page) for "${c.head}" in ${label(row.country)}: the searches it must answer (${c.keywords.slice(0, 8).map(k => k.q).join(', ')}), the outline with the keyword in its own short H2, what we can say that ${c.rivals[0] ?? 'rivals'} cannot, and which existing pages should link to it. Save under docs/proposals/.`,
      })
    }
  }
  return out
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
const label = (k: string) => k.split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ')

// ─────────────────────────────────────────────────────────── proposals

export type ProposalFact = { id: string; url: string; kind: string; status: string; spend: number; clicks: number }

/** Page changes waiting on a yes or no. Dinesh applies; the paid spend behind them sets the value. */
export function proposalCandidates(rows: ProposalFact[], cpl: number): Candidate[] {
  const byPage = new Map<string, ProposalFact[]>()
  for (const r of rows.filter(r => r.status === 'open')) byPage.set(r.url, [...(byPage.get(r.url) ?? []), r])
  return [...byPage].map(([url, list]) => {
    const spend = Math.max(...list.map(r => r.spend))
    const path = url.replace(/^https?:\/\/[^/]+/, '') || '/'
    const v = cpl > 0 ? (spend * 0.2) / cpl : 0
    return {
      id: `prop:${path}`, source: 'proposal', channel: 'SEO', owner: DINESH, market: null,
      title: `Review ${list.length} change${list.length === 1 ? '' : 's'} for ${path}`,
      why: spend > 0 ? `S$${Math.round(spend)} a month of paid clicks land here.` : 'Prepared from the page audit.',
      effortHours: 0.5 * list.length, value: v, valueLabel: spend > 0 ? dollars(spend * 0.2) : 'page standard', confidence: 0.6,
      doneWhen: 'Each change is approved and applied, or rejected with a reason.', stage: 'not_started',
      href: '/mw/people/Dinesh',
    } satisfies Candidate
  })
}

// ─────────────────────────────────────────────────────────────── sales

export type LeadFact = { owner_name: string | null; owner_email?: string | null; created_time: string; first_response_at: string | null; suspect_import: boolean }

/** Who holds new webform leads before they are handed to a salesperson (lib/mw-sales-run.ts seeds this queue). */
export const LEAD_QUEUE_EMAILS = ['dinesh@movingwalls.com']

/** Enquiries with no reply in the CRM, per person, last 14 days. Batch imports are not enquiries. */
export function salesCandidates(leads: LeadFact[], people: Person[], now = Date.now()): Candidate[] {
  const since = now - 14 * 86_400_000
  const waiting = new Map<string, number>()
  for (const l of leads) {
    if (l.suspect_import || l.first_response_at || Date.parse(l.created_time) < since) continue
    // By email, never by first name: "Dineshgandhi S" in Zoho is dinesh@, and
    // a first-name guess is how the wrong person ends up owning a queue.
    const email = String(l.owner_email ?? '').toLowerCase()
    const p = people.find(x => x.email.toLowerCase() === email)
    if (!p) continue
    waiting.set(p.name, (waiting.get(p.name) ?? 0) + 1)
  }
  return [...waiting].map(([name, n]) => {
    const queue = LEAD_QUEUE_EMAILS.includes(people.find(x => x.name === name)?.email.toLowerCase() ?? '')
    const c: Candidate = {
      id: `sales:${name}`, source: 'sales', channel: 'Sales', owner: name, market: null,
      title: queue
        ? `${n} enquir${n === 1 ? 'y is' : 'ies are'} still in the lead queue with no reply`
        : `${n} enquir${n === 1 ? 'y' : 'ies'} from the last two weeks with no reply in the CRM`,
      why: queue
        ? 'New webform leads land in this Zoho queue first. Each needs answering or handing to the right salesperson within a day.'
        : 'A reply in the first day is what turns an enquiry into a meeting. If you replied by phone, log it in Zoho so it counts.',
      effortHours: queue ? 0.5 : Math.min(2, 0.25 * n), value: n * 0.5, valueLabel: `${n} waiting`, confidence: 0.8,
      doneWhen: 'Every enquiry from the last two weeks has a logged reply.', stage: 'not_started', href: '/mw/sales',
    }
    return c
  })
}

export const ALL_STEPS = STEPS
