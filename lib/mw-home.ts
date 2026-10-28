import 'server-only'

// 👉 The CRM numbers on Home: qualified leads first (owner, 28 Oct 2026 — the
// number Mehul and Safwaan judge marketing by), then how many carry a source
// and how many were answered inside a day. Counted per calendar month, so Home
// can show month over month or any month against any other. Suspected bulk
// imports are left out, as everywhere else in /mw.

import { supabase, supabaseConfigured } from './supabase'

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
