// 👉 What happened to a lead, and whose hands it passed through.
//
// Pure module. It decides how people are judged, so it must be testable
// without a network call.
//
// WHY THIS EXISTS. The first version of the sales page scored each person by
// the leads they currently own. Sukriti Taneja owns one lead and was the
// first to answer thirty-three; the page therefore said something untrue
// about her month, and she was right to say so. Ownership is a snapshot of
// where a lead ended up. It is not a record of who worked on it.
//
// THREE RULES, all learned from the audit trail rather than assumed:
//
//  1. A rule firing is not a person working. Zoho stamps automation with a
//     human name — the webform assignment rule records "Dineshgandhi S" as
//     having assigned every inbound lead, and a tagging workflow records
//     "Franches Ramasamy". Only entries a person actually made count.
//
//  2. The clock runs from when YOU got it, not from when the lead arrived.
//     Ali Magdy came in on 29 Sep, reached Rukshana on 30 Sep at 14:40, and
//     was answered on 1 Oct at 11:15. That is 38 hours for the company and 21
//     for her. Both numbers are true and they answer different questions, so
//     the page carries both rather than picking the one that flatters.
//
//  3. Routing is work. Somebody reads a queue and decides where each lead
//     belongs. That is the least visible job on the team and the easiest to
//     punish by accident (owner, 1 Oct 2026).

import type { LeadEvent, Lead } from './mw-sales'

export type TimelineLike = {
  at: string
  action: string
  byName: string | null
  byId: string | null
  changes: { field: string; from: string | null; to: string | null }[]
  source: string | null
  assignedTo: { id: string | null; name: string | null } | null
  ruleName: string | null
  recordModule: string | null
  recordName: string | null
}

export type StepKind =
  | 'created' | 'assigned' | 'transferred' | 'email-out' | 'email-in'
  | 'note' | 'task' | 'call' | 'meeting' | 'status' | 'automation'

export type JourneyStep = {
  id: string
  at: string
  kind: StepKind
  /** The person, when a person did it. Null when a rule did. */
  actor: string | null
  byMachine: boolean
  /** One sentence a manager can read without knowing the CRM. */
  detail: string
}

export type Holding = {
  who: string
  from: string
  /** Null while they still hold it. */
  until: string | null
  heldHours: number | null
  /** Hours from receiving it to their own first outbound email. */
  answeredInHours: number | null
  /** Did anything at all happen while they held it. */
  acted: boolean
}

const HUMAN = new Set(['crm_ui', 'mobile', 'zoho_mail'])
export const isHuman = (t: TimelineLike) => !!t.source && HUMAN.has(t.source)

const hrs = (a: string, b: string) =>
  Math.round(((+new Date(b) - +new Date(a)) / 3_600_000) * 10) / 10

/**
 * Identity. The CRM refers to the same person three ways — display name on a
 * timeline entry, email address on an email, user id on an assignment — and
 * Deewakshi already appears twice in the scorecard because of it.
 */
export function makeResolver(users: { id: string; name: string; email: string }[]) {
  const byEmail = new Map(users.map(u => [u.email.toLowerCase(), u.name]))
  const byId = new Map(users.map(u => [u.id, u.name]))
  return (v: string | null | undefined): string | null => {
    const s = String(v ?? '').trim()
    if (!s) return null
    if (byId.has(s)) return byId.get(s)!
    const e = s.toLowerCase()
    if (byEmail.has(e)) return byEmail.get(e)!
    // An address we do not know is a prospect, not a colleague.
    if (e.includes('@')) return byEmail.get(e) ?? s
    return s
  }
}

/** Who held the lead, in order, from the ownership trail. */
export function holdings(
  lead: Lead,
  timeline: TimelineLike[],
  emails: LeadEvent[],
  name: (v: string | null | undefined) => string | null = v => v ?? null,
): Holding[] {
  const marks: { at: string; who: string }[] = []

  for (const t of [...timeline].sort((a, b) => +new Date(a.at) - +new Date(b.at))) {
    // The assignment rule's own handover, which names its target in
    // automation_details rather than in a field change.
    if (t.action === 'owner_assigned' && t.assignedTo?.name) {
      marks.push({ at: t.at, who: name(t.assignedTo.name) ?? t.assignedTo.name })
    }
    // A person reassigning by hand shows up as an Owner field change.
    for (const c of t.changes) {
      if (/^owner$/i.test(c.field) && c.to) marks.push({ at: t.at, who: name(c.to) ?? c.to })
    }
  }

  if (!marks.length && lead.ownerName) marks.push({ at: lead.createdTime, who: lead.ownerName })

  // Collapse repeats — a rule and a workflow can both stamp the same handover.
  const seq: { at: string; who: string }[] = []
  for (const m of marks) if (!seq.length || seq[seq.length - 1].who !== m.who) seq.push(m)

  const outbound = emails
    .filter(e => e.kind === 'email' && e.direction === 'out')
    .sort((a, b) => +new Date(a.at) - +new Date(b.at))

  return seq.map((m, i) => {
    const until = i + 1 < seq.length ? seq[i + 1].at : null
    const within = (iso: string) =>
      +new Date(iso) >= +new Date(m.at) && (!until || +new Date(iso) < +new Date(until))
    const theirs = outbound.find(e => within(e.at) && (name(e.actor ?? e.actorEmail) ?? '') === m.who)
      ?? outbound.find(e => within(e.at))
    return {
      who: m.who,
      from: m.at,
      until,
      heldHours: until ? hrs(m.at, until) : null,
      answeredInHours: theirs ? hrs(m.at, theirs.at) : null,
      acted: !!theirs,
    }
  })
}

