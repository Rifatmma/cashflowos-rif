import 'server-only'
// 👉 Writing down what actually happened in the receipts group.
//
// WHY. Nothing records whether staff are coping. `bot_memory` keeps twelve turns
// per chat, where the question side is usually a synthetic label rather than
// what anyone typed, keyed on the chat and never on the person. And the moment
// that matters most — someone replies to the fill-in template, gets it wrong,
// and Jarvis says "I won't file this yet" — writes nothing at all, anywhere.
//
// EVIDENCE IS TEMPORARY, LEARNING IS PERMANENT. These rows last 90 days. A
// suggestion raised from them copies the exchanges it cites onto itself, so the
// owner reviews it with the quotes and the receipt photos in front of him and
// what he decides outlives the chat (owner, 6 Oct 2026).
//
// NEVER THROWS. This is a watcher, not a participant: a failure here must never
// stop a receipt being filed.

import { supabase, supabaseConfigured } from './supabase'

export type EventKind =
  | 'filed'            // a receipt went in
  | 'refused'          // said something off-template and was turned away
  | 'template_sent'    // asked to fill in the missing fields
  | 'template_failed'  // replied, and the reply was rejected  ← the one that was invisible
  | 'unreadable'       // the photo could not be read at all
  | 'duplicate'        // the same bill again
  | 'cap_hit'          // the daily vision allowance ran out
  | 'corrected'        // the owner changed what was filed
  | 'photo_added'      // proof arrived later

/** 500 is enough to see what someone meant and short enough not to be a transcript. */
const CAP = 500
const clip = (s: unknown) => {
  const t = String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, CAP) : null
}

export type EventIn = {
  chatId: number | string
  from?: { id?: string | number | null; name?: string | null } | null
  kind: EventKind
  text?: unknown
  reply?: unknown
  recordId?: number | null
  detail?: Record<string, unknown>
}

export async function noteEvent(e: EventIn): Promise<void> {
  if (!supabaseConfigured) return
  try {
    await supabase.from('bot_events').insert({
      chat_id: Number(e.chatId),
      from_id: e.from?.id === undefined || e.from?.id === null ? null : String(e.from.id),
      from_name: e.from?.name ? String(e.from.name).slice(0, 80) : null,
      kind: e.kind,
      text: clip(e.text),
      reply: clip(e.reply),
      record_id: e.recordId ?? null,
      detail: e.detail ?? {},
    })
  } catch (err: any) {
    console.warn('[CFO] bot_events:', String(err?.message ?? err).slice(0, 120))
  }
}

export type BotEvent = {
  id: number
  chat_id: number
  from_id: string | null
  from_name: string | null
  kind: EventKind
  text: string | null
  reply: string | null
  record_id: number | null
  detail: Record<string, any>
  created_at: string
}

/** Everything that happened on one day, oldest first so a story reads in order. */
export async function eventsOn(day: string): Promise<BotEvent[]> {
  if (!supabaseConfigured) return []
  const from = `${day}T00:00:00+08:00`
  const to = `${day}T23:59:59.999+08:00`
  const { data, error } = await supabase
    .from('bot_events').select('*')
    .gte('created_at', from).lte('created_at', to)
    .order('created_at', { ascending: true })
  if (error) { console.warn('[CFO] bot_events read:', error.message); return [] }
  return (data ?? []) as BotEvent[]
}

/**
 * Drop evidence older than 90 days.
 *
 * Safe because a suggestion copies the exchanges it cites onto itself when it is
 * raised. What was learned, and why something was refused, is kept elsewhere and
 * forever; only the raw chat ages out.
 */
export async function pruneEvents(days = 90): Promise<number> {
  if (!supabaseConfigured) return 0
  const cut = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('bot_events').delete().lt('created_at', cut).select('id')
  if (error) { console.warn('[CFO] bot_events prune:', error.message); return 0 }
  return (data ?? []).length
}
