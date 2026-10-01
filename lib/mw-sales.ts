// 👉 What happened after a webform lead arrived.
//
// Pure module: the scorecard decides how people are judged, so it has to be
// testable without a network call.
//
// TWO THINGS THIS MEASURES, AND THEY ARE DIFFERENT:
//
//   1. Did the lead get answered, and how fast. Taken from the email trail,
//      which is automatic — nobody has to remember to log anything, so it
//      cannot be gamed or forgotten.
//
//   2. Was any of it written down. Four of the first five active leads
//      sampled had no note, no call log, nothing — including a live deal with
//      ten emails and two meetings. So "no record" and "no work" look
//      identical in the CRM today, and the dashboard's job is to tell them
//      apart rather than quietly score one as the other (owner, 1 Oct 2026).

export type LeadEvent = {
  id: string
  kind: 'email' | 'note' | 'call' | 'task' | 'meeting'
  at: string
  direction?: 'out' | 'in' | null
  actor?: string | null
  actorEmail?: string | null
  subject?: string | null
  body?: string | null
  /** Anything the source carried that is worth keeping: recipients, Zia's labels. */
  meta?: Record<string, unknown>
}

export type Lead = {
  id: string
  createdTime: string
  fullName?: string | null
  company?: string | null
  email?: string | null
  leadStatus?: string | null
  ownerName?: string | null
  country?: string | null
}

export type LeadRollup = {
  lead: Lead
  firstResponseAt: string | null
  firstResponder: string | null
  responseHours: number | null
  emailsOut: number
  emailsIn: number
  prospectReplied: boolean
  lastActivityAt: string | null
  /** Days since anything at all happened. Null when nothing ever has. */
  silentDays: number | null
  notes: number
  calls: number
  tasks: number
  meetings: number
  /** Anything written down by hand: a note, a call log, a task. */
  recorded: number
  band: 'fast' | 'ok' | 'late' | 'never'
  /** True when there is email activity but nobody wrote anything down. */
  unrecordedWork: boolean
}

/** Amber past a working day, red past three. His call (1 Oct 2026). */
export const SLA_HOURS = 24
export const SLA_RED_HOURS = 72

const hours = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000

export function bandOf(responseHours: number | null): LeadRollup['band'] {
  if (responseHours === null) return 'never'
  if (responseHours <= 4) return 'fast'
  if (responseHours <= SLA_HOURS) return 'ok'
  return 'late'
}

/**
 * One lead's story, from its events.
 *
 * The response clock stops at the first OUTBOUND email from anyone at Moving
 * Walls, not at the assigned owner's first email. On the Ethraco lead a
 * colleague answered four days before the owner engaged; the prospect was
 * answered, and that is what the clock is measuring.
 */
export function rollUpLead(lead: Lead, events: LeadEvent[]): LeadRollup {
  const byTime = [...events].sort((a, b) => +new Date(a.at) - +new Date(b.at))
  const emails = byTime.filter(e => e.kind === 'email')
  const out = emails.filter(e => e.direction === 'out')
  const incoming = emails.filter(e => e.direction === 'in')

  // An email that predates the lead record is not a response to it — CRM
  // records are often created from a conversation already under way. Skip
  // past those to the first outbound email that genuinely follows the lead,
  // rather than concluding nobody ever replied.
  const born = +new Date(lead.createdTime)
  const first = out.find(x => +new Date(x.at) >= born) ?? null
  const responseHours = first
    ? Math.round(hours(lead.createdTime, first.at) * 10) / 10
    : null

  const last = byTime.length ? byTime[byTime.length - 1].at : null
  const notes = byTime.filter(e => e.kind === 'note').length
  const calls = byTime.filter(e => e.kind === 'call').length
  const tasks = byTime.filter(e => e.kind === 'task').length
  const meetings = byTime.filter(e => e.kind === 'meeting').length
  const recorded = notes + calls + tasks

  return {
    lead,
    firstResponseAt: responseHours === null ? null : first!.at,
    firstResponder: responseHours === null ? null : (first!.actor ?? first!.actorEmail ?? null),
    responseHours,
    emailsOut: out.length,
    emailsIn: incoming.length,
    prospectReplied: incoming.length > 0,
    lastActivityAt: last,
    silentDays: last ? Math.floor(hours(last, new Date().toISOString()) / 24) : null,
    notes, calls, tasks, meetings, recorded,
    band: bandOf(responseHours),
    // The finding that matters: real conversation, no written record.
    unrecordedWork: emails.length >= 2 && recorded === 0,
  }
}

