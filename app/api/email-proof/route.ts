import { NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { attachEmailProof } from '@/lib/email-proof'

// Put proof on email-filed receipts that went in before there was any.
//
// Eleven payments were filed from the mailbox with nothing attached, so they
// sit under "No proof" and no amount of looking in a drawer will fix them.
// This walks them and attaches the seller's invoice, or the email itself.
//
// IT REPORTS WHAT IT FOUND, PER MESSAGE. I could not probe the real shape of
// Gmail's responses from a dev machine — the Composio key lives only in Vercel
// — so lib/email-proof.ts reads several plausible field names and says in
// `note` which one worked. Run this once and the JSON shows exactly what came
// back, so the parsing can be corrected against real data instead of guesses.
//
//   /api/email-proof?secret=<CRON_SECRET>            one receipt, a dry look
//   /api/email-proof?secret=...&limit=5              attach to the oldest 5
//   /api/email-proof?secret=...&record=443           just that one

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const secret = process.env.CRON_SECRET
  if (!secret || p.get('secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'bad secret' }, { status: 401 })
  }
  if (!supabaseConfigured) return NextResponse.json({ ok: false, error: 'no database' }, { status: 500 })

  const one = Number(p.get('record')) || 0
  // Deliberately small by default: each message is a sandbox round trip, and
  // this route has 60 seconds.
  const limit = Math.min(10, Math.max(1, Number(p.get('limit')) || 3))

  let rows: any[] = []
  if (one) {
    const { data } = await supabase.from('email_payments')
      .select('id, merchant, record_id, message_ids, inbox').eq('record_id', one)
    rows = data ?? []
  } else {
    const { data } = await supabase.from('email_payments')
      .select('id, merchant, record_id, message_ids, inbox')
      .eq('status', 'filed').not('record_id', 'is', null)
      .order('id').limit(40)
    rows = data ?? []
    // Skip the ones that already have a file, so a re-run is cheap and safe.
    const ids = rows.map(r => r.record_id)
    const { data: have } = await supabase.from('vault_files').select('record_id').in('record_id', ids)
    const got = new Set((have ?? []).map((h: any) => h.record_id))
    rows = rows.filter(r => !got.has(r.record_id)).slice(0, limit)
  }

  const out: any[] = []
  for (const r of rows) {
    const res = await attachEmailProof(Number(r.record_id), (r.message_ids ?? []) as string[], (r as any).inbox ?? null)
    out.push({ record: r.record_id, merchant: r.merchant, ...res })
  }
  return NextResponse.json({
    ok: true,
    looked_at: rows.length,
    attached: out.filter(o => o.ok).length,
    results: out,
  })
}
