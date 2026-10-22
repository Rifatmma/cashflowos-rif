import { readAct } from '@/lib/mw-sign'
import { writeStage } from '@/lib/mw-queue-write'

// 👉 The Done / Can't links in the Monday email. They work without signing in
// because each one is signed for one task, one person and one answer
// (lib/mw-sign.ts), and expires after two weeks.
//
// Done is recorded on the click. Can't shows one question — why — because a
// decline without a reason can never be re-raised when the data changes.
//
// Excluded from the proxy matcher (proxy.ts): the person clicking it is
// usually not signed in, which is the whole point.

export const dynamic = 'force-dynamic'

const secret = () => (process.env.APP_PASSCODE ?? '').trim()
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function page(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head><body style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:48px auto;padding:0 18px;color:#111827;line-height:1.55">
<p style="color:#2563EB;font-weight:bold;font-size:12px;letter-spacing:.1em;text-transform:uppercase">Moving Walls marketing</p>${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}

const broken = () => page('Link expired', '<h1>This link has expired</h1><p>Links in the Monday email last two weeks. Open the app, or wait for next Monday\'s email.</p>', 400)

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t')
  const c = readAct(t, secret())
  if (!c) return broken()
  if (c.stage === 'done') {
    await writeStage(c.id, 'done', null, c.by)
    return page('Marked done', '<h1>Marked done ✓</h1><p>Thank you. It is off your list, and your manager can see it is done.</p>')
  }
  return page("Can't do this", `<h1>Why can't this be done?</h1>
<p>One line is enough. The task will only come back if the numbers change.</p>
<form method="post"><input type="hidden" name="t" value="${esc(t ?? '')}">
<textarea name="reason" required maxlength="300" rows="3" style="width:100%;font:inherit;font-size:16px;padding:10px;border:1px solid #D1D5DB;border-radius:8px;box-sizing:border-box"></textarea>
<p><button style="font:inherit;font-weight:bold;padding:9px 16px;border:0;border-radius:8px;background:#2563EB;color:#fff">Save</button></p></form>`)
}

export async function POST(req: Request) {
  const f = await req.formData().catch(() => null)
  const t = String(f?.get('t') ?? '')
  const reason = String(f?.get('reason') ?? '').trim().slice(0, 300)
  const c = readAct(t, secret())
  if (!c || c.stage !== 'declined') return broken()
  if (!reason) return page('Reason needed', '<h1>Please add a reason</h1><p>Go back and write one line about why.</p>', 400)
  await writeStage(c.id, 'declined', reason, c.by)
  return page('Saved', '<h1>Saved</h1><p>Thank you — the reason is kept with the task.</p>')
}
