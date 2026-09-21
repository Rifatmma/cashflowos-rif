// ============================================================
// THE AD TASK BOARD — definitions.
//
// SPLIT OF RESPONSIBILITY:
//   • THIS FILE holds the CANONICAL definition of each task — what it is, why it
//     matters, what to measure, which phase, when it's due. It never changes
//     unless the analysis changes.
//   • SUPABASE `records` (category 'ad_task') holds the MUTABLE state — status,
//     notes, owner, and the reason if you decline it. Joined on meta.key.
//
// So a task's wording can be improved in code without wiping the team's notes,
// and the team's updates can never be clobbered by a redeploy.
//
// SEEDING: the Playbook page generates the INSERT statements from TASKS below,
// so the SQL can never drift from the definitions. Run it once in Supabase.
// ============================================================

export type Phase = 'now' | 'promo' | 'after' | 'ongoing'
export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done' | 'declined'

export type TaskDef = {
  key: string          // stable id, stored in meta.key — never reuse or rename
  title: string
  phase: Phase
  priority: number     // 1 = do first, globally ordered
  due: string          // YYYY-MM-DD
  impact: 'Highest' | 'High' | 'Medium' | 'Compounding'
  effort: 'Minutes' | 'An hour' | 'Half a day' | 'Ongoing'
  why: string
  measure: string
  kind: 'Fix' | 'Test' | 'Shoot' | 'Habit'
}

export const PHASES: { id: Phase; label: string; window: string; blurb: string }[] = [
  { id: 'now', label: 'Phase 1 — Now', window: '20–23 Sep', blurb: 'Account changes that cost nothing and start paying immediately.' },
  { id: 'promo', label: 'Phase 2 — Before the promo ends', window: '24–30 Sep', blurb: 'Everything that has to happen while the RM79.90 offer is still live.' },
  { id: 'after', label: 'Phase 3 — After', window: '1–14 Oct', blurb: 'Tests and creative that outlive this promo.' },
  { id: 'ongoing', label: 'Ongoing', window: 'Every week', blurb: 'Habits that compound. No due date — a weekly rhythm.' },
]

export const PROMO_ENDS = '2026-09-30'

