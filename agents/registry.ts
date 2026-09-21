// The agent registry — the ONE place the app learns which robots exist.
//
// Two exports:
//   • AGENTS    — metadata for the "AI Employees" tab (label, emoji, autonomy note).
//   • EXECUTORS — the deterministic run() for each agent. 🔒 These are what
//                 actually write rows / file docs. The HITL engine (lib/actions.ts)
//                 calls EXECUTORS[agent_key] AFTER a proposal is approved (or on
//                 the 🟢 autopilot path). Right now they are safe stubs — Phase B
//                 (HITL) and Phase C (Vault/Expense) fill in the real bodies.
//
// 👉 To add YOUR OWN agent: copy agents/_template into agents/<name>, fill the 4
//    knobs, then add ONE line to AGENTS below (and one to EXECUTORS if it acts).

export type AgentMeta = {
  key: string
  label: string
  emoji: string
  autonomyNote: string   // one line describing where its 🟢/🟡 dial sits
}

// Order here = order shown on the AI Employees tab.
export const AGENTS: AgentMeta[] = [
  // ---- Ships wired ----
  {
    key: 'vault',
    label: 'The Vault',
    emoji: '📸',
    autonomyNote: 'Photo in → files the receipt/doc. 🟢 auto-files small ones, 🟡 asks on big or unclear ones.',
  },
  {
    key: 'expense',
    label: 'Expense Filer',
    emoji: '🧾',
    autonomyNote: '🟢 auto-files spend at or under the threshold, 🟡 asks first above it (the autonomy dial).',
  },
  {
    key: 'jarvis',
    label: 'Jarvis',
    emoji: '🤖',
    autonomyNote: 'Read-only Q&A over your numbers on Telegram. Answers only — never acts on money.',
  },
  // ---- Department heads (docs/ai-csuite-blueprint.md) ----
  {
    key: 'head-marketing',
    label: 'Head of Marketing',
    emoji: '📣',
    autonomyNote: '🟡 Daily: reads the ads playbook + content calendar, hands you ONE recommendation. Dial fully closed — it never publishes, boosts or spends.',
  },
  // ---- Gallery placeholders (fill from agents/gallery/*.md; all DRAFT-only) ----
  {
    key: 'overdue-invoice',
    label: 'Overdue-Invoice Chaser',
    emoji: '💸',
    autonomyNote: '🟡 Daily: drafts a chase for invoices unpaid > 7 days. You send it.',
  },
  {
    key: 'cold-lead',
    label: 'Cold-Lead Follow-up',
    emoji: '🎯',
    autonomyNote: '🟡 Daily: drafts a nudge for leads quiet > 3 days. You send it.',
  },
  {
    key: 'content-approval',
    label: 'Content Approval',
    emoji: '📅',
    autonomyNote: '🟡 On new draft: asks before anything is published.',
  },
  {
    key: 'leave-claim',
    label: 'Leave / Claim Approval',
    emoji: '🗂️',
    autonomyNote: '🟡 On submit: always asks — HR sign-off never runs on its own.',
  },
  {
    key: 'renewal-nudge',
    label: 'Renewal Nudge',
    emoji: '🔁',
    autonomyNote: '🟡 Daily: drafts a reminder for policies/subscriptions expiring within 30 days.',
  },
  {
    key: 'viewing-followup',
    label: 'Viewing Follow-up',
    emoji: '🏠',
    autonomyNote: '🟡 After a viewing: drafts the follow-up. You send it.',
  },
]

// ------------------------------------------------------------
// EXECUTORS — deterministic, idempotent action runners.
//
// 🔒 Don't edit the CALL SHAPE — the HITL engine depends on it:
//    (payload) => Promise<any>   (the returned value is stored as the audit result)
//
// An executor is the ONLY thing that can actually "do" the action. It runs exactly
// ONCE, AFTER a YES or the 🟢 autopilot claim (the CAS in lib/actions.ts guarantees
// once-only). It is deterministic: same payload in → same rows out. Nothing in here
// sends to a customer, moves money, or deletes a row — the 🔴 NEVER-zone code
// simply does not live here. That's the whole safety guarantee.
//
// Two executor shapes ship:
//   • fileReceipt — writes a records row (+ a vault_files row when a photo was
//     uploaded) for the Vault/Expense agents.
//   • draftOnly   — hands back a DRAFT for a human to send (the gallery agents).
//     Note: no network call, nothing leaves the building.
// ------------------------------------------------------------
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { logRun } from '@/lib/runs'

export type Executor = (payload: any) => Promise<any>

