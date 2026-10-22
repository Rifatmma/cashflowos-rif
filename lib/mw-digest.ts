// 👉 The Monday emails: each person's tasks, the team summary, Rif's scorecard.
//
//   "If they don't use the app then we can send them an email ... From my work
//    Gmail ... but please also cc Safwaan and Mehul so they're also in the loop"
//                                                        (owner, 21 Oct 2026)
//
// Short on purpose. A person's email is at most three tasks, each with one
// line of why, when it counts as done, and two links that work without
// signing in. Anything longer is a newsletter, and newsletters go unread.
//
// Pure: builds subjects and HTML; sending is lib/mw-digest-send.ts. Every
// value that came from data is escaped.

import type { Ranked } from './mw-priorities'
import type { Person } from './mw-people'

export type Email = { to: string; cc: string[]; subject: string; html: string; kind: 'person' | 'bosses' | 'scorecard' }

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${+h.toFixed(1)} h`)

const WRAP = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111827;max-width:600px">${inner}</div>`
const BTN = (href: string, label: string, primary: boolean) =>
  `<a href="${esc(href)}" style="display:inline-block;padding:7px 14px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;` +
  (primary ? 'background:#2563EB;color:#ffffff' : 'background:#ffffff;color:#111827;border:1px solid #D1D5DB') + `">${esc(label)}</a>`

export type LinkFor = (taskId: string, stage: 'done' | 'declined') => string

/** One person's week. At most three tasks: the ones that fit their week, most valuable first. */
export function personEmail(p: Person, tasks: Ranked[], o: { appUrl: string; link: LinkFor; cc: string[] }): Email | null {
  const now = tasks.filter(t => t.when === 'now').slice(0, 3)
  if (!now.length) return null
  const total = now.reduce((t, x) => t + x.effortHours, 0)
  const items = now.map((t, i) => `
    <div style="border-top:1px solid #E5E7EB;padding:14px 0">
      <div style="font-weight:bold;font-size:16px">${i + 1}. ${esc(t.title)}</div>
      <div style="color:#4B5563;margin:4px 0">${esc(t.why)}</div>
      <div style="color:#6B7280;font-size:13px;margin-bottom:8px">About ${hrs(t.effortHours)} · done when: ${esc(t.doneWhen)}</div>
      ${BTN(o.link(t.id, 'done'), 'Done', true)} &nbsp; ${BTN(o.link(t.id, 'declined'), "Can't do this", false)}
    </div>`).join('')
  const more = tasks.length - now.length
  return {
    kind: 'person', to: p.email, cc: o.cc,
    subject: `Your marketing tasks this week (${now.length})`,
    html: WRAP(`
      <p>Hi ${esc(p.name)},</p>
      <p>Here ${now.length === 1 ? 'is your task' : `are your ${now.length} tasks`} for this week, most valuable first — about ${hrs(total)} in all.
      Press <b>Done</b> when it is done, or <b>Can't do this</b> to say why. No sign-in needed.</p>
      ${items}
      <p style="color:#6B7280;font-size:13px;border-top:1px solid #E5E7EB;padding-top:12px">
        ${more > 0 ? `${more} more ${more === 1 ? 'task is' : 'tasks are'} waiting for next week. ` : ''}
        See everything on <a href="${esc(o.appUrl)}/mw/people/${encodeURIComponent(p.name)}">your page</a> — sign in with your work email.
      </p>`),
  }
}

export type TeamRow = { name: string; title: string; now: number; waiting: number; done: number; lastOpened: string }

