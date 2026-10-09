import 'server-only'
import { supabase, supabaseConfigured } from './supabase'
import { desktopBidVerdict } from './mw-device-bids'
import { runWorkbench } from './composio-mcp'
import { gunzipSync } from 'node:zlib'
import type { MwData } from './mw-data'

// 👉 The Moving Walls daily pull. Runs at 9am Malaysia, kicked off by the morning cron.
//
// WHAT REPLACED WHAT. Until 28 Sep 2026 this ran as a Claude scheduled task that
// rewrote the artifact's HTML every morning. It kept not running: a scheduled
// Claude needs Claude to be awake and needs a human to approve its tool calls,
// so four mornings in five produced nothing and /mw showed week-old numbers with
// no sign anything was wrong. This version has no such dependency — Vercel calls
// it whether or not anyone is at a computer.
//
// WHAT IT TOUCHES, AND WHAT IT MUST NEVER TOUCH.
//   writes  mw_snapshots  — one new row per run; /mw always reads the newest
//   writes  mw_actions    — status + evidence, re-read from the account
//   NEVER   mw_decisions  — those are the team's answers (accept/reject/done and
//                           the reason). A robot that overwrote them would erase
//                           the record of why something was declined.
//   NEVER   mw_settings   — the targets are the owner's numbers.
//
// MEASURED vs CARRIED. Google Ads and GA4 are pulled fresh every morning. The
// Semrush blocks (competitors, keyword gaps, brand split, market table) are NOT:
// this app has no Semrush key — that research is done in Claude with the Semrush
// MCP. Rather than blank those sections or invent numbers for them, the refresh
// copies them from the previous snapshot and leaves meta.semrush showing their
// real age, so the SEO tab keeps saying "Semrush 25 Sep" until someone genuinely
// refreshes it. Same for the hand-written narrative (leaks, benchmark notes, the
// three discussion cards): carried, never fabricated.
//
// IT NEVER THROWS. A failed pull returns ok:false and writes nothing, so /mw
// keeps showing the last good snapshot with its true age rather than a blank.

const CUSTOMER = (process.env.GOOGLE_ADS_CUSTOMER_ID || '3759727500').replace(/-/g, '')
// The GA4 tool wants the full resource name ("properties/342007847"), not the
// bare id — it refuses the call outright if you pass property_id instead.
const GA4 = (() => {
  const raw = (process.env.GA4_PROPERTY_ID || '342007847').trim()
  return raw.startsWith('properties/') ? raw : `properties/${raw}`
})()

type Row = Record<string, any>
type Pull = {
  err?: string[]
  ads?: { cur: Row[]; prev: Row[]; daily: Row[]; kw: Row[]; budgets: Row[]; devices: Row[]; devperf?: Row[]; schedules: Row[]
           ishare?: Row[]; isharePrev?: Row[]; adurls?: Row[] }
  ga4?: { cur: Row[]; prev: Row[]; daily: Row[] }
  span?: Record<string, any>
}