const verb: Record<string, string> = {
  call: 'logged a call', task: 'created a task', meeting: 'booked a meeting',
}

/** Every step, in order, phrased for a reader who does not use the CRM. */
export function buildJourney(
  lead: Lead,
  events: LeadEvent[],
  timeline: TimelineLike[],
  name: (v: string | null | undefined) => string | null = v => v ?? null,
): JourneyStep[] {
  const out: JourneyStep[] = []

  for (const t of timeline) {
    const who = name(t.byName)
    const machine = !isHuman(t)

    if (t.action === 'added' && t.recordModule === 'Leads') {
      out.push({
        id: `tl-${t.at}-created`, at: t.at, kind: 'created', actor: null, byMachine: true,
        detail: t.source === 'zoho_forms'
          ? 'Lead arrived from the website form'
          : `Lead created (${t.source ?? 'unknown source'})`,
      })
      continue
    }

    if (t.action === 'owner_assigned') {
      const to = name(t.assignedTo?.name) ?? '—'
      out.push({
        id: `tl-${t.at}-assigned`, at: t.at, kind: 'assigned', actor: machine ? null : who,
        byMachine: machine,
        detail: machine
          ? `Routed to ${to} automatically${t.ruleName ? ` by "${t.ruleName}"` : ''}`
          : `${who ?? 'Someone'} assigned it to ${to}`,
      })
      continue
    }

    const ownerChange = t.changes.find(c => /^owner$/i.test(c.field))
    if (ownerChange) {
      out.push({
        id: `tl-${t.at}-transfer`, at: t.at, kind: 'transferred', actor: who, byMachine: machine,
        detail: `${who ?? 'Someone'} passed it from ${ownerChange.from ?? '—'} to ${ownerChange.to ?? '—'}`,
      })
    }

    const statusChange = t.changes.find(c => /lead_status/i.test(c.field))
    if (statusChange) {
      out.push({
        id: `tl-${t.at}-status`, at: t.at, kind: 'status', actor: who, byMachine: machine,
        detail: `Status ${statusChange.from ?? '—'} → ${statusChange.to ?? '—'}`
          + (machine ? ` (${t.ruleName ?? 'automatic'})` : ` · ${who ?? 'someone'}`),
      })
    }

    if (t.action === 'added' && t.recordModule && t.recordModule !== 'Leads' && t.recordModule !== 'Emails') {
      const k: StepKind = t.recordModule === 'Tasks' ? 'task'
        : t.recordModule === 'Calls' ? 'call'
        : t.recordModule === 'Events' ? 'meeting' : 'note'
      out.push({
        id: `tl-${t.at}-${t.recordModule}`, at: t.at, kind: k, actor: who, byMachine: machine,
        detail: `${who ?? 'Someone'} ${verb[k] ?? 'added a record'}: ${t.recordName ?? '—'}`,
      })
    }
  }

  for (const e of events) {
    const who = name(e.actor ?? e.actorEmail)
    if (e.kind === 'email') {
      out.push({
        id: e.id, at: e.at, kind: e.direction === 'in' ? 'email-in' : 'email-out',
        actor: who, byMachine: false,
        detail: e.direction === 'in'
          ? `The prospect replied${e.subject ? ` — "${e.subject}"` : ''}`
          : `${who ?? 'Someone'} emailed them${e.subject ? ` — "${e.subject}"` : ''}`,
      })
    } else if (e.kind === 'note') {
      out.push({
        id: e.id, at: e.at, kind: 'note', actor: who, byMachine: false,
        detail: `${who ?? 'Someone'} wrote: ${e.body?.slice(0, 160) ?? '(empty note)'}`,
      })
    }
  }

  // De-duplicate: a task appears both in the timeline and the related list.
  const seen = new Set<string>()
  return out
    .filter(s => (seen.has(`${s.kind}-${s.at}`) ? false : (seen.add(`${s.kind}-${s.at}`), true)))
    .sort((a, b) => +new Date(a.at) - +new Date(b.at))
}

// ------------------------------------------------------------ contribution

