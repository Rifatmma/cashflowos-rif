import 'server-only'
// Proof for a payment that only ever existed as an email.
//
// A card charge or a transfer has no paper, so every email-filed receipt sat
// under "No proof" forever with nothing the owner could do about it:
//
//   "can't you just take a snapshot from the email? or if they attach anything
//    in the email then you attach it in the app also?"  (owner, 8 Oct 2026)
//
// Both, in that order of preference:
//   1. A PDF or image ATTACHED to the email — the seller's own invoice, which
//      is real proof in the same sense a photographed till receipt is.
//   2. Failing that, the EMAIL ITSELF, saved as a small HTML page: who sent it,
//      when, the subject, and the body as Gmail delivered it.
//
// WHAT THIS IS NOT. It never writes a summary of our own numbers and calls it
// proof. Everything stored here came out of the mailbox; if the mailbox gives
// nothing back, nothing is attached and the receipt honestly stays unproven.
//
// Email content is UNTRUSTED. It is stored and displayed, never obeyed, and it
// is HTML-escaped on the way into the snapshot.

import { createHash } from 'crypto'
import { supabase, supabaseConfigured } from './supabase'
import { runWorkbench } from './composio-mcp'

const INBOX = () => (process.env.PAYMENTS_EMAIL || 'rifatmma@gmail.com').trim().toLowerCase()
const account = () => process.env.COMPOSIO_GMAIL_ACCOUNT?.trim() || INBOX()

/** What Gmail gave back for one message. `note` says which path was taken. */
export type MailProof = {
  messageId: string
  subject: string
  from: string
  at: string
  bodyHtml: string | null
  attachment: { filename: string; mime: string; b64: string } | null
  note: string
}

// Only things a person can actually look at. A .zip or .ics is not proof.
const KEEP = /^(application\/pdf|image\/(png|jpe?g|webp|gif|heic|heif))$/i
const EXT: Record<string, string> = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
}
/** Bigger than this and the base64 round trip is not worth it; the body still is. */
const MAX_BYTES = 4_000_000

/**
 * Fetch one message and whatever of it can serve as proof.
 *
 * Runs inside Composio's sandbox because a full Gmail payload is far too big to
 * travel back whole — the same reason lib/email-payments.ts flattens there.
 *
 * DEFENSIVE ON PURPOSE. I could not probe the real shape of these responses
 * from a dev machine (the Composio key lives only in Vercel), so the script
 * reads several plausible field names for the body and the attachment list and
 * reports which one it used in `note`.
 */
