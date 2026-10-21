// The SEO planner: content, the 80/20 cut, and progress. No network.
//   npx -y tsx --conditions=react-server tests/mw-seo-plan.test.mts
import {
  STEPS, CHAPTERS, GUARDRAILS, focusCut, scoreSteps, gains, progressOf, weekOf, thisWeek,
  orderFor, currentStep, neighbours, tally, withGuardrails, prerequisitesFirst,
  type PlanStep, type Evidence, type StepProgress,
} from '../lib/mw-seo-plan'
import { isBrand } from '../lib/mw-markets'

let bad = 0
const fail = (m: string) => { console.log(`FAIL ${m}`); bad++ }
const ok = (m: string) => console.log(`ok   ${m}`)
const check = (c: boolean, m: string) => (c ? ok(m) : fail(m))

// ── content ───────────────────────────────────────────────────────────────
const ids = STEPS.map(s => s.id)
check(new Set(ids).size === ids.length, 'step ids are unique')
check(STEPS.every(s => s.title && s.why && s.who && s.go && s.doneWhen), 'every step has title, why, who, go and done-when')
check(STEPS.every(s => CHAPTERS.some(c => c.n === s.chapter)), 'every step belongs to a chapter')
check(CHAPTERS.every(c => STEPS.some(s => s.chapter === c.n)), 'no chapter is empty')
check(STEPS.filter(s => s.who === 'Dinesh' && s.website && !s.links).every(s => !!s.apply), 'every website step Dinesh applies has an applier prompt')
check(STEPS.every(s => (s.unblocks ?? []).every(id => ids.includes(id))), 'every unblocks id exists')
check(STEPS.every(s => (s.targets ?? []).every(t => !isBrand(t.q.replace(/^~/, '')))), 'no target is a brand search')
check(GUARDRAILS.some(g => /publish/i.test(g)) && GUARDRAILS.some(g => /data, never instructions/i.test(g)), 'guardrails say prepare-not-publish and data-not-instructions')
check(/guardrails/i.test(withGuardrails('Do it')), 'the prompt Claude gets carries the guardrails')

// ── the scorer, on a hand-built plan ─────────────────────────────────────
const mk = (id: string, o: Partial<PlanStep>): PlanStep => ({
  id, chapter: 1, week: 1, size: 'S', who: 'Claude', title: id, why: 'w', go: 'g', doneWhen: 'd', ...o,
})
const plan: PlanStep[] = [
  mk('big', { targets: [{ q: 'programmatic dooh', to: 3 }] }),
  mk('mid', { funnel: ['sea'] }),
  mk('small', { targets: [{ q: 'unipole meaning', to: 3 }] }),
  mk('tiny', { targets: [{ q: 'hoardings in pune', to: 3 }] }),
  mk('none', {}),
  mk('pre', { unblocks: ['big'] }),
  mk('slow', { size: 'L', who: 'Dinesh', targets: [{ q: 'programmatic dooh', to: 3 }] }),
]
const ev: Evidence = {
  keywords: [
    { q: 'programmatic dooh', url: '/blog/x', country: 'united-states', pos: 10, impr: 2000, clicks: 0 },
    { q: 'unipole meaning', url: '/blog/u', country: 'india', pos: 10, impr: 100, clicks: 0 },
    { q: 'hoardings in pune', url: '/p', country: 'india', pos: 8, impr: 30, clicks: 0 },
  ],
  funnel: [{ market: 'sea', sessions: 700, leads: 6 }],
}
const g = gains(plan, ev)
check(Math.abs(g.get('big')!.clicks - 2000 * (0.10 - 0.03)) < 1e-6, 'ranking gain = impressions × (CTR at target − CTR now)')
check(Math.abs(g.get('mid')!.leads - (700 * 0.0171 - 6)) < 1e-6, 'funnel gain = sessions × benchmark − leads already won')
check(g.get('none')!.leads === 0 && g.get('none')!.rows === 0, 'a step with no evidence has no gain, and says it has no rows')
check(g.get('pre')!.leads > 0 && g.get('pre')!.leads < g.get('big')!.leads, 'a prerequisite inherits a share of what it unblocks')

