import 'server-only'
// 👉 Loading the SEO planner card: the plan, scored on today's numbers.
//
// One read assembles everything the card, the Telegram /seo command and the
// context pack need, so the three can never disagree about which step is
// first or how far along it is.

import { supabase, supabaseConfigured } from './supabase'
import { getActions, type ActionRow } from './mw-actions'
import { getMarketSeo, type MarketSeo } from './mw-market-data'
import { isBrand, MARKETS, SPECIALIST_SEED } from './mw-markets'
import { rankedByPage } from './mw-seo-protect'
import { openProposals } from './mw-proposals'
import {
  STEPS, STEP, scoreSteps, focusCut, progressOf, thisWeek, tally, weekOf, orderFor, currentStep, neighbours,
  type Evidence, type LinkedAction, type StepState, type StepProgress, type Scored, type FocusCut, type PlanStep,
} from './mw-seo-plan'
import { buildContext, type ContextPack } from './mw-seo-context'

export type InboxRow = {
  id: number
  step_id: string | null
  prompt: string
  status: 'queued' | 'claimed' | 'done' | 'failed' | 'cancelled'
  result: string | null
  result_links: { files?: string[]; proposals?: string[]; docs?: string[]; next?: { label: string; prompt: string }[] } | null
  error: string | null
  source: 'web' | 'telegram'
  created_at: string
  claimed_at: string | null
  finished_at: string | null
}

export type Planner = {
  week: number
  steps: PlanStep[]
  scored: Map<string, Scored>
  focus: FocusCut
  prog: Map<string, StepProgress>
  own: Map<string, StepState>
  thisWeek: { done: number; total: number }
  whole: { done: number; total: number }
  /** People a website step can be handed to: the specialist, the market owners, and Rif. */
  assignees: string[]
  actions: LinkedAction[]
  evidence: Evidence
  markets: MarketSeo[]
}

const nowMyt = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

export function evidenceFrom(markets: MarketSeo[]): Evidence {
  const keywords: Evidence['keywords'] = []
  for (const m of markets) {
    for (const c of m.countries) {
      for (const k of c.keywords) {
        if (!k.q || isBrand(k.q)) continue
        keywords.push({ q: k.q, url: k.url, country: c.country, pos: k.pos, impr: k.impr ?? 0, clicks: k.traffic ?? 0, vol: k.vol })
      }
    }
  }
  return { keywords, funnel: markets.map(m => ({ market: m.market.key, sessions: m.sessions, leads: m.leads })) }
}

export const linkedFrom = (rows: ActionRow[]): LinkedAction[] =>
  rows.map(r => ({
    id: r.id, status: r.status, kind: String(r.how?.kind ?? ''), choice: r.decision?.choice ?? null,
    reason: r.decision?.reason ?? null, owner: r.owner, market: r.market,
  }))

export async function stepStates(): Promise<Map<string, StepState>> {
  if (!supabaseConfigured) return new Map()
  const { data } = await supabase.from('mw_seo_step_state').select('step_id, stage, reason, assignee')
  return new Map((data ?? []).map((r: any) => [String(r.step_id), { stage: r.stage, reason: r.reason, assignee: r.assignee }]))
}

export async function loadPlanner(pre?: { rows?: ActionRow[]; markets?: MarketSeo[] }): Promise<Planner> {
  const [rows, markets, own] = await Promise.all([
    pre?.rows ? Promise.resolve(pre.rows) : getActions('seo'),
    pre?.markets ? Promise.resolve(pre.markets) : getMarketSeo(),
    stepStates(),
  ])
  const evidence = evidenceFrom(markets)
  const actions = linkedFrom(rows.filter(r => r.source === 'generated'))
  const scored = new Map(scoreSteps(STEPS, evidence).map(s => [s.step.id, s]))
  const focus = focusCut(STEPS, evidence)
  const prog = new Map(STEPS.map(s => [s.id, progressOf(s, own, actions)]))
  const week = weekOf(nowMyt())
  const owners = new Set<string>([SPECIALIST_SEED.pages ?? 'Dinesh'])
  for (const m of MARKETS) if (m.owner) owners.add(m.owner)
  for (const r of rows) if (r.owner) owners.add(r.owner)
  return {
    week, steps: STEPS, scored, focus, prog, own, actions, evidence, markets,
    thisWeek: tally(thisWeek(STEPS, week, prog), prog),
    whole: tally(STEPS, prog),
    assignees: [...owners, 'Me'],
  }
}

/** The step list for a cut, and where the card should open. */
export function viewOf(p: Planner, cut: 'focus' | 'all', want?: string) {
  const list = orderFor(cut, p.steps, p.focus)
  const step = (want && list.find(s => s.id === want)) || (want && STEP[want]) || currentStep(list, p.prog)
  const inList = list.includes(step)
  return { list, step, inList, nav: neighbours(inList ? list : p.steps, step.id) }
}

// ───────────────────────────────────────────────────────────── inbox

