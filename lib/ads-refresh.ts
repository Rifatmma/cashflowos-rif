import 'server-only'
import { supabase, supabaseConfigured } from './supabase'
import { mytDate, addDays } from './period'
import { SNAPSHOT } from './ads-snapshot'
import {
  A, n, action, toRow, placementLabel, deviceLabel, genderLabel, ageLabel,
  detectRuns, nameRuns, type AdsNumbers, type InsightRow, type Run, type Totals,
} from './ads-model'
import { runTool, connectedAccounts } from './composio-mcp'

// The daily pull from Meta, through Composio's MCP endpoint -- the same road
// the nightly email scan already uses, and the only one the owner's key opens.
//
// Runs inside the 9 am cron (the Vercel Hobby plan's two scheduled jobs are both
// in use). About 14 insight calls, in parallel where it can. The result is saved
// as one ads_snapshots row; any failure is saved as an ok=false row with the
// reason and the pages keep showing the last good pull. It NEVER throws.
//
// TWO ROADS TO META, and it takes whichever is open.
//
//   1. META_SYSTEM_TOKEN — a Business Manager SYSTEM USER token. Straight to
//      graph.facebook.com, no middleman. The token belongs to the business
//      rather than to a person, so it does not expire with somebody's password
//      and no one ever logs in again. This is the owner's choice (26 Sep 2026):
//      "I need automation -- if I have to login to Facebook then why do I set
//      this up in the first place?"
//   2. Composio, over the MCP endpoint his consumer key opens. The fallback,
//      and what the nightly Gmail scan uses.
//
// WHY IT FAILED EVERY MORNING BEFORE THIS. It called Composio's DEVELOPER REST
// API with an `x-api-key` header while his key is a CONSUMER key (ck_…), so
// every run wrote "Composio 401: Invalid API key" and the pages quietly kept
// showing the snapshot from 20 September. Composio's own Meta connection then
// turned out to be signed in as a stranger ("JS-Agent"), which Meta blocks.
//
// SETUP (the owner does this once):
//   META_SYSTEM_TOKEN          — the system user token, if he took road 1
//   COMPOSIO_API_KEY           — his consumer key (ck_…), already set
//   COMPOSIO_META_ACCOUNT_ID   — optional; otherwise the first ACTIVE Meta Ads
//                                connection on the Composio account is used
//   META_AD_ACCOUNT_ID         — optional; defaults to the account in the snapshot

const GRAPH = 'https://graph.facebook.com/v21.0'
const GRAPH_TIMEOUT_MS = 25_000
const LOOKBACK_DAYS = 200     // six-ish months of daily spend, enough to find every recent run
const KEEP_RUNS = 6

type Account = { id: string; userId?: string }

async function metaAccount(): Promise<Account> {
  const pinned = process.env.COMPOSIO_META_ACCOUNT_ID?.trim()
  if (pinned) return { id: pinned }
  const list = await connectedAccounts('metaads')
  const live = list.find(a => a.status.toLowerCase() === 'active')
  if (!live) throw new Error('No ACTIVE Meta Ads connection on Composio — reconnect it at composio.dev')
  return { id: live.id }
}

const systemToken = () => process.env.META_SYSTEM_TOKEN?.trim() || ''

/**
 * One insights page straight from Meta, with a system user token.
 *
 * The token goes in the Authorization header, never in the URL: a query string
 * ends up in logs, and this one does not expire.
 */
async function graphPage(account: string, args: Record<string, any>, after?: string): Promise<any> {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue
    // Graph wants fields and breakdowns comma-separated, but time_range and
    // the attribution windows as JSON. Send the wrong shape and it answers
    // with an unhelpful "(#100) param fields must be an array".
    if (Array.isArray(v)) q.set(k, k === 'fields' || k === 'breakdowns' ? v.join(',') : JSON.stringify(v))
    else if (typeof v === 'object') q.set(k, JSON.stringify(v))
    else q.set(k, String(v))
  }
  if (after) q.set('after', after)
  const res = await fetch(`${GRAPH}/${account}/insights?${q}`, {
    headers: { authorization: `Bearer ${systemToken()}` },
    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
  })
  const body = await res.json().catch(() => ({}))
  if (body?.error) throw new Error(`Meta: ${body.error.message ?? 'refused the request'}`)
  if (!res.ok) throw new Error(`Meta: HTTP ${res.status}`)
  return body
}

