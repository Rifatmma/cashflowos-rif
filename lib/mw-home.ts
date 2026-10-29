import 'server-only'

// 👉 The CRM numbers on Home: qualified leads first (owner, 28 Oct 2026 — the
// number Mehul and Safwaan judge marketing by), then how many carry a source
// and how many were answered inside a day. Counted per calendar month, so Home
// can show month over month or any month against any other. Suspected bulk
// imports are left out, as everywhere else in /mw.

import { supabase, supabaseConfigured } from './supabase'
import { tally, sourceMedium, type Tally } from './mw-cliq'
import { INTENTS, type Intent } from './mw-lead-intent'

export type CrmMonth = { leads: number; qualified: number; sourced: number; answered24: number; days: number }

const empty = (): CrmMonth => ({ leads: 0, qualified: 0, sourced: 0, answered24: 0, days: 0 })

/** First day of a "YYYY-MM" month, and of the month after, in UTC. */
export const monthBounds = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return { from: Date.UTC(y, m - 1, 1), to: Date.UTC(y, m, 1) }
}

/** The month before a "YYYY-MM" key. */
export const monthBefore = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export async function crmMonths(keys: string[], now = Date.now()): Promise<Map<string, CrmMonth>> {
  const out = new Map(keys.map(k => [k, empty()]))
  if (!supabaseConfigured || !keys.length) return out
  const bounds = keys.map(k => ({ k, ...monthBounds(k) }))
  const from = new Date(Math.min(...bounds.map(b => b.from))).toISOString()
  const to = new Date(Math.max(...bounds.map(b => b.to))).toISOString()
  const { data } = await supabase.from('mw_leads')
    .select('created_time, lead_status, utm_medium, first_response_at, suspect_import')
    .gte('created_time', from).lt('created_time', to)
  for (const b of bounds) out.get(b.k)!.days = Math.max(1, Math.round((Math.min(b.to, now) - b.from) / 864e5))
  for (const r of (data ?? []) as any[]) {
    if (r.suspect_import) continue
    const at = Date.parse(r.created_time)
    const b = bounds.find(x => at >= x.from && at < x.to)
    if (!b) continue
    const w = out.get(b.k)!
    w.leads++
    if (String(r.lead_status ?? '').toLowerCase() === 'qualified') w.qualified++
    if (r.utm_medium) w.sourced++
    if (r.first_response_at && Date.parse(r.first_response_at) - at <= 864e5) w.answered24++
  }
  return out
}

export type AiVisibility = { month: string; score: number; mentions: number; citations: number; citedPages: number; byLlm: Record<string, number>; source: string }

/**
 * The monthly AI-answers check (owner, 28 Oct 2026), newest first: Semrush AI
 * Visibility read in the browser on the first Monday of the month and saved as
 * mw_settings `ai_visibility_<YYYY-MM>`. Semrush goes through the browser only,
 * so this is a local step, not part of the cloud run.
 */
export async function aiVisibility(): Promise<AiVisibility[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_settings').select('key, value').like('key', 'ai_visibility_%').order('key', { ascending: false }).limit(2)
  return ((data ?? []) as any[]).map(r => r.value as AiVisibility)
}

type Count = { all: number; buyers: number; intent: Record<Intent, number> }
export type Enquiries = {
  stored: boolean; a: Count; b: Count; byPage: Tally[]; bySource: Tally[]
  /** High-intent leads only (Rif, 29 Oct 2026): which pages and channels bring serious buyers. */
  highByPage: Tally[]; highBySource: Tally[]
}

/**
 * Enquiries by the page they were sent from and by source / medium, months A
 * and B (Rif, 29 Oct 2026). Read from the #Website Leads posts in Zoho Cliq
 * (mw_cliq_leads), because GA4 credits every enquiry to the Zoho form.
 */
export async function enquiriesByPage(mA: string, mB: string): Promise<Enquiries> {
  const zero = (): Count => ({ all: 0, buyers: 0, intent: Object.fromEntries(INTENTS.map(i => [i, 0])) as Record<Intent, number> })
  const none: Enquiries = { stored: false, a: zero(), b: zero(), byPage: [], bySource: [], highByPage: [], highBySource: [] }
  if (!supabaseConfigured) return none
  const A = monthBounds(mA), B = monthBounds(mB)
  const from = new Date(Math.min(A.from, B.from)).toISOString(), to = new Date(Math.max(A.to, B.to)).toISOString()
  const { data, error } = await supabase.from('mw_cliq_leads').select('at, page, source, medium, is_buyer, intent').gte('at', from).lt('at', to).limit(5000)
  if (error) return none
  const rows = ((data ?? []) as any[]).map(r => ({ at: String(r.at), page: r.page as string | null, source: r.source as string | null, medium: r.medium as string | null, isBuyer: !!r.is_buyer, intent: (r.intent ?? null) as Intent | null }))
  const inA = (at: string) => { const t = Date.parse(at); return t >= A.from && t < A.to }
  const inB = (at: string) => { const t = Date.parse(at); return t >= B.from && t < B.to }
  const count = (f: (at: string) => boolean): Count => {
    const c = zero()
    for (const x of rows.filter(r => f(r.at))) { c.all++; if (x.isBuyer) c.buyers++; if (x.intent) c.intent[x.intent]++ }
    return c
  }
  const high = rows.filter(r => r.intent === 'high')
  return {
    stored: true, a: count(inA), b: count(inB),
    byPage: tally(rows, r => r.page ?? '', inA, inB),
    bySource: tally(rows, sourceMedium, inA, inB),
    highByPage: tally(high, r => r.page ?? '', inA, inB),
    highBySource: tally(high, sourceMedium, inA, inB),
  }
}
