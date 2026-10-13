// A plan run that writes nothing, so the effect of a change can be read
// before it reaches the board.
import { refreshPlan } from '../lib/mw-plan-run'

const r = await refreshPlan({ save: false })
console.log('\n' + r.message + '\n')
for (const n of r.notes) console.log('  ·', n)

const per: Record<string, Record<string, number>> = {}
for (const t of r.tasks) {
  per[t.market] ??= {}
  per[t.market][t.kind] = (per[t.market][t.kind] ?? 0) + 1
}
console.log('\ntasks per market:')
for (const [m, k] of Object.entries(per).sort()) console.log(`  ${m.padEnd(13)} ${JSON.stringify(k)}`)

const show = process.argv[2]
if (show) {
  console.log(`\n--- ${show} ---`)
  for (const t of r.tasks.filter(t => t.market === show)) {
    console.log(`\n[${t.kind}] ${t.title}`)
    console.log(`  ${t.why}`)
  }
}
