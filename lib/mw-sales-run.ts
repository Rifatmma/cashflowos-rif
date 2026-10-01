import 'server-only'
// 👉 Pulling the sales trail out of Zoho CRM, through Composio.
//
// Same road as GA4 and Search Console: the deployed app has no Zoho
// credentials of its own, it goes through the Composio connection. That was
// checked BEFORE any of this was written, because the Semrush build got as
// far as a finished dashboard before anyone noticed the app could not reach
// the data (owner, 1 Oct 2026).
//
// Cost: one call to list the leads, then two per lead (emails, notes). About
// 200 calls for a month of webform leads — comfortably inside Zoho's limits,
// and it runs once a day rather than on page load.

import { supabase, supabaseConfigured } from './supabase'
import { runTool } from './composio-mcp'
import { zohoConfigured, fetchTimeline, fetchUsers, fetchWritten } from './zoho'
import { rollUpLead, type Lead, type LeadEvent } from './mw-sales'

/** Only webform leads. Prospecting-tool imports are not the team's inbound work. */
export const WEBFORM = 'Website / Webform'

const s = (v: unknown) => (v === null || v === undefined ? null : String(v))

type ZohoLead = Record<string, any>

/** Webform leads created since `since` (YYYY-MM-DD). */
export async function fetchLeads(since: string, notes: string[]): Promise<ZohoLead[]> {
  // SMALL PAGES ON PURPOSE. Composio parks any oversized tool response in
  // its sandbox and returns a preview instead of the data, which surfaces as
  // "response too large" — two hundred leads with eleven fields each trips
  // it every time. Fifty does not (owner, 1 Oct 2026).
  const PAGE = 50
  const out: ZohoLead[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await runTool('ZOHO_SEARCH_LEADS', undefined, {
      criteria: `((Lead_Source:equals:${WEBFORM})and(Created_Time:greater_equal:${since}T00:00:00+08:00))`,
      fields: 'id,Full_Name,Company,Email,Lead_Status,Owner,Country,Created_Time',
      per_page: PAGE,
      page,
    })
    const rows: ZohoLead[] = res?.data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  notes.push(`Zoho: ${out.length} webform leads since ${since}`)
  return out
}

/**
 * Emails on one lead.
 *
 * ASK PER OWNER, NEVER THE DEFAULT CALL. Zoho returns only the mail the
 * connecting account is permitted to see under email-sharing settings, and
 * most of this team's mail is not shared with it. The default call reported
 * Manjusha Jain as having answered none of fifteen leads; asking with
 * type=user_emails and her user id returned the reply she had sent within
 * hours. Two people were wrongly shown as ignoring thirty-six leads between
 * them because of that one parameter (owner, 1 Oct 2026).
 *
 * `owners` is every user who has held the lead, so a handoff does not hide
 * the first responder's mail behind the current owner.
 */
async function fetchEmails(leadId: string, owners: string[]): Promise<LeadEvent[]> {
  const seen = new Map<string, any>()

  // The default call still catches anything shared openly.
  const base = await runTool('ZOHO_GET_RECORD_EMAILS', undefined, {
    module_api_name: 'Leads', record_id: leadId,
  }).catch(() => ({ Emails: [] }))
  for (const m of (base?.Emails ?? [])) if (m?.message_id) seen.set(String(m.message_id), m)

  // Asked in parallel. Three owners done one after another is three round
  // trips to Composio per lead, and with the activity lists added that was
  // enough to push a twenty-lead batch past Vercel's sixty seconds.
  const perOwner = await Promise.all(owners.filter(Boolean).map(ownerId =>
    runTool('ZOHO_GET_RECORD_EMAILS', undefined, {
      module_api_name: 'Leads', record_id: leadId,
      type: 'user_emails', owner_id: ownerId,
    }).catch(() => ({ Emails: [] }))))
  for (const mine of perOwner) {
    for (const m of (mine?.Emails ?? [])) if (m?.message_id) seen.set(String(m.message_id), m)
  }

  const rows: any[] = [...seen.values()]
  return rows.map(m => ({
    id: String(m.message_id),
    kind: 'email' as const,
    at: String(m.time),
    direction: m.sent === true ? ('out' as const) : ('in' as const),
    actor: s(m.from?.user_name) ?? s(m.from?.email),
    actorEmail: s(m.from?.email),
    subject: s(m.subject),
    body: null,
    meta: {
      to: (m.to ?? []).map((x: any) => x.email).filter(Boolean),
      hasAttachment: !!m.has_attachment,
      ziaIntent: s(m.intent),
      ziaSentiment: s(m.sentiment_info),
      ziaEmotion: s(m.emotion),
      threadId: s(m.thread_id),
    },
  })).filter(e => e.id && e.at)
}

/**
 * Everything written down by hand, from both sources, merged.
 *
 * Composio's related-records call found exactly one note across ninety-five
 * leads. The team says people do write notes, and the identical symptom on
 * emails was a visibility rule rather than an absence. So both are asked and
 * the union is kept: whichever can see a record, the record is kept
 * (owner, 1 Oct 2026).
 */
async function fetchWrittenWork(leadId: string): Promise<LeadEvent[]> {
  const seen = new Map<string, LeadEvent>()

  if (zohoConfigured) {
    try {
      for (const w of await fetchWritten(leadId)) {
        seen.set(`${w.kind}-${w.at}`, {
          id: w.id, kind: w.kind, at: w.at, direction: null,
          actor: w.actor, actorEmail: w.actorEmail,
          subject: w.title,
          body: w.body,
          meta: { via: 'zoho' },
        })
      }
    } catch { /* fall through to Composio */ }
  }

  for (const n of await fetchNotes(leadId).catch(() => [] as LeadEvent[])) {
    if (!seen.has(`note-${n.at}`)) seen.set(`note-${n.at}`, n)
  }
  return [...seen.values()]
}

/** Notes, which unlike emails do carry what the rep actually wrote. */
async function fetchNotes(leadId: string): Promise<LeadEvent[]> {
  const res = await runTool('ZOHO_GET_RELATED_RECORDS', undefined, {
    module_api_name: 'Leads', record_id: leadId,
    related_list_api_name: 'Notes',
    fields: 'Note_Title,Note_Content,Created_Time,Owner',
    per_page: 50,
  })
  const rows: any[] = res?.data ?? []
  return rows.map(n => ({
    id: `note-${n.id}`,
    kind: 'note' as const,
    at: String(n.Created_Time),
    direction: null,
    actor: s(n.Owner?.name),
    actorEmail: s(n.Owner?.email),
    subject: s(n.Note_Title),
    // Notes come back as HTML from the CRM editor.
    body: s(n.Note_Content)?.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() ?? null,
    meta: {},
  })).filter(e => e.at)
}

/**
 * The people a lead passes through before it reaches its owner.
 *
 * Asking EVERY user per lead would be thousands of calls; the queue is in
 * fact short. An assignment rule drops every webform lead on one person and
 * a second reassigns them on, so their two mailboxes plus the current
 * owner's cover almost everything. Editable in mw_settings without a deploy
 * as the team changes (owner, 1 Oct 2026).
 */
const QUEUE_SEED = [
  '5289273000017034001', // Dineshgandhi S — assignment-rule default holder
  '5289273000068406001', // Sukriti Taneja — reassigns leads onward
]

async function queueHandlers(notes: string[]): Promise<string[]> {
  if (!supabaseConfigured) return QUEUE_SEED
  const { data } = await supabase.from('mw_settings')
    .select('value').eq('key', 'sales_queue_handlers').maybeSingle()
  if (!data?.value) {
    await supabase.from('mw_settings')
      .upsert({ key: 'sales_queue_handlers', value: QUEUE_SEED }, { onConflict: 'key' })
    notes.push(`queue handlers: ${QUEUE_SEED.length} seeded`)
    return QUEUE_SEED
  }
  const ids = (data.value as string[]).filter(Boolean).slice(0, 4)
  notes.push(`queue handlers: ${ids.length} — their mail is checked on every lead`)
  return ids
}

/**
 * Everyone in the CRM, cached in settings.
 *
 * The same person reaches this app three ways — "Rukshana Rizwie" on a
 * timeline entry, rukshana@movingwalls.com on an email, a user id on an
 * assignment. Deewakshi already appears twice in the scorecard because of
 * it. One lookup per run fixes all three (owner, 1 Oct 2026).
 */
async function syncUsers(notes: string[]): Promise<{ id: string; name: string; email: string }[]> {
  if (!zohoConfigured) return []
  try {
    const users = await fetchUsers()
    if (users.length) {
      await supabase.from('mw_settings').upsert({ key: 'zoho_users', value: users }, { onConflict: 'key' })
      notes.push(`${users.length} CRM users cached for name matching`)
    }
    return users
  } catch (e: any) {
    notes.push(`users lookup failed: ${String(e?.message ?? e).slice(0, 80)}`)
    return []
  }
}

/**
 * The audit trail for one lead: who held it, who passed it on, what was
 * logged. This is the only source that distinguishes a person working from a
 * rule firing in their name, so a failure here is reported rather than
 * silently treated as "nothing happened".
 */
async function pullTimeline(leadId: string): Promise<number> {
  if (!zohoConfigured) return 0
  const rows = await fetchTimeline('Leads', leadId)
  if (!rows.length) return 0
  const { error } = await supabase.from('mw_lead_timeline').upsert(
    rows.map((t, i) => ({
      id: `${leadId}-${t.at}-${t.action}-${i}`,
      lead_id: leadId,
      at: t.at, action: t.action,
      by_name: t.byName, by_id: t.byId,
      source: t.source, rule_name: t.ruleName,
      assigned_to_name: t.assignedTo?.name ?? null,
      assigned_to_id: t.assignedTo?.id ?? null,
      record_module: t.recordModule, record_name: t.recordName,
      changes: t.changes,
      synced_at: new Date().toISOString(),
    })), { onConflict: 'id' })
  if (error) throw new Error(error.message)
  return rows.length
}

export type SalesRun = { ok: boolean; message: string; notes: string[] }

/**
 * Pull, roll up and store. Never throws: one lead failing must not lose the
 * other ninety-one.
 */
export async function refreshSales(
  opts: { since?: string; limit?: number; force?: boolean } = {},
): Promise<SalesRun> {
  const notes: string[] = []
  const since = opts.since ?? new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10)
  // THE BUDGET STARTS HERE, not when the lead loop starts. The first attempt
  // measured it from after the user sync and the lead search, which had
  // already spent ten seconds of the sixty — so a 48-second budget could not
  // be met and the function was killed anyway (owner, 1 Oct 2026).
  const startedAt = Date.now()
  try {
    if (!supabaseConfigured) return { ok: false, message: 'supabase not configured', notes }

    // Leads pass through a queue: an assignment rule gives them to one person
    // and a human reassigns them on. The first responder is often not the
    // current owner, so every active user's mailbox is asked, not just theirs.
    const extraOwnerIds = await queueHandlers(notes)
    await syncUsers(notes)
    if (!zohoConfigured) notes.push('ZOHO_* not set — no audit trail, so handoffs cannot be shown')

    const leads = await fetchLeads(since, notes)

    // RESUMABLE, because a backfill does not fit in one request. Each lead
    // costs two Composio calls and Vercel kills a function at sixty seconds,
    // so ninety-two leads cannot be done in one go. Leads pulled recently are
    // skipped, which means calling this repeatedly walks through the backlog
    // instead of restarting it (owner, 1 Oct 2026).
    // FORCE SHORTENS THE WINDOW, IT DOES NOT REMOVE IT.
    //
    // Turning the skip off entirely means every call starts at the top of the
    // same list, so a backfill that needs four calls repeats its first batch
    // four times and never reaches the end. force=1 exists to re-pull leads
    // fetched yesterday, not to forget what this backfill did ninety seconds
    // ago (owner, 1 Oct 2026).
    const windowMs = opts.force ? 10 * 60_000 : 12 * 3_600_000
    const fresh = new Date(Date.now() - windowMs).toISOString()
    const { data: doneRows } = await supabase.from('mw_leads').select('id').gte('synced_at', fresh)
    const done = new Set((doneRows ?? []).map(r => String(r.id)))
    const todo = leads.filter(z => !done.has(String(z.id)))
    const take = opts.limit ? todo.slice(0, opts.limit) : todo
    if (done.size) notes.push(`${done.size} already pulled in the last ${opts.force ? '10 min' : '12h'}, skipped`)

    // A DEADLINE, NOT A GUESSED BATCH SIZE.
    //
    // Each lead now costs about fifteen API calls -- emails per owner, eight
    // activity lists, the audit trail -- where it used to cost three. Twenty
    // leads went past Vercel's sixty seconds and returned a 504, which loses
    // the work already done and tells you nothing about how far it got.
    //
    // So the run stops itself with ten seconds to spare and reports what it
    // finished. Calling it again picks up where it left off, because leads
    // pulled recently are skipped. The batch size stops mattering
    // (owner, 1 Oct 2026).
    // Three separate guards, because the first version had only the weakest.
    //
    //   startNoLater  — do not BEGIN another lead after this point.
    //   PER_LEAD      — no single lead may hold a lane longer than this.
    //   hardStop      — return no matter what is still in flight.
    //
    // Checking only the first is what failed: three lanes each began a lead
    // at 47 seconds, every one of them took fifteen, and the function died at
    // sixty-two having reported nothing.
    const startNoLater = startedAt + 30_000
    const PER_LEAD = 14_000
    const hardStop = startedAt + 45_000
    let ranOut = false

    let stored = 0, failed = 0, withEmail = 0, withNote = 0, withTimeline = 0, tlFailed = 0
    let tlWhy = ''
    // Three leads at a time. Enough to hide the latency of forty sequential
    // HTTP calls; not so many that Zoho starts refusing them.
    const LANES = 3
    const queue = [...take]
    const worker = async () => {
      while (queue.length) {
        if (Date.now() > startNoLater) { ranOut = true; return }
        const z = queue.shift()!
        // A lead that hangs must cost one lane, not the whole run.
        await Promise.race([
          one(z),
          new Promise<void>(r => setTimeout(() => { failed++; r() }, PER_LEAD)),
        ])
      }
    }

    const one = async (z: any) => {
      try {
        const lead: Lead = {
          id: String(z.id),
          createdTime: String(z.Created_Time),
          fullName: s(z.Full_Name), company: s(z.Company), email: s(z.Email),
          leadStatus: s(z.Lead_Status), ownerName: s(z.Owner?.name), country: s(z.Country),
        }
        // Every user who might hold this lead's mail. The owner always, plus
        // anyone the team has nominated as a first-touch handler.
        const owners = [String(z.Owner?.id ?? ''), ...extraOwnerIds].filter(Boolean)
        const [emails, noteRows, tlCount] = await Promise.all([
          fetchEmails(lead.id, owners).catch(() => [] as LeadEvent[]),
          fetchWrittenWork(lead.id).catch(() => [] as LeadEvent[]),
          // A timeline failure must not cost the lead's email trail, but it
          // must be visible: without it the page cannot show who held what.
          pullTimeline(lead.id).catch(err => { tlFailed++; tlWhy = String(err?.message ?? err).slice(0, 80); return 0 }),
        ])
        if (tlCount) withTimeline++
        const events = [...emails, ...noteRows]
        const r = rollUpLead(lead, events)
        if (emails.length) withEmail++
        if (noteRows.length) withNote++

        // Zia's read of the most recent inbound email, kept as her opinion.
        const lastIn = [...emails].filter(e => e.direction === 'in').sort((a, b) => +new Date(b.at) - +new Date(a.at))[0]

        const { error } = await supabase.from('mw_leads').upsert({
          id: lead.id,
          created_time: lead.createdTime,
          full_name: lead.fullName, company: lead.company, email: lead.email,
          lead_source: s(z.Lead_Source), lead_status: lead.leadStatus,
          owner_name: lead.ownerName, owner_email: s(z.Owner?.email),
          country: lead.country,
          first_response_at: r.firstResponseAt, first_responder: r.firstResponder,
          response_hours: r.responseHours,
          emails_out: r.emailsOut, emails_in: r.emailsIn,
          prospect_replied: r.prospectReplied, last_activity_at: r.lastActivityAt,
          notes_count: r.notes, calls_count: r.calls, tasks_count: r.tasks, meetings_count: r.meetings,
          zia_intent: (lastIn?.meta as any)?.ziaIntent ?? null,
          zia_sentiment: (lastIn?.meta as any)?.ziaSentiment ?? null,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'id' })
        if (error) throw new Error(error.message)

        if (events.length) {
          const { error: e2 } = await supabase.from('mw_lead_events').upsert(
            events.map(ev => ({
              id: ev.id, lead_id: lead.id, kind: ev.kind, at: ev.at,
              direction: ev.direction ?? null, actor: ev.actor ?? null,
              actor_email: ev.actorEmail ?? null, subject: ev.subject ?? null,
              body: ev.body ?? null, meta: ev.meta ?? {},
            })), { onConflict: 'id' })
          if (e2) throw new Error(e2.message)
        }
        stored++
      } catch (err: any) {
        failed++
        if (failed <= 3) notes.push(`lead ${z.id}: ${String(err?.message ?? err).slice(0, 80)}`)
      }
    }

    // Whatever is still in flight at the hard stop is abandoned, not awaited.
    // Anything it had already written to the database is kept; anything it
    // had not is picked up by the next call. Returning late is worse than
    // returning short, because a 504 reports the finished work as nothing.
    await Promise.race([
      Promise.all(Array.from({ length: LANES }, worker)),
      new Promise<void>(r => setTimeout(() => { ranOut = true; r() }, Math.max(1_000, hardStop - Date.now()))),
    ])
    if (ranOut) {
      notes.push(`stopped after ${Math.round((Date.now() - startedAt) / 1000)}s to avoid a timeout — call again to continue`)
    }

    notes.push(`${withEmail} leads have an email trail, ${withNote} have a written note`)
    notes.push(tlFailed
      ? `audit trail: ${withTimeline} pulled, ${tlFailed} failed — ${tlWhy}`
      : `audit trail: ${withTimeline} leads, so handoffs are visible`)
    const remaining = todo.length - stored - failed
    return {
      ok: stored > 0 || take.length === 0,
      notes,
      message: `sales: ${stored} leads stored${failed ? `, ${failed} failed` : ''}`
        + (remaining > 0 ? ` · ${remaining} still to pull — call again` : ' · up to date'),
    }
  } catch (e: any) {
    return { ok: false, notes, message: `sales pull failed: ${String(e?.message ?? e).slice(0, 160)}` }
  }
}

// -------------------------------------------------------------------- read
export async function getLeads(since?: string) {
  if (!supabaseConfigured) return { leads: [], events: [] as any[], timeline: [] as any[], users: [] as any[] }
  const from = since ?? new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10)
  const { data: leads } = await supabase.from('mw_leads')
    .select('*').gte('created_time', from).order('created_time', { ascending: false })
  const ids = (leads ?? []).map(l => l.id as string)
  if (!ids.length) return { leads: [], events: [], timeline: [], users: [] }

  const [ev, tl, us] = await Promise.all([
    supabase.from('mw_lead_events').select('*').in('lead_id', ids).order('at', { ascending: true }),
    supabase.from('mw_lead_timeline').select('*').in('lead_id', ids).order('at', { ascending: true }),
    supabase.from('mw_settings').select('value').eq('key', 'zoho_users').maybeSingle(),
  ])
  return {
    leads: leads ?? [],
    events: ev.data ?? [],
    timeline: tl.data ?? [],
    users: (us.data?.value as any[]) ?? [],
  }
}
