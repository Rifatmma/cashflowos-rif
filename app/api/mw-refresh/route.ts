import { refreshMw } from '@/lib/mw-refresh'
import { refreshPlan, refreshHealth } from '@/lib/mw-plan-run'
import { refreshGaps } from '@/lib/mw-gap-run'
import { refreshSales } from '@/lib/mw-sales-run'
import { zohoConfigured, fetchUsers, zohoCredentialShape, zohoGet as zohoGetRaw } from '@/lib/zoho'
import { supabase } from '@/lib/supabase'
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
  if (only === 'sales') {
    // ?since=YYYY-MM-DD backfills; without it the daily window is used.
    const q = new URL(req.url).searchParams
    const since = q.get('since') ?? undefined
    // No default limit any more. refreshSales stops itself twelve seconds
    // before the function would be killed and says how far it got, so the
    // right batch size is "as many as fit" rather than a number guessed here
    // that was wrong the moment a lead got more expensive to pull.
    const limit = Number(q.get('limit')) || undefined
    const sv = await refreshSales({ since, limit, force: q.get('force') === '1' })
    return Response.json({ ok: sv.ok, sales: sv.message, notes: sv.notes })
  }
  // ?only=zoho-check proves the direct Zoho line works BEFORE anything is
  // built on it. The Semrush build reached a finished dashboard before anyone
  // noticed the app could not reach the data; this is the cheap check that
  // would have caught it (owner, 1 Oct 2026).
  if (only === 'zoho-check') {
    if (!zohoConfigured) {
      return Response.json({
        ok: false,
        why: 'ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN not all set',
        credentials: zohoCredentialShape(),
      })
    }
    try {
      const q = new URL(req.url).searchParams
      const users = await fetchUsers()

      // PICK A LEAD THAT ACTUALLY CHANGED HANDS. The first version of this
      // check took the newest lead, which was hours old and had no journey
      // yet -- it proved the call worked and nothing about the data. A lead
      // whose first responder is not its current owner is precisely the case
      // the dashboard gets wrong today (owner, 1 Oct 2026).
      let lead: any = null
      if (q.get('lead')) {
        const { data } = await supabase.from('mw_leads')
          .select('id, full_name, owner_name, first_responder').eq('id', q.get('lead')!).maybeSingle()
        lead = data
      } else {
        const { data } = await supabase.from('mw_leads')
          .select('id, full_name, owner_name, first_responder')
          .not('first_responder', 'is', null)
          .order('created_time', { ascending: false }).limit(50)
        lead = (data ?? []).find(l => l.first_responder && l.owner_name
          && !String(l.first_responder).startsWith(String(l.owner_name).split(' ')[0])) ?? data?.[0]
      }
      if (!lead) return Response.json({ ok: true, users: users.length, timeline: 'no lead stored yet to test against' })

      // RAW, not my parse of it. The parse already read ownership as a field
      // change when Zoho files it as an action, and reported zero handoffs on
      // a record that plainly had one. Print what Zoho sends.
      const raw: any = await zohoGetRaw(`Leads/${lead.id}/__timeline`, { per_page: 100 })
      const rows: any[] = raw?.__timeline ?? []
      const actions: Record<string, number> = {}
      for (const r of rows) actions[String(r.action ?? '?')] = (actions[String(r.action ?? '?')] ?? 0) + 1

      return Response.json({
        ok: true,
        users: users.length,
        testedLead: { id: lead.id, name: lead.full_name, owner: lead.owner_name, firstResponder: lead.first_responder },
        entries: rows.length,
        actionCounts: actions,
        // Every entry verbatim, so the handoff target can be located rather
        // than guessed at.
        rawSample: rows.slice(0, 20),
      })
    } catch (e: any) {
      // Say which credential is the wrong shape. Lengths and the client id's
      // prefix only — never a secret.
      return Response.json({
        ok: false,
        why: String(e?.message ?? e).slice(0, 300),
        credentials: zohoCredentialShape(),
      })
    }
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

  // Sales runs DAILY, unlike the plan: a lead nobody answered is useful to
  // know about tomorrow, not on the first of next month.
  const sales = await refreshSales()
  if (!sales.ok) console.error('[CFO]', sales.message)

  const health = await refreshHealth()
  if (!health.ok) console.error('[CFO]', health.message)

  return Response.json({
    ok: r.ok,
    mw: r.message,
    plan: plan ? plan.message : `not a plan day (runs on the 1st; ?force=plan to run now)`,
    health: health.message,
    broken: health.broken,
    gap: gap ? gap.message : 'not a gap day (runs on the 1st of a quarter)',
    sales: sales.message,
    notes: plan?.notes ?? [],
  })
}
