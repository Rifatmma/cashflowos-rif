'use server'

import { supabase } from '@/lib/supabase'
import { currentGuest } from '@/lib/guest'
import { storeImport } from '@/lib/mw-gap-run'
import { readFile, describe } from '@/lib/mw-import'
import { COUNTRIES, dbOf } from '@/lib/mw-markets'
import { decide, undecide } from '@/lib/mw-proposals'
import { setCityStatus } from '@/lib/mw-board'
import { actionChoiceFor, cityStatusFor, proposalStatusFor, stagesFor, type Stage } from '@/lib/mw-status'
import { revalidatePath } from 'next/cache'
import { STEP } from '@/lib/mw-seo-plan'
import { queuePrompt, cancelQueued, saveStepState } from '@/lib/mw-seo-planner'

// Recording a decision. The ONLY writes /mw makes.
//
// Since 20 Oct 2026 that includes the SEO planner card: mw_seo_step_state
// (Rif's own progress on plan-owned steps) and mw_claude_inbox (prompts for
// Claude Code to pick up). Both are owner-only — the plan is Rif's, and an
// inbox row is work done with his authority.
//
// Two rules the daily refresh must never break, enforced here rather than trusted:
//  • decisions are keyed on the action id, which is never renumbered or reused
//  • the refresh updates mw_actions (status, evidence); it never touches
//    mw_decisions, because those are the team's answers, not the robot's

const CHOICES = new Set(['accept', 'reject', 'done'])
const STAGES = new Set<Stage>(['not_started', 'in_progress', 'done', 'declined', 'moot'])

/** Who is deciding — a guest's email, or 'owner' for whoever holds the passcode. */
async function actor(): Promise<string> {
  return (await currentGuest()) ?? 'owner'
}

export async function setDecision(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const choice = String(formData.get('choice') ?? '')
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300)
  if (!id || !CHOICES.has(choice)) return

  await supabase.from('mw_decisions').upsert(
    { action_id: id, choice, reason: reason || null, decided_by: await actor(), updated_at: new Date().toISOString() },
    { onConflict: 'action_id' },
  )
  revalidatePath('/mw'); revalidatePath('/mw/paid'); revalidatePath('/mw/seo'); revalidatePath('/mw/plan')
}

/**
 * The lead's own date. Rif deliberately does not set deadlines — "let the team
 * suggest when this can be due instead" (29 Sep 2026) — so this is the only
 * date on a task, and the person doing the work puts it there.
 */
export async function setProposedDue(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const raw = String(formData.get('proposed_due') ?? '').slice(0, 10)
  if (!id) return
  const due = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null

  // A date is not a decision: if the lead dates a task they have not answered
  // yet, take the date as an acceptance rather than losing it.
  const { data: existing } = await supabase.from('mw_decisions').select('choice, reason').eq('action_id', id).maybeSingle()
  await supabase.from('mw_decisions').upsert(
    {
      action_id: id,
      choice: existing?.choice ?? 'accept',
      reason: existing?.reason ?? null,
      proposed_due: due,
      decided_by: await actor(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'action_id' },
  )
  revalidatePath('/mw'); revalidatePath('/mw/plan'); revalidatePath('/mw/seo')
}

export async function clearDecision(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) return
  // A guest may only clear a decision they made themselves. Before 21 Oct 2026
  // this had no check at all, so any guest could wipe anyone's answer.
  const who = await actor()
  let q = supabase.from('mw_decisions').delete().eq('action_id', id)
  if (who !== 'owner') q = q.eq('decided_by', who)
  await q
  revalidatePath('/mw'); revalidatePath('/mw/paid'); revalidatePath('/mw/seo'); revalidatePath('/mw/plan')
}

