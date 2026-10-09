'use server'

// "Fetch proof for all of them", from the Cash Out page.
//
// Nine receipts that only ever existed as an email, each needing the same
// three taps, is a chore the app invented. One button does the lot.
//
// IN SMALL BATCHES, DELIBERATELY. Every receipt is a round trip into Composio's
// sandbox and then Gmail, and a server action on Vercel has sixty seconds. So
// it takes a few, says how many are left, and asks to be tapped again — which
// is slower to read but never dies halfway through with nothing to show.

import { revalidatePath } from 'next/cache'
import { emailReceiptsNeedingProof, attachEmailProof } from '@/lib/email-proof'

export type AllProofResult = {
  ok: boolean
  done: { merchant: string; kind: string }[]
  failed: { merchant: string; note: string }[]
  left: number
  message: string
} | null

/** How many mailbox round trips fit comfortably inside one request. */
const PER_TAP = 3

export async function fetchAllEmailProof(_prev: AllProofResult, _form: FormData): Promise<AllProofResult> {
  const all = await emailReceiptsNeedingProof()
  if (!all.length) {
    return { ok: true, done: [], failed: [], left: 0, message: 'Every email receipt already has its proof.' }
  }

  const batch = all.slice(0, PER_TAP)
  const done: { merchant: string; kind: string }[] = []
  const failed: { merchant: string; note: string }[] = []
  for (const r of batch) {
    try {
      const got = await attachEmailProof(r.recordId, r.messageIds, r.inbox)
      if (got.ok) done.push({ merchant: r.merchant, kind: got.kind })
      else failed.push({ merchant: r.merchant, note: got.note })
    } catch (e: any) {
      failed.push({ merchant: r.merchant, note: String(e?.message ?? e).slice(0, 300) })
    }
  }

  if (done.length) { revalidatePath('/cash-out'); revalidatePath('/') }
  const left = all.length - done.length
  const invoices = done.filter(d => d.kind === 'attachment').length
  const message = done.length
    ? `${done.length} done` +
      (invoices ? ` — ${invoices} with the seller's own invoice` : ' — the emails themselves') +
      (left ? `. ${left} still to go: tap again.` : '. That was the last one.')
    : 'Nothing could be fetched this time.'
  return { ok: done.length > 0, done, failed, left, message }
}
