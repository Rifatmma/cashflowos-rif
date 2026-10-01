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
import { rollUpLead, type Lead, type LeadEvent } from './mw-sales'

/** Only webform leads. Prospecting-tool imports are not the team's inbound work. */
export const WEBFORM = 'Website / Webform'

const s = (v: unknown) => (v === null || v === undefined ? null : String(v))

type ZohoLead = Record<string, any>

/** Webform leads created since `since` (YYYY-MM-DD). */
export async function fetchLeads(since: string, notes: string[]): Promise<ZohoLead[]> {
  const out: ZohoLead[] = []
  for (let page = 1; page <= 10; page++) {
    const res = await runTool('ZOHO_SEARCH_LEADS', undefined, {
      criteria: `((Lead_Source:equals:${WEBFORM})and(Created_Time:greater_equal:${since}T00:00:00+08:00))`,
      fields: 'id,Full_Name,Company,Email,Phone,Lead_Source,Lead_Status,Owner,Country,City,Created_Time',
      per_page: 200,
      page,
    })
    const rows: ZohoLead[] = res?.data ?? []
    out.push(...rows)
    if (rows.length < 200) break
  }
  notes.push(`Zoho: ${out.length} webform leads since ${since}`)
  return out
}

/** Emails on one lead. Bodies are not available for IMAP-synced mail. */
async function fetchEmails(leadId: string): Promise<LeadEvent[]> {
  const res = await runTool('ZOHO_GET_RECORD_EMAILS', undefined, {
    module_api_name: 'Leads', record_id: leadId,
  })
  const rows: any[] = res?.Emails ?? []
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

export type SalesRun = { ok: boolean; message: string; notes: string[] }

/**
 * Pull, roll up and store. Never throws: one lead failing must not lose the
 * other ninety-one.
 */
export async function refreshSales(opts: { since?: string; limit?: number } = {}): Promise<SalesRun> {
  const notes: string[] = []
  const since = opts.since ?? new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10)
  try {
    if (!supabaseConfigured) return { ok: false, message: 'supabase not configured', notes }

    const leads = await fetchLeads(since, notes)
    const take = opts.limit ? leads.slice(0, opts.limit) : leads

    let stored = 0, failed = 0, withEmail = 0, withNote = 0
    for (const z of take) {
      try {
        const lead: Lead = {
          id: String(z.id),
          createdTime: String(z.Created_Time),
          fullName: s(z.Full_Name), company: s(z.Company), email: s(z.Email),
          leadStatus: s(z.Lead_Status), ownerName: s(z.Owner?.name), country: s(z.Country),
        }
        const [emails, noteRows] = await Promise.all([
          fetchEmails(lead.id).catch(() => [] as LeadEvent[]),
          fetchNotes(lead.id).catch(() => [] as LeadEvent[]),
        ])
        const events = [...emails, ...noteRows]
        const r = rollUpLead(lead, events)
        if (emails.length) withEmail++
        if (noteRows.length) withNote++

        // Zia's read of the most recent inbound email, kept as her opinion.
        const lastIn = [...emails].filter(e => e.direction === 'in').sort((a, b) => +new Date(b.at) - +new Date(a.at))[0]

        const { error } = await supabase.from('mw_leads').upsert({
          id: lead.id,
          created_time: lead.createdTime,
          full_name: lead.fullName, company: lead.company, email: lead.email, phone: s(z.Phone),
          lead_source: s(z.Lead_Source), lead_status: lead.leadStatus,
          owner_name: lead.ownerName, owner_email: s(z.Owner?.email),
          country: lead.country, city: s(z.City),
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

    notes.push(`${withEmail} leads have an email trail, ${withNote} have a written note`)
    return {
      ok: stored > 0,
      notes,
      message: `sales: ${stored} leads stored${failed ? `, ${failed} failed` : ''} since ${since}`,
    }
  } catch (e: any) {
    return { ok: false, notes, message: `sales pull failed: ${String(e?.message ?? e).slice(0, 160)}` }
  }
}

// -------------------------------------------------------------------- read
export async function getLeads(since?: string) {
  if (!supabaseConfigured) return { leads: [], events: [] as any[] }
  const from = since ?? new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10)
  const { data: leads } = await supabase.from('mw_leads')
    .select('*').gte('created_time', from).order('created_time', { ascending: false })
  const ids = (leads ?? []).map(l => l.id as string)
  if (!ids.length) return { leads: [], events: [] }
  const { data: events } = await supabase.from('mw_lead_events')
    .select('*').in('lead_id', ids).order('at', { ascending: true })
  return { leads: leads ?? [], events: events ?? [] }
}