const SCRIPT = (messageId: string, acct: string, maxBytes: number) => String.raw`
import json, base64, os, re, html

def _b64url(s):
    s = (s or '').replace('-', '+').replace('_', '/')
    return base64.b64decode(s + '=' * (-len(s) % 4))

def _walk(part, out):
    """Collect every leaf part of a MIME tree, whatever the nesting."""
    if not isinstance(part, dict): return
    for p in (part.get('parts') or []): _walk(p, out)
    if not part.get('parts'): out.append(part)

notes = []
res, err = run_composio_tool('GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
    {'message_id': ${JSON.stringify(messageId)}, 'format': 'full'},
    print_schema_for_tool=False, account=${JSON.stringify(acct)})
data = (res or {}).get('data') or res or {}
msg = data.get('message') or data.get('messageData') or data

subject = msg.get('subject') or ''
sender  = msg.get('sender') or msg.get('from') or ''
at      = msg.get('messageTimestamp') or msg.get('internalDate') or ''
payload = msg.get('payload') or {}

# Headers, when the flattened fields are not there.
for h in (payload.get('headers') or []):
    n = (h.get('name') or '').lower()
    if n == 'subject' and not subject: subject = h.get('value') or ''
    if n == 'from' and not sender:     sender  = h.get('value') or ''
    if n == 'date' and not at:         at      = h.get('value') or ''

leaves = []
_walk(payload, leaves)

body = None
for want in ('text/html', 'text/plain'):
    for p in leaves:
        if (p.get('mimeType') or '').lower().startswith(want):
            d = ((p.get('body') or {}).get('data'))
            if d:
                try:
                    body = _b64url(d).decode('utf-8', 'replace')
                    notes.append('body from ' + want)
                except Exception as e:
                    notes.append('body decode failed: ' + str(e)[:80])
            break
    if body: break
if body is None:
    body = msg.get('messageText') or (msg.get('preview') or {}).get('body') or ''
    if body: notes.append('body from messageText')

# An attachment the seller sent: their own invoice, which beats our snapshot.
att = None
cands = []
for p in leaves:
    aid = (p.get('body') or {}).get('attachmentId')
    mt  = (p.get('mimeType') or '').lower()
    fn  = p.get('filename') or ''
    sz  = (p.get('body') or {}).get('size') or 0
    if aid and fn: cands.append({'id': aid, 'mime': mt, 'name': fn, 'size': sz})
for a in (msg.get('attachmentList') or []):
    if a.get('attachmentId') and a.get('filename'):
        cands.append({'id': a['attachmentId'], 'mime': (a.get('mimeType') or '').lower(),
                      'name': a['filename'], 'size': a.get('size') or 0})
notes.append('attachments seen: ' + json.dumps([{'n': c['name'], 'm': c['mime'], 's': c['size']} for c in cands])[:400])

pick = None
for c in cands:
    if re.match(r'^(application/pdf|image/(png|jpe?g|webp|gif|heic|heif))$', c['mime'] or '') and (c['size'] or 0) <= ${maxBytes}:
        pick = c; break
if pick:
    ares, aerr = run_composio_tool('GMAIL_GET_ATTACHMENT',
        {'message_id': ${JSON.stringify(messageId)}, 'attachment_id': pick['id'], 'file_name': pick['name']},
        print_schema_for_tool=False, account=${JSON.stringify(acct)})
    adata = (ares or {}).get('data') or ares or {}
    raw = adata.get('data') or adata.get('attachmentData') or adata.get('content')
    blob = None
    if isinstance(raw, str) and len(raw) > 32:
        try: blob = _b64url(raw)
        except Exception as e: notes.append('attachment b64 failed: ' + str(e)[:80])
    # Some versions hand back a file on disk instead of bytes.
    for key in ('file', 'file_path', 'path', 'local_path', 's3url', 'uri'):
        if blob is None and isinstance(adata.get(key), str) and os.path.exists(adata[key]):
            blob = open(adata[key], 'rb').read(); notes.append('attachment read from ' + key)
    if blob and len(blob) <= ${maxBytes}:
        att = {'filename': pick['name'], 'mime': pick['mime'],
               'b64': base64.b64encode(blob).decode('ascii')}
        notes.append('attachment used: ' + pick['name'])
    else:
        notes.append('attachment not retrievable; keys=' + json.dumps(list(adata.keys()))[:200])

out = {'error': err, 'messageId': ${JSON.stringify(messageId)}, 'subject': subject,
       'from': sender, 'at': str(at), 'bodyHtml': (body or '')[:200000],
       'attachment': att, 'note': ' | '.join(notes)[:600]}
print('<<<CFO' + json.dumps(out, ensure_ascii=True) + '\nCFO>>>')
`

export async function fetchMailProof(messageId: string): Promise<MailProof | null> {
  try {
    const out = await runWorkbench(SCRIPT(messageId, account(), MAX_BYTES))
    if (!out || out.error) {
      console.warn('[CFO] email proof:', String(out?.error ?? 'no output').slice(0, 200))
      return null
    }
    const a = out.attachment
    return {
      messageId: String(out.messageId ?? messageId),
      subject: String(out.subject ?? ''),
      from: String(out.from ?? ''),
      at: String(out.at ?? ''),
      bodyHtml: out.bodyHtml ? String(out.bodyHtml) : null,
      attachment: a?.b64 && KEEP.test(String(a.mime ?? ''))
        ? { filename: String(a.filename), mime: String(a.mime).toLowerCase(), b64: String(a.b64) }
        : null,
      note: String(out.note ?? ''),
    }
  } catch (e: any) {
    console.warn('[CFO] email proof threw:', String(e?.message ?? e).slice(0, 200))
    return null
  }
}

const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The email itself as a page, for when nothing was attached.
 *
 * The body is inserted as ESCAPED TEXT inside <pre>, never as live HTML: this
 * file is served from the same storage as receipt photos and opened in his
 * browser, and an email is the last thing that should be trusted to run.
 */
export function emailSnapshot(p: MailProof): string {
  return page(p.subject, p.from, p.at, readable(p.bodyHtml ?? ''))
}

