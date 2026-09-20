// 👉 THE SUGGEST KNOB — the words the Head of Marketing hands you.
//
// This is a BRIEF for a human to read and act on, not a message that goes out.
// Nothing here is customer-facing: the head reports on your own board and names
// one thing to do. You decide. (The executor is draftOnly — it could not send
// this to anyone even if it wanted to.)

import type { Rec } from '@/lib/records'
import type { MarketingRead } from './definition'

const name = (r: Rec) => r.title
const prio = (r: Rec) => (r.meta?.priority ? `#${r.meta.priority} ` : '')

// The per-row fallback the AgentDefinition shape requires. The real output is
// briefText() below — this exists so the definition type stays satisfied and so
// a single row can still be explained on its own if something calls it.
export function suggest(row: Rec): string {
  return `${prio(row)}${name(row)} — due ${row.due_date ?? 'no date'}. Open /ads/playbook to update it.`
}

// ---- The daily brief -------------------------------------------------------
// ONE recommendation, with the facts that justify it underneath. Telegram-safe
// HTML (<b> only) since this text is surfaced in the chat and on Approvals.
export function briefText(read: MarketingRead): string {
  const lines: string[] = []

  // The headline: the single thing to do first.
  if (read.topPriority) {
    const t = read.topPriority
    const late = t.due_date && t.due_date < read.today
    const when = late
      ? `${Math.round((Date.parse(read.today) - Date.parse(t.due_date!)) / 86_400_000)}d overdue`
      : t.due_date === read.today
        ? 'due today'
        : `due ${t.due_date}`
    lines.push(`📣 <b>Do this first:</b> ${prio(t)}${name(t)} — <b>${when}</b>.`)
  } else {
    lines.push(`📣 <b>Nothing outstanding on the ads board.</b> Good place to be.`)
  }

  // The facts behind it.
  const facts: string[] = []
  if (read.overdue.length) facts.push(`🔴 ${read.overdue.length} overdue`)
  if (read.dueToday.length) facts.push(`📌 ${read.dueToday.length} due today`)
  if (read.dueSoon.length) facts.push(`🗓 ${read.dueSoon.length} due within 3 days`)
  facts.push(`${read.openCount} open · ${read.doneCount} done`)
  if (read.declinedCount) facts.push(`${read.declinedCount} declined`)
  lines.push(facts.join(' · '))

  // The promo clock — the reason the phase 1 and 2 work has a deadline at all.
  if (read.daysToPromoEnd >= 0) {
    lines.push(
      read.daysToPromoEnd <= 3
        ? `⏳ <b>The RM79.90 promo ends in ${read.daysToPromoEnd} day${read.daysToPromoEnd === 1 ? '' : 's'}.</b> Anything not done before then is done for nothing.`
        : `⏳ Promo ends in ${read.daysToPromoEnd} days.`,
    )
  } else {
    lines.push(`⏳ <b>The promo has ended.</b> If the post-promo ad is not live, that is now the priority.`)
  }

  // The number this head is judged on, per the canvas.
  lines.push(
    read.onTimePct === null
      ? `📊 On-time rate: nothing finished yet — the first completed task sets the baseline.`
      : `📊 <b>On-time rate: ${read.onTimePct}%</b> (${read.onTime} on time, ${read.late} late).`,
  )

  // One lane check outside the task board.
  if (read.contentScheduled === 0) {
    lines.push(`📅 Nothing is scheduled on the content calendar — the organic side is empty.`)
  }

  lines.push(`\nOpen /ads/playbook to update status, add a note, or record why you are not doing something.`)

  return lines.join('\n')
}

// The one-line summary that appears on the Telegram buttons and the Approvals
// card. Kept short deliberately — the full brief is in the payload.
export function briefHeadline(read: MarketingRead): string {
  if (read.topPriority) {
    const t = read.topPriority
    const late = t.due_date && t.due_date < read.today
    return `📣 <b>Head of Marketing</b>: ${late ? 'overdue — ' : ''}${prio(t)}${name(t)}${
      read.overdue.length > 1 ? ` (+${read.overdue.length - 1} more overdue)` : ''
    }. File this brief?`
  }
  return `📣 <b>Head of Marketing</b>: board is clear, ${read.doneCount} done. File today's brief?`
}
