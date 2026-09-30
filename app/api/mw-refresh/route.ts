import { refreshMw } from '@/lib/mw-refresh'
import { refreshPlan, refreshHealth } from '@/lib/mw-plan-run'
import { refreshGaps } from '@/lib/mw-gap-run'
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

  // ?only=plan regenerates the market tasks without re-pulling Ads and GA4 --
  // a fast way to see the effect of a rule change (owner, 29 Sep 2026).
  const only = new URL(req.url).searchParams.get('only')
  if (only === 'plan') {
    const p = await refreshPlan()
    return Response.json({ ok: p.ok, plan: p.message, notes: p.notes })
  }
  if (only === 'health') {
    const h = await refreshHealth()
    return Response.json({ ok: h.ok, health: h.message, broken: h.broken })
  }
  if (only === 'gap') {
    const one = new URL(req.url).searchParams.get('country') ?? undefined
    const g = await refreshGaps({ only: one })
    return Response.json({ ok: g.ok, gap: g.message, notes: g.notes })
  }

  const r = await refreshMw()
  if (!r.ok) console.error('[CFO]', r.message)

  // THE PLAN IS MONTHLY, THE HEALTH WATCH IS DAILY.
  //
  // Semrush refreshes its databases about monthly and SEO work takes four to
  // eight weeks to land, so regenerating the plan every day would churn the
  // team's tasks faster than either the data or the work moves. Reading the
  // live pages costs nothing, so that happens every day and catches a page
  // breaking between plans. `?force=plan` runs the plan out of turn
  // (owner, 29 Sep 2026).
  const force = new URL(req.url).searchParams.get('force') === 'plan'
  const planDay = force || new Date().getUTCDate() === 1

  const plan = planDay ? await refreshPlan() : null
  if (plan && !plan.ok) console.error('[CFO]', plan.message)

  // THE GAP IS QUARTERLY. One gap pull costs about sixteen times a keyword
  // pull -- 2,400 Semrush units for thirty rows of one market against ~150 --
  // and a competitor does not rewrite their content strategy monthly. So it
  // runs on the first day of a quarter, riding the same plan day.
  const d = new Date()
  const gapDay = planDay && (force || d.getUTCMonth() % 3 === 0)
  const gap = gapDay ? await refreshGaps() : null
  if (gap && !gap.ok) console.error('[CFO]', gap.message)

  const health = await refreshHealth()
  if (!health.ok) console.error('[CFO]', health.message)

  return Response.json({
    ok: r.ok,
    mw: r.message,
    plan: plan ? plan.message : `not a plan day (runs on the 1st; ?force=plan to run now)`,
    health: health.message,
    broken: health.broken,
    gap: gap ? gap.message : 'not a gap day (runs on the 1st of a quarter)',
    notes: plan?.notes ?? [],
  })
}
