// 👉 What Claude is told when a planner step is sent to it.
//
// A prompt typed on a phone — "fix this" — is useless on its own. The pack is
// everything a session needs to do the step properly without asking: the
// step, the pages, the rankings that must survive, the live numbers, the
// market tasks already open, and the rules. It is frozen into the inbox row
// at send time, so the card can always show exactly what Claude was told.
//
// Pure module: inputs in, pack out. The server loader is in
// lib/mw-seo-planner.ts.

import { GUARDRAILS, PLAN_VERSION, CHAPTERS, withGuardrails, type PlanStep, type Gain, type LinkedAction } from './mw-seo-plan'
import { bandOf, type RankedTerm } from './mw-seo-protect'

export const CONTEXT_VERSION = 1
/** A pack bigger than this is trimmed; Claude can fetch more itself. */
export const CONTEXT_CAP = 30_000
const GSC_PER_URL = 15

export type GscRow = { q: string; url: string; country: string; pos: number; impr: number; clicks: number }

export type ContextInputs = {
  step: PlanStep
  prompt: string
  gain: Gain | null
  /** Every non-brand GSC row this cycle. Filtered here to what the step touches. */
  gsc: GscRow[]
  /** rankedByPage() output, for the protected terms. */
  ranked: Map<string, RankedTerm[]>
  funnel: { market: string; sessions: number; leads: number }[]
  linked: LinkedAction[]
  proposals: { id: string; url: string; status: string; now_: string }[]
  previous: { id: number; prompt: string; status: string; result: string | null }[]
  owners: Record<string, string | null>
  builtAt: string
}

export type ContextPack = {
  v: number
  planVersion: number
  builtAt: string
  step: { id: string; chapter: string; title: string; why: string; who: string; doneWhen: string; files: string[]; apply: string | null }
  ownerPrompt: string
  /** What Claude should actually do: the owner's words plus the guardrails line. */
  task: string
  expectedGain: string | null
  targets: string[]
  protected: { url: string; q: string; pos: number; band: string }[]
  gsc: GscRow[]
  funnel: { market: string; sessions: number; leads: number; owner: string | null }[]
  linkedActions: { id: string; kind: string; owner: string | null; market: string | null; status: string; choice: string | null; reason: string | null }[]
  openProposals: { id: string; url: string; status: string; change: string }[]
  dataGaps: string[]
  previous: { id: number; prompt: string; status: string; result: string | null }[]
  guardrails: string[]
  howToReply: string
}

const pathOf = (u: string) => String(u || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0].replace(/\/$/, '') || '/'

const HOW_TO_REPLY =
  'Write the result back to mw_claude_inbox.result as plain text, leading with one line: what you did / what Rif or the applier needs to do / how to check. ' +
  'Put changed files, proposal ids and draft paths in result_links, and 2–3 suggested follow-up prompts in result_links.next as [{label, prompt}] — short labels, full prompts. ' +
  'Suggest only follow-ups that follow from what you found; never suggest publishing to movingwalls.com.'

/** The pages a step is about: its own urls plus the url fragments of its targets. */
function pagesOf(step: PlanStep): string[] {
  const out = new Set<string>()
  for (const u of step.urls ?? []) out.add(u)
  for (const t of step.targets ?? []) if (t.url && t.url.startsWith('/')) out.add(t.url)
  return [...out]
}

function touches(step: PlanStep, r: GscRow): boolean {
  const pages = pagesOf(step)
  if (pages.some(p => pathOf(r.url).startsWith(p) || r.url.includes(p))) return true
  return (step.targets ?? []).some(t => {
    const q = r.q.toLowerCase()
    const hit = t.q.startsWith('~') ? q.includes(t.q.slice(1)) : q === t.q
    return hit && (!t.url || r.url.includes(t.url)) && (!t.country || r.country === t.country)
  })
}

