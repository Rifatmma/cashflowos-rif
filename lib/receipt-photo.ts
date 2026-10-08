import 'server-only'
// 👉 The receipt photo: finding it, signing it, and asking about many at once.
//
// The same nine lines were copy-pasted in four places — app/cash-out/[id]/page.tsx,
// app/vault/[record]/page.tsx, app/vault/page.tsx and app/me/page.tsx. One of
// them had a different TTL. This is that block, once.
//
// TWO THINGS WORTH KNOWING:
//
//   A record may have SEVERAL photos. `vault_files` has no uniqueness on
//   record_id and every reader takes the newest. That is what makes "replace the
//   photo" an insert rather than a migration — and it keeps the old one as audit
//   trail, which matters when the question is "what did the bill actually say".
//
//   No file is ever public. The bucket is private; a URL is signed, short-lived,
//   and minted server-side. Never hand a storage_path to a browser.

import { supabase, supabaseConfigured } from './supabase'

/** An hour. Long enough to correct a receipt, short enough that a leaked URL dies. */
export const SIGNED_URL_TTL = 60 * 60

export type ReceiptPhoto = {
  recordId: number
  storagePath: string
  mime: string
  /** 0 | 90 | 180 | 270 — the owner's rotation, applied as CSS, never re-encoded. */
  rotate: number
  /**
   * An email saved as proof, as plain readable text.
   *
   * Kept on the row so the receipt page can simply PRINT it. The first attempt
   * linked out to the stored page, which has no back button once the app is on
   * his home screen — "I couldn't go back to editing the receipt and save it"
   * (owner, 8 Oct 2026) — and the second framed it, which React's mount cycle
   * kept aborting. Text needs neither.
   */
  text: string | null
  createdAt: string
}

const rowToPhoto = (f: any): ReceiptPhoto => ({
  recordId: Number(f.record_id),
  storagePath: String(f.storage_path),
  mime: String(f.mime ?? ''),
  rotate: Number(f.meta?.rotate ?? 0) || 0,
  text: f.meta?.text ? String(f.meta.text) : null,
  createdAt: String(f.created_at),
})

/** The newest photo on one record, or null. */
export async function latestPhoto(recordId: number): Promise<ReceiptPhoto | null> {
  if (!supabaseConfigured) return null
  const { data, error } = await supabase
    .from('vault_files')
    .select('record_id, storage_path, mime, meta, created_at')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) { console.warn('[CFO] vault_files:', error.message); return null }
  const f = data?.[0]
  return f?.storage_path ? rowToPhoto(f) : null
}

/**
 * Which of these records have a photo.
 *
 * In bulk because the day ledger draws a margin note per row: asking once per
 * receipt would be 213 queries to render one list.
 */
export async function recordsWithPhotos(ids: number[]): Promise<Set<number>> {
  if (!supabaseConfigured || !ids.length) return new Set()
  const out = new Set<number>()
  // Chunked: a URL has a length limit and `in.()` goes in the query string.
  for (let at = 0; at < ids.length; at += 200) {
    const { data, error } = await supabase
      .from('vault_files').select('record_id').in('record_id', ids.slice(at, at + 200))
    if (error) { console.warn('[CFO] vault_files bulk:', error.message); break }
    for (const f of data ?? []) if (f.record_id !== null) out.add(Number(f.record_id))
  }
  return out
}

/** A short-lived URL a browser may use. Null when the file is gone. */
export async function signPhoto(path: string, ttl = SIGNED_URL_TTL): Promise<string | null> {
  if (!supabaseConfigured) return null
  const { data, error } = await supabase.storage.from('vault').createSignedUrl(path, ttl)
  if (error) { console.warn('[CFO] sign:', error.message); return null }
  return data?.signedUrl ?? null
}

/** The newest photo on a record, already signed. The common case, in one call. */
export async function signedPhotoFor(recordId: number): Promise<
  { url: string; mime: string; rotate: number; text: string | null } | null
> {
  const p = await latestPhoto(recordId)
  if (!p) return null
  const url = await signPhoto(p.storagePath)
  return url ? { url, mime: p.mime, rotate: p.rotate, text: p.text } : null
}
