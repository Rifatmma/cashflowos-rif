// Monday, last step: save the finished cards.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/mw-week-save.mts docs/week/2026-W44.json
//
// Refuses any card that is not finished: no steps, no done-when, or a step
// that hands the reader a concept instead of an action. A card the owner has
// to think about is the card he called useless.

import { readFileSync } from 'fs'
import { isReady, checkPaid, type WeekTask } from '../lib/mw-week'
import { saveTasks } from '../lib/mw-week-store'

const file = process.argv[2]
if (!file) { console.error('usage: mw-week-save.mts docs/week/<week>.json'); process.exit(1) }
const doc = JSON.parse(readFileSync(file, 'utf8')) as { week: string; cards: (WeekTask & { evidence?: unknown })[] }

const VAGUE = /\b(consider|analy[sz]e|explore|think about|look into|investigate|review the data)\b/i
const problems: string[] = []
const cards: WeekTask[] = []
for (const { evidence: _e, ...t } of doc.cards) {
  // A card the run rejected is saved as it is — that is what keeps its topic out of later weeks.
  if (t.state === 'cant') {
    if (!t.reason) problems.push(`${t.id}: a rejected card needs its reason`)
    else cards.push(t)
    continue
  }
  if (!isReady(t)) { problems.push(`${t.id}: no steps or no done-when`); continue }
  const vague = t.steps.find(s => VAGUE.test(s))
  if (vague) { problems.push(`${t.id}: vague step — "${vague.slice(0, 80)}"`); continue }
  if ((t.kind === 'content-new' || t.kind === 'content-improve') && !t.links.some(l => /docs\.google\.com/.test(l.url))) {
    problems.push(`${t.id}: a content card needs its Google Doc link`); continue
  }
  if (t.kind === 'paid-apply') {
    const c = checkPaid(t.payload)
    if (!c.ok) { problems.push(`${t.id}: ${c.errors.join('; ')}`); continue }
  }
  cards.push(t)
}

if (problems.length) {
  console.error(`Not saved — ${problems.length} card(s) unfinished:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
const n = await saveTasks(cards, 'claude')
console.log(`${doc.week}: saved ${n} cards`)