// Runs inside Composio's sandbox: nine API calls there, one JSON back. Doing it
// in one script rather than nine round-trips is what keeps this inside 60s.
const SCRIPT = (customer: string, ga4: string) => String.raw`
import json, datetime, calendar, gzip, base64

TODAY = datetime.datetime.utcnow() + datetime.timedelta(hours=8)   # Asia/Kuala_Lumpur
CUR_S = TODAY.replace(day=1).date()
CUR_E = TODAY.date()
PREV_E = CUR_S - datetime.timedelta(days=1)
PREV_S = PREV_E.replace(day=1)
ERR = []

def gaql(q):
    res, err = run_composio_tool('GOOGLEADS_SEARCH_STREAM_GAQL',
        {'customer_id': ${JSON.stringify(customer)}, 'query': q},
        print_schema_for_tool=False)
    if err:
        ERR.append(str(err)[:200]); return []
    d = (res or {}).get('data') or res or {}
    chunks = d if isinstance(d, list) else (d.get('searchStream') or d.get('response') or [d])
    if isinstance(chunks, dict): chunks = [chunks]
    out = []
    for c in chunks:
        if isinstance(c, dict):
            out.extend(c.get('results') or c.get('rows') or [])
    return out

def g(row, *path):
    cur = row
    for p in path:
        if not isinstance(cur, dict): return None
        cur = cur.get(p)
    return cur

def micros(r):
    return float(g(r,'metrics','costMicros') or g(r,'metrics','cost_micros') or 0) / 1e6

DATES = "segments.date BETWEEN '%s' AND '%s'"
PERF = ("SELECT campaign.name, campaign.status, campaign.advertising_channel_type, "
        "metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions "
        "FROM campaign WHERE ")

cur  = gaql(PERF + (DATES % (CUR_S, CUR_E)))
prev = gaql(PERF + (DATES % (PREV_S, PREV_E)))
daily = gaql("SELECT segments.date, metrics.cost_micros, metrics.conversions FROM campaign WHERE "
             + (DATES % (CUR_S, CUR_E)))
# QUALITY SCORE, NOT JUST CONVERSIONS. A keyword with clicks and no
# conversions is not automatically a bad keyword: Google scores it on ad
# relevance, expected click-through and landing page experience, and if the
# page is the weak one then pausing the keyword pauses demand we are failing
# to serve rather than demand that is not there (owner, 5 Oct 2026).
kw = gaql("SELECT campaign.name, ad_group.name, ad_group.id, "
          "ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, "
          "ad_group_criterion.status, "
          "ad_group_criterion.quality_info.quality_score, "
          "ad_group_criterion.quality_info.creative_quality_score, "
          "ad_group_criterion.quality_info.post_click_quality_score, "
          "ad_group_criterion.quality_info.search_predicted_ctr, "
          "metrics.cost_micros, metrics.conversions, metrics.clicks, "
          "metrics.impressions, metrics.ctr "
          "FROM keyword_view WHERE " + (DATES % (CUR_S, CUR_E)))

# Where each ad group sends its clicks. Final URLs live on the AD, not the
# keyword, so a keyword's landing page has to be reached through its group.
adurls = gaql("SELECT ad_group.id, ad_group_ad.ad.final_urls FROM ad_group_ad "
              "WHERE ad_group_ad.status != 'REMOVED' AND ad_group.status = 'ENABLED'")
# WHY WE DO NOT SHOW. Impression share splits every missed auction into two
# causes that need opposite responses: lost to BUDGET means the money ran out
# before the day did, lost to RANK means we were outbid or outranked on
# quality. One is a finance decision, the other a campaign one, and the single
# "impression share" number hides which (owner, 5 Oct 2026).
#
# Competitor DOMAINS are deliberately absent: auction_insight_domain is not a
# field in the Google Ads API (v23 answers UNRECOGNIZED_FIELD). That report
# exists only in the Google Ads UI, so naming rivals needs a CSV export.
ISHARE = ("SELECT campaign.name, campaign.status, metrics.impressions, metrics.clicks, "
          "metrics.search_impression_share, metrics.search_budget_lost_impression_share, "
          "metrics.search_rank_lost_impression_share, metrics.search_top_impression_share, "
          "metrics.search_absolute_top_impression_share, metrics.search_exact_match_impression_share "
          "FROM campaign WHERE metrics.impressions > 0 AND ")
ishare      = gaql(ISHARE + (DATES % (CUR_S, CUR_E)))
ishare_prev = gaql(ISHARE + (DATES % (PREV_S, PREV_E)))

budgets   = gaql("SELECT campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign")
# ENABLED ONLY. Without the status filter this counted 12 desktop criteria of
# which 8 were paused and 2 deleted, and reported "no adjustment anywhere" about
# campaigns that no longer run (owner, 9 Oct 2026).
devices   = gaql("SELECT campaign.name, campaign.status, campaign.bidding_strategy_type, "
                 "campaign_criterion.device.type, campaign_criterion.bid_modifier "
                 "FROM campaign_criterion WHERE campaign_criterion.type = 'DEVICE' "
                 "AND campaign.status = 'ENABLED'")
# What each device actually DID. A rule that only reads configuration can never
# stop asking for the setting it is looking for.
devperf   = gaql("SELECT campaign.name, segments.device, metrics.clicks, metrics.cost_micros, "
                 "metrics.conversions FROM campaign WHERE campaign.status = 'ENABLED' AND "
                 + (DATES % (CUR_S, CUR_E)))
schedules = gaql("SELECT campaign.name, campaign_criterion.ad_schedule.day_of_week "
                 "FROM campaign_criterion WHERE campaign_criterion.type = 'AD_SCHEDULE'")

def perf(rows):
    return [{'n': g(r,'campaign','name'), 'st': g(r,'campaign','status'),
             'ch': g(r,'campaign','advertisingChannelType') or g(r,'campaign','advertising_channel_type'),
             'cost': micros(r),
             'conv': float(g(r,'metrics','conversions') or 0),
             'clicks': float(g(r,'metrics','clicks') or 0),
             'impr': float(g(r,'metrics','impressions') or 0)} for r in rows]

def ga(body):
    res, err = run_composio_tool('GOOGLE_ANALYTICS_BATCH_RUN_REPORTS',
        {'property': ${JSON.stringify(ga4)}, 'requests': body},
        print_schema_for_tool=False)
    if err:
        ERR.append(str(err)[:200]); return []
    d = (res or {}).get('data') or res or {}
    return d.get('reports') or d.get('batchReports') or []

def rng(a, b): return {'startDate': str(a), 'endDate': str(b)}
CH = [{'name': 'sessionDefaultChannelGroup'}]
MET = [{'name': 'sessions'}, {'name': 'totalUsers'}, {'name': 'keyEvents'}]

reps = ga([
  {'dateRanges': [rng(CUR_S, CUR_E)],   'dimensions': CH, 'metrics': MET, 'limit': 50},
  {'dateRanges': [rng(PREV_S, PREV_E)], 'dimensions': CH, 'metrics': MET, 'limit': 50},
  {'dateRanges': [rng(CUR_S, CUR_E)],
   'dimensions': [{'name': 'date'}, {'name': 'sessionDefaultChannelGroup'}],
   'metrics': [{'name': 'sessions'}, {'name': 'keyEvents'}], 'limit': 2000},
])

def flat(rep):
    out = []
    for r in (rep or {}).get('rows') or []:
        dims = [x.get('value') for x in r.get('dimensionValues') or []]
        mets = [float(x.get('value') or 0) for x in r.get('metricValues') or []]
        out.append({'d': dims, 'm': mets})
    return out

OUT = {'err': ERR,
       'ads': {'cur': perf(cur), 'prev': perf(prev),
               'daily': [{'d': g(r,'segments','date'), 'cost': micros(r),
                          'conv': float(g(r,'metrics','conversions') or 0)} for r in daily],
               'adurls': [{'ag': g(r,'adGroup','id') or g(r,'ad_group','id'),
                           'u': (g(r,'adGroupAd','ad','finalUrls') or g(r,'ad_group_ad','ad','final_urls') or [None])[0]}
                          for r in adurls],
               'kw': [{'c': g(r,'campaign','name'),
                       'ag': g(r,'adGroup','name') or g(r,'ad_group','name'),
                       'agid': g(r,'adGroup','id') or g(r,'ad_group','id'),
                       'qs': g(r,'adGroupCriterion','qualityInfo','qualityScore'),
                       'qAd': g(r,'adGroupCriterion','qualityInfo','creativeQualityScore'),
                       'qPage': g(r,'adGroupCriterion','qualityInfo','postClickQualityScore'),
                       'qCtr': g(r,'adGroupCriterion','qualityInfo','searchPredictedCtr'),
                       'impr': float(g(r,'metrics','impressions') or 0),
                       'ctr': float(g(r,'metrics','ctr') or 0),
                       'k': g(r,'adGroupCriterion','keyword','text') or g(r,'ad_group_criterion','keyword','text'),
                       'mt': g(r,'adGroupCriterion','keyword','matchType') or g(r,'ad_group_criterion','keyword','match_type'),
                       'st': g(r,'adGroupCriterion','status') or g(r,'ad_group_criterion','status'),
                       'cost': micros(r), 'conv': float(g(r,'metrics','conversions') or 0),
                       'clicks': float(g(r,'metrics','clicks') or 0)} for r in kw],
               'ishare': [{'n': g(r,'campaign','name'), 'st': g(r,'campaign','status'),
                           'impr': float(g(r,'metrics','impressions') or 0),
                           'clicks': float(g(r,'metrics','clicks') or 0),
                           'is': g(r,'metrics','searchImpressionShare'),
                           'lostBudget': g(r,'metrics','searchBudgetLostImpressionShare'),
                           'lostRank': g(r,'metrics','searchRankLostImpressionShare'),
                           'top': g(r,'metrics','searchTopImpressionShare'),
                           'absTop': g(r,'metrics','searchAbsoluteTopImpressionShare'),
                           'exact': g(r,'metrics','searchExactMatchImpressionShare')} for r in ishare],
               'isharePrev': [{'n': g(r,'campaign','name'),
                               'is': g(r,'metrics','searchImpressionShare'),
                               'lostBudget': g(r,'metrics','searchBudgetLostImpressionShare'),
                               'lostRank': g(r,'metrics','searchRankLostImpressionShare')} for r in ishare_prev],
               'budgets': [{'n': g(r,'campaign','name'), 'st': g(r,'campaign','status'),
                            'b': float(g(r,'campaignBudget','amountMicros') or g(r,'campaign_budget','amount_micros') or 0)/1e6}
                           for r in budgets],
               'devices': [{'n': g(r,'campaign','name'),
                            'strategy': g(r,'campaign','biddingStrategyType') or g(r,'campaign','bidding_strategy_type'),
                            'dev': g(r,'campaignCriterion','device','type') or g(r,'campaign_criterion','device','type'),
                            'mod': g(r,'campaignCriterion','bidModifier') or g(r,'campaign_criterion','bid_modifier')}
                           for r in devices],
               'devperf': [{'n': g(r,'campaign','name'),
                            'dev': g(r,'segments','device'),
                            'clicks': float(g(r,'metrics','clicks') or 0),
                            'cost': micros(r),
                            'conv': float(g(r,'metrics','conversions') or 0)}
                           for r in devperf],
               'schedules': [{'n': g(r,'campaign','name'),
                              'day': g(r,'campaignCriterion','adSchedule','dayOfWeek') or g(r,'campaign_criterion','ad_schedule','day_of_week')}
                             for r in schedules]},
       # Only Organic Search days travel: they are the only rows the shaping
       # reads (the SEO trend line), and the full day x channel grid is ~2,000
       # rows that blew past Composio's stdout cap -- see the note below.
       'ga4': {'cur': flat(reps[0] if len(reps) > 0 else None),
               'prev': flat(reps[1] if len(reps) > 1 else None),
               'daily': [r for r in flat(reps[2] if len(reps) > 2 else None)
                         if (r.get('d') or ['', ''])[1] == 'Organic Search']},
       'span': {'curStart': str(CUR_S), 'curEnd': str(CUR_E),
                'prevStart': str(PREV_S), 'prevEnd': str(PREV_E),
                'prevDays': (PREV_E - PREV_S).days + 1,
                'daysMonth': calendar.monthrange(TODAY.year, TODAY.month)[1]}}
# Composio truncates stdout at about 10,000 characters and parks the rest in a
# file -- so a raw dump lost its closing marker and the whole morning pull read
# as "no result" (owner, 29 Sep 2026). Gzipped and base64'd, the same data is a
# fraction of the size; lib/mw-refresh.ts inflates it.
_raw = json.dumps(OUT, ensure_ascii=True, separators=(',', ':'))
_z = base64.b64encode(gzip.compress(_raw.encode())).decode()
print('<<<CFO' + json.dumps({'z': _z, 'raw_len': len(_raw)}) + '\nCFO>>>')
`