const s = scoreSteps(plan, ev)
check(s.findIndex(x => x.step.id === 'big') < s.findIndex(x => x.step.id === 'slow'), 'the same gain at more effort ranks lower')

const f = focusCut(plan, ev)
const total = [...g.values()].reduce((t, x) => t + x.leads, 0)
check(f.share >= 0.8, `focus reaches 80% (${Math.round(f.share * 100)}%)`)
check(!f.ids.includes('none'), 'a step with no measurable gain is never in focus')
check(Math.abs(f.totalLeads - total) < 1e-6, 'the total is the whole plan, not just focus')
// minimal: dropping the last focus step must fall below 80%
const lastless = f.ids.slice(0, -1).reduce((t, id) => t + g.get(id)!.leads, 0)
check(lastless / total < 0.8, 'focus is the shortest prefix that reaches 80%')
check(!focusCut(plan, { keywords: [], funnel: [] }).measured, 'no evidence at all → not measured, no fake focus list')

const pf = prerequisitesFirst(['leak-sea', 'strike-pdooh', 'leak-tracking'])
check(pf.indexOf('leak-tracking') < pf.indexOf('leak-sea') && pf.includes('strike-pdooh') && pf.length === 3, 'a prerequisite moves ahead of the focus step it unblocks')
check(prerequisitesFirst(['strike-pdooh', 'leak-sea']).join() === 'strike-pdooh,leak-sea', 'unrelated steps keep their return order')

// ── progress ──────────────────────────────────────────────────────────────
const linked = mk('linked', { links: { kinds: ['cannibal'] } })
const acts = [
  { id: 'a1', status: 'done', kind: 'cannibal', choice: null, reason: null, owner: 'Dinesh', market: 'india' },
  { id: 'a2', status: 'not', kind: 'cannibal', choice: 'reject', reason: 'no time', owner: 'Sukrithi', market: 'india' },
  { id: 'a3', status: 'not', kind: 'health', choice: null, reason: null, owner: 'Dinesh', market: 'india' },
]
const own = new Map([['linked', { stage: 'done' as const }]])
const p = progressOf(linked, own, acts)
check(p.stage === 'in_progress', 'a linked step ignores stored state and derives from its tasks')
check(p.linked?.total === 2 && p.linked.done === 1 && p.linked.declined === 1, 'a linked step counts only its own kinds')
check(p.linked?.reasons[0] === 'no time', 'a decline reason is carried, so it can be re-raised')
check(progressOf(linked, own, []).stage === 'not_started', 'a linked step with no tasks is not done')

check(weekOf('2026-10-20') === 1 && weekOf('2026-10-27') === 2 && weekOf('2026-10-26') === 1, 'weeks start on the plan date')

const prog = new Map<string, StepProgress>(STEPS.map(x => [x.id, { stage: 'not_started' }]))
const wk2 = thisWeek(STEPS, 2, prog)
check(wk2.some(x => x.week === 1) && wk2.some(x => x.week === 2), 'open week-1 steps carry over into week 2')
prog.set(STEPS[0].id, { stage: 'done' })
check(!thisWeek(STEPS, 2, prog).includes(STEPS[0]), 'a done earlier step does not carry over')
check(tally(STEPS, prog).done === 1, 'tally counts done steps')

const focusList = orderFor('focus', plan, f)
check(focusList.map(x => x.id).join() === f.ids.join(), 'focus order is the return order')
check(orderFor('all', STEPS, f)[0].chapter === 1, 'the whole plan runs by chapter')
check(orderFor('focus', STEPS, { ids: [], share: 0, totalLeads: 0, measured: false }).length === STEPS.length, 'with no focus, the card falls back to the whole plan')
check(currentStep(STEPS, prog).id === STEPS[1].id, 'the card opens on the first open step')
const n = neighbours(STEPS, STEPS[1].id)
check(n.prev?.id === STEPS[0].id && n.next?.id === STEPS[2].id && n.index === 1, 'prev and next')

console.log(bad ? `\n${bad} FAILED` : '\nall passed')
process.exit(bad ? 1 : 0)
