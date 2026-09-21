import 'server-only'
import { supabase, supabaseConfigured } from './supabase'
import { fromFile, type AdsNumbers } from './ads-model'

// Where every Facebook Ads page (and Jarvis) gets its numbers.
//
// The newest SUCCESSFUL daily pull, if there is one; otherwise the hand-pulled
// file. A failed pull never reaches here -- its row is ok=false -- so a refused
// or broken refresh leaves yesterday's good numbers showing, with their real age,
// instead of an empty page.

export type AdsState = {
  n: AdsNumbers
  ageDays: number               // how old the numbers are, in whole days
  lastError: string | null      // the newest pull's failure, if it failed after the last success
  lastTriedAt: string | null
}

export async function getAds(): Promise<AdsState> {
  let n: AdsNumbers = fromFile()
  let lastError: string | null = null
  let lastTriedAt: string | null = null

  if (supabaseConfigured) {
    try {
      const [{ data: good }, { data: latest }] = await Promise.all([
        supabase.from('ads_snapshots').select('pulled_at, data').eq('ok', true)
          .order('pulled_at', { ascending: false }).limit(1),
        supabase.from('ads_snapshots').select('pulled_at, ok, error')
          .order('pulled_at', { ascending: false }).limit(1),
      ])
      const g = good?.[0]
      if (g?.data && Array.isArray((g.data as any).runs) && (g.data as any).runs.length) {
        n = { ...(g.data as AdsNumbers), pulledAt: g.pulled_at, source: 'live' }
      }
      const l = latest?.[0]
      if (l) {
        lastTriedAt = l.pulled_at
        if (!l.ok) lastError = l.error ?? 'The last refresh failed.'
      }
    } catch (e) {
      // A missing table or a network blip must never take the page down.
      console.error('[CFO] ads snapshot read failed, using the file:', e)
    }
  }

  const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(n.pulledAt)) / 86_400_000))
  return { n, ageDays, lastError, lastTriedAt }
}