/** Meta's own words, dug out of whatever wrapper they arrive in. */
function metaSays(e: unknown): string {
  const raw = String((e as any)?.message ?? e ?? '')
  const m = raw.match(/"message"\s*:\s*"([^"]+)"/)
  return m ? m[1] : raw.slice(0, 200)
}

/** One insights call, following pages. Meta's own errors surface verbatim. */
async function insights(acct: Account, args: Record<string, any>): Promise<InsightRow[]> {
  const rows: InsightRow[] = []
  let after: string | undefined
  const common = { level: 'account', limit: 500, action_attribution_windows: ['7d_click'], ...args }
  for (let page = 0; page < 6; page++) {
    let d: any
    if (systemToken()) {
      const { object_id, ...rest } = common as any
      d = await graphPage(String(object_id), rest, after)
    } else {
      try {
        d = await runTool('METAADS_GET_INSIGHTS', acct.id, { ...common, ...(after ? { after } : {}) })
      } catch (e) {
        // e.g. Meta's "API access blocked." -- keep the words, they tell the
        // owner what to fix, which a wrapped 400 does not.
        throw new Error(`Meta: ${metaSays(e)}`)
      }
    }
    const list: InsightRow[] = d?.data ?? d?.response_data?.data ?? (Array.isArray(d) ? d : [])
    rows.push(...list)
    after = d?.paging?.next ? d?.paging?.cursors?.after : undefined
    if (!after) break
  }
  return rows
}

const METRICS = ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm', 'frequency', 'actions']

function runFrom(r: InsightRow, meta: { id: string; label: string; since: string; until: string; gapAfter?: number }): Run {
  return {
    id: meta.id, label: meta.label, since: meta.since, until: meta.until,
    days: Math.round((Date.parse(meta.until) - Date.parse(meta.since)) / 86_400_000) + 1,
    spend: n(r.spend), impressions: n(r.impressions), reach: n(r.reach), clicks: n(r.clicks),
    ctr: n(r.ctr), cpc: n(r.cpc), cpm: n(r.cpm), frequency: n(r.frequency),
    convos: action(r, A.convos), depth2: action(r, A.depth2), depth3: action(r, A.depth3), depth5: action(r, A.depth5),
    ...(meta.gapAfter !== undefined ? { gapAfter: meta.gapAfter } : {}),
  }
}

