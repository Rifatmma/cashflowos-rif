// 👉 The SEO planner on the phone: how a step and a result read in Telegram.
//
//   "I also want to add a telegram bot function that I can prompt as Claude
//    through my Jarvis telegram bot on the SEO planner card and also suggest me
//    what the prompt back to Claude to proceed action."      (owner, 20 Oct 2026)
//
// Pure: formatting and button layout only, so it is testable. The handlers that
// read and write are in lib/mw-seo-bot.ts.
//
// Every card carries a footer tag `seo·<step id>`. Replying to any card with
// plain text queues that text for that step — the reply needs no state of its
// own, because the step is in the message being replied to.

import type { InlineKeyboard } from './telegram'
import { CHAPTERS, type PlanStep, type Gain } from './mw-seo-plan'

export const TAG = 'seo·'
export const tagOf = (stepId: string) => `${TAG}${stepId}`

/** The step a replied-to message was about, from its footer tag. */
export function stepFromReply(text: string | undefined | null): string | null {
  const m = String(text ?? '').match(/seo·([a-z0-9-]{2,40})/)
  return m ? m[1] : null
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export type CardInput = {
  step: PlanStep
  position: { index: number; total: number; focus: boolean }
  gain: Gain | null
  stage: string
  week: { done: number; total: number }
  whole: { done: number; total: number }
  latest?: { id: number; status: string; result: string | null } | null
  appUrl?: string | null
}

export function stepCard(c: CardInput): string {
  const s = c.step
  const ch = CHAPTERS.find(x => x.n === s.chapter)?.title ?? ''
  const lines: string[] = []
  lines.push(`🧭 <b>SEO plan</b> · ${c.position.focus ? 'Focus' : 'Step'} ${c.position.index + 1} of ${c.position.total}`)
  lines.push(`This week ${c.week.done}/${c.week.total} · Whole plan ${c.whole.done}/${c.whole.total}`)
  lines.push('')
  lines.push(`<b>${esc(s.title)}</b>`)
  lines.push(`<i>${esc(ch)}</i> · ${esc(s.who)}${s.website ? ' · website change' : ''} · ${esc(c.stage)}`)
  lines.push('')
  lines.push(esc(s.why))
  if (c.gain && c.gain.leads > 0) lines.push(`\n📈 ≈ ${c.gain.leads.toFixed(1)} enquiries/mo · ${esc(c.gain.basis)}`)
  lines.push(`\n✅ <b>Done when:</b> ${esc(s.doneWhen)}`)
  if (c.latest) {
    lines.push(`\n🤖 Last job #${c.latest.id}: ${esc(c.latest.status)}`)
    if (c.latest.result) lines.push(esc(c.latest.result.slice(0, 300)) + (c.latest.result.length > 300 ? '…' : ''))
  }
  lines.push(`\n<b>Prompt Claude:</b> tap ▶, or reply to this message with your own prompt.`)
  lines.push(`<code>${tagOf(s.id)}</code>`)
  return lines.join('\n')
}

export function stepButtons(stepId: string, canDone: boolean, url?: string | null): InlineKeyboard {
  const rows: InlineKeyboard = [
    [{ text: '▶ Send this step to Claude', callback_data: `seo:go:${stepId}` }],
    [{ text: '‹ Prev', callback_data: `seo:p:${stepId}` }, { text: 'Next ›', callback_data: `seo:x:${stepId}` }],
  ]
  const last: InlineKeyboard[number] = []
  if (canDone) last.push({ text: '✓ Mark done', callback_data: `seo:d:${stepId}` })
  if (url) last.push({ text: 'Open the card', url })
  if (last.length) rows.push(last)
  return rows
}

export type ResultInput = {
  id: number
  status: 'done' | 'failed' | string
  step: PlanStep | null
  result: string | null
  error: string | null
  next: { label: string; prompt: string }[]
  appUrl?: string | null
}

/** The message Jarvis sends when Claude finishes a job. */
export function resultMessage(r: ResultInput): string {
  const head = r.status === 'done' ? '✅' : '⚠️'
  const lines: string[] = []
  lines.push(`${head} <b>Claude finished #${r.id}</b>${r.step ? ` — ${esc(r.step.title)}` : ''}`)
  lines.push('')
  if (r.status === 'done' && r.result) lines.push(esc(r.result.slice(0, 1500)) + (r.result.length > 1500 ? '…' : ''))
  if (r.status !== 'done') lines.push(`It did not finish: ${esc(r.error ?? 'no reason given')}`)
  if (r.next.length) {
    lines.push('')
    lines.push('<b>Suggested next prompts</b> — tap one to send it to Claude:')
    r.next.slice(0, 3).forEach((n, i) => lines.push(`${i + 1}. ${esc(n.label)}`))
  }
  lines.push('')
  lines.push('Or reply to this message with your own prompt.')
  if (r.step) lines.push(`<code>${tagOf(r.step.id)}</code>`)
  return lines.join('\n')
}

export function resultButtons(r: ResultInput): InlineKeyboard {
  const rows: InlineKeyboard = r.next.slice(0, 3).map((n, i) => [{ text: `▶ ${n.label}`.slice(0, 60), callback_data: `seo:n:${r.id}:${i}` }])
  if (r.step) rows.push([{ text: '✏️ Write my own', callback_data: `seo:w:${r.step.id}` }, { text: '🧭 Show the step', callback_data: `seo:s:${r.step.id}` }])
  if (r.appUrl && r.step) rows.push([{ text: 'Open the card', url: r.appUrl }])
  return rows
}

/** Clean next-prompt suggestions out of whatever Claude wrote to result_links.next. */
export function cleanNext(raw: unknown): { label: string; prompt: string }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x: any) => ({ label: String(x?.label ?? '').trim().slice(0, 50), prompt: String(x?.prompt ?? '').trim().slice(0, 1500) }))
    .filter(x => x.label && x.prompt && !/publish (it |this )?(to|on) (the )?(live )?(site|movingwalls)/i.test(x.prompt))
    .slice(0, 3)
}

