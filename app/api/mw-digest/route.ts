import { cookies } from 'next/headers'
import { sendDigests } from '@/lib/mw-digest-send'

// 🔒 The Monday emails (lib/mw-digest-send.ts). cron-daily calls this on
// Mondays; the owner can also run it from Settings.
//
// AUTH FAILS CLOSED: Bearer CRON_SECRET or the owner's cfo_session cookie.
// Excluded from the proxy matcher, or the Bearer call would bounce to /login
// and "succeed" without sending anything.
//
// ?preview=1 forces preview (everything to Rif only); ?force=1 sends even if
// this week has already gone out.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const byCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  const byOwner = !!(await cookies()).get('cfo_session')?.value
  if (!byCron && !byOwner) return new Response('forbidden', { status: 401 })
  const q = new URL(req.url).searchParams
  try {
    const r = await sendDigests({ previewOnly: q.get('preview') === '1', force: q.get('force') === '1' })
    return Response.json({ ok: true, ...r })
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message ?? e).slice(0, 300) }, { status: 500 })
  }
}

export const POST = run
export const GET = run
