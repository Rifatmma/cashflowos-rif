import 'server-only'
// 👉 Sending the Monday emails — from Rif's work Gmail, and only after he has
// seen a preview.
//
// Two safety rails, both deliberate:
//  • PREVIEW UNTIL SWITCHED ON. Until mw_settings.digest.enabled is true,
//    every email goes to Rif alone, marked with who it would have gone to.
//    Nothing reaches the team until he has read the wording and flipped it.
//  • THE RIGHT SENDER OR NOTHING. Three Gmail accounts are connected to
//    Composio (two personal). Before any send, the connected account's own
//    address is checked against SENDER; a mismatch sends nothing at all.
//
// Once a week at most: the week sent is stored, so a cron retry or a second
// press cannot email the team twice.

import { supabase, supabaseConfigured } from './supabase'
import { runTool } from './composio-mcp'
import { appUrl } from './app-url'
import { getTargets } from './mw-data'
import { loadStack } from './mw-priority-load'
import { forPerson } from './mw-priorities'
import { doers, bosses, OWNER_NAME } from './mw-people'
import { seenByPerson } from './mw-presence'
import { stackSignals } from './mw-stack-signals'
import { signAct } from './mw-sign'
import { personEmail, bossEmail, scorecardEmail, asPreview, type Email, type TeamRow } from './mw-digest'

export const SENDER = 'rif-at.wanwang@movingwalls.com'
/** The Composio alias of Rif's work Gmail (checked against SENDER before every run). */
export const ACCOUNT = (process.env.MW_GMAIL_ACCOUNT || 'gmail_conics-abode').trim()

export type DigestSettings = { enabled: boolean; lastWeek: string | null }

export async function digestSettings(): Promise<DigestSettings> {
  if (!supabaseConfigured) return { enabled: false, lastWeek: null }
  const { data } = await supabase.from('mw_settings').select('value').eq('key', 'digest').maybeSingle()
  const v = (data?.value ?? {}) as any
  return { enabled: v.enabled === true, lastWeek: typeof v.lastWeek === 'string' ? v.lastWeek : null }
}

export async function saveDigestSettings(patch: Partial<DigestSettings>) {
  const cur = await digestSettings()
  await supabase.from('mw_settings').upsert(
    { key: 'digest', value: { ...cur, ...patch }, updated_at: new Date().toISOString() }, { onConflict: 'key' },
  )
}

/** ISO week in Malaysia time, e.g. 2026-W43. */
export function weekKey(d = new Date()): string {
  const t = new Date(d.getTime() + 8 * 3600_000)
  const day = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - day + 3)
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const wk = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`
}

export type DigestRun = { preview: boolean; sent: number; skipped: string[]; notes: string[] }

/**
 * Build every Monday email and send it.
 * `force` sends even if this week has gone out (the owner's "send preview now").
 */
export async function sendDigests(o: { previewOnly?: boolean; force?: boolean } = {}): Promise<DigestRun> {
  const notes: string[] = []
  const settings = await digestSettings()
  const preview = o.previewOnly || !settings.enabled
  const week = weekKey()
  if (!preview && !o.force && settings.lastWeek === week) {
    return { preview, sent: 0, skipped: [], notes: [`already sent for ${week}`] }
  }

  // The right sender or nothing.
  const profile = await runTool('GMAIL_GET_PROFILE', ACCOUNT, {})
  const from = String(profile?.emailAddress ?? '').toLowerCase()
  if (from !== SENDER) throw new Error(`Gmail account "${ACCOUNT}" is ${from || 'unknown'}, not ${SENDER} — nothing sent`)

  const secret = (process.env.APP_PASSCODE ?? '').trim()
  if (!secret) throw new Error('APP_PASSCODE is not set, so email links cannot be signed — nothing sent')
  const base = appUrl() || 'https://cashflowos-rif.vercel.app'

  const [stack, seen, targets] = await Promise.all([loadStack(), seenByPerson(), getTargets()])
  const { queue, people } = stack
  const bossList = bosses(people)
  const cc = bossList.map(b => b.email)
  const link = (email: string) => (id: string, stage: 'done' | 'declined') =>
    `${base}/api/mw-act?t=${encodeURIComponent(signAct({ id, by: email, stage }, secret))}`

  const emails: Email[] = []
  const skipped: string[] = []
  const team = doers(people).filter(p => p.name !== OWNER_NAME)
  for (const p of team) {
    const e = personEmail(p, forPerson(queue, p.name), { appUrl: base, link: link(p.email), cc })
    if (e) emails.push(e); else skipped.push(`${p.name}: nothing this week`)
  }

  const rows: TeamRow[] = doers(people).map(p => {
    const mine = queue.items.filter(x => x.owner === p.name)
    const s = seen.get(p.name)
    const days = s?.last ? Math.floor((Date.now() - Date.parse(s.last)) / 86_400_000) : null
    return {
      name: p.name, title: p.title, now: mine.filter(x => x.when === 'now').length,
      waiting: mine.filter(x => x.when === 'later').length, done: stack.doneThisWeek.get(p.name) ?? 0,
      lastOpened: days === null ? 'Never opened the app' : days === 0 ? 'Today' : `${days} days ago`,
    }
  })
  const be = bossEmail(bossList, rows, queue.items, { appUrl: base })
  if (be) emails.push(be)

  const rif = people.find(p => p.name === OWNER_NAME)
  if (rif) {
    const lines = stackSignals({
      channels: stack.facts.channels, utmFill: stack.facts.utmFill, paid: stack.facts.paid, cpaTarget: targets.cpa,
      leads14: stack.facts.leads14, unanswered14: stack.facts.unanswered14, markets: stack.markets, team, seen,
    }).map(s => ({ label: s.label, value: s.value, note: s.note }))
    emails.push(scorecardEmail(rif, lines, forPerson(queue, rif.name), { appUrl: base, link: link(rif.email), cc: [] }))
  }

  let sent = 0
  for (const raw of emails) {
    const e = preview ? asPreview(raw, SENDER) : raw
    try {
      await runTool('GMAIL_SEND_EMAIL', ACCOUNT, {
        recipient_email: e.to, cc: e.cc, subject: e.subject, body: e.html, is_html: true, include_signature: false,
      })
      sent++
    } catch (err: any) {
      notes.push(`${raw.to}: ${String(err?.message ?? err).slice(0, 120)}`)
    }
  }
  if (!preview && sent) await saveDigestSettings({ lastWeek: week })
  notes.push(`${preview ? 'preview to ' + SENDER : 'live'} · ${sent} of ${emails.length} sent · ${week}`)
  return { preview, sent, skipped, notes }
}
