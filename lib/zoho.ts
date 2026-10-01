import 'server-only'
import { supabase, supabaseConfigured } from './supabase'
// 👉 A direct line to Zoho CRM, alongside the Composio one.
//
// WHY BOTH. Composio handles the ordinary reads well and needs no secrets in
// this app. But the question the team actually asked — "Sukriti replied to
// these, why does the dashboard say she had one lead?" — can only be answered
// from the record's audit trail (`__timeline`), which says who owned the lead
// at each moment and who handed it to whom. Composio has no tool for it, so
// this module talks to the REST API itself with a Self Client refresh token.
//
// Read-only by construction: the token was issued with .READ scopes only, so
// a bug here cannot write to the CRM (owner, 1 Oct 2026).

const DC = 'https://www.zohoapis.com'
const ACCOUNTS = 'https://accounts.zoho.com'

// TRIMMED ON READ. A credential pasted into a web form picks up a trailing
// space or newline more often than anyone expects, and the failure it causes
// is indistinguishable from a wrong secret: Zoho answers "Access Denied" and
// says no more than that (owner, 1 Oct 2026).
const env = (k: string) => (process.env[k] ?? '').trim()

export const zohoConfigured =
  !!env('ZOHO_CLIENT_ID') && !!env('ZOHO_CLIENT_SECRET') && !!env('ZOHO_REFRESH_TOKEN')

/**
 * Enough to diagnose a rejected credential without printing one.
 *
 * Lengths and first characters only — a client id is not secret and its
 * shape is the thing that is usually wrong; the secret and token are
 * described, never shown.
 */
export function zohoCredentialShape() {
  const id = env('ZOHO_CLIENT_ID')
  const secret = env('ZOHO_CLIENT_SECRET')
  const refresh = env('ZOHO_REFRESH_TOKEN')
  const raw = (k: string) => process.env[k] ?? ''
  return {
    clientId: id ? `${id.slice(0, 14)}… (${id.length} chars)` : 'MISSING',
    clientIdLooksRight: /^1000\.[A-Z0-9]{20,}$/i.test(id),
    clientSecret: secret ? `${secret.length} chars` : 'MISSING',
    clientSecretLooksRight: /^[a-f0-9]{40,}$/i.test(secret),
    refreshToken: refresh ? `${refresh.length} chars` : 'MISSING',
    refreshTokenLooksRight: /^1000\./.test(refresh),
    hadWhitespace: [
      raw('ZOHO_CLIENT_ID') !== id && 'ZOHO_CLIENT_ID',
      raw('ZOHO_CLIENT_SECRET') !== secret && 'ZOHO_CLIENT_SECRET',
      raw('ZOHO_REFRESH_TOKEN') !== refresh && 'ZOHO_REFRESH_TOKEN',
    ].filter(Boolean),
  }
}

// Access tokens last an hour, and ZOHO LIMITS HOW MANY A REFRESH TOKEN MAY
// MINT. On a serverless host a module variable dies with the invocation, so
// every run minted fresh ones and a backfill clicked five times in a row
// exhausted the allowance -- after which every call answers "Access Denied",
// which looks exactly like a broken credential and is not one.
//
// So the token is cached in the database, where it survives between
// invocations, and concurrent callers inside one invocation share a single
// request instead of racing to make three (owner, 1 Oct 2026).
let cached: { token: string; until: number } | null = null
let inFlight: Promise<string> | null = null

const TOKEN_KEY = 'zoho_access_token'

async function readStoredToken(): Promise<{ token: string; until: number } | null> {
  if (!supabaseConfigured) return null
  try {
    const { data } = await supabase.from('mw_settings').select('value').eq('key', TOKEN_KEY).maybeSingle()
    const v = data?.value as any
    if (v?.token && Number(v.until) > Date.now() + 60_000) return { token: String(v.token), until: Number(v.until) }
  } catch { /* a cache miss is not an error */ }
  return null
}

async function storeToken(t: { token: string; until: number }) {
  if (!supabaseConfigured) return
  try {
    await supabase.from('mw_settings').upsert({ key: TOKEN_KEY, value: t }, { onConflict: 'key' })
  } catch { /* worst case the next invocation mints one */ }
}

async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token
  // One request per invocation, however many callers arrive at once.
  if (inFlight) return inFlight
  inFlight = mintToken().finally(() => { inFlight = null })
  return inFlight
}