// ---- fileReceipt: the Vault/Expense write ----------------------------------
// Files a receipt/doc into the ONE `records` table. A receipt with a real amount
// becomes a `cash_out` row (money going out); anything else becomes a `doc`. If the
// payload carries a photo's sha256, we also write the `vault_files` row and link it
// back — the sha256 UNIQUE constraint makes that write idempotent (same photo twice
// = same hash = no duplicate). The returned result includes `record_id` so /undo
// can post a reversal later.
async function fileReceipt(agentKey: string, payload: any): Promise<any> {
  if (!supabaseConfigured) throw new Error('Supabase not configured — cannot file this yet.')

  const kind = String(payload?.kind || 'receipt').toLowerCase()
  const rawAmount = Number(payload?.amount)
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0
  const isExpense = kind !== 'doc' && amount > 0
  const merchant = (payload?.merchant || '').toString().trim()
  const catCol = isExpense ? 'cash_out' : 'doc'
  const label = payload?.category || (isExpense ? 'expense' : 'document')
  const title = isExpense
    ? `${merchant || 'Receipt'} — ${label}`
    : `${merchant || payload?.title || 'Document'}`

  // 1) The business-spine row.
  const { data: recRows, error: recErr } = await supabase
    .from('records')
    .insert({
      title,
      status: 'filed',
      amount: isExpense ? amount : 0,
      category: catCol,
      due_date: payload?.date || null,
      notes: payload?.note || (payload?.auto ? 'Auto-filed by the Vault 🤖' : 'Filed by the Vault 🤖'),
      meta: {
        merchant: merchant || undefined,
        category: payload?.category || undefined,
        auto_filed: !!payload?.auto,
        source: 'vault',
        sha256: payload?.sha256 || undefined,
        // The itemised layer from lib/vision.ts — already clamped and reconciled
        // there. Stored on the ONE row rather than as child rows, so a receipt
        // stays one cash-out entry and the totals on every other tab stay right.
        items: Array.isArray(payload?.items) && payload.items.length ? payload.items : undefined,
        expense_type: payload?.expense_type || undefined,
        receipt_no: payload?.receipt_no || undefined,
        subtotal: typeof payload?.subtotal === 'number' ? payload.subtotal : undefined,
        tax: typeof payload?.tax === 'number' ? payload.tax : undefined,
        items_note: payload?.items_note || undefined,
        // Who sent it, when it came from the staff receipts group. Auto-filing
        // under the limit means nobody reviews it as it lands, so the trail has to
        // survive on the row itself -- the Cash Out tab and the daily brief both
        // read this back.
        filed_by: payload?.filed_by || undefined,
        filed_by_id: payload?.filed_by_id || undefined,
        filed_in_group: payload?.filed_in_group || undefined,
      },
    })
    .select()
  if (recErr) throw new Error(`could not file the record: ${recErr.message}`)
  const recordId = recRows?.[0]?.id ?? null

  // 2) The vault_files row (only when a photo/document was actually uploaded).
  //    Idempotent via the sha256 UNIQUE constraint — a replayed file is ignored.
  let vaultFiled = false
  if (payload?.sha256) {
    const { data: vfRows, error: vfErr } = await supabase
      .from('vault_files')
      .upsert(
        {
          sha256: payload.sha256,
          storage_path: payload.storage_path || null,
          mime: payload.mime || null,
          size_bytes: payload.size_bytes ?? null,
          uploaded_by_chat_id: payload.uploaded_by_chat_id ?? null,
          record_id: recordId,
        },
        { onConflict: 'sha256', ignoreDuplicates: true },
      )
      .select()
    if (vfErr) console.error('[CFO] vault_files write failed:', vfErr.message)
    vaultFiled = !!(vfRows && vfRows.length)
  }

  const result = {
    kind: catCol === 'cash_out' ? 'expense' : 'doc',
    record_id: recordId,
    title,
    amount: isExpense ? amount : 0,
    category: label,
    vault_filed: vaultFiled,
    filed_at: new Date().toISOString(),
  }
  await logRun(agentKey, 'ok', result)
  return result
}

