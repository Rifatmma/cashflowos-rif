import 'server-only'
// 👉 Jarvis's /seo: the planner card and the Claude inbox, from Telegram.
//
// OWNER ONLY, enforced by the caller before anything here runs. Nothing is ever
// queued except by an explicit command, a reply to an SEO card, or a tap on a
// button the owner was sent — the chat model never queues work by itself.
//
// Which step "now" means is kept in mw_settings ('seo_cursor'), not in
// bot_memory: bot_memory's counters are pruned to today, and a cursor that
// forgets itself overnight would be worse than none.

import { supabase } from './supabase'
import { sendMessage, sendWithButtons, answerCallbackQuery } from './telegram'
import { appUrl } from './app-url'
import { STEP, isDone } from './mw-seo-plan'
import { loadPlanner, viewOf, queuePrompt, saveStepState, getInbox, latestForStep, recentInbox, type Planner } from './mw-seo-planner'
import { stepCard, stepButtons, parseSeo, cleanNext, tagOf, SEO_HELP, type SeoCommand } from './mw-seo-telegram'
import { STAGE_LABEL } from './mw-status'

const cardUrl = (stepId: string) => (appUrl() ? `${appUrl()}/mw/seo?step=${stepId}#planner` : null)

async function getCursor(): Promise<string | null> {
  const { data } = await supabase.from('mw_settings').select('value').eq('key', 'seo_cursor').maybeSingle()
  const id = (data?.value as any)?.step
  return id && STEP[id] ? id : null
}
async function setCursor(stepId: string) {
  await supabase.from('mw_settings').upsert({ key: 'seo_cursor', value: { step: stepId }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

/** The step "now": the cursor if set, else the first open Focus step. */
async function current(p: Planner, want?: string | null) {
  const v = viewOf(p, 'focus', want ?? (await getCursor()) ?? undefined)
  return v
}

export async function sendStepCard(chatId: number | string, stepId?: string | null) {
  const p = await loadPlanner()
  const v = await current(p, stepId)
  const latest = (await latestForStep(v.step.id, 1))[0] ?? null
  const prog = p.prog.get(v.step.id)!
  await setCursor(v.step.id)
  const text = stepCard({
    step: v.step,
    position: { index: v.nav.index, total: v.nav.total, focus: v.inList && p.focus.ids.length > 0 },
    gain: p.scored.get(v.step.id)?.gain ?? null,
    stage: STAGE_LABEL[prog.stage],
    week: p.thisWeek, whole: p.whole,
    latest: latest ? { id: latest.id, status: latest.status, result: latest.result } : null,
  })
  await sendWithButtons(chatId, text, stepButtons(v.step.id, !v.step.links && !isDone(prog), cardUrl(v.step.id)))
}

async function queued(chatId: number | string, stepId: string | null, prompt: string, parentId?: number | null) {
  const r = await queuePrompt({ stepId, prompt, by: `telegram:${chatId}`, source: 'telegram', chatId: Number(chatId), parentId })
  if (!r.id) { await sendMessage(chatId, 'Nothing to send — the prompt was empty.'); return }
  await sendMessage(chatId,
    `📨 ${r.duplicate ? 'Already queued' : 'Queued'} as <b>#${r.id}</b>${stepId ? ` for “${STEP[stepId]?.title ?? stepId}”` : ''}.\n` +
    `Claude picks it up when a Claude Code session on your PC checks the SEO inbox. I'll send the result here, with suggested next prompts.` +
    (stepId ? `\n<code>${tagOf(stepId)}</code>` : ''))
}

export async function handleSeoCommand(cmd: SeoCommand, chatId: number | string) {
  if (cmd.kind === 'card' || cmd.kind === 'focus') {
    if (cmd.kind === 'focus') await supabase.from('mw_settings').delete().eq('key', 'seo_cursor')
    return sendStepCard(chatId, null)
  }
  const p = await loadPlanner()
  const v = await current(p)
  if (cmd.kind === 'next' || cmd.kind === 'prev') {
    const to = cmd.kind === 'next' ? v.nav.next : v.nav.prev
    if (!to) { await sendMessage(chatId, cmd.kind === 'next' ? 'That was the last step.' : 'That was the first step.'); return }
    return sendStepCard(chatId, to.id)
  }
  if (cmd.kind === 'go') return queued(chatId, v.step.id, v.step.go)
  if (cmd.kind === 'prompt') return queued(chatId, v.step.id, cmd.text)
  if (cmd.kind === 'done') {
    if (v.step.links) { await sendMessage(chatId, `“${v.step.title}” is tracked on /mw/plan — it closes when those tasks are done.`); return }
    await saveStepState(v.step.id, { stage: 'done' }, 'telegram')
    await sendMessage(chatId, `✓ Ticked: <b>${v.step.title}</b>`)
    const after = await loadPlanner()
    return sendStepCard(chatId, viewOf(after, 'focus').step.id)
  }
  if (cmd.kind === 'status') {
    const rows = await recentInbox(5)
    if (!rows.length) { await sendMessage(chatId, 'The SEO inbox is empty.'); return }
    await sendMessage(chatId, '🤖 <b>SEO inbox</b>\n' + rows.map(r =>
      `#${r.id} · ${r.status} · ${STEP[r.step_id ?? '']?.title ?? 'no step'}`).join('\n'))
  }
}

/** A plain message from the owner. Returns true when it was SEO business. */
export async function maybeHandleSeoText(text: string, chatId: number | string, repliedToText?: string | null): Promise<boolean> {
  const cmd = parseSeo(text)
  if (cmd) { await handleSeoCommand(cmd, chatId); return true }
  // A reply to an SEO card or result: the text is a prompt for that step.
  const step = repliedToText && /seo·/.test(repliedToText) ? repliedToText.match(/seo·([a-z0-9-]{2,40})/)?.[1] : null
  if (step && STEP[step] && text.trim() && !text.trim().startsWith('/')) {
    await queued(chatId, step, text.trim())
    return true
  }
  return false
}

/** Button taps: seo:<verb>:<arg>[:<i>]. */
export async function handleSeoCallback(data: string, cbId: string, chatId: number | string) {
  const [, verb, arg, extra] = data.split(':')
  const toast = (t: string) => answerCallbackQuery(cbId, t)
  const ack = () => answerCallbackQuery(cbId)
  if (verb === 'go' && STEP[arg]) { await toast('Sending to Claude…'); return queued(chatId, arg, STEP[arg].go) }
  if ((verb === 'x' || verb === 'p') && STEP[arg]) {
    const p = await loadPlanner()
    const v = viewOf(p, 'focus', arg)
    const to = verb === 'x' ? v.nav.next : v.nav.prev
    if (!to) return toast(verb === 'x' ? 'That was the last step.' : 'That was the first step.')
    await ack()
    return sendStepCard(chatId, to.id)
  }
  if (verb === 's' && STEP[arg]) { await ack(); return sendStepCard(chatId, arg) }
  if (verb === 'd' && STEP[arg]) {
    if (STEP[arg].links) return toast('Tracked on /mw/plan — it closes with those tasks.')
    await saveStepState(arg, { stage: 'done' }, 'telegram')
    await toast('Ticked ✓')
    const p = await loadPlanner()
    return sendStepCard(chatId, viewOf(p, 'focus').step.id)
  }
  if (verb === 'w' && STEP[arg]) {
    await ack()
    return sendMessage(chatId, `✏️ Reply to this message with what you want Claude to do on “${STEP[arg].title}”.\n<code>${tagOf(arg)}</code>`)
  }
  if (verb === 'n') {
    // A suggested next prompt. Only ever one Claude wrote on a finished job.
    const row = await getInbox(Number(arg))
    const next = cleanNext(row?.result_links?.next)[Number(extra)]
    if (!row || row.status !== 'done' || !next) return toast('That suggestion is no longer available.')
    await toast('Sending to Claude…')
    return queued(chatId, row.step_id, next.prompt, row.id)
  }
  return toast('Unknown button.')
}

export { SEO_HELP }