// ---------------------------------------------------------------- helpers
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const r2 = (v: number) => Math.round(v * 100) / 100
const money = (v: number) => 'S$' + v.toFixed(2)
const delta = (now: number, was: number, invert = false) => {
  if (!(was > 0)) return now > 0 ? 'new' : '—'
  const p = Math.round(((now - was) / was) * 100)
  return `${p >= 0 ? '+' : ''}${p}%`
}

/** Weekdays only — the days paid search actually delivers on this account. */
function weekdays(y: number, m: number, upto?: number): number {
  const last = upto ?? new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  let n = 0
  for (let d = 1; d <= last; d++) {
    const w = new Date(Date.UTC(y, m, d)).getUTCDay()
    if (w !== 0 && w !== 6) n++
  }
  return n
}

// ---------------------------------------------------------------- the refresh
export async function refreshMw(): Promise<{ ok: boolean; message: string }> {
  if (!supabaseConfigured) return { ok: false, message: 'mw refresh skipped: Supabase not configured' }
  if (!process.env.COMPOSIO_API_KEY?.trim()) return { ok: false, message: 'mw refresh skipped: COMPOSIO_API_KEY not set' }

  let pull: Pull
  try {
    const out: any = await runWorkbench(SCRIPT(CUSTOMER, GA4))
    // The sandbox sends the payload gzipped: Composio truncates stdout around
    // 10,000 characters, and the raw JSON is many times that.
    pull = out?.z ? JSON.parse(gunzipSync(Buffer.from(String(out.z), 'base64')).toString('utf8')) : out
  } catch (e: any) {
    return { ok: false, message: `mw refresh failed: ${String(e?.message || e).slice(0, 200)}` }
  }

  const ads = pull?.ads
  const ga = pull?.ga4
  if (!ads?.cur?.length && !ga?.cur?.length) {
    return { ok: false, message: `mw refresh got nothing back${pull?.err?.length ? `: ${pull.err[0]}` : ''}` }
  }

  // The previous snapshot is the source for everything this job cannot measure.
  const { data: last } = await supabase
    .from('mw_snapshots').select('data').order('pulled_at', { ascending: false }).limit(1).maybeSingle()
  const prev = (last?.data ?? null) as MwData | null
  if (!prev) return { ok: false, message: 'mw refresh aborted: no previous snapshot to carry the Semrush blocks from' }

  const span = pull.span ?? {}
  const now = new Date(Date.now() + 8 * 3600 * 1000)     // Malaysia
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), dayOfMonth = now.getUTCDate()
  const prevLabel = MONTHS[(mo + 11) % 12]

  // ------------------------------------------------- paid search
  const sum = (rows: Row[], k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)
  const cur = ads?.cur ?? [], was = ads?.prev ?? []
  const spend = sum(cur, 'cost'), leads = sum(cur, 'conv'), clicks = sum(cur, 'clicks')
  const pSpend = sum(was, 'cost'), pLeads = sum(was, 'conv'), pClicks = sum(was, 'clicks')
  const cpl = leads > 0 ? spend / leads : 0
  const cpc = clicks > 0 ? spend / clicks : 0
  const cvr = clicks > 0 ? (leads / clicks) * 100 : 0
  const pCpl = pLeads > 0 ? pSpend / pLeads : 0
  const pCpc = pClicks > 0 ? pSpend / pClicks : 0
  const pCvr = pClicks > 0 ? (pLeads / pClicks) * 100 : 0
  const vs = (s: string) => `${s} vs ${prevLabel}`

  // Daily spend/leads, collapsed from campaign rows to one row per date.
  const byDate = new Map<string, { cost: number; conv: number }>()
  for (const d of ads?.daily ?? []) {
    const key = String(d.d ?? '').replace(/-/g, '')
    if (!key) continue
    const at = byDate.get(key) ?? { cost: 0, conv: 0 }
    at.cost += Number(d.cost) || 0
    at.conv += Number(d.conv) || 0
    byDate.set(key, at)
  }
  const dates = [...byDate.keys()].sort()
  let run = 0
  const daily = {
    labels: dates.map(d => String(Number(d.slice(-2)))),
    cost: dates.map(d => r2(byDate.get(d)!.cost)),
    leads: dates.map(d => Math.round(byDate.get(d)!.conv)),
    cum: dates.map(d => { run += byDate.get(d)!.conv; return Math.round(run) }),
  }
  const daysDone = dates.filter(d => (byDate.get(d)!.cost || 0) > 0).length || weekdays(y, mo, dayOfMonth)

  // Concentration: daily budget spread across the keywords actually enabled.
  const budgetOf = new Map((ads?.budgets ?? []).map(b => [String(b.n), Number(b.b) || 0]))
  const liveOf = new Map((ads?.budgets ?? []).map(b => [String(b.n), String(b.st ?? '') === 'ENABLED']))
  const kwStat = new Map<string, { live: number; broad: number; clicks: number; conv: number }>()
  for (const k of ads?.kw ?? []) {
    const c = String(k.c ?? ''); if (!c) continue
    const at = kwStat.get(c) ?? { live: 0, broad: 0, clicks: 0, conv: 0 }
    if (String(k.st ?? '') === 'ENABLED') at.live++
    if (String(k.mt ?? '').toUpperCase() === 'BROAD') at.broad++
    at.clicks += Number(k.clicks) || 0
    at.conv += Number(k.conv) || 0
    kwStat.set(c, at)
  }
  const concentration = [...kwStat.entries()]
    .filter(([c, s]) => s.live > 0 && (budgetOf.get(c) ?? 0) > 0)
    .map(([c, s]) => ({
      c,
      bpk: r2((budgetOf.get(c) ?? 0) / s.live),
      cvr: r2(s.clicks > 0 ? (s.conv / s.clicks) * 100 : 0),
      broad: s.broad > s.live / 2,
      live: liveOf.get(c) ?? false,
    }))
    .sort((a, b) => b.bpk - a.bpk)

  // Campaign scoreboard. The one-line note is carried from the previous
  // snapshot when the campaign is the same one — it is editorial, not measured.
  const noteOf = new Map((prev.sem.campaigns ?? []).map(c => [c.name, c.note]))
  const CHANNEL: Record<string, string> = {
    SEARCH: 'Search', PERFORMANCE_MAX: 'Performance Max', DISPLAY: 'Display',
    VIDEO: 'Video', SHOPPING: 'Shopping', DEMAND_GEN: 'Demand Gen',
  }
  const campaigns = cur
    .map(c => {
      const name = String(c.n ?? '')
      const cSpend = Number(c.cost) || 0, cLeads = Number(c.conv) || 0
      return {
        name,
        sub: CHANNEL[String(c.ch ?? '')] ?? String(c.ch ?? '').replace(/_/g, ' ').toLowerCase(),
        state: String(c.st ?? ''),
        spend: r2(cSpend),
        leads: Math.round(cLeads),
        cpl: cLeads > 0 ? r2(cSpend / cLeads) : null,
        note: noteOf.get(name) ?? '',
      }
    })
    .filter(c => c.spend > 0 || c.leads > 0)
    .sort((a, b) => b.spend - a.spend)

  // ------------------------------------------------- GA4 channels
  const curCh = new Map<string, number[]>((ga?.cur ?? []).map(r => [String(r.d?.[0] ?? ''), r.m as number[]]))
  const prevCh = new Map<string, number[]>((ga?.prev ?? []).map(r => [String(r.d?.[0] ?? ''), r.m as number[]]))
  const names = [...new Set([...curCh.keys(), ...prevCh.keys()])].filter(Boolean)
  const channels = names
    .map(n => {
      const c = curCh.get(n) ?? [0, 0, 0]
      const p = prevCh.get(n) ?? [0, 0, 0]
      return { n, s: Math.round(c[0] || 0), sl: Math.round(c[2] || 0), a: Math.round(p[0] || 0), al: Math.round(p[2] || 0) }
    })
    .sort((a, b) => b.s - a.s)

  // Organic search, day by day — the SEO tab's trend line.
  const org = (ga?.daily ?? []).filter(r => String(r.d?.[1] ?? '') === 'Organic Search')
    .sort((a, b) => String(a.d?.[0]).localeCompare(String(b.d?.[0])))
  const orgDaily = {
    start: org.length ? `${Number(String(org[0].d[0]).slice(6, 8))} ${SHORT[mo]}` : prev.seo.daily.start,
    sessions: org.map(r => Math.round(r.m?.[0] || 0)),
    leads: org.map(r => Math.round(r.m?.[1] || 0)),
  }

  const organic = channels.find(c => c.n === 'Organic Search')
  const totalLeads = channels.reduce((a, c) => a + c.sl, 0)
  const orgUsers = Math.round((curCh.get('Organic Search') ?? [0, 0, 0])[1] || 0)
  const orgSessions = organic?.s ?? 0
  const orgLeads = organic?.sl ?? 0

  // ------------------------------------------------- the snapshot
  const data: MwData = {
    meta: {
      pulled: `${dayOfMonth} ${SHORT[mo]} ${y}`,
      semrush: prev.meta.semrush,                 // carried — see the note at the top
      monthLabel: MONTHS[mo],
      daysDone,
      daysMonth: weekdays(y, mo),
      days: dayOfMonth,
      prevDays: Number(span.prevDays) || prev.meta.prevDays,
      prevLabel,
    },
    sem: {
      kpi: {
        spend: r2(spend), leads: Math.round(leads), cpl: r2(cpl), clicks: Math.round(clicks),
        cpc: Math.round(cpc * 1000) / 1000, cvr: r2(cvr), live: campaigns.filter(c => c.state === 'ENABLED').length,
        dSpend: vs(delta(spend, pSpend)), dLeads: vs(delta(leads, pLeads)), dCpl: vs(delta(cpl, pCpl)),
        dClicks: vs(delta(clicks, pClicks)), dCpc: vs(delta(cpc, pCpc)), dCvr: vs(delta(cvr, pCvr)),
      },
      daily,
      // Impression share: our own side of every auction. Carried from the
      // previous snapshot when a pull returns nothing, so a bad morning at
      // Google does not read as "we stopped competing".
      ishare: (ads?.ishare ?? []).length ? ads!.ishare : (prev.sem as any).ishare,
      isharePrev: (ads?.isharePrev ?? []).length ? ads!.isharePrev : (prev.sem as any).isharePrev,
      // Raw keyword rows with quality score, for the keyword analysis. Kept
      // separate from `concentration`, which is a different question.
      keywords: (ads?.kw ?? []).length ? ads!.kw : (prev.sem as any).keywords,
      adUrls: (ads?.adurls ?? []).length ? ads!.adurls : (prev.sem as any).adUrls,
      concentration: concentration.length ? concentration : prev.sem.concentration,
      campaigns: campaigns.length ? campaigns : prev.sem.campaigns,
      benchmark: prev.sem.benchmark,              // carried — editorial
      leaks: prev.sem.leaks,                      // carried — editorial
    },
    seo: {
      market: prev.seo.market,
      kpi: {
        sessions: orgSessions, users: orgUsers, leads: orgLeads,
        shareOfLeads: totalLeads > 0 ? `${Math.round((orgLeads / totalLeads) * 100)}%` : '—',
        cvr: orgSessions > 0 ? r2((orgLeads / orgSessions) * 100) : 0,
        authority: prev.seo.kpi.authority,        // carried — Semrush
        refDomains: prev.seo.kpi.refDomains,      // carried — Semrush
      },
      daily: orgDaily.sessions.length ? orgDaily : prev.seo.daily,
      competitors: prev.seo.competitors,          // carried — Semrush
      brand: prev.seo.brand,
      opportunities: prev.seo.opportunities,
      winning: prev.seo.winning,
      collide: prev.seo.collide,
      markets: prev.seo.markets,
      marketNote: prev.seo.marketNote,
    },
    channels: channels.length ? channels : prev.channels,
    overview: prev.overview,                      // carried — the three discussion cards
  }

  const acted = await refreshActions({
    ads: {
      cur, prev: was,
      daily: ads?.daily ?? [], kw: ads?.kw ?? [],
      budgets: ads?.budgets ?? [], devices: ads?.devices ?? [], schedules: ads?.schedules ?? [],
    },
    channels, prevLabel, monthLabel: MONTHS[mo], days: dayOfMonth,
    prevDays: Number(span.prevDays) || 30,
  })

  const note = `Auto refresh — Ads + GA4 through ${dayOfMonth} ${SHORT[mo]}, Semrush ${prev.meta.semrush} (carried).` +
    (pull.err?.length ? ` Partial: ${pull.err[0].slice(0, 120)}` : '')

  const { error } = await supabase.from('mw_snapshots')
    .insert({ pulled_at: new Date().toISOString(), source: 'cron', data, note })
  if (error) return { ok: false, message: `mw refresh could not save: ${error.message}` }

  return {
    ok: true,
    message: `mw refresh ok — ${campaigns.length} campaigns, ${money(spend)} spend, ${Math.round(leads)} paid leads, ` +
      `${channels.length} GA4 channels, ${acted} action${acted === 1 ? '' : 's'} re-checked` +
      (pull.err?.length ? ` (partial: ${pull.err[0].slice(0, 80)})` : ''),
  }
}

