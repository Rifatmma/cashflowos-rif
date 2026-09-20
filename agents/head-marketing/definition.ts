// 👉 HEAD OF MARKETING 📣 — the first AI department head, per docs/ai-csuite-blueprint.md.
//
// THE CANVAS, IN CODE (see my-agent.md for the written version):
//   Watches   → `content` rows (the marketing calendar) + `ad_task` rows (the
//               Facebook Ads playbook board on /ads/playbook).
//   🟢 alone  → NOTHING. The dial starts fully closed, on purpose.
//   🟡 asks   → every recommendation, every day.
//   🔴 never  → publish, boost, spend, message a customer. Not a setting — the
//               executor is draftOnly and has no network call, so the code that
//               would do it does not exist.
//
// ONE RECOMMENDATION, NOT TWENTY-FIVE. The blueprint is explicit that a head
// "gathers the facts, grills the numbers, and hands you ONE clear recommendation".
// So the scheduled check emits at most ONE proposal per day — a marketing brief
// naming the single most important thing to do — rather than one proposal per
// overdue row, which would bury the Approvals tab.

import type { Rec } from '@/lib/records'
import { suggest } from './prompt'

export type WhenTrigger = 'on_photo' | 'on_new_record' | 'daily'

export type AgentDefinition = {
  key: string
  when: WhenTrigger
  lookAt: (rows: Rec[]) => Rec[]
  askBefore: (row: Rec) => boolean
  suggest: (row: Rec) => string
}

export const definition: AgentDefinition = {
  key: 'head-marketing',

  // WHEN — swept by the existing daily cron. No new cron entry (Hobby allows 2).
  when: 'daily',

  // LOOK-AT — the marketing lens on the one `records` spine. Content calendar
  // plus the ads playbook; nothing else is this head's lane.
  lookAt: (rows) =>
    rows.filter((r) => r.category === 'content' || r.category === 'ad_task'),

  // ASK-BEFORE — THE DIAL, and it is fully closed. Always true: every single
  // recommendation waits for a human YES. Raise it later by returning false for
  // a narrow, reversible, non-customer-facing case — never for anything a
  // customer would see.
  askBefore: (_row) => true,

  suggest,
}

// ---- The head's reading of the numbers -------------------------------------
// Exported so the scheduled check in registry.ts and the brief text in prompt.ts
// both work from ONE calculation. A head that reports two different numbers for
// the same thing is worse than no head.

export type MarketingRead = {
  today: string
  daysToPromoEnd: number
  overdue: Rec[]
  dueToday: Rec[]
  dueSoon: Rec[]          // within 3 days, not already counted above
  openCount: number
  doneCount: number
  declinedCount: number
  onTime: number          // done on or before due_date
  late: number            // done after due_date
  onTimePct: number | null // null while nothing is finished yet
  contentScheduled: number
  topPriority: Rec | null // the single thing to do first
}

const PROMO_ENDS = '2026-09-30'
const RESOLVED = new Set(['done', 'declined'])
const isHabit = (r: Rec) => r.meta?.phase === 'ongoing'
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

export function readMarketing(rows: Rec[], today: string): MarketingRead {
  const ads = rows.filter((r) => r.category === 'ad_task')
  const open = ads.filter((r) => !RESOLVED.has((r.status || '').toLowerCase()))
  const done = ads.filter((r) => (r.status || '').toLowerCase() === 'done')

  // Habits carry a start-by date, not a deadline — counting them as overdue
  // would put a permanent red number in every brief from day two.
  const deadlined = open.filter((r) => !isHabit(r))

  const overdue = deadlined.filter((r) => r.due_date && r.due_date < today)
  const dueToday = deadlined.filter((r) => r.due_date === today)
  const dueSoon = deadlined.filter(
    (r) => r.due_date && r.due_date > today && days(today, r.due_date) <= 3,
  )

  // The metric this head is judged on: ad tasks completed on or before due date.
  // meta.done_at is stamped by the Playbook when you mark something done.
  let onTime = 0
  let late = 0
  for (const r of done) {
    const at = r.meta?.done_at as string | undefined
    if (!at || !r.due_date) continue
    if (at <= r.due_date) onTime++
    else late++
  }
  const finished = onTime + late
  const onTimePct = finished > 0 ? Math.round((onTime / finished) * 100) : null

  // Priority order: overdue first, then due today, then due soon, then plain
  // priority. Within each band the lower meta.priority number wins.
  const rank = (r: Rec) => {
    const p = Number(r.meta?.priority ?? 999)
    if (r.due_date && r.due_date < today) return p
    if (r.due_date === today) return 1000 + p
    return 2000 + p
  }
  const topPriority = [...deadlined].sort((a, b) => rank(a) - rank(b))[0] ?? null

  const contentScheduled = rows.filter(
    (r) => r.category === 'content' && (r.status || '').toLowerCase() === 'scheduled',
  ).length

  return {
    today,
    daysToPromoEnd: days(today, PROMO_ENDS),
    overdue,
    dueToday,
    dueSoon,
    openCount: open.length,
    doneCount: done.length,
    declinedCount: ads.filter((r) => (r.status || '').toLowerCase() === 'declined').length,
    onTime,
    late,
    onTimePct,
    contentScheduled,
    topPriority,
  }
}
