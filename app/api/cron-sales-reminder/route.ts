import { sendMessage } from '@/lib/telegram'
import { getRecords } from '@/lib/records'
import { appendTurn } from '@/lib/bot-memory'
import { mytDate, dayLabel } from '@/lib/period'
import { salesImportInUse, salesFiledFor } from '@/lib/sales'
import { scanEmailPayments, buildQuestion } from '@/lib/email-payments'

// The nightly "send me tonight's sales" nudge.
//
// WHEN: the second of the two Vercel Hobby cron slots, scheduled for the 15:00 UTC
// hour = 11 pm in Kuala Lumpur. Hobby runs a job once a day SOMEWHERE within its
// hour, so this lands between 11:00 and 11:59 pm -- the shop closes at 11 and the
// POS reports are ready by about 11:30, which is why the wording says "when it's
// ready" rather than assuming it already is.
//
// It stays quiet unless it has something to do:
//   • until the POS import has been used once, it never fires -- asking for a file
//     the system cannot yet read would teach the owner to ignore it;
//   • if tonight's sales are already in, it says nothing.
//
// AUTH FAILS CLOSED, exactly like /api/cron-daily: no CRON_SECRET, no entry.

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // the email scan reads Gmail and asks Claude once

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const authed = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!authed) return new Response('forbidden', { status: 401 })

  const owner = process.env.OWNER_CHAT_ID?.trim()
  if (!owner) return Response.json({ ok: true, skipped: 'no OWNER_CHAT_ID to remind' })

  // ① Payments that came by EMAIL today (lib/email-payments.ts): scan, then ask
  //    the owner to classify anything unanswered. Runs every night, whatever the
  //    sales situation, and never blocks the sales reminder below.
  const scan = await scanEmailPayments()
  let asked = false
  try {
    const q = await buildQuestion()
    if (q) {
      await sendMessage(owner, q)
      await appendTurn(Number(owner), '[nightly email payments check]', q.replace(/<[^>]+>/g, ''))
      asked = true
    }
  } catch (e) {
    console.error('[CFO] email payments question failed:', e)
  }

  // ② The sales reminder. The business day that is just closing, in Malaysia.
  const today = mytDate()
  const rows = await getRecords()

  if (!salesImportInUse(rows)) {
    return Response.json({ ok: true, email: scan, asked, sales: 'POS import not in use yet — staying quiet' })
  }
  if (salesFiledFor(rows, today)) {
    return Response.json({ ok: true, email: scan, asked, sales: `sales for ${today} already in` })
  }

  const text =
    `🌙 <b>Tonight's sales aren't in yet</b> (${dayLabel(today, today).toLowerCase()}, ${today}).\n` +
    `When service ends, export the EasyEat <b>Dish Report Over Time</b> for today (CSV or Excel) and ` +
    `send the file to me here, or upload it on the Cash In tab. It files the sales and takes the stock off the shelf — ` +
    `it's what keeps your food cost % honest.`
  await sendMessage(owner, text)

  // Into the owner's chat memory, so a reply like "ok here" or "done" -- or the
  // file itself -- lands in a conversation Jarvis knows is about tonight's sales.
  try {
    await appendTurn(Number(owner), '[nightly sales reminder]',
      `Reminded the owner to upload the EasyEat Dish Report for ${today} (they can send the CSV/Excel here, or upload it on the Cash In tab). Not received yet.`)
  } catch (e) {
    console.error('[CFO] reminder memory write failed:', e)
  }

  return Response.json({ ok: true, email: scan, asked, reminded: today })
}