/** For Mehul and Safwaan: who has looked, what is done, what is waiting. */
export function bossEmail(bosses: Person[], rows: TeamRow[], top: Ranked[], o: { appUrl: string }): Email | null {
  if (!bosses.length) return null
  const active = rows.filter(r => !/never/i.test(r.lastOpened)).length
  const done = rows.reduce((t, r) => t + r.done, 0)
  const tr = rows.map(r => `<tr>
      <td style="padding:6px 8px;border-top:1px solid #E5E7EB"><b>${esc(r.name)}</b><br><span style="color:#6B7280;font-size:12px">${esc(r.title)}</span></td>
      <td style="padding:6px 8px;border-top:1px solid #E5E7EB;text-align:right">${r.now}</td>
      <td style="padding:6px 8px;border-top:1px solid #E5E7EB;text-align:right">${r.waiting}</td>
      <td style="padding:6px 8px;border-top:1px solid #E5E7EB;text-align:right">${r.done}</td>
      <td style="padding:6px 8px;border-top:1px solid #E5E7EB;color:${/never/i.test(r.lastOpened) ? '#DC2626' : '#16A34A'}">${esc(r.lastOpened)}</td></tr>`).join('')
  const list = top.slice(0, 5).map(t => `<li>${esc(t.title)} — <span style="color:#6B7280">${esc(t.owner)}</span></li>`).join('')
  return {
    kind: 'bosses', to: bosses[0].email, cc: bosses.slice(1).map(b => b.email),
    subject: `Marketing team this week: ${active} of ${rows.length} opened the app · ${done} tasks done`,
    html: WRAP(`
      <p>The marketing team's week, from the task list and app visits.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="color:#6B7280;font-size:12px;text-align:left"><th style="padding:6px 8px">Person</th><th style="padding:6px 8px;text-align:right">This week</th><th style="padding:6px 8px;text-align:right">Waiting</th><th style="padding:6px 8px;text-align:right">Done (7 days)</th><th style="padding:6px 8px">Last opened</th></tr>
        ${tr}
      </table>
      <p style="margin-top:16px"><b>The five most valuable tasks right now</b></p>
      <ol>${list}</ol>
      <p style="color:#6B7280;font-size:13px">Full view: <a href="${esc(o.appUrl)}/mw/people">${esc(o.appUrl)}/mw/people</a></p>`),
  }
}

export type ScoreLine = { label: string; value: string; note: string }

/** Rif's Monday: the six numbers and his own tasks. */
export function scorecardEmail(rif: Person, lines: ScoreLine[], mine: Ranked[], o: { appUrl: string; link: LinkFor; cc: string[] }): Email {
  const table = lines.map(l => `<tr><td style="padding:5px 8px;border-top:1px solid #E5E7EB;color:#4B5563">${esc(l.label)}</td>
    <td style="padding:5px 8px;border-top:1px solid #E5E7EB;font-weight:bold">${esc(l.value)}</td>
    <td style="padding:5px 8px;border-top:1px solid #E5E7EB;color:#6B7280;font-size:13px">${esc(l.note)}</td></tr>`).join('')
  const tasks = personEmail(rif, mine, o)
  return {
    kind: 'scorecard', to: rif.email, cc: o.cc,
    subject: 'Marketing scorecard and your tasks this week',
    html: WRAP(`<p><b>This week's numbers</b></p><table style="border-collapse:collapse;width:100%;font-size:14px">${table}</table>`
      + (tasks ? tasks.html.replace(/^<div[^>]*>/, '<div>') : '<p>No tasks of yours this week.</p>')
      + `<p style="color:#6B7280;font-size:13px">Today: <a href="${esc(o.appUrl)}/mw">${esc(o.appUrl)}/mw</a></p>`),
  }
}

/** In preview, every email goes to Rif alone and says where it would have gone. */
export function asPreview(e: Email, rifEmail: string): Email {
  const banner = `<div style="background:#FEF3C7;color:#92400E;padding:10px 12px;border-radius:6px;margin-bottom:14px;font-family:Arial,sans-serif;font-size:13px">
    Preview — this would go to <b>${esc(e.to)}</b>${e.cc.length ? `, cc ${esc(e.cc.join(', '))}` : ''}. Nothing has been sent to them.</div>`
  return { ...e, to: rifEmail, cc: [], subject: `[Preview] ${e.subject}`, html: banner + e.html }
}
