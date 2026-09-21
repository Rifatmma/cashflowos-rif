'use server'

import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'

// Turning a supplier note on and off from the tab.
//
// Every write here is scoped `.eq('category', 'supplier_rule')` so a stray id can
// never flip the status of a receipt or an invoice. Notes are switched OFF rather
// than deleted: the owner should still be able to see what was being applied to
// their receipts, and when it stopped.
export async function setRuleActive(id: number, active: boolean) {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  if (!Number.isFinite(id)) return { ok: false, message: 'That is not a valid note.' }

  const { data: existing } = await supabase
    .from('records').select('meta').eq('id', id).eq('category', 'supplier_rule').single()
  if (!existing) return { ok: false, message: 'That note no longer exists.' }

  const meta = { ...((existing.meta as any) ?? {}) }
  if (active) delete meta.forgotten_at
  else meta.forgotten_at = new Date().toISOString().slice(0, 10)

  const { error } = await supabase
    .from('records')
    .update({ status: active ? 'active' : 'off', meta })
    .eq('id', id)
    .eq('category', 'supplier_rule')
  if (error) return { ok: false, message: error.message }

  revalidatePath('/cash-out')
  return { ok: true }
}
