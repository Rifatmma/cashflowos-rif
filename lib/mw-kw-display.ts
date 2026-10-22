// 👉 Never show a 0 that means "no data".
//
// Search Console rows carry impressions, not monthly volume, and no difficulty.
// They used to render as "0 searches/mo, difficulty 0" — which reads as "nobody
// searches for this and it is easy", the opposite of what is known. A cell
// now says which measurement it is, or "—" when there is none.
//
// Pure, so the rule is tested (tests/mw-kw-display.test.mts).

type Kw = { vol: number; kd: number; impr?: number; src?: 'gsc' | 'semrush' | 'both'; traffic?: number }

const n = (x: number) => Math.round(x).toLocaleString('en-US')

export type Cell = { text: string; title: string; missing: boolean }

/** Monthly searches when Semrush has them; Search Console impressions when not; else "—". */
export function demandCell(k: Kw): Cell {
  if (k.vol > 0) return { text: n(k.vol), title: 'Semrush estimate of monthly searches', missing: false }
  if ((k.impr ?? 0) > 0) return { text: `${n(k.impr!)} impr.`, title: 'Search Console impressions — no monthly volume source for this search', missing: false }
  return { text: '—', title: 'No volume source for this search', missing: true }
}

/** Difficulty only exists where Semrush measured it. */
export function difficultyCell(k: Kw): Cell & { band: 'easy' | 'mid' | 'hard' | null } {
  const measured = k.src !== 'gsc' && !(k.kd === 0 && k.vol === 0)
  if (!measured) return { text: '—', title: 'No difficulty source — Search Console does not measure it', missing: true, band: null }
  return { text: k.kd.toFixed(0), title: 'Semrush keyword difficulty, 0–100', missing: false, band: k.kd < 20 ? 'easy' : k.kd < 40 ? 'mid' : 'hard' }
}

/** A market's keyword count: Semrush's when it has one, else what Search Console shows us. */
export function keywordsCell(semrushTotal: number, keywords: Kw[]): Cell {
  if (semrushTotal > 0) return { text: n(semrushTotal), title: 'Semrush keyword count', missing: false }
  if (keywords.length) return { text: `${n(keywords.length)} (GSC)`, title: 'Searches Search Console shows us ranking for — Semrush has no count for this market', missing: false }
  return { text: '—', title: 'No keyword source for this market', missing: true }
}

/** Estimated traffic: Semrush's estimate, else real Search Console clicks. */
export function trafficCell(semrushTraffic: number, keywords: Kw[]): Cell {
  if (semrushTraffic > 0) return { text: n(semrushTraffic), title: 'Semrush estimated monthly traffic', missing: false }
  const clicks = keywords.reduce((t, k) => t + (k.traffic ?? 0), 0)
  if (keywords.length) return { text: `${n(clicks)} clicks (GSC)`, title: 'Real Search Console clicks — Semrush has no estimate for this market', missing: false }
  return { text: '—', title: 'No traffic source for this market', missing: true }
}
