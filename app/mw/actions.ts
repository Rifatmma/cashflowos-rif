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

/**
 * What a signed-in guest may answer. Before 26 Oct 2026 any guest could
 * decide any task, proposal or city page — one click from a lead could close
 * someone else's work. Now: their own tasks; proposals for the site
 * specialist; city pages for market leads and the specialist.
 */
async function guestMay(what: 'action' | 'proposal' | 'city', id: string): Promise<boolean> {
  const who = await actor()
  if (who === 'owner') return true
  const { getPeople } = await import('@/lib/mw-people-store')
  const { personByActor, personByName } = await import('@/lib/mw-people')
  const people = await getPeople()
  const me = personByActor(people, who)
  if (!me) return false
  if (what === 'proposal') return me.role === 'specialist'
  if (what === 'city') return me.role === 'specialist' || me.role === 'market'
  const { data } = await supabase.from('mw_actions').select('owner').eq('id', id).maybeSingle()
  return personByName(people, (data as any)?.owner)?.name === me.name
}

export async function setDecision(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const choice = String(formData.get('choice') ?? '')
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300)
  if (!id || !CHOICES.has(choice)) return
  if (!(await guestMay('action', id))) return

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
  if (!id || !(await guestMay('action', id))) return
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
  if (!id || !(await guestMay('proposal', id))) return
  if (choice === 'undo') await undecide(id)
  else if (choice === 'approved' || choice === 'rejected') await decide(id, choice, await actor(), reason)
  revalidatePath('/mw/plan')
}

/** A market lead's own progress on a city page (lib/mw-board.ts). */
export async function setCityStatusAction(formData: FormData) {
  const url = String(formData.get('url') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!url || !['not_started', 'in_progress', 'done'].includes(status)) return
  if (!(await guestMay('city', url))) return
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
  if (kind !== 'action' && kind !== 'city' && kind !== 'proposal') return
  if (!(await guestMay(kind, id))) return

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
  // Plan steps, and since 21 Oct 2026 any task in the one list (a content
  // brief, a paid review, a tracking fix) — those carry a prefixed id.
  if (!prompt || (id && !STEP[id] && !/^(gap|trk|paid|sales|prop|task):[^<>]{1,160}$/.test(id))) return
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

  const { writeStage } = await import('@/lib/mw-queue-write')
  await writeStage(id, stage as Stage, reason || null, who)
}

// ---------------------------------------------------------------------------
// "My week" cards (lib/mw-week.ts). A card is answered by the person it
// belongs to; the owner (Rif) may answer any. Every answer is also written to
// the queue item the card came from, so the ranked list agrees with the card
// and a "Can't" is never picked again.
// ---------------------------------------------------------------------------

async function weekCard(id: string) {
  const { getTask } = await import('@/lib/mw-week-store')
  const t = id ? await getTask(id) : null
  if (!t) return null
  const who = await actor()
  if (who === 'owner') return { t, who }
  const { getPeople } = await import('@/lib/mw-people-store')
  const { personByActor } = await import('@/lib/mw-people')
  const me = personByActor(await getPeople(), who)
  return me && me.name === t.owner ? { t, who } : null
}

async function mirror(sourceId: string | null, stage: Stage, reason: string | null, who: string) {
  if (!sourceId) return
  const { writeStage } = await import('@/lib/mw-queue-write')
  await writeStage(sourceId, stage, reason, who).catch(() => {})
}

const weekPaths = () => { revalidatePath('/mw'); revalidatePath('/mw/people') }

