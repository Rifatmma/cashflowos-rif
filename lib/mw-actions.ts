import 'server-only'
import { supabase, supabaseConfigured } from './supabase'

export type MwAction = {
  id: string
  channel: 'paid' | 'seo'
  status: 'done' | 'part' | 'not'
  title: string
  sub: string | null
  evidence: string | null
  impact: string
  cross_channel: boolean
  sort: number
}

export type MwDecision = {
  action_id: string
  choice: 'accept' | 'reject' | 'done'
  reason: string | null
  decided_by: string | null
  updated_at: string
}

export type ActionRow = MwAction & { decision: MwDecision | null }

/** All active actions with their decision attached, in display order. */
export async function getActions(channel?: 'paid' | 'seo'): Promise<ActionRow[]> {
  if (!supabaseConfigured) return []
  let q = supabase.from('mw_actions').select('*').eq('active', true).order('sort')
  if (channel) q = q.eq('channel', channel)
  const [{ data: acts }, { data: decs }] = await Promise.all([
    q,
    supabase.from('mw_decisions').select('*'),
  ])
  if (!acts) return []
  const byId = new Map((decs ?? []).map(d => [d.action_id, d as MwDecision]))
  return (acts as MwAction[]).map(a => ({ ...a, decision: byId.get(a.id) ?? null }))
}

export type Tally = {
  total: number
  done: number; part: number; not: number
  accept: number; reject: number; alreadyDone: number; undecided: number
}

export function tally(rows: ActionRow[]): Tally {
  const t: Tally = { total: rows.length, done: 0, part: 0, not: 0, accept: 0, reject: 0, alreadyDone: 0, undecided: 0 }
  for (const r of rows) {
    if (r.status === 'done') t.done++
    else if (r.status === 'part') t.part++
    else t.not++
    if (!r.decision) t.undecided++
    else if (r.decision.choice === 'accept') t.accept++
    else if (r.decision.choice === 'reject') t.reject++
    else t.alreadyDone++
  }
  return t
}

export const STATUS_LABEL = { done: 'Done', part: 'Part-way', not: 'Not started' } as const
export const CHOICE_LABEL = { accept: 'Will do', reject: "Won't do", done: 'Already done' } as const