// ---- writeRecord: the bot ACTION-tool write (V2) ---------------------------
// The Jarvis action tools (add task / add lead / log cash-in / mark invoice paid /
// update lead stage) all funnel through here — AFTER a 🟡 approval or a 🟢 autopilot
// claim (the CAS in lib/actions.ts guarantees once-only). Two shapes:
//   • op:'insert' → writes a new `records` row and returns record_id (so /undo can
//     post a reversal exactly like a filed receipt).
//   • op:'update' → flips a status (+ optional meta) on an existing row (mark paid,
//     move a lead stage). Idempotent: setting an already-'paid' row to 'paid' is a
//     no-op net change.
// Nothing here sends a message, moves money, or deletes — the 🔴 NEVER zone does not
// live here, same guarantee as fileReceipt/draftOnly.
async function writeRecord(agentKey: string, payload: any): Promise<any> {
  if (!supabaseConfigured) throw new Error('Supabase not configured — cannot write this yet.')
  const op = String(payload?.op || 'insert')

  if (op === 'update') {
    const recordId = Number(payload?.record_id)
    if (!Number.isFinite(recordId)) throw new Error('update needs a numeric record_id')
    const patch: Record<string, any> = {}
    if (payload?.status != null) patch.status = String(payload.status)
    if (payload?.meta && typeof payload.meta === 'object') patch.meta = payload.meta
    if (payload?.note != null) patch.notes = String(payload.note)
    // A corrected TOTAL. Only ever set from the yellow (approved) path, and still
    // bounded here -- an executor never trusts its payload.
    if (payload?.amount != null) {
      const amt = Number(payload.amount)
      if (!Number.isFinite(amt) || amt < 0) throw new Error('that corrected amount is not a usable number')
      patch.amount = amt
    }
    if (Object.keys(patch).length === 0) throw new Error('nothing to update')
    const { data, error } = await supabase.from('records').update(patch).eq('id', recordId).select()
    if (error) throw new Error(`could not update the record: ${error.message}`)
    const row = data?.[0]
    if (!row) throw new Error(`no record #${recordId} to update`)
    const result = {
      kind: 'record_updated',
      record_id: recordId,
      title: row.title,
      status: row.status,
      category: row.category,
    }
    await logRun(agentKey, 'ok', result)
    return result
  }

  // op:'insert' — a new business row (task / lead / cash_in).
  const title = String(payload?.title || '').trim() || 'Untitled'
  const category = String(payload?.category || 'task')
  const rawAmount = Number(payload?.amount)
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0
  const { data, error } = await supabase
    .from('records')
    .insert({
      title,
      status: String(payload?.status || 'open'),
      amount,
      category,
      due_date: payload?.due_date || null,
      notes: payload?.note || 'Added via Jarvis 🤖',
      meta: { ...(payload?.meta || {}), source: 'jarvis' },
    })
    .select()
  if (error) throw new Error(`could not add the ${category}: ${error.message}`)
  const recordId = data?.[0]?.id ?? null
  const result = { kind: 'record_created', record_id: recordId, title, category, amount }
  await logRun(agentKey, 'ok', result)
  return result
}

// ---- draftOnly: the gallery agents ----------------------------------------
// Produces a DRAFT the human reads and sends. There is deliberately no send here —
// customer-facing messages are 🔴 NEVER-zone. Returns the draft; logs the run.
async function draftOnly(agentKey: string, payload: any): Promise<any> {
  const result = {
    kind: 'draft' as const,
    channel: payload?.channel || 'manual',
    text: (payload?.text || '').toString().trim() || '(no draft text was provided)',
    ready_to_send: false as const, // always false — the robot never sends. You do.
    drafted_at: new Date().toISOString(),
  }
  await logRun(agentKey, 'ok', { drafted: true, channel: result.channel })
  return result
}

export const EXECUTORS: Record<string, Executor> = {
  // The two that write money/docs (Vault = the photo pipeline, Expense = its
  // threshold specialisation). Both file into the ONE records table.
  vault: (p) => fileReceipt('vault', p),
  expense: (p) => fileReceipt('expense', p),
  // The Jarvis bot ACTION tools (V2) — all write through writeRecord, all pass the
  // same CAS/approval funnel. 🟢 add-task/add-lead autopilot; 🟡 the rest ask first.
  'add-task': (p) => writeRecord('add-task', p),
  'add-lead': (p) => writeRecord('add-lead', p),
  'log-cash-in': (p) => writeRecord('log-cash-in', p),
  'mark-paid': (p) => writeRecord('mark-paid', p),
  'lead-status': (p) => writeRecord('lead-status', p),
  // Teaching the robot how a shop lays out its receipts, and fixing a receipt it
  // read wrong. Both are ordinary record writes through the same funnel.
  'teach-supplier': (p) => writeRecord('teach-supplier', p),
  'correct-receipt': (p) => writeRecord('correct-receipt', p),
  // The department heads — DRAFT-only. A head recommends; you decide.
  'head-marketing': (p) => draftOnly('head-marketing', p),
  // The gallery agents — all DRAFT-only (a human sends).
  'overdue-invoice': (p) => draftOnly('overdue-invoice', p),
  'cold-lead': (p) => draftOnly('cold-lead', p),
  'content-approval': (p) => draftOnly('content-approval', p),
  'leave-claim': (p) => draftOnly('leave-claim', p),
  'renewal-nudge': (p) => draftOnly('renewal-nudge', p),
  'viewing-followup': (p) => draftOnly('viewing-followup', p),
}

