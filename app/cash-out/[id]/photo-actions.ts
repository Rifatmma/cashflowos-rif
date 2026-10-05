'use server'

// 📎 Attaching proof to a receipt, from the web.
//
// WHY THIS DID NOT EXIST. Photos could only ever arrive through Telegram. The
// correction page read one and, when there was none, said so and stopped:
// "No photo kept for this one — it was typed in, or filed before photos were
// saved." A dead end on 60 of 213 receipts.
//
// NO MIGRATION NEEDED. `vault_files` has no uniqueness on record_id and every
// reader takes `.order('created_at', desc).limit(1)`. So "replace the photo" is
// an insert: the new row wins, and the old one stays as audit trail — which
// matters, because the question a month later is "what did the bill actually
// say", and an overwritten photo cannot answer it (owner, 5 Oct 2026).

import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'

export type PhotoResult = { ok: boolean; message: string } | null

const MAX_BYTES = 8_000_000
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
}

export async function addReceiptPhoto(_prev: PhotoResult, form: FormData): Promise<PhotoResult> {
  if (!supabaseConfigured) return { ok: false, message: 'No database configured.' }

  const id = Number(form.get('id'))
  if (!Number.isFinite(id) || id <= 0) return { ok: false, message: 'Which receipt?' }

  const file = form.get('photo')
  if (!(file instanceof File) || !file.size) return { ok: false, message: 'Pick a photo first.' }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: 'That file is over 8 MB. Most phones can send a smaller one.' }
  }

  const mime = file.type || 'image/jpeg'
  const ext = ALLOWED[mime]
  if (!ext) return { ok: false, message: 'Photos or a PDF only — that file is a different kind.' }

  // The record must exist and be a receipt, or a stray id could attach a file
  // to anything in the table.
  const { data: rec } = await supabase
    .from('records').select('id').eq('id', id).eq('category', 'cash_out').maybeSingle()
  if (!rec) return { ok: false, message: `Record #${id} is not a receipt.` }

  const bytes = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const path = `receipts/${sha256}.${ext}`

  // Content-addressed, so the same bill photographed twice costs nothing and is
  // stored once. An "already exists" is the happy path, not an error.
  const { error: upErr } = await supabase.storage
    .from('vault').upload(path, bytes, { contentType: mime, upsert: false })
  if (upErr && !/exist/i.test(upErr.message)) {
    return { ok: false, message: `The photo would not upload: ${upErr.message}` }
  }

  // vault_files has a UNIQUE sha256, so re-sending the same image must not
  // throw — it just moves to this record.
  const { error: rowErr } = await supabase.from('vault_files').upsert({
    sha256, storage_path: path, mime, size_bytes: bytes.length, record_id: id,
  }, { onConflict: 'sha256' })
  if (rowErr) return { ok: false, message: rowErr.message }

  // The proof question is now answered, and the chase stops. Written on the
  // record because that is what survives — see lib/bot-memory.ts for why
  // nothing durable may live in the bot's counters bag.
  const { data: row } = await supabase.from('records').select('meta').eq('id', id).maybeSingle()
  const meta = { ...(row?.meta ?? {}), sha256, storage_path: path, mime }
  meta.proof = 'photo'
  meta.proof_ok = true
  meta.proof_added_at = new Date().toISOString().slice(0, 10)
  delete meta.proof_since
  await supabase.from('records').update({ meta }).eq('id', id)

  revalidatePath(`/cash-out/${id}`)
  revalidatePath('/cash-out')
  revalidatePath('/cash-out/day')
  revalidatePath('/vault')

  return { ok: true, message: 'Saved. This bill has its proof now.' }
}

/**
 * Turn the photo without touching the file.
 *
 * A quarter turn is written on the vault_files row and applied as a CSS
 * transform when it is shown. Re-encoding the image to bake it in would lose
 * quality on every turn and throw away the original the owner may later need.
 */
export async function rotateReceiptPhoto(_prev: PhotoResult, form: FormData): Promise<PhotoResult> {
  if (!supabaseConfigured) return { ok: false, message: 'No database configured.' }
  const id = Number(form.get('id'))
  const by = Number(form.get('by')) || 90
  if (!Number.isFinite(id) || id <= 0) return { ok: false, message: 'Which receipt?' }

  const { data } = await supabase.from('vault_files')
    .select('sha256, meta').eq('record_id', id)
    .order('created_at', { ascending: false }).limit(1)
  const f = data?.[0]
  if (!f) return { ok: false, message: 'There is no photo on this one yet.' }

  const now = Number((f.meta as any)?.rotate ?? 0) || 0
  const next = (((now + by) % 360) + 360) % 360
  await supabase.from('vault_files')
    .update({ meta: { ...((f.meta as any) ?? {}), rotate: next } })
    .eq('sha256', f.sha256)

  revalidatePath(`/cash-out/${id}`)
  return { ok: true, message: next === 0 ? 'Back to how it was.' : `Turned ${next}°.` }
}
