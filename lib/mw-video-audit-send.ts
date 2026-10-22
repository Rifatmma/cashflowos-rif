import 'server-only'
import { supabase, supabaseConfigured } from './supabase'
import { runTool } from './composio-mcp'
import { ACCOUNT, SENDER } from './mw-digest-send'
import { verdict, stillWrong, engineBugs, type Finding } from './mw-video-audit'

// 👉 After a Studio export: the video into a private bucket, the audit to Rif.
//
// Only when something is still wrong after the Studio's automatic fixes (a
// clean video sends nothing — Rif, 22 Oct 2026). Then the browser uploads the
// MP4 straight to Supabase Storage with a signed upload URL (a 5–9 MB file is
// too big for a server action), this signs a 30-day link and emails Rif from
// his work Gmail (the Monday emails' sender check). The team never sees any of
// it. Engine bugs are queued for Claude by app/mw/actions.ts before this runs.

export const BUCKET = 'mw-video-audits'
const DAYS = 30

async function ensureBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 50 * 1024 * 1024 })
  if (error && !/already exists/i.test(error.message)) throw new Error(`Storage bucket: ${error.message}`)
}

/** Where the browser puts this export: a path and a one-time signed upload URL. */
export async function uploadTarget(slug: string, fmt: string): Promise<{ path: string; url: string }> {
  if (!supabaseConfigured) throw new Error('Supabase is not configured.')
  await ensureBucket()
  const now = new Date().toISOString()
  const safe = slug.replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'video'
  const path = `${now.slice(0, 10)}/${safe}_${fmt.replace(/[^0-9a-z]/gi, '')}_${now.slice(11, 19).replace(/:/g, '')}.mp4`
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(`Upload link: ${error?.message ?? 'none'}`)
  return { path: data.path ?? path, url: data.signedUrl }
}

export type AuditMail = {
  title: string
  format: string
  path: string | null
  article: string
  findings: Finding[]
  fixed: Finding[]
  changed: string[]
  rounds: number
  loudness: { before: number; after: number } | null
  audioCodec: string
  reviewError?: string
  /** the inbox row the engine bugs went to, if any */
  inbox?: number | null
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const COL: Record<string, string> = { blocker: '#B32322', 'should fix': '#C77700', 'nice to have': '#2B3C92' }
const td = 'style="padding:6px 8px;border-bottom:1px solid #e3e6ef;vertical-align:top;font-size:13px"'
const th = 'style="padding:6px 8px;text-align:left;font-size:12px;color:#556;border-bottom:2px solid #2B3C92"'

function table(rows: Finding[], fixedCol = false) {
  return `<table style="border-collapse:collapse;width:100%"><tr>${['Severity', 'When · scene', 'What', 'Rule', 'Found by', ...(fixedCol ? ['Fixed in'] : [])].map(h => `<th ${th}>${h}</th>`).join('')}</tr>` +
    rows.map(q => `<tr><td ${td}><span style="color:${COL[q.severity]};font-weight:600">${q.severity}</span></td>` +
      `<td ${td}>${q.t != null ? `${q.t.toFixed(1)}s · ` : ''}${esc(q.scene || '—')}</td>` +
      `<td ${td}>${q.text ? `“${esc(q.text)}” ` : ''}${esc(q.detail)}</td><td ${td}><span style="font-size:12px;color:#556">${esc(q.rule)}</span></td>` +
      `<td ${td}>${esc(q.source)} · ${esc(q.kind)}</td>${fixedCol ? `<td ${td}>round ${q.fixedInRound ?? ''}</td>` : ''}</tr>`).join('') + '</table>'
}

/** The audit email to Rif, with a 30-day link to the export. Returns the link. */
export async function sendAuditMail(m: AuditMail): Promise<{ link: string | null }> {
  let link: string | null = null
  if (m.path) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.path, DAYS * 86400)
    link = data?.signedUrl ?? null
  }
  const wrong = stillWrong(m.findings), bugs = engineBugs(m.findings)
  const ask = wrong.filter(q => q.fix === 'approve')
  const open = wrong.filter(q => q.fix === 'auto' && !bugs.includes(q))
  const v = verdict(m.findings)
  const html = `<div style="font-family:Poppins,Arial,sans-serif;color:#1b2340;max-width:900px">
<h2 style="color:#2B3C92;margin:0 0 4px">Video audit — ${esc(m.title)} (${esc(m.format)})</h2>
<p style="margin:0 0 12px;color:#556">You get this only when something is still wrong. Checked in the Studio before download (the team does not see it): layout and timing on every frame, the audio, and a Claude review of the frames against the article. ${m.rounds} round${m.rounds === 1 ? '' : 's'}; timing was fixed in the loop.${m.article ? ` Source: <a href="${esc(m.article)}">${esc(m.article)}</a>.` : ''}</p>
<p style="font-size:15px"><b>${v}</b>${link ? ` · <a href="${esc(link)}">the video</a> (private link, ${DAYS} days)` : ' · the video was not uploaded'}</p>
${ask.length ? `<h3 style="color:#B32322;margin:18px 0 6px">A wrong fact or wrong words — needs your OK (${ask.length})</h3>${table(ask)}` : ''}
${bugs.length ? `<h3 style="color:#B32322;margin:18px 0 6px">Engine problems — sent to Claude to fix${m.inbox ? ` (inbox #${m.inbox})` : ''} (${bugs.length})</h3>${table(bugs)}` : ''}
${open.length ? `<h3 style="color:#2B3C92;margin:18px 0 6px">Still open (${open.length}) — e.g. a line the timing can't fit; shorten it in the script</h3>${table(open)}` : ''}
${m.fixed.length || m.changed.length ? `<h3 style="color:#1E7B3A;margin:18px 0 6px">Caught and fixed before you saw it</h3>${m.fixed.length ? table(m.fixed, true) : ''}${m.changed.length ? `<ul style="font-size:13px">${m.changed.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}` : ''}
<h3 style="color:#2B3C92;margin:18px 0 6px">The file</h3>
<p style="font-size:13px">Audio ${esc(m.audioCodec)}${m.loudness ? ` · loudness ${m.loudness.before.toFixed(1)} → ${m.loudness.after.toFixed(1)} LUFS (target −14)` : ''} · voice en-US-AvaNeural (English-only Ava).
Pronunciation is checked by Whisper in the skills, not here — “Send to Claude to fix” runs the full audit.${m.reviewError ? `<br>Claude review: ${esc(m.reviewError)}` : ''}</p>
</div>`
  const profile = await runTool('GMAIL_GET_PROFILE', ACCOUNT, {})
  const from = String(profile?.emailAddress ?? '').toLowerCase()
  if (from !== SENDER) throw new Error(`Gmail account "${ACCOUNT}" is ${from || 'unknown'}, not ${SENDER} — audit email not sent`)
  await runTool('GMAIL_SEND_EMAIL', ACCOUNT, {
    recipient_email: SENDER, subject: `Video check — ${m.title} (${m.format}): ${[ask.length && `${ask.length} to OK`, bugs.length && `${bugs.length} sent to Claude`, open.length && `${open.length} open`].filter(Boolean).join(', ') || v}`,
    body: html, is_html: true, include_signature: false,
  })
  return { link }
}
