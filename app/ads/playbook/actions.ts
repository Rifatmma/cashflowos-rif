'use server'

// The write path for the ad task board. Mirrors the approvals pattern: the tiny
// client leaf (TaskControls.tsx) calls these 'use server' wrappers rather than
// importing the server-only Supabase client itself.
//
// SAFETY: every write is scoped with .eq('category', 'ad_task'). These actions
// physically cannot touch a cash_in, lead or task row even if an id is guessed,
// because the category filter is applied server-side on every statement.

import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { TASKS, type TaskStatus } from '@/lib/ad-tasks'

type Result = { ok: boolean; message: string }

const ALLOWED: TaskStatus[] = ['todo', 'doing', 'blocked', 'done', 'declined']
const MAX_TEXT = 2000

function refresh() {
  revalidatePath('/ads/playbook')
  revalidatePath('/ads')
}

// Read the row's current meta so we merge rather than clobber it. Returns null
// if the row isn't an ad_task — which is also how the category guard reports
// "not yours to touch".
async function readMeta(id: number): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from('records')
    .select('meta')
    .eq('id', id)
    .eq('category', 'ad_task')
    .maybeSingle()
  if (error || !data) return null
  return (data.meta ?? {}) as Record<string, any>
}

export async function setStatus(id: number, status: TaskStatus): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not wired up yet.' }
  if (!ALLOWED.includes(status)) return { ok: false, message: 'Unknown status.' }
  // Declining needs a reason, so it goes through declineTask() instead. Blocking
  // this here means the UI can't accidentally strand a task with no explanation.
  if (status === 'declined') return { ok: false, message: 'Declining needs a reason — use the Decline button.' }

  const meta = await readMeta(id)
  if (!meta) return { ok: false, message: 'That task no longer exists.' }

  // Moving off 'declined' clears the old reason so stale rationale can't linger.
  const next = { ...meta }
  delete next.declined_reason
  delete next.declined_at

  const { error } = await supabase
    .from('records')
    .update({ status, meta: next })
    .eq('id', id)
    .eq('category', 'ad_task')
  if (error) return { ok: false, message: 'Could not save — try again.' }

  refresh()
  return { ok: true, message: `Marked ${status}.` }
}

export async function declineTask(id: number, reason: string): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not wired up yet.' }
  const why = (reason || '').trim().slice(0, MAX_TEXT)
  // The whole point of declining is capturing WHY, so an empty reason is refused.
  if (why.length < 3) return { ok: false, message: 'Tell me why first — that is the part worth keeping.' }

  const meta = await readMeta(id)
  if (!meta) return { ok: false, message: 'That task no longer exists.' }

  const { error } = await supabase
    .from('records')
    .update({
      status: 'declined',
      meta: { ...meta, declined_reason: why, declined_at: new Date().toISOString() },
    })
    .eq('id', id)
    .eq('category', 'ad_task')
  if (error) return { ok: false, message: 'Could not save — try again.' }

  refresh()
  return { ok: true, message: 'Declined, and the reason is saved.' }
}

// Create the task rows. IDEMPOTENT BY DESIGN: it reads the keys already present
// and inserts only what's missing, so clicking twice cannot duplicate the board,
// and a later release that adds a task can be picked up by clicking again.
// Nothing existing is ever updated here — your statuses and notes are safe.
export async function seedTasks(): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not wired up yet.' }

  const { data, error: readErr } = await supabase
    .from('records')
    .select('meta')
    .eq('category', 'ad_task')
  if (readErr) return { ok: false, message: 'Could not read the existing tasks — try again.' }

  const have = new Set(
    (data ?? []).map((r: any) => r?.meta?.key).filter((k: unknown): k is string => typeof k === 'string'),
  )
  const missing = TASKS.filter(t => !have.has(t.key))
  if (!missing.length) {
    refresh()
    return { ok: true, message: 'Already up to date — nothing to add.' }
  }

  const { error } = await supabase.from('records').insert(
    missing.map(t => ({
      title: t.title,
      status: 'todo',
      category: 'ad_task',
      due_date: t.due,
      meta: {
        key: t.key, priority: t.priority, phase: t.phase, kind: t.kind,
        impact: t.impact, effort: t.effort, owner: 'Rif',
      },
    })),
  )
  if (error) return { ok: false, message: 'Could not create the tasks — try again.' }

  refresh()
  return {
    ok: true,
    message: `Tracking is on — ${missing.length} task${missing.length === 1 ? '' : 's'} added.`,
  }
}

export async function saveNote(id: number, note: string): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not wired up yet.' }
  const text = (note || '').slice(0, MAX_TEXT)

  const { error } = await supabase
    .from('records')
    .update({ notes: text })
    .eq('id', id)
    .eq('category', 'ad_task')
  if (error) return { ok: false, message: 'Could not save — try again.' }

  refresh()
  return { ok: true, message: 'Saved.' }
}
