'use server'

import { supabase } from '@/lib/supabase'
import { currentGuest } from '@/lib/guest'
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
  revalidatePath('/mw'); revalidatePath('/mw/paid'); revalidatePath('/mw/seo')
}

export async function clearDecision(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await supabase.from('mw_decisions').delete().eq('action_id', id)
  revalidatePath('/mw'); revalidatePath('/mw/paid'); revalidatePath('/mw/seo')
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
  revalidatePath('/mw'); revalidatePath('/mw/paid'); revalidatePath('/mw/seo')
}
