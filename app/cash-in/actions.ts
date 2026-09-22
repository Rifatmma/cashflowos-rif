'use server'

import { revalidatePath } from 'next/cache'
import ExcelJS from 'exceljs'
import { supabaseConfigured } from '@/lib/supabase'
import { parseDishReport, ReportError } from '@/lib/easyeat'
import { importDay } from '@/lib/stock-data'
import { mytDate, shortDate } from '@/lib/period'
import { ITEM, fmtQty } from '@/lib/stock-items'

export type ImportResult =
  | { ok: false; message: string; needDate?: boolean }
  | {
      ok: true
      date: string
      total: number
      qty: number
      replaced: boolean
      sets: number
      used: { name: string; qty: string }[]
      unmatched: { name: string; variation: string; qty: number }[]
      guesses: number
    }

const MAX_BYTES = 5 * 1024 * 1024

// The daily EasyEat "Dish Report Over Time" upload. Uploading the same day again
// replaces it -- sales and stock both -- so a corrected export is always safe.
export async function importDishReport(_prev: ImportResult | null, form: FormData): Promise<ImportResult> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase is not configured yet.' }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose the Excel file first.' }
  if (file.size > MAX_BYTES) return { ok: false, message: 'That file is too big to be a daily dish report.' }
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, message: 'That isn’t an Excel (.xlsx) file. Export the Dish Report Over Time from EasyEat as Excel.' }

  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any)
    const ws = wb.worksheets[0]
    if (!ws) return { ok: false, message: 'The file has no sheets.' }
    const rows: unknown[][] = []
    ws.eachRow({ includeEmpty: false }, r => { rows.push((r.values as unknown[]).slice(1)) })

    const rep = parseDishReport(rows)

    // The day these sales belong to comes from the report itself (EasyEat prints
    // it in the title). Only a file WITHOUT a date asks the uploader to pick one.
    const picked = String(form.get('date') || '').trim()
    if (!rep.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(picked)) {
        return { ok: false, needDate: true, message: 'This file doesn’t say which day it’s for. Pick the day below and upload again.' }
      }
      if (picked > mytDate()) return { ok: false, needDate: true, message: 'That date is in the future. Pick the day the sales happened.' }
      rep.date = picked
    }
    if (rep.date > mytDate()) return { ok: false, message: `This report is dated ${shortDate(rep.date)}, which hasn’t happened yet. Check the export.` }
    const { replaced, day } = await importDay(rep, 'Cash In upload', file.name)

    revalidatePath('/cash-in')
    revalidatePath('/stock')
    revalidatePath('/cash-out')
    return {
      ok: true,
      date: rep.date,
      total: rep.total,
      qty: rep.qty,
      replaced,
      sets: day.setsSold,
      used: Object.entries(day.total)
        .filter(([k]) => ITEM[k])
        .sort((a, b) => ITEM[a[0]].sort - ITEM[b[0]].sort)
        .map(([k, q]) => ({ name: ITEM[k].name, qty: fmtQty(q, ITEM[k].unit) })),
      unmatched: day.unmatched.map(u => ({ name: u.name, variation: u.variation, qty: u.qty })),
      guesses: day.results.filter(r => r.recipe?.guess).reduce((t, r) => t + r.line.qty, 0),
    }
  } catch (e: any) {
    if (e instanceof ReportError) return { ok: false, message: e.message }
    console.error('[CFO] dish report import failed:', e)
    return { ok: false, message: 'Could not read that file. Is it the EasyEat Dish Report Over Time, exported as Excel?' }
  }
}