async function mintToken(): Promise<string> {
  const stored = await readStoredToken()
  if (stored) { cached = stored; return stored.token }

  const params = {
    grant_type: 'refresh_token',
    client_id: env('ZOHO_CLIENT_ID'),
    client_secret: env('ZOHO_CLIENT_SECRET'),
    refresh_token: env('ZOHO_REFRESH_TOKEN'),
  }
  const qs = new URLSearchParams(params)

  // QUERY STRING FIRST, FORM BODY SECOND.
  //
  // Zoho's refresh grant wants its parameters on the URL. Posting them as a
  // form body — which is what the authorisation-code exchange accepts, and
  // what I therefore assumed — gets "Access Denied", a message that reads
  // exactly like a wrong secret and sent us looking at Vercel for an hour.
  //
  // The code exchange was verified by hand; the refresh was not, because the
  // script that would have tested it was blocked for holding credentials. So
  // both forms are tried and the one that works is reported, rather than
  // trusting either (owner, 1 Oct 2026).
  const attempts: { how: string; res: Response }[] = []
  attempts.push({
    how: 'query',
    res: await fetch(`${ACCOUNTS}/oauth/v2/token?${qs}`, { method: 'POST' }),
  })

  let j: any = await attempts[0].res.json().catch(() => ({}))
  if (!j?.access_token) {
    const res2 = await fetch(`${ACCOUNTS}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    })
    attempts.push({ how: 'body', res: res2 })
    j = await res2.json().catch(() => ({}))
  }

  if (!j?.access_token) {
    // Never echo the response wholesale — it can carry the token on success
    // and the client id on failure. The shape report says which credential is
    // malformed without showing any of them.
    const why = String(j?.error ?? attempts[attempts.length - 1].res.status)
    throw new Error(
      `Zoho auth failed: ${why} (tried ${attempts.map(a => a.how).join(' then ')})`
      + (why === 'Access Denied'
        ? ' — credentials are the right shape, so this is most likely a revoked refresh token'
        : ''),
    )
  }

  cached = { token: j.access_token, until: Date.now() + (Number(j.expires_in ?? 3600) - 300) * 1000 }
  await storeToken(cached)
  return cached.token
}

/**
 * One GET against the CRM.
 *
 * Returns null for 204 — Zoho's way of saying "no related records", which is
 * an answer, not a failure, and must not be confused with one. That
 * distinction has already caused four separate bugs on this dashboard where a
 * silent source was read as "the thing is gone".
 */
/**
 * Why a call was refused, in Zoho's own words.
 *
 * A 401 is not one thing. INVALID_TOKEN means mint a new one.
 * OAUTH_SCOPE_MISMATCH means this token will never read this list, however
 * many times you mint. Treating the second as the first is what drained the
 * allowance: eight activity lists per lead, a scope error on some of them,
 * and a fresh token requested every time (owner, 1 Oct 2026).
 */
/** Which related lists came back refused, and with what code. */
export const refusedLists = new Map<string, string>()

export class ZohoRefused extends Error {
  constructor(public code: string, public status: number, public path: string) {
    super(`Zoho ${status} ${code} on ${path}`)
  }
}

/** At most one re-mint per invocation, however many 401s arrive. */
let remints = 0
const NOT_WORTH_RETRYING = /OAUTH_SCOPE_MISMATCH|NO_PERMISSION|INVALID_URL_PATTERN|FORBIDDEN/i

const codeOf = (text: string) => {
  try { return String(JSON.parse(text)?.code ?? 'UNKNOWN') } catch { return 'UNKNOWN' }
}

/**
 * One GET against the CRM.
 *
 * Returns null for 204 — Zoho's way of saying "no related records", which is
 * an answer, not a failure, and must not be confused with one. That
 * distinction has already caused four separate bugs on this dashboard where a
 * silent source was read as "the thing is gone".
 */
export async function zohoGet<T = any>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T | null> {
  const token = await accessToken()
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v))
  const url = `${DC}/crm/v8/${path.replace(/^\//, '')}${q.toString() ? `?${q}` : ''}`

  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
  if (res.status === 204) return null

  if (res.status === 401) {
    const code = codeOf(await res.text().catch(() => ''))

    // A scope we were never granted. Minting a new token cannot fix it, and
    // asking for one is what caused the outage.
    if (NOT_WORTH_RETRYING.test(code) || remints >= 1) {
      throw new ZohoRefused(code, 401, path)
    }

    remints++
    cached = null
    if (supabaseConfigured) await supabase.from('mw_settings').delete().eq('key', TOKEN_KEY).then(() => {}, () => {})
    const retry = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}` } })
    if (retry.status === 204) return null
    if (!retry.ok) throw new ZohoRefused(codeOf(await retry.text().catch(() => '')), retry.status, path)
    return retry.json() as Promise<T>
  }

  if (!res.ok) {
    throw new ZohoRefused(codeOf(await res.text().catch(() => '')), res.status, path)
  }
  return res.json() as Promise<T>
}

/** Reset between runs so a later invocation may retry once more. */
export function zohoResetRetries() { remints = 0 }

export async function zohoPost<T = any>(path: string, body: unknown): Promise<T | null> {
  const token = await accessToken()
  const res = await fetch(`${DC}/crm/v8/${path.replace(/^\//, '')}`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 204) return null
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Zoho ${res.status} on ${path}: ${t.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

// ------------------------------------------------------------------ timeline

export type TimelineEntry = {
  at: string
  action: string
  byName: string | null
  byId: string | null
  changes: { field: string; from: string | null; to: string | null }[]
  /**
   * How the entry came about: 'crm_ui' is a person at a keyboard, everything
   * else is machinery — 'zoho_forms', 'assignment_rules', 'workflow',
   * 'pathfinder', 'scoringrule'.
   *
   * THIS IS THE MOST IMPORTANT FIELD HERE. Zoho stamps automation with a
   * person's name in done_by: the assignment rule that files every webform
   * lead records "Dineshgandhi S" as having done it, and a tagging workflow
   * records "Franches Ramasamy". Counting those as work is how the first
   * dashboard decided one man handles a third of all inbound leads. He does
   * not; he is the name on the rule (owner, 1 Oct 2026).
   */
  source: string | null
  /** For owner_assigned: who the rule handed it to. */
  assignedTo: { id: string | null; name: string | null } | null
  /** The automation that fired, when one did. */
  ruleName: string | null
  /** What the entry is about — a Task, an Email, the Lead itself. */
  recordModule: string | null
  recordName: string | null
}

/** Actions a person performed by hand, as opposed to a rule firing. */
export const isHumanAction = (e: TimelineEntry) =>
  e.source === 'crm_ui' || e.source === 'mobile' || e.source === 'zoho_mail'

const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v))

/**
 * The audit trail of one record: every edit, who made it, and what changed.
 *
 * This is the only honest source for "who held this lead and when". Zoho's
 * Owner field shows the current owner and nothing else, which is why a person
 * who answered thirty-three leads and passed them on appeared in the first
 * version of this dashboard as owning one.
 */
export async function fetchTimeline(module: string, recordId: string, pages = 3): Promise<TimelineEntry[]> {
  const out: TimelineEntry[] = []
  let token: string | undefined
  for (let i = 0; i < pages; i++) {
    const res: any = await zohoGet(`${module}/${recordId}/__timeline`, {
      per_page: 100, page_token: token,
    })
    const rows: any[] = res?.__timeline ?? []
    for (const r of rows) {
      const auto = r.automation_details ?? null
      out.push({
        at: String(r.audited_time),
        action: String(r.action ?? 'updated'),
        byName: str(r.done_by?.name),
        byId: str(r.done_by?.id),
        // Zoho nests the before/after under `_value.old` / `_value.new`. The
        // first build guessed at `_field_history_value_before`, so every
        // change rendered as "∅ → ∅" — present, and saying nothing.
        changes: (r.field_history ?? []).map((f: any) => ({
          field: String(f.api_name ?? f.field_label ?? '?'),
          from: str(f._value?.old),
          to: str(f._value?.new),
        })),
        source: str(r.source),
        assignedTo: auto?.owner ? { id: str(auto.owner.id), name: str(auto.owner.name) } : null,
        ruleName: str(auto?.rule?.name),
        recordModule: str(r.record?.module?.api_name),
        recordName: str(r.record?.name),
      })
    }
    token = res?.info?.next_page_token
    if (!token || rows.length === 0) break
  }
  return out.sort((a, b) => +new Date(a.at) - +new Date(b.at))
}

// ------------------------------------------------------------ related work

export type WrittenRecord = {
  id: string
  kind: 'note' | 'task' | 'call' | 'meeting'
  at: string
  actor: string | null
  actorEmail: string | null
  title: string | null
  body: string | null
}

const strip = (v: unknown) =>
  v === null || v === undefined ? null
    : String(v).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ').trim() || null

/**
 * Everything a person wrote down against a lead: notes, tasks, call logs and
 * meetings, with their text.
 *
 * ASKED DIRECTLY RATHER THAN THROUGH COMPOSIO. The Composio related-records
 * call returned exactly one note across ninety-five leads, which the team
 * says is wrong — and the identical symptom on emails turned out to be a
 * visibility rule on the connecting account, not an absence of data. Asking
 * with our own token at least makes the two sources comparable, and the
 * audit trail gives a third opinion: if it records a note being added and no
 * note comes back, that gap is reported rather than read as "nobody wrote
 * anything" (owner, 1 Oct 2026).
 */
export async function fetchWritten(leadId: string): Promise<WrittenRecord[]> {
  const out: WrittenRecord[] = []

  const grab = async (
    list: string, kind: WrittenRecord['kind'],
    fields: string, pick: (r: any) => { at: string; title: string | null; body: string | null },
  ) => {
    const res: any = await zohoGet(`Leads/${leadId}/${list}`, { fields, per_page: 100 })
    for (const r of (res?.data ?? [])) {
      const p = pick(r)
      if (!p.at) continue
      out.push({
        id: `${kind}-${r.id}`, kind, at: String(p.at),
        actor: str(r.Owner?.name ?? r.Created_By?.name),
        actorEmail: str(r.Owner?.email ?? r.Created_By?.email),
        title: p.title, body: p.body,
      })
    }
  }

  // SIX LISTS, NOT THREE. Zoho splits every activity in two: `Tasks` is open
  // tasks and `Tasks_History` is completed ones, and the same for Calls and
  // Events. Asking only the first three returned nothing but unfinished work,
  // so a 45-minute meeting that actually took place was invisible and its
  // lead was reported as never answered.
  //
  // `Invited_Events` is a seventh case: a meeting whose "related to" is not
  // this lead but which the lead was invited to. That is where the MeetSocial
  // call sat (owner, 1 Oct 2026).
  const CALL_FIELDS = 'Subject,Description,Call_Purpose,Call_Result,Call_Start_Time,Created_Time,Owner,Created_By'
  const EVENT_FIELDS = 'Event_Title,Description,Start_DateTime,Created_Time,Owner,Created_By'
  const TASK_FIELDS = 'Subject,Description,Status,Created_Time,Closed_Time,Owner,Created_By'

  const asCall = (r: any) => ({
    at: r.Call_Start_Time ?? r.Created_Time,
    title: strip(r.Subject),
    body: [strip(r.Call_Purpose), strip(r.Call_Result), strip(r.Description)].filter(Boolean).join(' · ') || null,
  })
  const asEvent = (r: any) => ({
    at: r.Start_DateTime ?? r.Created_Time,
    title: strip(r.Event_Title),
    body: strip(r.Description),
  })
  const asTask = (r: any) => ({
    at: r.Created_Time, title: strip(r.Subject), body: strip(r.Description),
  })

  // A refused list is recorded, not swallowed. "No meetings came back" and
  // "we are not allowed to read meetings" look identical in the data and
  // mean completely different things.
  const note = (e: any) => {
    const code = e instanceof ZohoRefused ? e.code : 'ERROR'
    const path = e instanceof ZohoRefused ? e.path.split('/').pop() : '?'
    refusedLists.set(String(path), code)
    if (code === 'INVALID_TOKEN' || code === 'AUTHENTICATION_FAILURE') throw e
  }

  // Each list is asked for independently: one module being unavailable on
  // this plan must not cost the others.
  await Promise.all([
    grab('Notes', 'note', 'Note_Title,Note_Content,Created_Time,Owner,Created_By',
      r => ({ at: r.Created_Time, title: strip(r.Note_Title), body: strip(r.Note_Content) })).catch(note),
    grab('Tasks', 'task', TASK_FIELDS, asTask).catch(note),
    grab('Tasks_History', 'task', TASK_FIELDS, asTask).catch(note),
    grab('Calls', 'call', CALL_FIELDS, asCall).catch(note),
    grab('Calls_History', 'call', CALL_FIELDS, asCall).catch(note),
    grab('Events', 'meeting', EVENT_FIELDS, asEvent).catch(note),
    grab('Events_History', 'meeting', EVENT_FIELDS, asEvent).catch(note),
    grab('Invited_Events', 'meeting', EVENT_FIELDS, asEvent).catch(note),
  ])

  // The same meeting can appear in two lists — open and invited, say. Keyed
  // on the record id, so it is counted once.
  const once = new Map(out.map(r => [r.id, r]))
  return [...once.values()].sort((a, b) => +new Date(a.at) - +new Date(b.at))
}

/** Everyone in the CRM, so an actor's email can be matched back to a person. */
export async function fetchUsers(): Promise<{ id: string; name: string; email: string }[]> {
  const res: any = await zohoGet('users', { type: 'AllUsers', per_page: 200 })
  return (res?.users ?? []).map((u: any) => ({
    id: String(u.id), name: String(u.full_name ?? u.first_name ?? u.email), email: String(u.email ?? ''),
  })).filter((u: any) => u.id && u.email)
}
