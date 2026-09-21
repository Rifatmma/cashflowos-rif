import { sendMessage } from '@/lib/telegram'
import { getRecords } from '@/lib/records'
import { appendTurn } from '@/lib/bot-memory'
import { mytDate, dayLabel } from '@/lib/period'
import { salesImportInUse, salesFiledFor } from '@/lib/sales'

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

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const authed = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!authed) return new Response('forbidden', { status: 401 })

  const owner = process.env.OWNER_CHAT_ID?.trim()
  if (!owner) return Response.json({ ok: true, skipped: 'no OWNER_CHAT_ID to remind' })

  // The business day that is just closing, in Malaysia -- never the UTC date.
  const today = mytDate()
  const rows = await getRecords()

  if (!salesImportInUse(rows)) {
    return Response.json({ ok: true, skipped: 'POS import not in use yet — staying quiet' })
  }
  if (salesFiledFor(rows, today)) {
    return Response.json({ ok: true, skipped: `sales for ${today} already in` })
  }

  const text =
    `🌙 <b>Tonight's sales aren't in yet</b> (${dayLabel(today, today).toLowerCase()}, ${today}).\n` +
    `When the POS end-of-day report is ready, send me the CSV here and I'll file it — ` +
    `it's what keeps your food cost % honest.`
  await sendMessage(owner, text)

  // Into the owner's chat memory, so a reply like "ok here" or "done" -- or the
  // file itself -- lands in a conversation Jarvis knows is about tonight's sales.
  try {
    await appendTurn(Number(owner), '[nightly sales reminder]',
      `Asked for the POS sales CSV for ${today}. Not received yet.`)
  } catch (e) {
    console.error('[CFO] reminder memory write failed:', e)
  }

  return Response.json({ ok: true, reminded: today })
}