/** A lead hands their edited Google Doc to Dinesh: their card is finished, his appears. */
export async function weekSubmit(formData: FormData) {
  const doc = String(formData.get('doc') ?? '').trim()
  const c = await weekCard(String(formData.get('id') ?? ''))
  if (!c || (c.t.kind !== 'content-new' && c.t.kind !== 'content-improve') || c.t.state !== 'todo') return
  if (!/^https:\/\/docs\.google\.com\//.test(doc)) return
  const { setState, saveTasks, getTask } = await import('@/lib/mw-week-store')
  const { publishCardFor } = await import('@/lib/mw-week')
  const { getPeople } = await import('@/lib/mw-people-store')
  const dinesh = (await getPeople()).find(p => p.role === 'specialist')?.name ?? 'Dinesh'
  await setState(c.t.id, 'submitted', c.who, { payload: { ...(c.t.payload ?? {}), doc } })
  const card = publishCardFor(c.t, doc, dinesh)
  // Same id every time: a second press finds the card and changes nothing.
  if (!(await getTask(card.id))) await saveTasks([card], c.who)
  await mirror(c.t.sourceId, 'in_progress', null, c.who)
  weekPaths()
}

/** Dinesh: it is live. Closes his card and the lead's, and the queue item behind them. */
export async function weekPublished(formData: FormData) {
  const url = String(formData.get('url') ?? '').trim()
  const c = await weekCard(String(formData.get('id') ?? ''))
  if (!c || c.t.kind !== 'publish' || c.t.state !== 'todo') return
  if (!/^https:\/\/(www\.)?movingwalls\.com\//.test(url)) return
  const { setState, getTask } = await import('@/lib/mw-week-store')
  await setState(c.t.id, 'done', c.who, { payload: { ...(c.t.payload ?? {}), url } })
  const from = String(c.t.payload?.from ?? '')
  const lead = from ? await getTask(from) : null
  if (lead) {
    await setState(lead.id, 'done', c.who, { payload: { ...(lead.payload ?? {}), url } })
    await mirror(lead.sourceId, 'done', null, c.who)
  }
  weekPaths()
}

/** Any other card: done, with an optional note (a fact a lead was asked for). */
export async function weekDone(formData: FormData) {
  const note = String(formData.get('note') ?? '').trim().slice(0, 1000)
  const c = await weekCard(String(formData.get('id') ?? ''))
  if (!c || c.t.state !== 'todo') return
  if (c.t.kind === 'content-new' || c.t.kind === 'content-improve' || c.t.kind === 'publish' || c.t.kind === 'paid-apply') return
  if (c.t.kind === 'facts' && !note) return
  const { setState } = await import('@/lib/mw-week-store')
  await setState(c.t.id, 'done', c.who, note ? { payload: { ...(c.t.payload ?? {}), note } } : {})
  await mirror(c.t.sourceId, 'done', null, c.who)
  weekPaths()
}

/**
 * Rif: apply the Google Ads change on a paid card. Owner only — a guest can
 * see the card but never touch the account. The change is checked, validated
 * by Google, then applied; on any failure the card stays open with the reason.
 */
export async function weekApply(formData: FormData) {
  if ((await actor()) !== 'owner') return
  const c = await weekCard(String(formData.get('id') ?? ''))
  if (!c || c.t.kind !== 'paid-apply' || c.t.state !== 'todo') return
  const { applyPaid } = await import('@/lib/mw-paid-apply')
  const { setState } = await import('@/lib/mw-week-store')
  const r = await applyPaid(c.t.payload)
  if (!r.ok) {
    await setState(c.t.id, 'todo', c.who, { payload: { ...(c.t.payload ?? {}), lastError: r.error, lastTried: new Date().toISOString() } })
  } else {
    await setState(c.t.id, 'done', c.who, { payload: { ...(c.t.payload ?? {}), applied: { at: new Date().toISOString(), resources: r.resources, adStrength: r.adStrength ?? null }, lastError: null } })
    await mirror(c.t.sourceId, 'done', null, c.who)
  }
  weekPaths()
}

/** "Can't do this", with the reason. The card closes and its topic is not picked again. */
export async function weekCant(formData: FormData) {
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300)
  const c = await weekCard(String(formData.get('id') ?? ''))
  if (!c || c.t.state !== 'todo' || !reason) return
  const { setState } = await import('@/lib/mw-week-store')
  await setState(c.t.id, 'cant', c.who, { reason })
  await mirror(c.t.sourceId, 'declined', reason, c.who)
  weekPaths()
}

// ---------------------------------------------------------------------------
// The Monday emails (lib/mw-digest-send.ts). Owner only.
// ---------------------------------------------------------------------------

/** Send this week's emails to Rif alone, as a preview. */
export async function sendDigestPreview(_prev: unknown): Promise<{ message: string }> {
  if ((await actor()) !== 'owner') return { message: 'Only the owner can send the emails.' }
  const { sendDigests } = await import('@/lib/mw-digest-send')
  try {
    const r = await sendDigests({ previewOnly: true, force: true })
    return { message: `Preview: ${r.notes[r.notes.length - 1]}${r.notes.length > 1 ? ` — ${r.notes.slice(0, -1).join('; ')}` : ''}` }
  } catch (e: any) {
    return { message: `Nothing sent: ${String(e?.message ?? e).slice(0, 200)}` }
  }
}

/** Switch the Monday emails on (or back off) for the team. */
export async function setDigestEnabled(formData: FormData) {
  if ((await actor()) !== 'owner') return
  const { saveDigestSettings } = await import('@/lib/mw-digest-send')
  await saveDigestSettings({ enabled: String(formData.get('enabled') ?? '') === '1' })
  revalidatePath('/mw/import')
}

// ---------------------------------------------------------------------------
// The Studio's check before an export (lib/mw-video-audit.ts, in the browser):
// the video into a private bucket, the audit emailed to Rif, and "Send to
// Claude to fix" into the inbox.
// ---------------------------------------------------------------------------

/** A signed upload URL for one export; the browser uploads the MP4 itself. */
export async function videoUploadTarget(slug: string, fmt: string): Promise<{ ok: true; path: string; url: string } | { ok: false; error: string }> {
  try {
    const { uploadTarget } = await import('@/lib/mw-video-audit-send')
    return { ok: true, ...(await uploadTarget(slug, fmt)) }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) }
  }
}

