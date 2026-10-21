import 'server-only'
// The live directory: mw_settings.people, seeded from lib/mw-people.ts on first read.
import { supabase, supabaseConfigured } from './supabase'
import { PEOPLE_SEED, parsePeople, type Person } from './mw-people'

export async function getPeople(): Promise<Person[]> {
  if (!supabaseConfigured) return PEOPLE_SEED
  const { data } = await supabase.from('mw_settings').select('value').eq('key', 'people').maybeSingle()
  if (!data) {
    await supabase.from('mw_settings').upsert({ key: 'people', value: PEOPLE_SEED, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    return PEOPLE_SEED
  }
  return parsePeople(data.value)
}
