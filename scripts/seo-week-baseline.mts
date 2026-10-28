// Save this week's positions for every SEO plan step's target searches, so
// the Monday re-score (step rhythm-rescore) can say what moved week on week.
// Search Console only keeps a rolling window in mw_market_seo, so without this
// snapshot there is no "last week" to compare against.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/seo-week-baseline.mts [YYYY-MM-DD]
//
// Writes mw_settings key `seo_positions_<ISO week>`, and prints the change
// against the previous week's snapshot when there is one.

import { createClient } from '@supabase/supabase-js'
import { STEPS } from '../lib/mw-seo-plan'
import { isoWeek } from '../lib/mw-week'

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const today = process.argv[2] ?? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
const week = isoWeek(today)

const { data } = await db.from('mw_market_seo').select('cycle, country, gsc_keywords')
const cycle = (data ?? []).map((r: any) => String(r.cycle)).sort().pop()
const rows = (data ?? []).filter((r: any) => String(r.cycle) === cycle)
  .flatMap((r: any) => (r.gsc_keywords ?? []).map((k: any) => ({ ...k, country: r.country })))

type Pos = { step: string; q: string; url: string; country: string; pos: number; impr: number }
const snap: Pos[] = []
for (const s of STEPS) {
  for (const t of s.targets ?? []) {
    for (const r of rows) {
      const q = String(r.q ?? '').toLowerCase()
      const hit = t.q.startsWith('~') ? q.includes(t.q.slice(1)) : q === t.q
      if (!hit) continue
      if (t.url && !String(r.url ?? '').includes(t.url)) continue
      if (t.country && r.country !== t.country) continue
      snap.push({ step: s.id, q, url: String(r.url ?? '').replace(/^https?:\/\/[^/]+/, ''), country: r.country, pos: Number(r.pos) || 0, impr: Number(r.impr) || 0 })
    }
  }
}

const key = `seo_positions_${week}`
await db.from('mw_settings').upsert({ key, value: { week, cycle, takenAt: new Date().toISOString(), rows: snap }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
console.log(`${key}: ${snap.length} positions across ${new Set(snap.map(x => x.step)).size} steps (cycle ${cycle})`)

const prevKey = (await db.from('mw_settings').select('key').like('key', 'seo_positions_%').lt('key', key).order('key', { ascending: false }).limit(1)).data?.[0]?.key
if (!prevKey) { console.log('no earlier snapshot: this is the baseline'); process.exit(0) }
const prev = ((await db.from('mw_settings').select('value').eq('key', prevKey).single()).data as any)?.value?.rows as Pos[] ?? []
const id = (x: Pos) => `${x.step}|${x.q}|${x.url}|${x.country}`
const before = new Map(prev.map(x => [id(x), x.pos]))
const byStep = new Map<string, { better: number; worse: number; moves: string[] }>()
for (const x of snap) {
  const was = before.get(id(x)); if (was === undefined || !was || !x.pos) continue
  const d = was - x.pos; if (Math.abs(d) < 1) continue
  const s = byStep.get(x.step) ?? { better: 0, worse: 0, moves: [] }
  if (d > 0) s.better++; else s.worse++
  s.moves.push(`${x.q} (${x.country}) #${was.toFixed(1)}→#${x.pos.toFixed(1)}`)
  byStep.set(x.step, s)
}
console.log(`vs ${prevKey}:`)
for (const [step, s] of byStep) console.log(`  ${step}: ${s.better} up, ${s.worse} down — ${s.moves.slice(0, 4).join('; ')}`)