export function buildContext(i: ContextInputs): ContextPack {
  const s = i.step
  const chapter = CHAPTERS.find(c => c.n === s.chapter)?.title ?? String(s.chapter)

  // GSC rows the step touches, the strongest first, capped per URL.
  const perUrl = new Map<string, number>()
  const gsc = i.gsc
    .filter(r => touches(s, r))
    .sort((a, b) => b.impr - a.impr || a.pos - b.pos)
    .filter(r => {
      const n = perUrl.get(r.url) ?? 0
      if (n >= GSC_PER_URL) return false
      perUrl.set(r.url, n + 1)
      return true
    })

  // Protected terms on the pages the step will touch. Locked and Protect only:
  // Watch binds nothing, and a list where everything is protected protects nothing.
  const urls = new Set([...pagesOf(s), ...gsc.map(r => pathOf(r.url))])
  const prot: ContextPack['protected'] = []
  for (const [url, terms] of i.ranked) {
    const p = pathOf(url)
    if (![...urls].some(u => p === u || p.startsWith(u + '/') || (u.length > 1 && p.includes(u)))) continue
    for (const t of terms) {
      const band = bandOf(t)
      if (band === 'watch') continue
      prot.push({ url: p, q: t.q, pos: t.pos, band })
    }
  }
  prot.sort((a, b) => a.pos - b.pos)

  const dataGaps: string[] = []
  if (gsc.some(r => r.impr && !r.clicks)) dataGaps.push('Search Console rows carry impressions, not monthly volume. Semrush volume is only present where a CSV was imported.')
  if (!i.gain || !i.gain.rows) dataGaps.push('The planner had no evidence rows to estimate this step\'s gain — its place in the order is a guess.')

  const pack: ContextPack = {
    v: CONTEXT_VERSION,
    planVersion: PLAN_VERSION,
    builtAt: i.builtAt,
    step: { id: s.id, chapter, title: s.title, why: s.why, who: s.who, doneWhen: s.doneWhen, files: s.files ?? [], apply: s.apply ?? null },
    ownerPrompt: i.prompt,
    task: withGuardrails(i.prompt),
    expectedGain: i.gain && i.gain.leads > 0 ? `${i.gain.basis} (≈${i.gain.leads.toFixed(1)} enquiries a month — a model, not a promise)` : null,
    targets: (s.targets ?? []).map(t => `${t.q.replace(/^~/, 'contains: ')}${t.url ? ` on ${t.url}` : ''}${t.country ? ` (${t.country})` : ''} → ${t.to > 0 ? `#${t.to}` : 'better CTR'}`),
    protected: prot.slice(0, 60),
    gsc,
    funnel: (s.funnel ?? []).map(m => {
      const f = i.funnel.find(x => x.market === m)
      return { market: m, sessions: f?.sessions ?? 0, leads: f?.leads ?? 0, owner: i.owners[m] ?? null }
    }),
    linkedActions: i.linked.slice(0, 30).map(a => ({ id: a.id, kind: a.kind, owner: a.owner, market: a.market, status: a.status, choice: a.choice, reason: a.reason })),
    openProposals: i.proposals
      .filter(p => [...urls].some(u => pathOf(p.url).startsWith(u)))
      .slice(0, 20)
      .map(p => ({ id: p.id, url: pathOf(p.url), status: p.status, change: String(p.now_ ?? '').slice(0, 200) })),
    dataGaps,
    previous: i.previous.slice(0, 3).map(p => ({ ...p, result: p.result ? p.result.slice(0, 1200) : null })),
    guardrails: GUARDRAILS,
    howToReply: HOW_TO_REPLY,
  }
  return capped(pack)
}

/** Trim the bulky lists until the pack fits. The step and the rules are never cut. */
export function capped(p: ContextPack, cap = CONTEXT_CAP): ContextPack {
  const size = () => JSON.stringify(p).length
  while (size() > cap && p.gsc.length > 5) p.gsc = p.gsc.slice(0, Math.floor(p.gsc.length * 0.7))
  while (size() > cap && p.protected.length > 10) p.protected = p.protected.slice(0, Math.floor(p.protected.length * 0.7))
  while (size() > cap && p.linkedActions.length > 5) p.linkedActions = p.linkedActions.slice(0, Math.floor(p.linkedActions.length * 0.7))
  if (size() > cap) p.previous = p.previous.map(x => ({ ...x, result: x.result ? x.result.slice(0, 300) : null }))
  return p
}

/** The few lines shown under "What Claude will be told". */
export function contextSummary(p: ContextPack): string[] {
  const out: string[] = []
  if (p.targets.length) out.push(`${p.targets.length} target search${p.targets.length === 1 ? '' : 'es'}`)
  if (p.gsc.length) out.push(`${p.gsc.length} Search Console rows`)
  if (p.protected.length) out.push(`${p.protected.length} protected rankings it must not lose`)
  if (p.funnel.length) out.push(`funnel numbers for ${p.funnel.map(f => f.market).join(', ')}`)
  if (p.linkedActions.length) out.push(`${p.linkedActions.length} related market tasks`)
  if (p.openProposals.length) out.push(`${p.openProposals.length} open page proposals`)
  if (p.previous.length) out.push(`the last ${p.previous.length} replies on this step`)
  out.push(`${p.guardrails.length} guardrails`)
  return out
}
