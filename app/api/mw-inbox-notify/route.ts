import { supabase, supabaseConfigured } from '@/lib/supabase'
import { sendWithButtons } from '@/lib/telegram'
import { appUrl } from '@/lib/app-url'
import { STEP } from '@/lib/mw-seo-plan'
import { resultMessage, resultButtons, cleanNext } from '@/lib/mw-seo-telegram'
import { cookies } from 'next/headers'

// 🔒 Sends Claude's finished SEO inbox jobs to Telegram, with suggested next prompts.
//
// Claude Code calls this after writing a result back (the mw-seo-inbox skill),
// and cron-daily calls it as a backstop sweep. A job is sent once: notified_at
// is stamped on success, so a retry can never double-post.
//
// Where it goes: the chat that sent it, or — for a job sent from the web card —
// the owner's private chat, because anything Rif does routinely must reach his
// phone (phone-first). Set MW_INBOX_NOTIFY_WEB=0 to keep web jobs off Telegram.
//
// AUTH FAILS CLOSED: Bearer CRON_SECRET, or the owner's cfo_session cookie.
// This path is excluded from the proxy matcher (proxy.ts), or the Bearer call
// would be bounced to /login and "succeed" without sending anything.

export const dynamic = 'force-dynamic'

async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim()
  const byCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  const byOwner = !!(await cookies()).get('cfo_session')?.value
  if (!byCron && !byOwner) return new Response('forbidden', { status: 401 })
  if (!supabaseConfigured) return Response.json({ ok: false, why: 'not configured' })

  const owner = (process.env.OWNER_CHAT_ID || '').trim()
  const webToo = process.env.MW_INBOX_NOTIFY_WEB !== '0'

  const { data, error } = await supabase.from('mw_claude_inbox')
    .select('id, step_id, status, result, result_links, error, source, telegram_chat_id')
    .in('status', ['done', 'failed']).is('notified_at', null)
    .order('finished_at', { ascending: true }).limit(10)
  if (error) return Response.json({ ok: false, why: error.message }, { status: 500 })

  const sent: number[] = []
  const skipped: number[] = []
  for (const r of (data ?? []) as any[]) {
    const chat = r.telegram_chat_id ?? (webToo && owner ? owner : null)
    if (!chat) { skipped.push(r.id); continue }
    const step = r.step_id ? STEP[r.step_id] ?? null : null
    const input = {
      id: r.id, status: r.status, step, result: r.result, error: r.error,
      next: cleanNext(r.result_links?.next),
      appUrl: appUrl() && step ? `${appUrl()}/mw/seo?step=${step.id}#planner` : null,
    }
    const msgId = await sendWithButtons(chat, resultMessage(input), resultButtons(input))
    if (msgId === null) continue        // send failed: leave it for the next sweep
    await supabase.from('mw_claude_inbox').update({ notified_at: new Date().toISOString() }).eq('id', r.id).is('notified_at', null)
    sent.push(r.id)
  }
  return Response.json({ ok: true, sent, skipped })
}

export const POST = run
export const GET = run