export const TASKS: TaskDef[] = [
  // ── Phase 1 ───────────────────────────────────────────────
  // Priority 0: a legal problem outranks every performance fix. Found on 21 Sep
  // when the redesign checked the live ad's copy against the brand guideline.
  { key: 'no-halal-claim', title: 'Remove "Halal" from the live ad', phase: 'now', priority: 0, due: '2026-09-21',
    impact: 'Highest', effort: 'Minutes', kind: 'Fix',
    why: 'The live ad says "100% Halal". Jaosamut is not JAKIM certified, and your own brand guideline (section 15) says using that word is an offence under Malaysian law. Replace it with "No pork · No alcohol served".',
    measure: 'The word is gone from every live ad and post' },
  { key: 'wa-opener', title: 'Fix the WhatsApp opening message', phase: 'now', priority: 1, due: '2026-09-21',
    impact: 'Highest', effort: 'Minutes', kind: 'Fix',
    why: '63% of conversations die after one message. Worth more than every ad change combined — reclaiming half the 74 lost chats is roughly RM 3,000 in sets at no extra ad spend.',
    measure: 'Depth-2 rate, currently 37.3%' },
  { key: 'widen-geo', title: 'Widen the geographic targeting', phase: 'now', priority: 2, due: '2026-09-22',
    impact: 'Highest', effort: 'Minutes', kind: 'Fix',
    why: 'Reach fell 90% since March (134,690 → 12,862) while CPM rose 4.4×. You cannot out-creative an exhausted pool. Add Seri Kembangan, Kajang, Shah Alam, or lift the radius to 25km.',
    measure: 'Reach and CPM on the next run' },
  { key: 'kill-ig-feed', title: 'Turn off Instagram Feed placement', phase: 'now', priority: 3, due: '2026-09-21',
    impact: 'High', effort: 'Minutes', kind: 'Fix',
    why: 'RM 67.06 for three conversations at 0.85% CTR — RM 22.35 each. No reading of the data justifies it.',
    measure: 'Blended cost per conversation' },
  { key: 'dayparting', title: 'Add a 10:00–21:00 ad schedule', phase: 'now', priority: 4, due: '2026-09-21',
    impact: 'High', effort: 'Minutes', kind: 'Fix',
    why: 'Evenings return RM 6.09 per conversation. 01:00–05:00 spent RM 25.47 for one, and 09:00 alone burned RM 48.90 for two.',
    measure: 'Cost per conversation' },
  { key: 'shift-placements', title: 'Move budget into FB Stories and Reels', phase: 'now', priority: 5, due: '2026-09-22',
    impact: 'High', effort: 'Minutes', kind: 'Fix',
    why: 'Stories delivers at RM 3.47 and Reels at RM 5.22. Feed is RM 9.42 and holds 43% of spend. Move about RM 120 across.',
    measure: 'Blended cost per conversation' },
  { key: 'no-more-pauses', title: 'Stop pausing the campaign', phase: 'now', priority: 6, due: '2026-09-23',
    impact: 'High', effort: 'Minutes', kind: 'Fix',
    why: 'Five pauses in six months including 32 straight days. Every restart re-enters the learning phase. A smaller continuous daily budget beats a bigger stop-start one.',
    measure: 'Days delivering per month' },
  { key: 'fix-price', title: 'Correct the normal price in the live ad', phase: 'now', priority: 7, due: '2026-09-22',
    impact: 'Medium', effort: 'Minutes', kind: 'Fix',
    why: 'The ad says N.P RM99.80 but your normal price is RM98.90, and the saving is RM19.00 while the free tomyam is billed as RM19.90. Pricing the set at RM79 makes every number agree.',
    measure: 'Nothing — this is a credibility fix' },
  { key: 'shoot-tomyam', title: 'Shoot: the tomyam pour (9:16, 6–8s)', phase: 'now', priority: 8, due: '2026-09-23',
    impact: 'High', effort: 'An hour', kind: 'Shoot',
    why: 'Puts your strongest hook — FREE tomyam worth RM19.90 — into your strongest placement. Close-up, steam, sound on, text on frame one.',
    measure: 'CTR and cost per conversation vs the current video' },

  // ── Phase 2 ───────────────────────────────────────────────
  { key: 'age-floor', title: 'Raise the age floor to 25', phase: 'promo', priority: 9, due: '2026-09-24',
    impact: 'Medium', effort: 'Minutes', kind: 'Fix',
    why: '18–24 produced two conversations on RM 17.26. 45–54 delivers 41% of results at RM 6.46.',
    measure: 'Cost per conversation' },
  { key: 'strip-wedding', title: 'Remove the wedding interests', phase: 'promo', priority: 10, due: '2026-09-24',
    impact: 'Medium', effort: 'Minutes', kind: 'Fix',
    why: '“Love marriage” and “Marriage (weddings)” are live on a restaurant ad set, pulling the wrong intent.',
    measure: 'Depth-2 rate' },
  { key: 'test-opener', title: 'Test: one-question WhatsApp opener', phase: 'promo', priority: 11, due: '2026-09-25',
    impact: 'Highest', effort: 'Minutes', kind: 'Test',
    why: 'A: whatever the auto-reply sends now. B: “Berapa orang & pukul berapa?” and nothing else. The highest-leverage test in the account.',
    measure: 'Depth-2 rate' },
  { key: 'shoot-choice', title: 'Shoot: the choice montage (9:16, 12s)', phase: 'promo', priority: 12, due: '2026-09-25',
    impact: 'High', effort: 'An hour', kind: 'Shoot',
    why: 'Four cuts, one per protein, each captioned with its preparation. Sells the free-choice angle no competitor can claim.',
    measure: 'CTR' },
  { key: 'shoot-owner', title: 'Shoot: owner-to-camera, unpolished (20s)', phase: 'promo', priority: 13, due: '2026-09-25',
    impact: 'Medium', effort: 'Minutes', kind: 'Shoot',
    why: 'Phone camera, no edit, you in the restaurant. Low-production owner footage consistently beats polished work for local restaurants because it reads as real.',
    measure: 'CTR and depth-2 rate' },
  { key: 'post-promo-ad', title: 'Write the post-promo ad', phase: 'promo', priority: 14, due: '2026-09-26',
    impact: 'High', effort: 'An hour', kind: 'Fix',
    why: 'The promo ends 30 Sep and every ad you run leads on the discount. SukhoThai has run an occasion-led ad for weeks with no price. Build one that sells free choice of preparation.',
    measure: 'Cost per conversation in October' },
  { key: 'test-tomyam-hook', title: 'Test: free tomyam as the headline', phase: 'promo', priority: 15, due: '2026-09-27',
    impact: 'High', effort: 'Minutes', kind: 'Test',
    why: 'A: “Makan Thai Feast sekeluarga…”. B: “FREE Tomyam Seafood RM19.90 — bila order Set RM79.90”. Your best hook is currently a line item.',
    measure: 'CTR and cost per conversation' },
  { key: 'test-occasion', title: 'Test: occasion framing vs price framing', phase: 'promo', priority: 16, due: '2026-09-29',
    impact: 'High', effort: 'Minutes', kind: 'Test',
    why: 'A: price leads. B: “Birthday? Family dinner? Date night?” with price at the end. SukhoThai has run exactly this since 2 Sep, unchanged.',
    measure: 'Cost per conversation and depth-2 rate' },

  // ── Phase 3 ───────────────────────────────────────────────
  { key: 'shoot-table', title: 'Shoot: the table reveal (9:16, 10s)', phase: 'after', priority: 17, due: '2026-10-02',
    impact: 'Medium', effort: 'An hour', kind: 'Shoot',
    why: 'Overhead, empty table, five dishes placed in quick succession. Your 45–54 family audience buys the size of the table.',
    measure: 'CTR' },
  { key: 'design-static', title: 'Design: price-tag static (1080×1350)', phase: 'after', priority: 18, due: '2026-10-02',
    impact: 'Medium', effort: 'An hour', kind: 'Shoot',
    why: 'Feed still carries 43% of spend and deserves one properly designed static rather than a video thumbnail.',
    measure: 'Feed CTR' },
  { key: 'test-free-choice', title: 'Test: free-choice angle vs set-menu angle', phase: 'after', priority: 19, due: '2026-10-03',
    impact: 'High', effort: 'Minutes', kind: 'Test',
    why: 'A: lists the five dishes. B: “Pilih SENDIRI cara masak setiap lauk”. Free choice is a real differentiator the ad barely mentions.',
    measure: 'CTR, then depth-2' },
  { key: 'test-wider-geo', title: 'Test: wider geo vs current geo', phase: 'after', priority: 20, due: '2026-10-06',
    impact: 'High', effort: 'Minutes', kind: 'Test',
    why: 'Tests whether the shrinking pool or the creative is the real constraint.',
    measure: 'CPM and reach, then cost per conversation' },
  { key: 'shoot-walkthrough', title: 'Shoot: the 15-second walkthrough', phase: 'after', priority: 21, due: '2026-10-06',
    impact: 'Medium', effort: 'Minutes', kind: 'Shoot',
    why: 'Car park to table, handheld. Cyberjaya parking is a real objection and this answers it without a word.',
    measure: 'Depth-2 rate' },
  { key: 'test-price-framing', title: 'Test: saving-as-a-number price framing', phase: 'after', priority: 22, due: '2026-10-09',
    impact: 'Medium', effort: 'Minutes', kind: 'Test',
    why: 'B: “Jimat RM19 — bayar RM79.90, bukan RM98.90”. A number beats a struck-through price for value-led audiences.',
    measure: 'Cost per conversation' },
  { key: 'test-placements', title: 'Test: FB Stories + Reels only', phase: 'after', priority: 23, due: '2026-10-12',
    impact: 'Medium', effort: 'Minutes', kind: 'Test',
    why: 'Stories at RM 3.47 is being averaged down by Feed at RM 9.42 and IG Feed at RM 22.35.',
    measure: 'Blended cost per conversation' },

  // ── Ongoing ───────────────────────────────────────────────
  { key: 'label-chats', title: 'Label every WhatsApp chat', phase: 'ongoing', priority: 24, due: '2026-09-21',
    impact: 'Compounding', effort: 'Ongoing', kind: 'Habit',
    why: 'Genuine / booked / showed up / price shopper / wrong intent / no reply. Labels cannot be read by API, but the counts take thirty seconds and turn cost-per-conversation into cost-per-diner.',
    measure: 'Cost per diner — the only number that matters' },
  { key: 'organic-content', title: 'Two organic recipe posts a week', phase: 'ongoing', priority: 25, due: '2026-09-22',
    impact: 'Compounding', effort: 'Ongoing', kind: 'Habit',
    why: 'Akak Founder built 286,000 followers on founder-led Thai recipe content and buys no ads at all. You have the skills to run that model. It compounds while ad costs do not.',
    measure: 'Page followers and organic reach' },
]

export const STATUS_PILL: Record<TaskStatus, string> = {
  todo: 'nurture',
  doing: 'active',
  blocked: 'pending',
  done: 'done',
  declined: 'rejected',
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'Doing',
  blocked: 'Blocked',
  done: 'Done',
  declined: 'Declined',
}

// Escape a value for a single-quoted SQL literal.
const q = (s: string) => `'${s.replace(/'/g, "''")}'`

// The seed statement, generated from TASKS so it can never drift from the
// definitions above. Rendered on the page when no ad_task rows exist yet.
export function seedSql(owner: string): string {
  const values = TASKS.map(t => {
    const meta = {
      key: t.key, priority: t.priority, phase: t.phase, kind: t.kind,
      impact: t.impact, effort: t.effort, owner,
    }
    return `  (${q(t.title)}, 'todo', 'ad_task', ${q(t.due)}, ${q(JSON.stringify(meta))}::jsonb)`
  }).join(',\n')
  return `insert into records (title, status, category, due_date, meta)\nvalues\n${values};`
}