export async function latestForStep(stepId: string, n = 3): Promise<InboxRow[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_claude_inbox')
    .select('id, step_id, prompt, status, result, result_links, error, source, created_at, claimed_at, finished_at')
    .eq('step_id', stepId).order('created_at', { ascending: false }).limit(n)
  return (data ?? []) as InboxRow[]
}

export async function recentInbox(n = 5): Promise<InboxRow[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_claude_inbox')
    .select('id, step_id, prompt, status, result, result_links, error, source, created_at, claimed_at, finished_at')
    .order('created_at', { ascending: false }).limit(n)
  return (data ?? []) as InboxRow[]
}

export async function getInbox(id: number): Promise<InboxRow | null> {
  if (!supabaseConfigured) return null
  const { data } = await supabase.from('mw_claude_inbox')
    .select('id, step_id, prompt, status, result, result_links, error, source, created_at, claimed_at, finished_at')
    .eq('id', id).maybeSingle()
  return (data ?? null) as InboxRow | null
}

/** The frozen pack for one step. */
export async function contextFor(p: Planner, stepId: string, prompt: string): Promise<ContextPack> {
  const step = STEP[stepId]
  const [proposals, previous, raw] = await Promise.all([
    openProposals().catch(() => []),
    latestForStep(stepId, 3),
    supabase.from('mw_market_seo').select('cycle, market, country, keywords'),
  ])
  const rows = (raw.data ?? []) as any[]
  const cycle = rows.map(r => String(r.cycle)).sort().pop() ?? ''
  const owners = Object.fromEntries(MARKETS.map(m => [m.key, m.owner ?? null]))
  return buildContext({
    step, prompt,
    gain: p.scored.get(stepId)?.gain ?? null,
    gsc: p.evidence.keywords.map(k => ({ q: k.q, url: k.url, country: k.country, pos: k.pos, impr: k.impr, clicks: k.clicks })),
    ranked: rankedByPage(rows, cycle),
    funnel: p.evidence.funnel,
    linked: p.actions.filter(a => step.links && ((step.links.kinds ?? []).includes(a.kind) || (step.links.actionIds ?? []).includes(a.id))),
    proposals: proposals.map(x => ({ id: x.id, url: x.url, status: x.status, now_: x.now_ })),
    previous: previous.map(x => ({ id: x.id, prompt: x.prompt, status: x.status, result: x.result })),
    owners,
    builtAt: new Date().toISOString(),
  })
}

/**
 * Put a prompt in the inbox. Idempotent within a minute: a double tap, a
 * resubmitted form or a Telegram retry lands on the same row.
 */
export async function queuePrompt(o: {
  stepId: string | null; prompt: string; by: string; source: 'web' | 'telegram'; chatId?: number | null; parentId?: number | null
}): Promise<{ id: number | null; duplicate: boolean }> {
  const prompt = o.prompt.trim().slice(0, 4000)
  if (!prompt) return { id: null, duplicate: false }
  const p = await loadPlanner()
  const context = o.stepId && STEP[o.stepId] ? await contextFor(p, o.stepId, prompt) : { v: 1, ownerPrompt: prompt, guardrails: [] }
  const minute = new Date().toISOString().slice(0, 16)
  const { createHash } = await import('node:crypto')
  const key = createHash('sha1').update(`${o.stepId}|${prompt}|${minute}|${o.source}`).digest('hex')
  const { data, error } = await supabase.from('mw_claude_inbox').upsert({
    step_id: o.stepId, prompt, context, created_by: o.by, source: o.source,
    telegram_chat_id: o.chatId ?? null, idempotency_key: key, parent_id: o.parentId ?? null,
  }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id')
  if (error) throw new Error(error.message)
  if (data?.length) return { id: Number(data[0].id), duplicate: false }
  const { data: had } = await supabase.from('mw_claude_inbox').select('id').eq('idempotency_key', key).maybeSingle()
  return { id: had ? Number(had.id) : null, duplicate: true }
}

export async function cancelQueued(id: number): Promise<boolean> {
  const { data } = await supabase.from('mw_claude_inbox').update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'queued').select('id')
  return !!data?.length
}

/** Plan-owned steps only. A linked step's stage belongs to its market tasks. */
export async function saveStepState(stepId: string, patch: Partial<{ stage: string; reason: string | null; assignee: string | null }>, by: string): Promise<boolean> {
  const step = STEP[stepId]
  if (!step) return false
  if (patch.stage && step.links) return false
  const have = (await stepStates()).get(stepId)
  await supabase.from('mw_seo_step_state').upsert({
    step_id: stepId,
    stage: patch.stage ?? have?.stage ?? 'not_started',
    reason: patch.reason !== undefined ? patch.reason : have?.reason ?? null,
    assignee: patch.assignee !== undefined ? patch.assignee : have?.assignee ?? null,
    updated_by: by, updated_at: new Date().toISOString(),
  }, { onConflict: 'step_id' })
  return true
}