/**
 * After a Studio export, silently: nothing when the video is clean; otherwise
 * engine bugs into Claude's inbox (for the mw-video-audit skill) and the
 * check emailed to Rif with the video's 30-day link. Any Studio user's export
 * triggers it — the row and the email are the system's, not the user's.
 */
export async function finishVideoCheck(v: import('@/lib/mw-video-audit-send').AuditMail & { slug: string; plan: unknown; film: unknown }): Promise<{ ok: true; emailed: boolean; inbox: number | null } | { ok: false; error: string }> {
  try {
    const { stillWrong, engineBugs } = await import('@/lib/mw-video-audit')
    const findings = (v.findings ?? []).slice(0, 60)
    if (!stillWrong(findings).length) return { ok: true, emailed: false, inbox: null }
    let inbox: number | null = null
    const bugs = engineBugs(findings)
    if (bugs.length) {
      const slug = String(v.slug ?? '').replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'video'
      const extra = { kind: 'video-audit', title: String(v.title).slice(0, 200), format: v.format, article: String(v.article ?? '').slice(0, 300), findings: bugs, plan: v.plan, film: v.film }
      if (JSON.stringify(extra).length <= 400_000) {
        const prompt = `Video audit: the Studio found ${bugs.length} engine problem${bugs.length > 1 ? 's' : ''} it could not fix in “${String(v.title).slice(0, 120)}” (${String(v.format).slice(0, 8)}). Use the mw-video-audit skill: reproduce from the plan, fix the engine, add the lessons, and reply with what changed.`
        inbox = (await queuePrompt({ stepId: `video:${slug}`, prompt, by: `studio:${await actor()}`, source: 'web', extra })).id
      }
    }
    const { sendAuditMail } = await import('@/lib/mw-video-audit-send')
    await sendAuditMail({ ...v, findings, fixed: (v.fixed ?? []).slice(0, 60), changed: (v.changed ?? []).slice(0, 30), inbox })
    return { ok: true, emailed: true, inbox }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) }
  }
}