export type SeoCommand =
  | { kind: 'card' }
  | { kind: 'go' }
  | { kind: 'status' }
  | { kind: 'done' }
  | { kind: 'next' }
  | { kind: 'prev' }
  | { kind: 'focus' }
  | { kind: 'prompt'; text: string }

/** `/seo`, `/seo go`, `/seo status`, `/seo done`, `/seo next|prev`, `/seo focus`, `/seo <anything else>`. */
export function parseSeo(text: string): SeoCommand | null {
  const m = String(text ?? '').trim().match(/^\/seo(?:@\w+)?(?:\s+([\s\S]*))?$/i)
  if (!m) return null
  const rest = (m[1] ?? '').trim()
  if (!rest) return { kind: 'card' }
  const w = rest.toLowerCase()
  if (w === 'go' || w === 'send') return { kind: 'go' }
  if (w === 'status' || w === 'inbox') return { kind: 'status' }
  if (w === 'done') return { kind: 'done' }
  if (w === 'next') return { kind: 'next' }
  if (w === 'prev' || w === 'back') return { kind: 'prev' }
  if (w === 'focus' || w === 'top' || w === 'first') return { kind: 'focus' }
  return { kind: 'prompt', text: rest }
}

export const SEO_HELP =
  `🧭 <b>SEO plan</b>\n` +
  `<code>/seo</code> — the step to do now\n` +
  `<code>/seo go</code> — send it to Claude\n` +
  `<code>/seo &lt;your prompt&gt;</code> — ask Claude about this step\n` +
  `<code>/seo next</code> · <code>/seo prev</code> · <code>/seo focus</code>\n` +
  `<code>/seo status</code> — what Claude is working on\n` +
  `<code>/seo done</code> — tick the step\n` +
  `Reply to any SEO card to prompt Claude about that step.`
