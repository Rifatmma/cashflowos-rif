import 'server-only'
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

export const zohoConfigured =
  !!process.env.ZOHO_CLIENT_ID &&
  !!process.env.ZOHO_CLIENT_SECRET &&
  !!process.env.ZOHO_REFRESH_TOKEN

// Access tokens last an hour. A daily pull makes ~200 calls in a couple of
// minutes, so one token covers a whole run; caching it in module scope saves
// 200 round trips to the accounts server.
let cached: { token: string; until: number } | null = null

async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
  })
  const res = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: 'POST', body })
  const j = await res.json().catch(() => ({}))
  if (!j?.access_token) {
    // Never echo the response wholesale — it can carry the token on success
    // and the client id on failure.
    throw new Error(`Zoho auth failed: ${String(j?.error ?? res.status)}`)
  }
  cached = { token: j.access_token, until: Date.now() + (Number(j.expires_in ?? 3600) - 120) * 1000 }
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
    // Token rejected mid-run: drop the cache and try once more.
    cached = null
    const retry = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}` } })
    if (retry.status === 204) return null
    if (!retry.ok) throw new Error(`Zoho ${retry.status} on ${path}`)
    return retry.json() as Promise<T>
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Zoho ${res.status} on ${path}: ${t.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

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

  // Each list is asked for independently: one module being unavailable on
  // this plan must not cost the others.
  await Promise.all([
    grab('Notes', 'note', 'Note_Title,Note_Content,Created_Time,Owner,Created_By',
      r => ({ at: r.Created_Time, title: strip(r.Note_Title), body: strip(r.Note_Content) })).catch(() => {}),
    grab('Tasks', 'task', 'Subject,Description,Status,Created_Time,Closed_Time,Owner,Created_By',
      r => ({ at: r.Created_Time, title: strip(r.Subject), body: strip(r.Description) })).catch(() => {}),
    grab('Calls', 'call', 'Subject,Description,Call_Purpose,Call_Result,Call_Start_Time,Owner,Created_By',
      r => ({
        at: r.Call_Start_Time ?? r.Created_Time,
        title: strip(r.Subject),
        body: [strip(r.Call_Purpose), strip(r.Call_Result), strip(r.Description)].filter(Boolean).join(' · ') || null,
      })).catch(() => {}),
    grab('Events', 'meeting', 'Event_Title,Description,Start_DateTime,Owner,Created_By',
      r => ({ at: r.Start_DateTime ?? r.Created_Time, title: strip(r.Event_Title), body: strip(r.Description) })).catch(() => {}),
  ])

  return out.sort((a, b) => +new Date(a.at) - +new Date(b.at))
}

/** Everyone in the CRM, so an actor's email can be matched back to a person. */
export async function fetchUsers(): Promise<{ id: string; name: string; email: string }[]> {
  const res: any = await zohoGet('users', { type: 'AllUsers', per_page: 200 })
  return (res?.users ?? []).map((u: any) => ({
    id: String(u.id), name: String(u.full_name ?? u.first_name ?? u.email), email: String(u.email ?? ''),
  })).filter((u: any) => u.id && u.email)
}