// ---------------------------------------------------------------- action status
//
// Only the checks that can be READ FROM THE ACCOUNT live here. An action whose
// completion cannot be observed (a judgement call, an offline conversation) is
// left exactly as it was rather than guessed at — the team marks those by hand,
// and their decision is in mw_decisions where this job cannot reach it.

type Probe = { ads: NonNullable<Pull['ads']>; channels: { n: string; s: number; sl: number; a: number; al: number }[]
  prevLabel: string; monthLabel: string; days: number; prevDays: number }

async function refreshActions(p: Probe): Promise<number> {
  // `moot_why` and `how_text` ride along for an item that no longer applies:
  // the reason belongs on the card, and where there IS a real alternative it
  // should be named rather than left for him to work out (owner, 9 Oct 2026).
  const updates: {
    id: string; status: string; evidence: string
    moot_why?: string; how_text?: string
  }[] = []
  const n = (v: number) => Math.round(v).toLocaleString('en-US')

  // a01 — Restart India Max Con with a bigger budget.
  const maxcon = p.ads.budgets.find(b => /max ?con/i.test(String(b.n ?? '')) && /india/i.test(String(b.n ?? '')))
  if (maxcon) {
    const live = String(maxcon.st ?? '') === 'ENABLED'
    const budget = Number(maxcon.b) || 0
    updates.push({
      id: 'a01',
      status: live && budget > 25 ? 'done' : live ? 'part' : 'not',
      evidence: `status ${maxcon.st} · budget S$${budget.toFixed(2)}/day`,
    })
  }

  // a03 — Finish cutting the zero-conversion keywords.
  const bleeding = p.ads.kw
    .filter(k => String(k.st ?? '') === 'ENABLED' && (Number(k.cost) || 0) >= 10 && !(Number(k.conv) > 0))
    .sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0))
  updates.push({
    id: 'a03',
    status: bleeding.length === 0 ? 'done' : bleeding.length <= 5 ? 'part' : 'not',
    evidence: bleeding.length === 0
      ? `no enabled keyword has spent S$10+ without a conversion this ${p.monthLabel}`
      : `still live: ${bleeding.slice(0, 4).map(k => `${k.k} (S$${(Number(k.cost) || 0).toFixed(2)})`).join(', ')}` +
        (bleeding.length > 4 ? ` · and ${bleeding.length - 4} more, ${bleeding.length} in total` : ''),
  })

  // a05 — Desktop bid adjustment. The judgement lives in lib/mw-device-bids.ts
  // so it can be tested against real account numbers; the note on why it had
  // to be rewritten is there too.
  {
    const verdict = desktopBidVerdict(
      (p.ads.devices ?? []).map((d: any) => ({
        n: String(d.n ?? ''), dev: String(d.dev ?? ''),
        mod: d.mod == null ? null : Number(d.mod), strategy: String(d.strategy ?? ''),
      })),
      (p.ads.devperf ?? []).map((x: any) => ({
        n: String(x.n ?? ''), dev: String(x.dev ?? ''),
        clicks: Number(x.clicks) || 0, cost: Number(x.cost) || 0, conv: Number(x.conv) || 0,
      })),
    )
    if (verdict) {
      updates.push({ id: 'a05', status: verdict.status, evidence: verdict.evidence, moot_why: verdict.mootWhy })
    }
  }

  // a08 — Test weekends. Saturday or Sunday appearing in any ad schedule is the tell.
  if (p.ads.schedules.length) {
    const wknd = p.ads.schedules.filter(s => /SATURDAY|SUNDAY/i.test(String(s.day ?? '')))
    const campaigns = [...new Set(wknd.map(s => String(s.n ?? '')))]
    updates.push({
      id: 'a08',
      status: campaigns.length ? 'part' : 'not',
      evidence: campaigns.length
        ? `weekend hours now scheduled on: ${campaigns.slice(0, 3).join(', ')}`
        : `every ad schedule is still Monday–Friday only, across ${new Set(p.ads.schedules.map(s => s.n)).size} campaigns`,
    })
  }

  // a19 — The Email traffic spike. Still open while Email brings sessions and no leads.
  const email = p.channels.find(c => c.n === 'Email')
  if (email) {
    const perNow = email.s / (p.days || 1), perWas = email.a / (p.prevDays || 1)
    updates.push({
      id: 'a19',
      status: email.sl > 0 ? 'done' : email.s > email.a ? 'not' : 'part',
      evidence: `GA4 ${p.monthLabel}: ${n(email.s)} sessions (${perNow.toFixed(0)}/day) vs ${p.prevLabel} ` +
        `${n(email.a)} (${perWas.toFixed(0)}/day) · ${email.sl} lead${email.sl === 1 ? '' : 's'}`,
    })
  }

  // a15 — Reconcile Google Ads conversions against GA4.
  const paid = p.channels.find(c => c.n === 'Paid Search')
  const adsLeads = p.ads.cur.reduce((a, c) => a + (Number(c.conv) || 0), 0)
  if (paid) {
    const gap = Math.abs(adsLeads - paid.sl)
    updates.push({
      id: 'a15',
      status: gap <= 1 ? 'done' : gap <= 3 ? 'part' : 'not',
      evidence: `Google Ads reports ${adsLeads.toFixed(0)} conversions this ${p.monthLabel}; ` +
        `GA4 Paid Search shows ${paid.sl} key events from ${n(paid.s)} sessions`,
    })
  }

  let done = 0
  const now = new Date().toISOString()
  for (const u of updates) {
    // checked_at moves on EVERY run, whether or not anything changed: the age
    // of a claim is the thing he could not see, and "nothing changed" is still
    // a fresh answer (owner, 9 Oct 2026).
    const row: Record<string, unknown> = {
      status: u.status, evidence: u.evidence, updated_at: now, checked_at: now,
    }
    if (u.status === 'moot') {
      // The reason AND the real alternative, together, because "you can't do
      // this" on its own leaves him to work out what he can do instead.
      // NOT in `how`: that column has a fixed shape (steps, keywords, url…)
      // that the playbook reads, and free text there would break it.
      row.moot_why = [u.moot_why ?? u.evidence, u.how_text].filter(Boolean).join(' ')
      // Set once and left alone, so "no longer applies" can say SINCE when.
      const { data: had } = await supabase.from('mw_actions').select('moot_at').eq('id', u.id).maybeSingle()
      if (!had?.moot_at) row.moot_at = now
    } else {
      // It applies again. A rule that could not un-moot itself would be the
      // same mistake in the other direction.
      row.moot_at = null
      row.moot_why = null
    }
    const { error } = await supabase.from('mw_actions').update(row).eq('id', u.id)
    if (!error) done++
  }
  return done
}
