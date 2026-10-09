'use server'

// "Get the proof from my email", as a button.
//
// The backfill started life as /api/email-proof with a CRON_SECRET, and the
// owner's first attempt at it was a PowerShell error — a URL and a secret
// typed into a terminal is not how he uses this app, and it was never going to
// be. Everything else here is a tap, so this is too.

import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { attachEmailProof } from '@/lib/email-proof'

export type EmailProofResult = { ok: boolean; message: string; note?: string } | null

export async function fetchProofFromEmail(_prev: EmailProofResult, form: FormData): Promise<EmailProofResult> {
  const id = Number(form.get('id'))
  if (!(id > 0)) return { ok: false, message: 'Which receipt?' }
  if (!supabaseConfigured) return { ok: false, message: 'Not connected to the database.' }

  const { data: pay } = await supabase.from('email_payments')
    .select('message_ids, merchant, inbox').eq('record_id', id).maybeSingle()
  const ids = (pay?.message_ids ?? []) as string[]
  if (!ids.length) {
    return { ok: false, message: 'I have no email on file for this one, so there is nothing to go and get.' }
  }

  let res
  try {
    res = await attachEmailProof(id, ids, (pay as any)?.inbox ?? null)
  } catch (e: any) {
    return { ok: false, message: 'Could not reach the mailbox.', note: String(e?.message ?? e).slice(0, 600) }
  }
  if (!res.ok) {
    // The note is the diagnostic: it lists every attachment Gmail reported and
    // which field the body came from. Shown rather than swallowed, because it
    // is what says how to fix the reading.
    return { ok: false, message: 'Nothing in the mailbox could be used as proof.', note: res.note }
  }

  revalidatePath(`/cash-out/${id}`); revalidatePath('/cash-out')
  return {
    ok: true,
    message: res.kind === 'attachment'
      ? 'Got the invoice that was attached to the email.'
      : 'No attachment on it, so I saved the email itself as the proof.',
    note: res.note,
  }
}
