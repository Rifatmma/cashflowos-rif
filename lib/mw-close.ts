import 'server-only'
// 👉 Closing a month properly, days after it ended.
//
// WHY THIS EXISTS. September's dashboard said 14 conversions; Google says 16.
// Neither was lying. The September snapshot was taken at 09:49 on the 30th,
// so it never saw the rest of that day — which had two conversions and S$79
// of spend. A month's "final" figures were simply whatever the last morning's
// pull happened to catch.
//
// It is worse than one missing day. Google attributes a conversion back to the
// date of the CLICK for up to sixty days, so a month keeps filling in long
// after it ends. Any snapshot of a month is provisional until well past the
// month's end, and the dashboard was treating the earliest possible reading as
// the final one.
//
// So: re-pull a finished month and overwrite its stored snapshot. Run for the
// previous month during the first days of a new one, and again later as late
// conversions land (owner, 5 Oct 2026).

import { supabase, supabaseConfigured } from './supabase'
import { runTool } from './composio-mcp'

const CUSTOMER = (process.env.GOOGLE_ADS_CUSTOMER_ID || '3759727500').replace(/-/g, '')
const r2 = (n: number) => Math.round(n * 100) / 100

const pick = (row: any, ...path: string[]) => {
  let cur = row
  for (const p of path) { if (cur == null || typeof cur !== 'object') return undefined; cur = cur[p] }
  return cur
}

async function gaql(query: string): Promise<any[]> {
  const res = await runTool('GOOGLEADS_SEARCH_STREAM_GAQL', undefined, { customer_id: CUSTOMER, query })
  const d = res?.data ?? res ?? {}
  const chunks = Array.isArray(d) ? d : (d.searchStream ?? d.response ?? [d])
  const out: any[] = []
  for (const c of (Array.isArray(chunks) ? chunks : [chunks])) {
    if (c && typeof c === 'object') out.push(...(c.results ?? c.rows ?? []))
  }
  return out
}

export type CloseResult = { ok: boolean; message: string; before?: number; after?: number }

/** Last day of a month, as YYYY-MM-DD. */
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/**
 * Re-pull `month` (YYYY-MM) and overwrite the stored snapshot for it.
 *
 * Only the figures that keep moving are rewritten — spend, conversions,
 * clicks, the daily series and impression share. Anything editorial on the
 * snapshot (benchmarks, notes, the written plan) is left exactly as it is: a
 * month close is an arithmetic correction, not a reinterpretation.
 */
