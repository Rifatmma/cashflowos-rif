import 'server-only'
// 👉 Who opens the app, and when.
//
// Nothing recorded this before 21 Oct 2026, so there was no way to tell a
// lead who had read her tasks and declined to act from one who had never
// opened the page. That difference is the whole point of the People view.
//
// One row per person per half hour at most — enough for "last opened" and a
// weekly count, without a row for every click.

import { supabase, supabaseConfigured } from './supabase'
import { getPeople } from './mw-people-store'
import { personByActor, type Person } from './mw-people'

const GAP_MS = 30 * 60_000

export async function notePresence(actor: string | null, path = '/mw'): Promise<void> {
  if (!supabaseConfigured || !actor) return
  const email = actor === 'owner' ? 'owner' : actor.toLowerCase()
  try {
    const { data } = await supabase.from('mw_presence').select('at').eq('email', email)
      .order('at', { ascending: false }).limit(1)
    const last = data?.[0]?.at ? Date.parse(data[0].at) : 0
    if (Date.now() - last < GAP_MS) return
    await supabase.from('mw_presence').insert({ email, path })
  } catch { /* presence is a nice-to-have; never break a page over it */ }
}

export type Seen = { last: string | null; visitsThisWeek: number }

/** Last opened and visits in the last 7 days, per person name. */
export async function seenByPerson(): Promise<Map<string, Seen>> {
  const out = new Map<string, Seen>()
  if (!supabaseConfigured) return out
  const people = await getPeople()
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data } = await supabase.from('mw_presence').select('email, at').gte('at', since)
    .order('at', { ascending: false }).limit(5000)
  const week = Date.now() - 7 * 86_400_000
  for (const r of (data ?? []) as { email: string; at: string }[]) {
    const p: Person | null = personByActor(people, r.email)
    if (!p) continue
    const s = out.get(p.name) ?? { last: null, visitsThisWeek: 0 }
    if (!s.last) s.last = r.at
    if (Date.parse(r.at) >= week) s.visitsThisWeek++
    out.set(p.name, s)
  }
  return out
}
