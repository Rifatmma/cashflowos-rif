// Build this week's Monday emails WITHOUT sending, and write them to a folder.
//   npx -y tsx --conditions=react-server --env-file=.env scripts/digest-preview.mts <outdir>
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadStack } from '../lib/mw-priority-load'
import { forPerson } from '../lib/mw-priorities'
import { doers, bosses, OWNER_NAME } from '../lib/mw-people'
import { seenByPerson } from '../lib/mw-presence'
import { getTargets } from '../lib/mw-data'
import { stackSignals } from '../lib/mw-stack-signals'
import { personEmail, bossEmail, scorecardEmail, type Email, type TeamRow } from '../lib/mw-digest'

const out = process.argv[2] ?? 'digest-preview'
mkdirSync(out, { recursive: true })
const [stack, seen, targets] = await Promise.all([loadStack(), seenByPerson(), getTargets()])
const { queue, people } = stack
const base = 'https://cashflowos-rif.vercel.app'
const link = () => `${base}/api/mw-act?t=PREVIEW`
const cc = bosses(people).map(b => b.email)
const team = doers(people).filter(p => p.name !== OWNER_NAME)
const emails: Email[] = []
for (const p of team) { const e = personEmail(p, forPerson(queue, p.name), { appUrl: base, link, cc }); if (e) emails.push(e) }
const rows: TeamRow[] = doers(people).map(p => {
  const mine = queue.items.filter(x => x.owner === p.name); const s = seen.get(p.name)
  const d = s?.last ? Math.floor((Date.now() - Date.parse(s.last)) / 86_400_000) : null
  return { name: p.name, title: p.title, now: mine.filter(x => x.when === 'now').length, waiting: mine.filter(x => x.when === 'later').length, done: stack.doneThisWeek.get(p.name) ?? 0, lastOpened: d === null ? 'Never opened the app' : d === 0 ? 'Today' : `${d} days ago` }
})
const be = bossEmail(bosses(people), rows, queue.items, { appUrl: base }); if (be) emails.push(be)
const rif = people.find(p => p.name === OWNER_NAME)!
emails.push(scorecardEmail(rif, stackSignals({ channels: stack.facts.channels, utmFill: stack.facts.utmFill, paid: stack.facts.paid, cpaTarget: targets.cpa, leads14: stack.facts.leads14, unanswered14: stack.facts.unanswered14, markets: stack.markets, team, seen }).map(s => ({ label: s.label, value: s.value, note: s.note })), forPerson(queue, rif.name), { appUrl: base, link, cc: [] }))
const index: string[] = []
emails.forEach((e, i) => {
  const f = `${String(i + 1).padStart(2, '0')}-${e.kind}-${e.to.split('@')[0]}.html`
  writeFileSync(join(out, f), `<!doctype html><meta charset="utf-8"><title>${e.subject}</title><div style="font-family:Arial;font-size:13px;color:#555;border-bottom:1px solid #ddd;padding:8px 0;margin-bottom:12px"><b>To:</b> ${e.to}${e.cc.length ? ` · <b>Cc:</b> ${e.cc.join(', ')}` : ''}<br><b>Subject:</b> ${e.subject}</div>${e.html}`)
  index.push(`<li><a href="${f}">${e.subject}</a> — to ${e.to}</li>`)
})
writeFileSync(join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Monday emails preview</title><body style="font-family:Arial;max-width:640px;margin:30px auto"><h2>Monday emails — preview (nothing sent)</h2><ol>${index.join('')}</ol></body>`)
console.log(`${emails.length} emails written to ${out}`)
