// Print the one ranked list from live data.
//   npx -y tsx --conditions=react-server --env-file=.env scripts/stack-preview.mts
import { loadStack } from '../lib/mw-priority-load'
const s = await loadStack()
const q = s.queue
console.log(`candidates ranked: ${q.items.length} · focus ${q.focus.length} = ${Math.round(q.share * 100)}% of ${q.totalValue.toFixed(1)}`)
console.log('facts', JSON.stringify(s.facts.paid), 'utmFill', s.facts.utmFill, 'semrushAge', s.facts.semrushAgeDays, 'unanswered14', s.facts.unanswered14, '/', s.facts.leads14)
for (const x of q.items.slice(0, 22)) console.log(`${String(x.rank).padStart(2)} ${q.focus.includes(x.id) ? '★' : ' '} ${x.when.padEnd(5)} ${x.channel.padEnd(8)} ${x.owner.padEnd(9)} ${(x.market ?? '-').padEnd(9)} ${x.score.toFixed(2).padStart(6)} ${x.valueLabel.padEnd(30)} ${x.title.slice(0, 70)}`)
console.log('load', JSON.stringify(q.load))