export async function closeMonth(month: string): Promise<CloseResult> {
  if (!supabaseConfigured) return { ok: false, message: 'supabase not configured' }
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: `"${month}" is not a YYYY-MM month` }

  const from = `${month}-01`
  const to = monthEnd(month)
  const [y, m] = month.split('-').map(Number)

  // The snapshot to correct: the last one pulled inside that month.
  const { data: snap } = await supabase
    .from('mw_snapshots').select('id, data')
    .gte('pulled_at', new Date(Date.UTC(y, m - 1, 1)).toISOString())
    .lt('pulled_at', new Date(Date.UTC(y, m, 1)).toISOString())
    .order('pulled_at', { ascending: false }).limit(1).maybeSingle()
  if (!snap?.data) return { ok: false, message: `no snapshot stored for ${month}` }

  const DATES = `segments.date BETWEEN '${from}' AND '${to}'`
  let camp: any[], days: any[], ishare: any[]
  try {
    [camp, days, ishare] = await Promise.all([
      gaql(`SELECT campaign.name, metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions FROM campaign WHERE ${DATES}`),
      gaql(`SELECT segments.date, metrics.cost_micros, metrics.conversions FROM customer WHERE ${DATES}`),
      gaql(`SELECT campaign.name, campaign.status, metrics.impressions, metrics.clicks, `
         + `metrics.search_impression_share, metrics.search_budget_lost_impression_share, `
         + `metrics.search_rank_lost_impression_share, metrics.search_top_impression_share, `
         + `metrics.search_absolute_top_impression_share, metrics.search_exact_match_impression_share `
         + `FROM campaign WHERE metrics.impressions > 0 AND ${DATES}`),
    ])
  } catch (e: any) {
    // A failed pull must never be written as a month of zeroes.
    return { ok: false, message: `Google Ads refused: ${String(e?.message ?? e).slice(0, 160)}` }
  }
  if (!camp.length) return { ok: false, message: `Google returned nothing for ${month} — nothing written` }

  const num = (r: any, ...p: string[]) => Number(pick(r, 'metrics', ...p) ?? 0)
  const spend = r2(camp.reduce((a, r) => a + num(r, 'costMicros') / 1e6, 0))
  const leads = Math.round(camp.reduce((a, r) => a + num(r, 'conversions'), 0))
  const clicks = Math.round(camp.reduce((a, r) => a + num(r, 'clicks'), 0))

  const dayRows = days
    .map(r => ({ d: String(pick(r, 'segments', 'date') ?? ''), cost: num(r, 'costMicros') / 1e6, conv: num(r, 'conversions') }))
    .filter(x => x.d)
    .sort((a, b) => a.d.localeCompare(b.d))
  let run = 0
  const daily = {
    labels: dayRows.map(x => String(Number(x.d.slice(-2)))),
    cost: dayRows.map(x => r2(x.cost)),
    leads: dayRows.map(x => Math.round(x.conv)),
    cum: dayRows.map(x => { run += x.conv; return Math.round(run) }),
  }

  const data: any = JSON.parse(JSON.stringify(snap.data))
  const before = Number(data?.sem?.kpi?.leads ?? 0)

  data.sem.kpi = {
    ...data.sem.kpi,
    spend, leads, clicks,
    cpl: leads ? r2(spend / leads) : 0,
    cpc: clicks ? Math.round((spend / clicks) * 1000) / 1000 : 0,
    cvr: clicks ? r2((leads / clicks) * 100) : 0,
  }
  if (daily.labels.length) data.sem.daily = daily
  data.meta = { ...data.meta, daysDone: dayRows.filter(x => x.cost > 0).length || data.meta?.daysDone }

  if (ishare.length) {
    data.sem.ishare = ishare.map(r => ({
      n: String(pick(r, 'campaign', 'name') ?? ''),
      st: pick(r, 'campaign', 'status') ?? null,
      impr: num(r, 'impressions'), clicks: num(r, 'clicks'),
      is: pick(r, 'metrics', 'searchImpressionShare') ?? null,
      lostBudget: pick(r, 'metrics', 'searchBudgetLostImpressionShare') ?? null,
      lostRank: pick(r, 'metrics', 'searchRankLostImpressionShare') ?? null,
      top: pick(r, 'metrics', 'searchTopImpressionShare') ?? null,
      absTop: pick(r, 'metrics', 'searchAbsoluteTopImpressionShare') ?? null,
      exact: pick(r, 'metrics', 'searchExactMatchImpressionShare') ?? null,
    }))
  }

  // Say on the page itself that these are settled figures, not a morning's
  // partial read. The owner spotted the gap by comparing with Google; the
  // dashboard should be the one volunteering it.
  data.meta.closedAt = new Date().toISOString().slice(0, 10)

  const { error } = await supabase.from('mw_snapshots').update({ data }).eq('id', snap.id)
  if (error) return { ok: false, message: error.message }

  return {
    ok: true, before, after: leads,
    message: before === leads
      ? `${month} unchanged at ${leads} conversions, S$${spend.toFixed(2)}`
      : `${month} corrected: ${before} → ${leads} conversions, S$${spend.toFixed(2)} (late attribution and the final day)`,
  }
}

/**
 * The previous month, while it is still settling.
 *
 * Called from the daily run. Sixty days because that is how long Google keeps
 * attributing conversions back to a click; stopping at the 1st would bake in
 * exactly the undercount this module exists to fix.
 */
export async function closePreviousMonthIfDue(today = new Date()): Promise<CloseResult | null> {
  const d = today.getUTCDate()
  if (d > 7) return null
  const prev = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
  return closeMonth(prev.toISOString().slice(0, 7))
}
