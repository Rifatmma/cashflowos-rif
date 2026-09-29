import { refreshMw } from '@/lib/mw-refresh'
import { cookies } from 'next/headers'

// 🔒 Don't edit — this keeps your robot safe.
// The Moving Walls daily pull, on its own endpoint rather than inside cron-daily.
//
// WHY IT IS NOT JUST ANOTHER STEP IN THE MORNING CRON. Vercel gives each function
// call 60 seconds. cron-daily already spends up to 35 of those on the Meta ads
// pull, and this job makes nine calls of its own — bolted on, one slow morning at
// Google would cost you the brief as well. A separate endpoint is a separate
// invocation with a fresh 60s, so the two can never starve each other. cron-daily
// starts it and walks away; both then run side by side at 9am Malaysia.
//
// This is also the manual "refresh now" button: signed in as the owner, open
// /api/mw-refresh in a browser and it runs on the spot.
//
// AUTH FAILS CLOSED, the same rule as cron-daily. Two ways in and no third:
//   • Bearer CRON_SECRET — how cron-daily calls it
//   • a valid cfo_session cookie — the owner, by hand
// A Moving Walls guest (cfo_guest) is deliberately NOT enough: guests read the
// dashboard, they do not spend the account's API quota.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const byCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  const byOwner = !!(await cookies()).get('cfo_session')?.value
  if (!byCron && !byOwner) return new Response('forbidden', { status: 401 })

  const r = await refreshMw()
  if (!r.ok) console.error('[CFO]', r.message)
  return Response.json({ ok: r.ok, mw: r.message })
}