/**
 * Turn the delivered email into something a person reads.
 *
 * Three things were wrong with the first version, all visible on the Meta
 * receipt: the markup showed through, "You&#039;ll" appeared instead of
 * "You'll", and every dash came out as "â€”".
 */
export function readable(raw: string): string {
  let t = String(raw ?? '')
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  // TWICE: these emails arrive double-encoded, so one pass leaves "&#039;".
  t = unent(unent(t))
  t = demojibake(t)
  return t
    // Every flavour of space becomes a space. Once the mis-decoding is undone,
    // Meta's narrow no-break space is a real character \u2014 and it reads as "12:00
    // AM" that no search for "12:00 AM" will ever match.
    .replace(/[ \t\u00a0\u2007\u2008\u2009\u200a\u202f]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// The HTML 4 Latin-1 names, in codepoint order 160-255, plus the handful of
// punctuation names that actually turn up in receipts.
//
// All 96 of them matter here and not for completeness' sake: the mojibake in
// these emails arrives AS entities — "12:00&acirc;&#8364;&macr;AM" — so
// without acirc and Acirc the mangling cannot even be seen, let alone undone.
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr ' +
  'deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest ' +
  'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml ' +
  'Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times ' +
  'Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
  'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml ' +
  'igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide ' +
  'oslash ugrave uacute ucirc uuml yacute thorn yuml'

const ENT: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', bull: '•', trade: '™', euro: '€',
  // CASE-SENSITIVE, and it has to be: &Acirc; is Â and &acirc; is â.
  // Folding the name lowercased them into one and turned "MasterCard Â·Â·Â·"
  // into "â·â·â·" instead of "···".
  ...Object.fromEntries(LATIN1.split(' ').map((n, i) => [n, String.fromCharCode(160 + i)])),
}

const unent = (s: string) =>
  s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g: string) => {
    const k = g.toLowerCase()
    if (k.startsWith('#x')) { const n = parseInt(k.slice(2), 16); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m }
    if (k.startsWith('#')) { const n = parseInt(k.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m }
    // Exact name first; the lowercase fallback catches &AMP; and friends.
    return ENT[g] ?? ENT[k] ?? m
  })

/**
 * Undo UTF-8 that was decoded as Windows-1252 somewhere upstream.
 *
 * That is where "12:00â€¯AM" and "MasterCard Â·Â·Â·" come from. The first
 * attempt matched the few sequences I could see in one screenshot, which fixed
 * the em dash and missed the en dash — a list of examples is not a rule.
 *
 * This reverses the mistake instead: map each character back to the byte it
 * came from and read those bytes as UTF-8 again. A line that cannot be mapped,
 * or that does not decode cleanly, is left exactly as it was — so genuine Thai
 * or Malay text is never mangled in the name of fixing it.
 *
 * Done per line, because one bad line should not stop the rest being repaired.
 */
const CP1252: Record<string, number> = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85,
  '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A,
  '\u2039': 0x8B, '\u0152': 0x8C, '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92,
  '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B, '\u0153': 0x9C,
  '\u017E': 0x9E, '\u0178': 0x9F,
}
/** The tell-tale lead byte of a mis-decoded UTF-8 sequence. */
const LOOKS_MANGLED = /[\u00c2-\u00c3\u00e2]/

function fixLine(line: string): string {
  if (!LOOKS_MANGLED.test(line)) return line
  const bytes: number[] = []
  for (const ch of line) {
    const c = ch.codePointAt(0)!
    if (c < 0x100) bytes.push(c)
    else if (CP1252[ch] !== undefined) bytes.push(CP1252[ch])
    else return line                       // not representable: not our mangling
  }
  const out = Buffer.from(bytes).toString('utf8')
  // A replacement character means the guess was wrong; keep what we had.
  return out.includes('\ufffd') ? line : out
}

const demojibake = (s: string) => s.split('\n').map(fixLine).join('\n')

