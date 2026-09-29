'use server'

// "It's correct": the owner has looked at a receipt on To check and it is
// right as filed -- one tap, nothing to retype (owner, 27 Sep 2026). The lines,
// total and stock are left exactly as they are; the receipt leaves To check
// (fixed_note, which To check already honours) and is kept on the Corrected
// receipts page as checked.
//
// Refused while a line has no category: that money would be left out of food
// cost for good, and a tap that looks like it worked but leaves the receipt on
// the list is the confusion this page keeps having to fix.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { EXPENSE_TYPES } from '@/lib/vision'

export async function markCorrect(form: FormData): Promise<void> {
  const id = Number(form.get('id'))
  if (!supabaseConfigured || !Number.isFinite(id)) redirect('/cash-out')

  const { data: rec } = await supabase.from('records').select('*').eq('id', id).eq('category', 'cash_out').single()
  if (!rec) redirect(`/cash-out?saved=${id}&msg=${encodeURIComponent('That receipt no longer exists.')}`)

  const meta: any = { ...(rec.meta ?? {}) }
  const items: any[] = Array.isArray(meta.items) ? meta.items : []
  // A receipt with no lines can take its category in the same tap.
  const picked = String(form.get('type') || '')
  if (!items.length && (EXPENSE_TYPES as readonly string[]).includes(picked)) {
    meta.expense_type = picked
    delete meta.type_split
  }
  const split = meta.type_split as Record<string, number> | undefined
  const uncategorised = split ? Number(split.unclassified) > 0 : !meta.expense_type
  if (uncategorised) {
    const n = items.findIndex(i => !i?.expense_type)
    const which = n >= 0 ? `line ${n + 1} (${String(items[n].name).slice(0, 40)})` : 'this receipt'
    redirect(`/cash-out/${id}?need=${encodeURIComponent(`Choose a category for ${which} first, then Save.`)}`)
  }

  meta.fixed_note = 'Checked by the owner: correct as filed.'
  meta.checked_ok = true
  meta.corrected_by = 'owner'
  meta.corrected_at = new Date().toISOString().slice(0, 10)
  meta.corrected_via = 'checked'
  delete meta.fix_later; delete meta.fix_later_note

  const { error } = await supabase.from('records').update({ meta }).eq('id', id).eq('category', 'cash_out')
  revalidatePath('/cash-out'); revalidatePath('/cash-out/corrected')
  redirect(`/cash-out?saved=${id}&msg=${encodeURIComponent(error ? `Could not save: ${error.message}` : 'Marked as correct -- off the To check list.')}`)
}