export type Contribution = {
  who: string
  /** Leads where this person sent the first reply to the prospect. */
  firstResponses: number
  emailsSent: number
  /** Distinct leads they emailed at all. */
  conversations: number
  notes: number
  tasks: number
  calls: number
  meetings: number
  /** Leads they routed or reassigned by hand. */
  routed: number
  /** Every lead they did anything to. */
  leadsTouched: number
  /**
   * Median hours from THEM receiving a lead to THEIR first email on it. Null
   * when they never held one — a first responder who never owns anything
   * still has a first-response count, which is the point.
   */
  medianOwnHours: number | null
  /** Leads they held and never acted on. */
  wentQuiet: number
}

export type LeadJourney = {
  lead: Lead
  steps: JourneyStep[]
  held: Holding[]
  /** First human outbound email after the lead arrived. */
  firstResponder: string | null
  firstResponseHours: number | null
  /** Hours the company took, regardless of who had it. */
  teamHours: number | null
  prospectReplied: boolean
  /** Written down by a person: note, task, call or meeting. */
  recorded: number
  emailsOut: number
  emailsIn: number
  lastActivityAt: string | null
  silentDays: number | null
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10
}

export function buildLeadJourney(
  lead: Lead,
  events: LeadEvent[],
  timeline: TimelineLike[],
  name: (v: string | null | undefined) => string | null = v => v ?? null,
): LeadJourney {
  const steps = buildJourney(lead, events, timeline, name)
  const held = holdings(lead, timeline, events, name)

  const born = +new Date(lead.createdTime)
  const outbound = steps
    .filter(s => s.kind === 'email-out' && +new Date(s.at) >= born)
    .sort((a, b) => +new Date(a.at) - +new Date(b.at))
  const first = outbound[0] ?? null

  const inbound = steps.filter(s => s.kind === 'email-in')
  const last = steps.length ? steps[steps.length - 1].at : null

  return {
    lead, steps, held,
    firstResponder: first?.actor ?? null,
    firstResponseHours: first ? hrs(lead.createdTime, first.at) : null,
    teamHours: first ? hrs(lead.createdTime, first.at) : null,
    prospectReplied: inbound.length > 0,
    recorded: steps.filter(s => ['note', 'task', 'call', 'meeting'].includes(s.kind) && !s.byMachine).length,
    emailsOut: outbound.length,
    emailsIn: inbound.length,
    lastActivityAt: last,
    silentDays: last ? Math.floor(hrs(last, new Date().toISOString()) / 24) : null,
  }
}

/**
 * Everyone's contribution across the window, counted four ways — first
 * response, every email, anything written down, and routing.
 *
 * Nobody is credited for a rule firing in their name, and nobody is blamed
 * for a lead they never received.
 */
export function contributions(journeys: LeadJourney[]): Contribution[] {
  const by = new Map<string, Contribution & { _own: number[] }>()
  const get = (who: string) => {
    if (!by.has(who)) by.set(who, {
      who, firstResponses: 0, emailsSent: 0, conversations: 0, notes: 0, tasks: 0,
      calls: 0, meetings: 0, routed: 0, leadsTouched: 0, medianOwnHours: null,
      wentQuiet: 0, _own: [],
    })
    return by.get(who)!
  }

  for (const j of journeys) {
    const touched = new Set<string>()
    const emailed = new Set<string>()

    if (j.firstResponder) { get(j.firstResponder).firstResponses++; touched.add(j.firstResponder) }

    for (const s of j.steps) {
      if (s.byMachine || !s.actor) continue
      // The prospect is not a colleague. An inbound email has their name on
      // it, and counting it here put customers in the team scorecard.
      if (s.kind === 'email-in') continue
      const c = get(s.actor)
      touched.add(s.actor)
      if (s.kind === 'email-out') { c.emailsSent++; emailed.add(s.actor) }
      else if (s.kind === 'note') c.notes++
      else if (s.kind === 'task') c.tasks++
      else if (s.kind === 'call') c.calls++
      else if (s.kind === 'meeting') c.meetings++
      else if (s.kind === 'transferred' || s.kind === 'assigned') c.routed++
    }
    for (const who of emailed) get(who).conversations++

    for (const h of j.held) {
      touched.add(h.who)
      const c = get(h.who)
      if (h.answeredInHours !== null) c._own.push(h.answeredInHours)
      // Held it, did nothing, and it has already moved on or gone cold.
      else if (h.until || (j.silentDays ?? 0) >= 3) c.wentQuiet++
    }

    for (const who of touched) get(who).leadsTouched++
  }

  return [...by.values()]
    .map(({ _own, ...c }) => ({ ...c, medianOwnHours: median(_own) }))
    .sort((a, b) =>
      (b.firstResponses + b.emailsSent + b.routed) - (a.firstResponses + a.emailsSent + a.routed))
}