/** Build a full AdsNumbers from Meta. Throws on any failure -- refreshAds() records it. */
export async function pullAds(): Promise<AdsNumbers> {
  // With a system token there is no connection to look up: the token IS the
  // access, and Composio is not involved at all.
  const acct: Account = systemToken() ? { id: 'meta-system-token' } : await metaAccount()
  const account = process.env.META_AD_ACCOUNT_ID?.trim() || SNAPSHOT.account.id
  const today = mytDate()
  const range = (since: string, until: string) => ({ object_id: account, time_range: { since, until } })

  // 1) Daily spend over the look-back, to find the runs.
  const daily = await insights(acct, { ...range(addDays(today, -LOOKBACK_DAYS), today), fields: ['spend', 'impressions', 'clicks', 'ctr', 'actions'], time_increment: 1 })
  const found = detectRuns(daily.map(d => ({ date: String(d.date_start), spend: n(d.spend) })))
  if (!found.length) throw new Error(`No delivery at all in the last ${LOOKBACK_DAYS} days`)
  const named = nameRuns(found).slice(-KEEP_RUNS)
  const cur = named.at(-1)!

  // 2) Each run's own totals -- reach can't be summed from days (it counts people once).
  // 3) The current run, broken down every way the page shows.
  const r = (b: string[], fields = ['spend', 'impressions', 'clicks', 'ctr', 'actions']) =>
    insights(acct, { ...range(cur.since, cur.until), fields, breakdowns: b })
  const [runRows, place, plat, ages, genders, regions, devices, hours] = await Promise.all([
    Promise.all(named.map(x => insights(acct, { ...range(x.since, x.until), fields: METRICS }))),
    r(['publisher_platform', 'platform_position']),
    r(['publisher_platform']),
    r(['age']),
    r(['gender']),
    r(['region']),
    r(['impression_device']),
    r(['hourly_stats_aggregated_by_advertiser_time_zone'], ['spend', 'actions']),
  ])

  const runs = named.map((x, i) => runFrom(runRows[i][0] ?? {}, x))
  runs[runs.length - 1] = { ...runs[runs.length - 1], current: true }
  const c = runRows.at(-1)![0] ?? {}

  const curDays = daily.filter(d => String(d.date_start) >= cur.since && String(d.date_start) <= cur.until)
  const totals: Totals = {
    spend: n(c.spend), impressions: n(c.impressions), reach: n(c.reach), clicks: n(c.clicks),
    ctr: n(c.ctr), cpc: n(c.cpc), cpm: n(c.cpm), frequency: n(c.frequency),
    convos: action(c, A.convos), newConnections: action(c, A.newConnections), totalConnections: action(c, A.totalConnections),
    depth2: action(c, A.depth2), depth3: action(c, A.depth3), depth5: action(c, A.depth5),
    linkClicks: action(c, A.linkClicks), videoViews: action(c, A.videoViews), postSaves: action(c, A.postSaves),
    comments: action(c, A.comments), reactions: action(c, A.reactions),
    deliveryDays: cur.deliveryDays, calendarDays: runs.at(-1)!.days,
  }

  // Drop placements/segments that neither spent nor produced anything -- noise on a phone.
  const nonEmpty = <T extends { spend: number; convos: number }>(rows: T[]) => rows.filter(x => x.spend > 0 || x.convos > 0)

  return {
    pulledAt: new Date().toISOString(),
    source: 'live',
    accountId: account,
    runs,
    totals,
    placements: nonEmpty(place.map(p => toRow(placementLabel(String(p.publisher_platform), String(p.platform_position)), p))),
    platforms: nonEmpty(plat.map(p => toRow(p.publisher_platform === 'instagram' ? 'Instagram' : p.publisher_platform === 'facebook' ? 'Facebook' : String(p.publisher_platform), p))),
    ages: nonEmpty(ages.map(a => toRow(ageLabel(String(a.age)), a))),
    genders: nonEmpty(genders.map(g => toRow(genderLabel(String(g.gender)), g))),
    // Meta doesn't split conversations-started by region; total connections is the closest it gives.
    regions: nonEmpty(regions.map(g => toRow(String(g.region), g, A.totalConnections))),
    devices: nonEmpty(devices.map(d => toRow(deviceLabel(String(d.impression_device)), d))),
    hours: hours.map(h => ({
      h: parseInt(String(h.hourly_stats_aggregated_by_advertiser_time_zone).slice(0, 2), 10) || 0,
      spend: n(h.spend), convos: action(h, A.convos),
    })).sort((a, b) => a.h - b.h),
    days: fillDays(cur.since, cur.until, curDays),
  }
}

// Every calendar day of the run, zeros included -- an outage has to SHOW as a
// gap, not silently close up.
function fillDays(since: string, until: string, rows: InsightRow[]) {
  const by = new Map(rows.map(r => [String(r.date_start), r]))
  const out: AdsNumbers['days'] = []
  for (let d = since; d <= until; d = addDays(d, 1)) {
    const r = by.get(d)
    out.push({ date: d, spend: n(r?.spend), convos: r ? action(r, A.convos) : 0, ctr: n(r?.ctr) })
  }
  return out
}

/**
 * Pull, sanity-check, save. Returns what happened in one line for the cron log.
 * A pull that looks wrong is saved as a FAILURE, never as good numbers.
 */
export async function refreshAds(): Promise<{ ok: boolean; message: string }> {
  if (!supabaseConfigured) return { ok: false, message: 'Supabase not configured' }
  if (!systemToken() && !process.env.COMPOSIO_API_KEY?.trim()) {
    return { ok: false, message: 'No META_SYSTEM_TOKEN and no COMPOSIO_API_KEY — ads refresh skipped' }
  }
  try {
    const data = await pullAds()
    const t = data.totals
    if (!(t.spend >= 0) || !Number.isFinite(t.spend) || data.runs.some(r => !Number.isFinite(r.spend))) {
      throw new Error('Pulled numbers failed the sanity check (non-numeric spend)')
    }
    await supabase.from('ads_snapshots').insert({ ok: true, data })
    return {
      ok: true,
      message: `ads refreshed via ${systemToken() ? 'the system token' : 'Composio'}: ` +
        `run ${data.runs.at(-1)!.id}, ${data.runs.length} runs, RM ${t.spend.toFixed(2)}`,
    }
  } catch (e: any) {
    const message = String(e?.message ?? e).slice(0, 400)
    try { await supabase.from('ads_snapshots').insert({ ok: false, error: message }) } catch {}
    return { ok: false, message: `ads refresh failed: ${message}` }
  }
}
