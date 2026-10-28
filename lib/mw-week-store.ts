import 'server-only'

// Reads and writes for mw_week_tasks. The rules live in lib/mw-week.ts; this
// only moves rows. Every UI write goes through app/mw/actions.ts.

import { supabase, supabaseConfigured } from './supabase'
import type { WeekTask, WeekState, Finding } from './mw-week'

const COLS = 'id, week, owner, kind, market, title, why, steps, links, done_when, due, value, state, reason, payload, source_id, carried, finding_id, updated_at, updated_by'

export function rowToTask(r: any): WeekTask {
  return {
    id: String(r.id), week: String(r.week), owner: String(r.owner), kind: r.kind, market: r.market ?? null,
    title: String(r.title), why: String(r.why ?? ''),
    steps: Array.isArray(r.steps) ? r.steps.map(String) : [],
    links: Array.isArray(r.links) ? r.links.filter((l: any) => l?.url).map((l: any) => ({ label: String(l.label ?? 'Open'), url: String(l.url) })) : [],
    doneWhen: String(r.done_when ?? ''), due: String(r.due).slice(0, 10), value: Number(r.value) || 0,
    state: r.state, reason: r.reason ?? null, payload: r.payload ?? null, sourceId: r.source_id ?? null,
    carried: Number(r.carried) || 0, findingId: r.finding_id ?? null,
  }
}

export const taskToRow = (t: WeekTask, by: string) => ({
  id: t.id, week: t.week, owner: t.owner, kind: t.kind, market: t.market, title: t.title, why: t.why,
  steps: t.steps, links: t.links, done_when: t.doneWhen, due: t.due, value: t.value, state: t.state,
  reason: t.reason ?? null, payload: t.payload ?? null, source_id: t.sourceId, carried: t.carried,
  // Left out when unknown, so an upsert never unhooks a card from its finding.
  ...(t.findingId !== undefined ? { finding_id: t.findingId } : {}),
  updated_at: new Date().toISOString(), updated_by: by,
})

const FCOLS = 'id, week, rank, title, evidence, source, value, market, kind, links'

const rowToFinding = (r: any): Finding => ({
  id: String(r.id), week: String(r.week), rank: Number(r.rank) || 0, title: String(r.title),
  evidence: String(r.evidence ?? ''), source: String(r.source ?? ''), value: Number(r.value) || 0,
  market: r.market ?? null, kind: r.kind === 'info' ? 'info' : 'action',
  links: Array.isArray(r.links) ? r.links.filter((l: any) => l?.url).map((l: any) => ({ label: String(l.label ?? 'Open'), url: String(l.url) })) : [],
})

/** A week's findings, in the order the Monday run ranked them. */
export async function weekFindings(week: string): Promise<Finding[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_week_findings').select(FCOLS).eq('week', week).order('rank')
  return ((data ?? []) as any[]).map(rowToFinding)
}

export async function saveFindings(fs: Finding[]): Promise<number> {
  if (!supabaseConfigured || !fs.length) return 0
  const now = new Date().toISOString()
  const { error } = await supabase.from('mw_week_findings').upsert(fs.map(f => ({ ...f, updated_at: now })), { onConflict: 'id' })
  if (error) throw new Error(`mw_week_findings: ${error.message}`)
  return fs.length
}

/** Every card for a week, most valuable first. */
export async function weekTasks(week: string): Promise<WeekTask[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_week_tasks').select(COLS).eq('week', week).order('value', { ascending: false })
  return ((data ?? []) as any[]).map(rowToTask)
}

/** Unfinished cards from any week before this one — they carry over. */
export async function openBefore(week: string): Promise<WeekTask[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_week_tasks').select(COLS).lt('week', week).eq('state', 'todo')
  return ((data ?? []) as any[]).map(rowToTask)
}

/** Queue ids someone answered "Can't" to, or the Monday run rejected — kept out of later weeks. */
export async function ruledOutIds(): Promise<Set<string>> {
  if (!supabaseConfigured) return new Set()
  const { data } = await supabase.from('mw_week_tasks').select('source_id').eq('state', 'cant').not('source_id', 'is', null)
  return new Set(((data ?? []) as any[]).map(r => String(r.source_id)))
}

export async function getTask(id: string): Promise<WeekTask | null> {
  if (!supabaseConfigured) return null
  const { data } = await supabase.from('mw_week_tasks').select(COLS).eq('id', id).maybeSingle()
  return data ? rowToTask(data) : null
}

export async function saveTasks(tasks: WeekTask[], by: string): Promise<number> {
  if (!supabaseConfigured || !tasks.length) return 0
  const { error } = await supabase.from('mw_week_tasks').upsert(tasks.map(t => taskToRow(t, by)), { onConflict: 'id' })
  if (error) throw new Error(`mw_week_tasks: ${error.message}`)
  return tasks.length
}

export async function setState(id: string, state: WeekState, by: string, patch: { reason?: string | null; payload?: Record<string, unknown> | null } = {}) {
  if (!supabaseConfigured) return
  const row: Record<string, unknown> = { state, updated_at: new Date().toISOString(), updated_by: by }
  if (patch.reason !== undefined) row.reason = patch.reason
  if (patch.payload !== undefined) row.payload = patch.payload
  const { error } = await supabase.from('mw_week_tasks').update(row).eq('id', id)
  if (error) throw new Error(`mw_week_tasks: ${error.message}`)
}
