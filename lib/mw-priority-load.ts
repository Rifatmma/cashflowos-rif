import 'server-only'
// 👉 The one ranked list, built from live data. Today, People, the SEO card,
// and the weekly cards all read this, so none of them can disagree
// about what comes first or whose it is.

import { supabase, supabaseConfigured } from './supabase'
import { getMwData } from './mw-data'
import { getActions, type ActionRow } from './mw-actions'
import { getMarketSeo, type MarketSeo } from './mw-market-data'
import { getGaps } from './mw-gap-run'
import { openProposals, spendOf, clicksOf } from './mw-proposals'
import { loadPlanner, type Planner } from './mw-seo-planner'
import { getPeople } from './mw-people-store'
import { FOCUS_MARKETS, type Person } from './mw-people'
import { rank, type Candidate, type Queue } from './mw-priorities'
import {
  trackingCandidates, seoStepCandidates, marketTaskCandidates, paidCandidates, gapCandidates,
  proposalCandidates, salesCandidates, ruledOutPhrases, TRACKING_IDS, type TaskRow, type LeadFact,
} from './mw-priority-sources'
import type { KeywordRow } from './mw-keywords'

export type Stack = {
  queue: Queue
  /** Every candidate before ranking, closed ones included — for "done this week". */
  all: Candidate[]
  /** Tasks each person finished in the last 7 days. */
  doneThisWeek: Map<string, number>
  people: Person[]
  planner: Planner
  markets: MarketSeo[]
  /** Snapshot numbers the Today signals use. */
  facts: {
    utmFill: number | null
    semrushAgeDays: number | null
    leads14: number
    unanswered14: number
    paid: { spend: number; leads: number; cpl: number; monthLabel: string } | null
    channels: { n: string; s: number; sl: number }[]
  }
}

const days = (iso: string | null | undefined) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null)

export async function loadStack(pre?: { rows?: ActionRow[]; markets?: MarketSeo[] }): Promise<Stack> {
  const [rows, markets, snap, gaps, props, people, leadsRes, semrushRes] = await Promise.all([
    pre?.rows ? Promise.resolve(pre.rows) : getActions('seo'),
    pre?.markets ? Promise.resolve(pre.markets) : getMarketSeo(),
    getMwData(),
    getGaps().catch(() => []),
    openProposals().catch(() => []),
    getPeople(),
    supabaseConfigured
      ? supabase.from('mw_leads').select('owner_name, owner_email, created_time, first_response_at, suspect_import, utm_medium')
          .gte('created_time', new Date(Date.now() - 30 * 86_400_000).toISOString())
      : Promise.resolve({ data: [] as any[] }),
    supabaseConfigured
      ? supabase.from('mw_market_seo').select('pulled_at, keywords').order('pulled_at', { ascending: false }).limit(60)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const planner = await loadPlanner({ rows, markets })

  // ── facts
  const leads = ((leadsRes as any).data ?? []) as (LeadFact & { utm_medium: string | null })[]
  const recent = leads.filter(l => !l.suspect_import && Date.parse(l.created_time) >= Date.now() - 14 * 86_400_000)
  const utmFill = recent.length ? recent.filter(l => !!l.utm_medium).length / recent.length : null
  const semrushRow = ((semrushRes as any).data ?? []).find((r: any) => Array.isArray(r.keywords) && r.keywords.length)
  const semrushAgeDays = days(semrushRow?.pulled_at ?? null)
  const d = snap?.data
  const kpi = d?.sem?.kpi
  const keywords: KeywordRow[] = ((d?.sem as any)?.keywords ?? []).filter((r: any) => r?.k).map((r: any) => ({
    text: String(r.k), matchType: r.mt ?? null, campaign: String(r.c ?? ''), adGroup: String(r.ag ?? ''),
    cost: Number(r.cost) || 0, clicks: Number(r.clicks) || 0, conversions: Number(r.conv) || 0,
    impressions: Number(r.impr) || 0, ctr: Number(r.ctr) || 0, qs: r.qs ?? null,
    adRelevance: r.qAd ?? null, landingPage: r.qPage ?? null, expectedCtr: r.qCtr ?? null, landingUrl: null,
  }))
  const cpl = Number(kpi?.cpl) || 0
  const monthKey = new Date().toISOString().slice(0, 7)

  // ── candidates
  const own = planner.own
  const seo = seoStepCandidates(planner.steps, planner.scored, planner.prog, people)
  const stepUrls = new Set(planner.steps.flatMap(s => [...(s.urls ?? []), ...(s.targets ?? []).map(t => t.url ?? '').filter(u => u.startsWith('/'))]))
  const tasks = marketTaskCandidates(rows.filter(r => r.source === 'generated') as unknown as TaskRow[], stepUrls, people)
  const paid = paidCandidates({ keywords, cpl, monthKey }, own)
  // Anything declined stays declined in every source, not only the one it was declined in.
  const declinedTitles = (await getActions()).filter(r => r.decision?.choice === 'reject').map(r => r.title)
  const content = gapCandidates(gaps.map(g => ({ country: g.country, market: g.market, clusters: g.clusters })), own, people, 3, ruledOutPhrases(declinedTitles))
  const proposals = proposalCandidates(props.map(p => ({
    id: p.id, url: p.url, kind: p.kind, status: p.status, spend: spendOf(p.evidence), clicks: clicksOf(p.evidence),
  })), cpl)
  const sales = salesCandidates(leads, people)

  const tracking = trackingCandidates(
    { utmFill, semrushAgeDays, marketsWithoutRivals: markets.filter(m => !m.competitors.length).length },
    own,
    {
      ga4: seo.filter(c => /^seo:leak-/.test(c.id)).map(c => c.id),
      zoho: [...paid, ...sales].map(c => c.id),
      semrush: content.map(c => c.id),
    },
  )

  const all: Candidate[] = [...tracking, ...paid, ...seo, ...tasks, ...content, ...proposals, ...sales]
  const queue = rank(all, {
    focusMarkets: FOCUS_MARKETS,
    capacity: Object.fromEntries(people.map(p => [p.name, p.hours])),
    defaultHours: 1,
  })

  // Done in the last seven days, credited to whoever owned the task.
  const doneThisWeek = new Map<string, number>()
  if (supabaseConfigured) {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const [st, dec] = await Promise.all([
      supabase.from('mw_seo_step_state').select('step_id').eq('stage', 'done').gte('updated_at', since),
      supabase.from('mw_decisions').select('action_id').eq('choice', 'done').gte('updated_at', since),
    ])
    const ids = new Set<string>([
      ...((st.data ?? []) as any[]).flatMap(r => [String(r.step_id), `seo:${r.step_id}`]),
      ...((dec.data ?? []) as any[]).map(r => `task:${r.action_id}`),
    ])
    for (const c of all) if (ids.has(c.id)) doneThisWeek.set(c.owner, (doneThisWeek.get(c.owner) ?? 0) + 1)
  }

  return {
    queue, all, doneThisWeek, people, planner, markets,
    facts: {
      utmFill, semrushAgeDays,
      leads14: recent.length, unanswered14: recent.filter(l => !l.first_response_at).length,
      paid: kpi ? { spend: Number(kpi.spend) || 0, leads: Number(kpi.leads) || 0, cpl, monthLabel: String(d?.meta?.monthLabel ?? '') } : null,
      channels: (d?.channels ?? []).map((c: any) => ({ n: String(c.n), s: Number(c.s) || 0, sl: Number(c.sl) || 0 })),
    },
  }
}

export { TRACKING_IDS }
