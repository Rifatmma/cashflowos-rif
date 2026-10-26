// Monday, step 1: pick this week's cards. Writes nothing to the database.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/mw-week-pick.mts [YYYY-MM-DD]
//
// Output: docs/week/<week>.json — every card for the week (carried + newly
// picked) with the queue evidence the Monday run needs to write its steps.
// The run fills `steps`, `links`, `doneWhen` and `payload`, then saves with
// scripts/mw-week-save.mts. See .claude/skills/mw-week-build/SKILL.md.

import { mkdirSync, writeFileSync } from 'fs'
import { loadStack } from '../lib/mw-priority-load'
import { pickWeek, isoWeek } from '../lib/mw-week'
import { openBefore, weekTasks, ruledOutIds } from '../lib/mw-week-store'

const today = process.argv[2] ?? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
const week = isoWeek(today)

const stack = await loadStack()
const [earlier, already, ruledOut] = await Promise.all([openBefore(week), weekTasks(week), ruledOutIds()])
const w = pickWeek({ week, queue: stack.queue.items, open: [...earlier, ...already], people: stack.people, ruledOut })

const byId = new Map(stack.queue.items.map(c => [c.id, c]))
const cards = [...w.carried, ...w.picked].map(t => {
  const c = t.sourceId ? byId.get(t.sourceId) : undefined
  return {
    ...t,
    evidence: c ? { source: c.source, channel: c.channel, valueLabel: c.valueLabel, href: c.href ?? null, prompt: c.prompt ?? null, helper: c.helper ?? null } : null,
  }
})

mkdirSync('docs/week', { recursive: true })
const out = `docs/week/${week}.json`
writeFileSync(out, JSON.stringify({ week, pickedAt: new Date().toISOString(), load: w.load, cards,
  forClaude: w.forClaude.map(c => ({ id: c.id, title: c.title, why: c.why, prompt: c.prompt ?? null, value: c.value })), waiting: w.waiting.slice(0, 40).map(c => ({ id: c.id, owner: c.owner, title: c.title, value: c.value })) }, null, 2))

console.log(`${week}: ${w.carried.length} carried, ${w.picked.length} new, ${w.forClaude.length} for Claude, ${w.waiting.length} waiting → ${out}`)
for (const [who, l] of Object.entries(w.load)) console.log(`  ${who.padEnd(10)} ${l.cards}/${l.cap}`)
for (const c of cards) console.log(`  ${c.owner.padEnd(10)} ${c.kind.padEnd(16)} ${c.title.slice(0, 80)}`)
