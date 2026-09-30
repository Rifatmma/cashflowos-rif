import 'server-only'
import { supabase, supabaseConfigured } from './supabase'

/** What a generated task carries beyond the title: the actual instructions. */
export type MwHow = {
  steps: string[]
  keywords: { q: string; pos: number; vol: number; visits: number; kd?: number; url?: string }[]
  url: string
  doneWhen: string
  kind: string
  country?: string
  /** /locations/<key>, so a link can be built for the right country. */
  countryKey?: string
  score?: number
  /** Top-ten rankings this page already has, which the work must not lose. */
  holds?: { q: string; pos: number; vol: number; visits: number }[]
  /** Ties a copy task to its build task, so the pair stays together. */
  group?: string | null
  /** The task that must land first — shown so nobody starts a blocked build. */
  blockedBy?: { id: string; owner: string | null; title: string } | null
}

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
  // Added 29 Sep 2026 for the market plan: a task now knows which market it
  // belongs to, whose it is, and exactly what doing it involves.
  market: string | null
  owner: string | null
  size: 'S' | 'M' | 'L' | null
  how: MwHow | null
  source: 'seeded' | 'generated'
  cycle: string | null
  /** The SEO action this task rolls up to. */
  theme: string | null
}

export type MwDecision = {
  action_id: string
  choice: 'accept' | 'reject' | 'done'
  reason: string | null
  decided_by: string | null
  updated_at: string
  /** The lead's own date. Nobody is given a deadline (owner, 29 Sep 2026). */
  proposed_due: string | null
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

/** Rolled up per person, so a week's load is visible before it is handed out. */
export function byOwner(rows: ActionRow[], label: (marketKey: string) => string = k => k) {
  const weight = { S: 1, M: 2, L: 3 } as const
  const by = new Map<string, { owner: string; total: number; weight: number; done: number; undecided: number; markets: Set<string> }>()
  for (const r of rows) {
    const key = r.owner ?? 'Unassigned'
    const at = by.get(key) ?? { owner: key, total: 0, weight: 0, done: 0, undecided: 0, markets: new Set<string>() }
    at.total++
    at.weight += weight[(r.size ?? 'S') as 'S' | 'M' | 'L']
    if (r.status === 'done' || r.decision?.choice === 'done') at.done++
    if (!r.decision) at.undecided++
    if (r.market) at.markets.add(label(r.market))
    by.set(key, at)
  }
  return [...by.values()].map(x => ({ ...x, markets: [...x.markets] })).sort((a, b) => b.weight - a.weight)
}

export const STATUS_LABEL = { done: 'Done', part: 'Part-way', not: 'Not started' } as const
export const CHOICE_LABEL = { accept: 'Will do', reject: "Won't do", done: 'Already done' } as const
