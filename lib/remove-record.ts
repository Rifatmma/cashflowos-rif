import 'server-only'
// Taking a receipt back out of the books, and putting it back.
//
// "I can see some receipt was filed that I don't want it to file... I want the
// ability to remove a receipt if filed incorrectly" (owner, 8 Oct 2026).
//
// THE ROW IS REALLY DELETED. `records` is read from twenty-one places; a
// soft-delete flag means every one of them has to remember to filter it, and
// one miss leaves money in a total with nothing on screen to explain it. That
// exact failure has happened here before. Deleting makes every total right
// everywhere, with nothing to remember.
//
// NOTHING IS LOST. The row, its stock movements and its photo rows are copied
// into `removed_records` first, so a restore is exact rather than approximate.
// The photo FILE in storage is never touched — deleting it would make "put it
// back" a lie.

import { supabase, supabaseConfigured } from './supabase'

export type RemovedRow = {
  id: number
  record_id: number
  record: any
  moves: any[]
  files: any[]
  reason: string | null
  removed_by: string | null
  removed_at: string
}

/**
 * Remove one cash-out receipt.
 *
 * Order matters: snapshot first, then unwind, then delete the row. If anything
 * fails before the delete, the receipt is still whole.
 */
export async function removeRecord(
  id: number,
  by: string,
  reason?: string,
): Promise<{ ok: boolean; message: string; amount?: number; merchant?: string }> {
  if (!supabaseConfigured) return { ok: false, message: 'Not connected to the database.' }
  if (!(id > 0)) return { ok: false, message: 'Which receipt?' }

  const { data: rec, error: readErr } = await supabase
    .from('records').select('*').eq('id', id).maybeSingle()
  if (readErr) return { ok: false, message: readErr.message }
  if (!rec) return { ok: false, message: 'That receipt is already gone.' }

  const [{ data: moves }, { data: files }] = await Promise.all([
    supabase.from('stock_moves').select('*').eq('record_id', id),
    supabase.from('vault_files').select('*').eq('record_id', id),
  ])

  const { error: snapErr } = await supabase.from('removed_records').insert({
    record_id: id,
    record: rec,
    moves: moves ?? [],
    files: files ?? [],
    reason: reason?.trim().slice(0, 300) || null,
    removed_by: by,
  })
  // A snapshot that did not save means the delete must not happen: removing a
  // receipt with no way back is not what was asked for.
  if (snapErr) return { ok: false, message: `Could not save a copy first, so nothing was removed: ${snapErr.message}` }

  // The stock it moved goes with it. Left behind, the freezer would still show
  // food that was never bought.
  if (moves?.length) {
    const { error } = await supabase.from('stock_moves').delete().eq('record_id', id)
    if (error) return { ok: false, message: `Could not unwind the stock: ${error.message}` }
  }

  // A payment that came from email goes back to "skipped", so the nightly check
  // neither counts it as filed nor offers it again.
  await supabase.from('email_payments')
    .update({ status: 'skipped', record_id: null }).eq('record_id', id)

  // The photo ROWS go, so the receipt stops claiming proof; the files stay in
  // storage so a restore puts the picture back too.
  if (files?.length) await supabase.from('vault_files').delete().eq('record_id', id)

  const { error: delErr } = await supabase.from('records').delete().eq('id', id)
  if (delErr) return { ok: false, message: `Could not remove it: ${delErr.message}` }

  const amount = Number(rec.amount) || 0
  const merchant = String(rec.meta?.merchant || rec.title || 'that receipt')
  return { ok: true, message: `Removed ${merchant} — RM ${amount.toFixed(2)}.`, amount, merchant }
}

/** Everything taken out and not yet put back, newest first. */
export async function removedRecords(limit = 50): Promise<RemovedRow[]> {
  if (!supabaseConfigured) return []
  const { data, error } = await supabase.from('removed_records').select('*')
    .is('restored_at', null).order('removed_at', { ascending: false }).limit(limit)
  if (error) { console.warn('[CFO] removed_records:', error.message); return [] }
  return (data ?? []) as RemovedRow[]
}

/**
 * Put one back, exactly as it was — same record id, same lines, same photo.
 *
 * Keeping the original id matters: Telegram messages already sent carry
 * /cash-out/<id> links, and the owner quotes record numbers.
 */
export async function restoreRecord(removedId: number): Promise<{ ok: boolean; message: string }> {
  if (!supabaseConfigured) return { ok: false, message: 'Not connected to the database.' }
  const { data: row } = await supabase.from('removed_records').select('*')
    .eq('id', removedId).is('restored_at', null).maybeSingle()
  if (!row) return { ok: false, message: 'That one has already been put back.' }

  const rec = (row as any).record
  const { error } = await supabase.from('records').upsert(rec, { onConflict: 'id' })
  if (error) return { ok: false, message: `Could not put it back: ${error.message}` }

  const moves = Array.isArray((row as any).moves) ? (row as any).moves : []
  if (moves.length) {
    const { error: e } = await supabase.from('stock_moves').upsert(moves, { onConflict: 'id' })
    if (e) console.warn('[CFO] restore stock_moves:', e.message)
  }
  const files = Array.isArray((row as any).files) ? (row as any).files : []
  if (files.length) {
    const { error: e } = await supabase.from('vault_files').upsert(files, { onConflict: 'id' })
    if (e) console.warn('[CFO] restore vault_files:', e.message)
  }

  await supabase.from('removed_records')
    .update({ restored_at: new Date().toISOString() }).eq('id', removedId)
  const amount = Number(rec?.amount) || 0
  return {
    ok: true,
    message: `Put back: ${String(rec?.meta?.merchant || rec?.title || 'the receipt')} — RM ${amount.toFixed(2)}, record #${rec?.id}.`,
  }
}
