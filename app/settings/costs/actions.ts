'use server'

import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { getFixedHistory, costsOn, ensureFixedFiled, CATEGORY, type FixedCosts } from '@/lib/fixed-costs'
import { mytDate } from '@/lib/period'

export type Result = { ok: boolean; message: string } | null

const num = (v: FormDataEntryValue | null, fallback: number) => {
  const s = String(v ?? '').trim().replace(/,/g, '')
  if (!s) return fallback
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

/**
 * A pay rise, a rent change, the wifi bill finally arriving.
 *
 * A change NEVER rewrites the past: it is a new row, effective from a date the
 * owner chooses (today by default). Months already filed keep the figures they
 * were filed with -- which is the whole reason the history exists.
 */
export async function saveCosts(_prev: Result, form: FormData): Promise<Result> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  const today = mytDate()
  const history = await getFixedHistory()
  const cur = costsOn(history, today)

  const from = String(form.get('from') || today).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { ok: false, message: 'Pick the date the new figures start.' }

  const next: FixedCosts = {
    from,
    wages_per_day: num(form.get('wages_per_day'), cur.wages_per_day),
    unit_rent: num(form.get('unit_rent'), cur.unit_rent),
    staff_house: num(form.get('staff_house'), cur.staff_house),
    pos_per_year: num(form.get('pos_per_year'), cur.pos_per_year),
    licence_per_year: num(form.get('licence_per_year'), cur.licence_per_year),
    wifi_per_month: num(form.get('wifi_per_month'), cur.wifi_per_month),
    note: String(form.get('note') || '').trim().slice(0, 200) || undefined,
  }
  const bad = Object.entries(next).find(([, v]) => typeof v === 'number' && Number.isNaN(v))
  if (bad) return { ok: false, message: `Check the number for ${bad[0].replace(/_/g, ' ')}.` }

  // Same day, same figures: replace that row rather than stacking duplicates.
  const { data: same } = await supabase.from('records').select('id').eq('category', CATEGORY).eq('due_date', from).limit(1)
  const row = {
    title: `Fixed costs from ${from}`, status: 'active', amount: 0,
    category: CATEGORY, due_date: from, notes: next.note ?? null, meta: next,
  }
  const { error } = same?.length
    ? await supabase.from('records').update(row).eq('id', same[0].id)
    : await supabase.from('records').insert(row)
  if (error) return { ok: false, message: error.message }

  const { filed } = await ensureFixedFiled(today)
  revalidatePath('/')
  revalidatePath('/settings/costs')
  revalidatePath('/cash-out')
  return {
    ok: true,
    message: `Saved, from ${from} onwards. Days before that keep the old figures.${filed ? ` ${filed} row${filed === 1 ? '' : 's'} filed.` : ''}`,
  }
}
