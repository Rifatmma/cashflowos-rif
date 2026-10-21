// Score the SEO plan against the live data and print the Focus cut.
//   npx -y tsx --conditions=react-server --env-file=.env scripts/seo-plan-score.mts
import { createClient } from '@supabase/supabase-js'
import { STEPS, scoreSteps, focusCut, type Evidence } from '../lib/mw-seo-plan'
import { isBrand } from '../lib/mw-markets'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: rows, error } = await db.from('mw_market_seo').select('cycle, market, country, gsc_keywords, keywords, ga4_sessions, ga4_leads')
if (error) throw error
const cycle = (rows ?? []).filter((r: any) => r.gsc_keywords).map((r: any) => String(r.cycle)).sort().pop()
const cur = (rows ?? []).filter((r: any) => String(r.cycle) === cycle)
const ev: Evidence = { keywords: [], funnel: [] }
const fm = new Map<string, { sessions: number; leads: number }>()
for (const r of cur as any[]) {
  for (const k of (r.gsc_keywords ?? []) as any[]) {
    const q = String(k.q ?? '')
    if (!q || isBrand(q)) continue
    ev.keywords.push({ q, url: String(k.url ?? ''), country: String(r.country), pos: Number(k.pos) || 0, impr: Number(k.impr) || 0, clicks: Number(k.clicks) || 0 })
  }
  const f = fm.get(r.market) ?? { sessions: 0, leads: 0 }
  f.sessions += Number(r.ga4_sessions) || 0; f.leads += Number(r.ga4_leads) || 0
  fm.set(r.market, f)
}
ev.funnel = [...fm].map(([market, f]) => ({ market, ...f }))
console.log('cycle', cycle, 'rows', ev.keywords.length, 'funnel', JSON.stringify(ev.funnel))
for (const s of scoreSteps(STEPS, ev).slice(0, 14)) console.log(s.score.toFixed(2).padStart(6), s.gain.leads.toFixed(2).padStart(6), s.step.id.padEnd(24), s.gain.basis)
const f = focusCut(STEPS, ev)
console.log('FOCUS', f.ids.length, 'steps', Math.round(f.share * 100) + '%', 'of', f.totalLeads.toFixed(1), 'leads/mo', f.ids.join(', '))