export async function saveTargets(formData: FormData) {
  // Rif's paid targets. Owner only: a guest could overwrite them before 21 Oct 2026.
  if ((await actor()) !== 'owner') return
  const n = (k: string) => {
    const v = Number(formData.get(k))
    return Number.isFinite(v) && v > 0 ? v : 0
  }
  await supabase.from('mw_settings').upsert(
    { key: 'targets', value: { cpa: n('cpa'), budget: n('budget'), leads: n('leads') }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  revalidatePath('/mw'); revalidatePath('/mw/paid'); revalidatePath('/mw/seo'); revalidatePath('/mw/plan')
}

/**
 * Name the competitors a market is measured against.
 *
 * Capped at four because Semrush's gap report compares at most five domains
 * including ours, and anything past the fourth rival is silently ignored —
 * better to say so than to let a lead type a fifth and wonder why it does
 * nothing (owner, 29 Sep 2026).
 */
// Rivals are no longer typed in. They come from each market's own search
// results during the monthly pull and are stored on mw_market_gaps with the
// topics they produced, so the comparison and the findings can never drift
// apart — which they had: Japan's typed list held two Australian domains while
// its topics came from tokai-ad.co.jp and nichemedia.jp.
//
// setRivals() stays in lib/mw-gap-run.ts for the importer; nothing in /mw
// writes it any more.

export async function importSemrush(_prev: unknown, formData: FormData): Promise<{ lines: string[]; ok: number; skipped: number }> {
  if ((await actor()) !== 'owner') return { lines: ['Only the owner can import data.'], ok: 0, skipped: 0 }
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  const pick = String(formData.get('country') ?? '').trim()

  if (!files.length) return { lines: ['No files chosen.'], ok: 0, skipped: 0 }

  const forced = pick
    ? (() => {
      const hit = COUNTRIES.find(c => c.country.key === pick)
      return hit ? { country: hit.country.key, market: hit.market.key, db: dbOf(hit.country) ?? '' } : undefined
    })()
    : undefined

  const lines: string[] = []
  let ok = 0, skipped = 0

  for (const file of files) {
    const parsed = readFile(file.name, await file.text(), forced)
    if (parsed.problem || !parsed.kind || !parsed.country) {
      skipped++
      lines.push(describe(parsed))
      continue
    }
    try {
      const what = await storeImport({
        kind: parsed.kind,
        country: parsed.country,
        market: parsed.market!,
        db: parsed.db,
        keywords: parsed.keywords,
        competitors: parsed.competitors,
        gap: parsed.gap,
        rivals: parsed.rivals,
      })
      ok++
      lines.push(`${file.name} — ${parsed.country}: ${what}`)
    } catch (e: any) {
      skipped++
      lines.push(`${file.name} — could not be saved: ${String(e?.message ?? e).slice(0, 100)}`)
    }
  }

  revalidatePath('/mw/seo'); revalidatePath('/mw/gaps'); revalidatePath('/mw/plan'); revalidatePath('/mw/import')
  return { lines, ok, skipped }
}

// ---------------------------------------------------------------------------
// Page proposals (lib/mw-proposals.ts)
//
// Approve / reject sits beside the download rather than on a page of its own:
// "I just feel adding another page inside /mw is a bit too much page too
// confusing" (owner, 12 Oct 2026).
// ---------------------------------------------------------------------------

export async function decideProposal(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const choice = String(formData.get('choice') ?? '')
  const reason = String(formData.get('reason') ?? '')
  if (!id) return
  if (choice === 'undo') await undecide(id)
  else if (choice === 'approved' || choice === 'rejected') await decide(id, choice, await actor(), reason)
  revalidatePath('/mw/plan')
}

/** A market lead's own progress on a city page (lib/mw-board.ts). */
export async function setCityStatusAction(formData: FormData) {
  const url = String(formData.get('url') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!url || !['not_started', 'in_progress', 'done'].includes(status)) return
  await setCityStatus(url, status as any, await actor())
  revalidatePath('/mw/plan')
}

/**
 * One control, three stores.
 *
 * Tasks, city pages and page proposals each kept their own tracking gesture —
 * segmented buttons with a reason box, a click-to-cycle button, and
 * Approve / Reject… / Change my mind. All three sat on a market lead's screen
 * at once, asking the same question three ways.
 *
 *   "unify the three status controls"                  (owner, 13 Oct 2026)
 *
 * The Stage vocabulary was already shared for DISPLAY (lib/mw-status.ts); this
 * is the write side. Each store keeps its own words, because they are not the
 * same fact — a proposal really can be rejected, which is not a stage of doing
 * it — and the translation happens here rather than in the database.
 */
export async function setStage(formData: FormData) {
  const kind = String(formData.get('kind') ?? '')
  const id = String(formData.get('id') ?? '')
  const stage = String(formData.get('stage') ?? '') as Stage
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300)
  if (!id || !STAGES.has(stage)) return

  // Only offer what the store can hold. A city page cannot be "declined", and
  // a control that writes a state its store cannot keep is a control that
  // lies about what it did.
  if (!stagesFor(kind as any).includes(stage)) return

  const who = await actor()
  if (kind === 'action') {
    const choice = actionChoiceFor(stage)
    if (!choice) {
      await supabase.from('mw_decisions').delete().eq('action_id', id)
    } else {
      await supabase.from('mw_decisions').upsert(
        { action_id: id, choice, reason: reason || null, decided_by: who, updated_at: new Date().toISOString() },
        { onConflict: 'action_id' },
      )
    }
  } else if (kind === 'city') {
    await setCityStatus(id, cityStatusFor(stage), who)
  } else if (kind === 'proposal') {
    const s = proposalStatusFor(stage)
    if (s === 'undo') await undecide(id)
    else await decide(id, s, who, reason)
  } else {
    return
  }

  revalidatePath('/mw'); revalidatePath('/mw/paid'); revalidatePath('/mw/seo'); revalidatePath('/mw/plan')
}

// ---------------------------------------------------------------------------
// SEO planner card (app/mw/seo/_planner.tsx)
// ---------------------------------------------------------------------------

const PLAN_STAGES = new Set(['not_started', 'in_progress', 'done'])
const isOwner = async () => (await currentGuest()) === null

/** The done-when checkbox. Linked steps are refused: their stage is their tasks'. */
export async function setPlanStep(formData: FormData) {
  if (!(await isOwner())) return
  const id = String(formData.get('id') ?? '')
  const stage = String(formData.get('stage') ?? '')
  if (!STEP[id] || STEP[id].links || !PLAN_STAGES.has(stage)) return
  await saveStepState(id, { stage }, 'owner')
  revalidatePath('/mw/seo')
}

/** Who applies a website step. Kept on the step so the applier prompt names them. */
export async function setStepAssignee(formData: FormData) {
  if (!(await isOwner())) return
  const id = String(formData.get('id') ?? '')
  const who = String(formData.get('assignee') ?? '').trim().slice(0, 60)
  if (!STEP[id]) return
  await saveStepState(id, { assignee: who || null }, 'owner')
  revalidatePath('/mw/seo')
}

/** Send to Claude: the prompt plus a frozen context pack, into the inbox. */
export async function sendToClaude(formData: FormData) {
  if (!(await isOwner())) return
  const id = String(formData.get('step_id') ?? '')
  const prompt = String(formData.get('prompt') ?? '').trim().slice(0, 4000)
  const parent = Number(formData.get('parent_id') ?? 0) || null
  if (!prompt || (id && !STEP[id])) return
  await queuePrompt({ stepId: id || null, prompt, by: 'owner', source: 'web', parentId: parent })
  revalidatePath('/mw/seo')
}

export async function cancelInbox(formData: FormData) {
  if (!(await isOwner())) return
  const id = Number(formData.get('id') ?? 0)
  if (!id) return
  await cancelQueued(id)
  revalidatePath('/mw/seo')
}

// ---------------------------------------------------------------------------
// The one ranked list (lib/mw-priorities.ts): Done, and "Can't — here's why"
// ---------------------------------------------------------------------------
//
// One gesture for every kind of task, whatever store it lives in. A guest may
// only answer their own tasks; the owner may answer any. A reason is required
// to decline, because a decline without a reason can never be re-raised when
// the data changes, and that is the whole point of keeping it.

const QUEUE_STAGES = new Set(['done', 'declined', 'not_started', 'in_progress'])

export async function setQueueStage(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const stage = String(formData.get('stage') ?? '')
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300)
  if (!id || !QUEUE_STAGES.has(stage)) return
  if (stage === 'declined' && !reason) return

  const who = await actor()
  if (who !== 'owner') {
    const { loadStack } = await import('@/lib/mw-priority-load')
    const { personByActor } = await import('@/lib/mw-people')
    const stack = await loadStack()
    const me = personByActor(stack.people, who)
    const item = stack.queue.items.find(x => x.id === id)
    if (!me || !item || (item.owner !== me.name && item.helper !== me.name)) return
  }

  const now = new Date().toISOString()
  if (id.startsWith('task:')) {
    const actionId = id.slice(5)
    const choice = actionChoiceFor(stage as Stage)
    if (!choice) await supabase.from('mw_decisions').delete().eq('action_id', actionId)
    else await supabase.from('mw_decisions').upsert(
      { action_id: actionId, choice, reason: reason || null, decided_by: who, updated_at: now },
      { onConflict: 'action_id' },
    )
  } else {
    // Everything the app owns itself — SEO steps, tracking, paid, content,
    // sales, page reviews — keeps its progress in one table, keyed by id.
    const key = id.startsWith('seo:') ? id.slice(4) : id
    await supabase.from('mw_seo_step_state').upsert(
      { step_id: key, stage, reason: reason || null, updated_by: who, updated_at: now },
      { onConflict: 'step_id' },
    )
  }
  revalidatePath('/mw'); revalidatePath('/mw/people'); revalidatePath('/mw/seo')
}
