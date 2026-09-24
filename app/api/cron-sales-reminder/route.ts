import { sendMessage } from '@/lib/telegram'
import { getRecords } from '@/lib/records'
import { appendTurn } from '@/lib/bot-memory'
import { mytDate, dayLabel, addDays } from '@/lib/period'
import { salesImportInUse, salesFiledFor } from '@/lib/sales'
import { scanEmailPayments, buildQuestion } from '@/lib/email-payments'
import { getMeals, getBudget, kcalOn } from '@/lib/meals'

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
  const params = new URL(req.url).searchParams
  // ?only=email&dry=1&days=14 -- preview what the detector sees; saves and sends nothing.
  if (params.get('only') === 'email' && params.get('dry') === '1') {
    const days = Math.min(31, Math.max(1, Number(params.get('days')) || 2))
    return Response.json({ ok: true, email: await scanEmailPayments({ days, dry: true }) })
  }
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

  // ?only=email -- a manual test of the email check without the sales nudge.
  if (new URL(req.url).searchParams.get('only') === 'email') {
    return Response.json({ ok: true, email: scan, asked })
  }

  // ② THE FOOD DIARY. The owner asked for an evening summary; Vercel's free plan
  //    allows two scheduled jobs a day and both were already taken, so he chose
  //    to fold it into this one rather than pay for a third (24 Sep 2026).
  let ate = false
  try {
    ate = await sendFoodSummary(owner)
  } catch (e) {
    console.error('[CFO] food summary failed:', e)
  }

  // ③ The sales reminder. The business day that is just closing, in Malaysia.
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

  return Response.json({ ok: true, email: scan, asked, food: ate, reminded: today })
}

/**
 * Tonight's eating, in one message. Silent on a day with nothing logged: a
 * nag about a diary he did not use is how a diary gets abandoned.
 */
async function sendFoodSummary(owner: string): Promise<boolean> {
  const day = mytDate()
  const [meals, budget] = await Promise.all([getMeals(8), getBudget()])
  const todays = meals.filter(m => m.day === day)
  if (!todays.length) return false

  const eaten = kcalOn(meals, day)
  const left = budget.target - eaten
  // The week so far, to put one day in its place: one heavy night is nothing,
  // seven of them are the whole problem.
  const week = Array.from({ length: 7 }, (_, i) => addDays(day, -i))
  const logged = week.map(d => ({ d, kcal: kcalOn(meals, d) })).filter(x => x.kcal > 0)
  const avg = logged.length ? Math.round(logged.reduce((t, x) => t + x.kcal, 0) / logged.length) : eaten

  const text =
    `\ud83c\udf7d\ufe0f <b>Today's food</b>\n` +
    todays.map(m => `\u2022 ${m.title} \u2014 ${m.kcal}`).join('\n') +
    `\n\n<b>${eaten}</b> eaten of ${budget.target} \u2014 ` +
    (left >= 0 ? `<b>${left} left</b>.` : `<b>${-left} over</b>.`) +
    (logged.length >= 3 ? `\n${logged.length} days logged this week, ${avg} a day on average.` : '') +
    (left < 0 ? '\n<i>One day over changes nothing. The average is what moves the scale.</i>' : '')

  await sendMessage(owner, text)
  await appendTurn(Number(owner), '[nightly food summary]',
    `${eaten} kcal of ${budget.target} today across ${todays.length} meals.`)
  return true
}
