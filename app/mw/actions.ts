'use server'

import { supabase } from '@/lib/supabase'
import { currentGuest } from '@/lib/guest'
import { setRivals } from '@/lib/mw-gap-run'
import { revalidatePath } from 'next/cache'

// Recording a decision. The ONLY writes /mw makes.
//
// Two rules the daily refresh must never break, enforced here rather than trusted:
//  • decisions are keyed on the action id, which is never renumbered or reused
//  • the refresh updates mw_actions (status, evidence); it never touches
//    mw_decisions, because those are the team's answers, not the robot's

const CHOICES = new Set(['accept', 'reject', 'done'])

/** Who is deciding — a guest's email, or 'owner' for whoever holds the passcode. */
async function actor(): Promise<string> {
  return (await currentGuest()) ?? 'owner'
}

export async function setDecision(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const choice = String(formData.get('choice') ?? '')
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300)
  if (!id || !CHOICES.has(choice)) return

  await supabase.from('mw_decisions').upsert(
    { action_id: id, choice, reason: reason || null, decided_by: await actor(), updated_at: new Date().toISOString() },
    { onConflict: 'action_id' },
  )
  revalidatePath('/mw'); revalidatePath('/mw/paid'); revalidatePath('/mw/seo'); revalidatePath('/mw/plan')
}

/**
 * The lead's own date. Rif deliberately does not set deadlines — "let the team
 * suggest when this can be due instead" (29 Sep 2026) — so this is the only
 * date on a task, and the person doing the work puts it there.
 */
export async function setProposedDue(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const raw = String(formData.get('proposed_due') ?? '').slice(0, 10)
  if (!id) return
  const due = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null

  // A date is not a decision: if the lead dates a task they have not answered
  // yet, take the date as an acceptance rather than losing it.
  const { data: existing } = await supabase.from('mw_decisions').select('choice, reason').eq('action_id', id).maybeSingle()
  await supabase.from('mw_decisions').upsert(
    {
      action_id: id,
      choice: existing?.choice ?? 'accept',
      reason: existing?.reason ?? null,
      proposed_due: due,
      decided_by: await actor(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'action_id' },
  )
  revalidatePath('/mw'); revalidatePath('/mw/plan'); revalidatePath('/mw/seo')
}

export async function clearDecision(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await supabase.from('mw_decisions').delete().eq('action_id', id)
  revalidatePath('/mw'); revalidatePath('/mw/paid'); revalidatePath('/mw/seo'); revalidatePath('/mw/plan')
}

export async function saveTargets(formData: FormData) {
  const n = (k: string) => {
    const v = Number(formData.get(k))
    return Number.isFinite(v) && v > 0 ? v : 0
  }
  await supabase.from('mw_settings').upsert(
    { key: 'targets', value: { cpa: n('cpa'), budget: n('budget'), leads: n('leads') }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  revalidatePath('/mw'); revalidatePath('/mw/paid'); revalidatePath('/mw/seo'); revalidatePath('/mw/plan')
}

/**
 * Name the competitors a market is measured against.
 *
 * Capped at four because Semrush's gap report compares at most five domains
 * including ours, and anything past the fourth rival is silently ignored —
 * better to say so than to let a lead type a fifth and wonder why it does
 * nothing (owner, 29 Sep 2026).
 */
export async function saveRivals(formData: FormData) {
  const country = String(formData.get('country') ?? '').trim()
  if (!country) return
  const list = String(formData.get('rivals') ?? '')
    .split(/[\n,]/)
    .map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
    .filter(Boolean)
    .slice(0, 4)
  await setRivals(country, list)
  revalidatePath('/mw/gaps'); revalidatePath('/mw/seo')
}
