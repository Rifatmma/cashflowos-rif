// A plan run that writes nothing, so the effect of a change can be read
// before it reaches the board. Pass --save to commit it.
//
//   npx tsx --conditions=react-server --env-file=.env scripts/plan-dry.mts
//   npx tsx --conditions=react-server --env-file=.env scripts/plan-dry.mts --save
//
// The market name as a bare argument prints that market's tasks in full.
import { refreshPlan } from '../lib/mw-plan-run'

const save = process.argv.includes('--save')
const r = await refreshPlan({ save })
console.log('\n' + r.message + '\n')
for (const n of r.notes) console.log('  ·', n)

const per: Record<string, Record<string, number>> = {}
for (const t of r.tasks) {
  per[t.market] ??= {}
  per[t.market][t.kind] = (per[t.market][t.kind] ?? 0) + 1
}
console.log('\ntasks per market:')
for (const [m, k] of Object.entries(per).sort()) console.log(`  ${m.padEnd(13)} ${JSON.stringify(k)}`)

const show = process.argv.slice(2).find(a => !a.startsWith('--'))
if (show) {
  console.log(`\n--- ${show} ---`)
  for (const t of r.tasks.filter(t => t.market === show)) {
    console.log(`\n[${t.kind}] ${t.title}`)
    console.log(`  ${t.why}`)
  }
}