const esc2 = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function page(subject: string, from: string, at: string, text: string): string {
  return `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc2(subject) || 'Email'}</title>
<style>
  body{margin:0;padding:22px;background:#F1F4EC;color:#0C2B18;
       font:15px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .h{background:#fff;border:1px solid #DDE3D6;border-radius:12px;padding:16px 18px;max-width:720px;margin:0 auto 14px}
  .k{color:#6B7A6E;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
  .v{font-size:15px;margin:2px 0 12px;overflow-wrap:anywhere}
  .v:last-child{margin-bottom:0}
  pre{background:#fff;border:1px solid #DDE3D6;border-radius:12px;padding:16px 18px;max-width:720px;
      margin:0 auto;white-space:pre-wrap;overflow-wrap:anywhere;
      font:14px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}
  .n{max-width:720px;margin:14px auto 0;color:#6B7A6E;font-size:12.5px}
</style>
<div class="h">
  <div class="k">From</div><div class="v">${esc2(from)}</div>
  <div class="k">Subject</div><div class="v">${esc2(subject)}</div>
  <div class="k">Received</div><div class="v">${esc2(at)}</div>
</div>
<pre>${esc2(text)}</pre>
<p class="n">Saved from the mailbox as proof of this payment. Nothing here was written by CashflowOS.</p>
`
}

export type AttachResult = { ok: boolean; kind: 'attachment' | 'email' | 'none'; note: string }

/**
 * Put the best available proof onto a filed receipt.
 *
 * Content-addressed like every other receipt file, so the same invoice fetched
 * twice is stored once.
 */
export async function attachEmailProof(recordId: number, messageIds: string[]): Promise<AttachResult> {
  if (!supabaseConfigured) return { ok: false, kind: 'none', note: 'no database' }
  if (!(recordId > 0) || !messageIds.length) return { ok: false, kind: 'none', note: 'nothing to look up' }

  const notes: string[] = []
  let best: MailProof | null = null
  for (const id of messageIds.slice(0, 4)) {
    const p = await fetchMailProof(id)
    if (!p) { notes.push(`${id}: nothing came back`); continue }
    notes.push(`${id}: ${p.note}`)
    // An attachment wins outright; otherwise keep the first readable body.
    if (p.attachment) { best = p; break }
    if (!best && (p.bodyHtml ?? '').trim()) best = p
  }
  if (!best) return { ok: false, kind: 'none', note: notes.join(' || ').slice(0, 900) }

  const kind: 'attachment' | 'email' = best.attachment ? 'attachment' : 'email'
  const bytes = best.attachment
    ? Buffer.from(best.attachment.b64, 'base64')
    : Buffer.from(emailSnapshot(best), 'utf8')
  const mime = best.attachment ? best.attachment.mime : 'text/html'
  const ext = best.attachment ? (EXT[mime] ?? 'pdf') : 'html'
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const path = `receipts/${sha256}.${ext}`

  const { error: upErr } = await supabase.storage
    .from('vault').upload(path, bytes, { contentType: mime, upsert: false })
  if (upErr && !/exist/i.test(upErr.message)) {
    return { ok: false, kind: 'none', note: `upload: ${upErr.message}` }
  }
  // A re-fetch replaces what was there: the readers take the newest file for a
  // record, and leaving an earlier snapshot behind would make "which one is the
  // proof" a question nobody can answer.
  await supabase.from('vault_files').delete().eq('record_id', recordId).eq('meta->>from', 'email')
  const { error: rowErr } = await supabase.from('vault_files').upsert({
    sha256, storage_path: path, mime, size_bytes: bytes.length, record_id: recordId,
    meta: {
      from: 'email', kind, subject: best.subject.slice(0, 200), message_id: best.messageId,
      // The readable text, so the receipt page can print it inline instead of
      // sending him to another page he cannot get back from.
      sender: best.from.slice(0, 200), at: best.at.slice(0, 60),
      text: kind === 'email' ? readable(best.bodyHtml ?? '').slice(0, 20000) : null,
    },
  }, { onConflict: 'sha256' })
  if (rowErr) return { ok: false, kind: 'none', note: rowErr.message }

  const { data: row } = await supabase.from('records').select('meta').eq('id', recordId).maybeSingle()
  const meta: any = { ...(row?.meta ?? {}), sha256, storage_path: path, mime }
  // An attached invoice is proof of the same standing as a photographed till
  // receipt. The email itself is weaker but it IS what the seller sent, and it
  // is marked so the difference stays visible.
  meta.proof = kind === 'attachment' ? 'photo' : 'email'
  meta.proof_ok = true
  meta.proof_added_at = new Date().toISOString().slice(0, 10)
  await supabase.from('records').update({ meta }).eq('id', recordId)

  return { ok: true, kind, note: notes.join(' || ').slice(0, 900) }
}
