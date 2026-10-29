// Monday, step 0c of the weekly build: the #Website Leads posts from Zoho Cliq.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/cliq-leads.mts --since              # newest stored post: fetch after it
//   npx -y tsx --conditions=react-server --env-file=.env scripts/cliq-leads.mts <messages.json> ...  # parse and store
//   npx -y tsx --conditions=react-server --env-file=.env scripts/cliq-leads.mts --relink             # re-match stored rows to CRM leads
//   npx -y tsx --conditions=react-server --env-file=.env scripts/cliq-leads.mts --parsed <rows.json> # rows already parsed in the browser
//
// --parsed takes { D: [strings], rows: [[time, idSuffix, form, emailHash, role, country,
// interest, source, medium, page, intent, reason, isBuyer]] } (indexes into D, -1 = none):
// the 29 Oct 2026 backfill was parsed inside the Cliq tab with lib/mw-cliq.ts, so only
// these fields ever left it.
//
// The messages come from the Rifat-MCP Cliq tools ("Get Messages" on the
// Website Leads channel), saved as JSON — read-only, nothing is posted back.
// Any of these shapes: [msg, …], { data: [msg, …] }, { messages: [msg, …] };
// a msg has id, time (epoch ms or ISO) and content.text, text or message.
// Re-running a file is safe: rows are keyed on the Cliq message id.

import { readFileSync } from 'fs'
import { supabase } from '../lib/supabase'
import { parseLead, hashEmail, type CliqLead } from '../lib/mw-cliq'

const args = process.argv.slice(2)

async function leadIdsByHash(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase.from('mw_leads').select('id, email, created_time').not('email', 'is', null)
      .order('created_time', { ascending: true }).range(off, off + 999)
    if (error) throw new Error(`mw_leads: ${error.message}`)
    // Oldest first, so a repeat enquirer maps to the newest CRM lead.
    for (const r of data ?? []) out.set(hashEmail(String(r.email)), String(r.id))
    if (!data || data.length < 1000) break
  }
  return out
}

const row = (l: CliqLead, ids: Map<string, string>) => ({
  msg_id: l.msgId, at: l.at, form: l.form, email_hash: l.emailHash, role: l.role, country: l.country,
  interest: l.interest, source: l.source, medium: l.medium, page: l.page, is_buyer: l.isBuyer,
  intent: l.intent, intent_reason: l.intentReason,
  lead_id: l.emailHash ? ids.get(l.emailHash) ?? null : null, synced_at: new Date().toISOString(),
})

if (args.includes('--since')) {
  const { data, error } = await supabase.from('mw_cliq_leads').select('at').order('at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  console.log(data?.at ? `newest stored post: ${data.at} (${Date.parse(data.at)} ms) — fetch messages after it` : 'nothing stored yet — fetch the whole history')
} else if (args.includes('--relink')) {
  const ids = await leadIdsByHash()
  const { data } = await supabase.from('mw_cliq_leads').select('msg_id, email_hash').is('lead_id', null).not('email_hash', 'is', null)
  let n = 0
  for (const r of data ?? []) {
    const id = ids.get(String(r.email_hash))
    if (id) { await supabase.from('mw_cliq_leads').update({ lead_id: id }).eq('msg_id', r.msg_id); n++ }
  }
  console.log(`matched ${n} of ${data?.length ?? 0} unmatched posts to CRM leads`)
} else if (args.includes('--parsed')) {
  const j = JSON.parse(readFileSync(args[args.indexOf('--parsed') + 1], 'utf8')) as { D: string[]; rows: any[][] }
  const g = (i: number) => (i < 0 ? null : j.D[i])
  const leads: CliqLead[] = j.rows.map(r => ({
    msgId: `${r[0]}_${r[1]}`, at: new Date(Number(r[0])).toISOString(), form: g(r[2]), emailHash: r[3] || null,
    role: g(r[4]), country: g(r[5]), interest: g(r[6]), source: g(r[7]), medium: g(r[8]), page: g(r[9]),
    intent: g(r[10]) as CliqLead['intent'], intentReason: g(r[11]) ?? '', isBuyer: r[12] === 1,
  }))
  await store(leads, leads.length)
} else {
  const files = args.filter(a => !a.startsWith('--'))
  if (!files.length) { console.log('give a messages JSON file, --since or --relink'); process.exit(1) }
  const msgs = files.flatMap(f => {
    const j = JSON.parse(readFileSync(f, 'utf8'))
    return (Array.isArray(j) ? j : j.data ?? j.messages ?? []) as any[]
  })
  const leads = msgs.map(m => parseLead({
    id: String(m.id ?? m.message_id ?? m.msg_id),
    time: m.time ?? m.ts ?? m.created_time ?? m.timestamp,
    text: String(m.content?.text ?? m.text ?? m.message ?? m.content ?? ''),
  })).filter((l): l is CliqLead => !!l)
  await store(leads, msgs.length)
}

async function store(leads: CliqLead[], messages: number) {
  const ids = await leadIdsByHash()
  const rows = [...new Map(leads.map(l => [l.msgId, row(l, ids)])).values()]
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('mw_cliq_leads').upsert(rows.slice(i, i + 500), { onConflict: 'msg_id' })
    if (error) throw new Error(`mw_cliq_leads: ${error.message}`)
  }
  const by = (k: string) => rows.filter(r => r.intent === k).length
  console.log(`${messages} messages · ${rows.length} leads stored · ${rows.filter(r => r.is_buyer).length} buyers · ` +
    `${rows.filter(r => r.lead_id).length} matched to a CRM lead · intent high ${by('high')}, medium ${by('medium')}, low ${by('low')}, not a buyer ${by('not a buyer')}`)
}