// ============================================================
// SCHEDULED CHECKS — the 'daily' agents the merged cron (/api/cron-daily) sweeps.
//
// 🔒 Don't edit the SHAPE. A scheduled agent's check() reads today's rows and
// returns a list of proposals to CREATE — it NEVER executes anything itself
// (scheduled agents still pass through the 🟡 ASK zone; the human decides). The
// cron calls propose() for each, so a stable idempotency_key (keyed by row + day)
// means re-running the cron never duplicates a proposal.
//
// 👉 To make YOUR daily agent run in the cron: add ONE entry here whose `key`
//    matches an EXECUTORS key above. Everything else (create → surface → approve →
//    execute-once → audit) is already wired.
// ============================================================
import type { Rec } from '@/lib/records'
import { rm } from '@/lib/records'
import { readMarketing } from './head-marketing/definition'
import { briefText, briefHeadline } from './head-marketing/prompt'

// `auto: true` = this one is 🟢 graduated (autopilot: run it, then just tell me).
// Omitted/false = 🟡 ask first (the safe default every agent starts on).
export type ProposalDraft = { idempotencyKey: string; payload: any; text: string; auto?: boolean }
export type ScheduledCheck = {
  key: string
  label: string
  check: (rows: Rec[], today: string) => ProposalDraft[]
}

// Whole days between a due date and today (positive = overdue).
function daysPast(due: string | null, today: string): number {
  if (!due) return 0
  return Math.floor((Date.parse(today) - Date.parse(due)) / 86_400_000)
}

// Finance · Overdue-Invoice Chaser (the worked example): unpaid cash_in more than
// 7 days past due → draft a chase for the owner to send. DRAFT only — never sends.
const overdueInvoiceCheck: ScheduledCheck = {
  key: 'overdue-invoice',
  label: 'Overdue-Invoice Chaser',
  check: (rows, today) =>
    rows
      .filter(
        (r) =>
          r.category === 'cash_in' &&
          (r.status || '').toLowerCase() !== 'paid' &&
          r.due_date &&
          daysPast(r.due_date, today) > 7,
      )
      .map((r) => {
        const late = daysPast(r.due_date, today)
        const who = (r.meta?.customer as string) || r.title
        return {
          idempotencyKey: `overdue-invoice:${r.id}:${today}`,
          payload: {
            row_id: r.id,
            channel: 'whatsapp',
            text:
              `Hi ${who}, a friendly reminder that ${rm(r.amount)} for "${r.title}" is now ` +
              `${late} days past due. Could you let me know when it'll be settled? Thank you!`,
          },
          text: `💸 Overdue: <b>${r.title}</b> (${rm(r.amount)}, ${late}d late). Draft a chase for you to send?`,
        }
      }),
}

// Marketing 📣 · Head of Marketing — the first department head.
//
// ONE PROPOSAL PER DAY, NOT ONE PER ROW. The blueprint says a head hands you ONE
// clear recommendation; 25 ad tasks would otherwise become 25 cards on Approvals
// and you would stop reading them. So this emits a single daily brief keyed by
// date, and stays SILENT on days when there is genuinely nothing to raise — a
// head that speaks every day regardless is just noise with a job title.
const headMarketingCheck: ScheduledCheck = {
  key: 'head-marketing',
  label: 'Head of Marketing',
  check: (rows, today) => {
    const read = readMarketing(rows, today)

    // Worth raising? Something is late or landing, the promo clock is running
    // out, or the organic side is empty. Otherwise say nothing.
    const worthRaising =
      read.overdue.length > 0 ||
      read.dueToday.length > 0 ||
      read.dueSoon.length > 0 ||
      (read.daysToPromoEnd >= 0 && read.daysToPromoEnd <= 3) ||
      read.daysToPromoEnd < 0 ||
      read.contentScheduled === 0
    if (!worthRaising) return []

    return [
      {
        idempotencyKey: `head-marketing:${today}`,
        payload: {
          channel: 'brief',
          text: briefText(read),
          // Kept on the payload so the audit trail records what the head saw,
          // not just what it said.
          read: {
            overdue: read.overdue.length,
            due_today: read.dueToday.length,
            due_soon: read.dueSoon.length,
            open: read.openCount,
            done: read.doneCount,
            on_time_pct: read.onTimePct,
            days_to_promo_end: read.daysToPromoEnd,
            top_priority: read.topPriority?.title ?? null,
          },
        },
        text: briefHeadline(read),
      },
    ]
  },
}

export const SCHEDULED: ScheduledCheck[] = [overdueInvoiceCheck, headMarketingCheck]