export type RepScore = {
  owner: string
  leads: number
  answered: number
  never: number
  late: number
  /** Median rather than mean: one holiday should not define a rep's month. */
  medianHours: number | null
  replyRate: number
  /** Share of their leads with any hand-written record. */
  recordedRate: number
  unrecorded: number
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  const v = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  return Math.round(v * 10) / 10
}

export function scoreByRep(rows: LeadRollup[]): RepScore[] {
  const by = new Map<string, LeadRollup[]>()
  for (const r of rows) {
    const k = r.lead.ownerName ?? 'Unassigned'
    by.set(k, [...(by.get(k) ?? []), r])
  }
  return [...by.entries()].map(([owner, rs]) => {
    const answered = rs.filter(r => r.responseHours !== null)
    return {
      owner,
      leads: rs.length,
      answered: answered.length,
      never: rs.filter(r => r.band === 'never').length,
      late: rs.filter(r => r.band === 'late').length,
      medianHours: median(answered.map(r => r.responseHours!)),
      replyRate: rs.length ? Math.round((rs.filter(r => r.prospectReplied).length / rs.length) * 100) : 0,
      recordedRate: rs.length ? Math.round((rs.filter(r => r.recorded > 0).length / rs.length) * 100) : 0,
      unrecorded: rs.filter(r => r.unrecordedWork).length,
    }
  }).sort((a, b) => b.leads - a.leads)
}

/** Hours as something a person reads: "3h", "1d 4h", "never". */
export function sayHours(h: number | null): string {
  if (h === null) return 'never'
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 24) return `${Math.round(h)}h`
  const d = Math.floor(h / 24)
  const r = Math.round(h % 24)
  return r ? `${d}d ${r}h` : `${d}d`
}

/**
 * A prospect's email address is personal data and /mw is open to the team,
 * so guests see enough to recognise the lead and not enough to contact them
 * behind the owner's back.
 */
export function maskEmail(email: string | null | undefined): string {
  const s = String(email ?? '')
  const at = s.indexOf('@')
  if (at < 1) return '—'
  const name = s.slice(0, at)
  const domain = s.slice(at + 1)
  const head = name.slice(0, Math.min(2, name.length))
  return `${head}${'•'.repeat(Math.max(3, name.length - 2))}@${domain}`
}

export type SalesSummary = {
  leads: number
  answered: number
  never: number
  late: number
  medianHours: number | null
  replyRate: number
  recordedRate: number
  unrecorded: number
  silent: number
}

export function summarise(rows: LeadRollup[]): SalesSummary {
  const answered = rows.filter(r => r.responseHours !== null)
  return {
    leads: rows.length,
    answered: answered.length,
    never: rows.filter(r => r.band === 'never').length,
    late: rows.filter(r => r.band === 'late').length,
    medianHours: median(answered.map(r => r.responseHours!)),
    replyRate: rows.length ? Math.round((rows.filter(r => r.prospectReplied).length / rows.length) * 100) : 0,
    recordedRate: rows.length ? Math.round((rows.filter(r => r.recorded > 0).length / rows.length) * 100) : 0,
    unrecorded: rows.filter(r => r.unrecordedWork).length,
    // Still open, prospect engaged, and nothing has happened for a week.
    silent: rows.filter(r => r.prospectReplied && (r.silentDays ?? 0) >= 7).length,
  }
}
