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
}

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
      out.push({
        at: String(r.audited_time),
        action: String(r.action ?? 'updated'),
        byName: str(r.done_by?.name),
        byId: str(r.done_by?.id),
        changes: (r.field_history ?? []).map((f: any) => ({
          field: String(f.api_name ?? f.field_label ?? '?'),
          from: str(f._field_history_value_before ?? f.old_value),
          to: str(f._field_history_value_after ?? f.new_value),
        })),
      })
    }
    token = res?.info?.next_page_token
    if (!token || rows.length === 0) break
  }
  return out.sort((a, b) => +new Date(a.at) - +new Date(b.at))
}

/** Everyone in the CRM, so an actor's email can be matched back to a person. */
export async function fetchUsers(): Promise<{ id: string; name: string; email: string }[]> {
  const res: any = await zohoGet('users', { type: 'AllUsers', per_page: 200 })
  return (res?.users ?? []).map((u: any) => ({
    id: String(u.id), name: String(u.full_name ?? u.first_name ?? u.email), email: String(u.email ?? ''),
  })).filter((u: any) => u.id && u.email)
}
