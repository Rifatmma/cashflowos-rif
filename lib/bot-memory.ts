import { supabase, supabaseConfigured } from './supabase'

// 🔒 Don't edit — this keeps your robot safe.
// Short-term memory for the bot — keeps the last few turns so Jarvis can resolve
// "and her?" / "what about last week?". Backed by the bot_memory table.
//
// 12, not 6: photos and approval decisions now write here too, so six turns
// could be used up by a single receipt conversation and the owner's actual
// question would fall off the end. Still small enough to cost next to nothing.
const KEEP_TURNS = 12
type Turn = { q: string; a: string }

export async function loadTurns(chatId: number): Promise<string> {
  if (!supabaseConfigured) return ''   // skip the slow failing fetch before keys are set
  const { data } = await supabase.from('bot_memory').select('turns').eq('chat_id', chatId).maybeSingle()
  const turns = (data?.turns ?? []) as Turn[]
  return turns.slice(-KEEP_TURNS).map(t => `Q: ${t.q}\nA: ${t.a}`).join('\n')
}

export async function appendTurn(chatId: number, q: string, a: string) {
  if (!supabaseConfigured) return   // no memory to persist until keys are set
  const { data } = await supabase.from('bot_memory').select('turns').eq('chat_id', chatId).maybeSingle()
  const turns = ((data?.turns ?? []) as Turn[]).concat({ q, a }).slice(-KEEP_TURNS)
  await supabase.from('bot_memory').upsert({ chat_id: chatId, turns, updated_at: new Date().toISOString() })
}

// The bot_memory table doubles as a per-chat daily counter (e.g. the vision-call
// cost cap in the Vault agent). Keyed by chat_id + a YYYY-MM-DD day string so the
// count naturally resets each day without a sweeper. Never throws.
//
// THE COUNTERS BAG IS SHARED, AND THIS USED TO DESTROY THE OTHER TENANT.
//
// It also holds the bot's conversational state under `pending:<userId>` keys —
// a receipt parked waiting for its missing fields, with a twelve-hour window and
// the only copy of its payload and vision result. Pruning was written as
//
//     const pruned = { [key]: next }          // "drop any key not for today"
//
// which threw away every pending entry in that chat on EVERY photo. Receipt A is
// parked awaiting details, someone sends photo B, receipt A is gone — silently,
// with no message to anyone. Staff were getting blamed for not replying to a
// question about a receipt the robot had already forgotten.
//
// Now only a STALE DAILY COUNTER is dropped: a key ending in `:YYYY-MM-DD` for
// some day that is not today. Anything else is somebody else's state and is left
// exactly where it was (owner, 5 Oct 2026).
const DAY_KEYED = /:(\d{4}-\d{2}-\d{2})$/

export async function bumpDailyCounter(chatId: number, name: string, day: string): Promise<number> {
  if (!supabaseConfigured) return 0
  const { data } = await supabase.from('bot_memory').select('counters').eq('chat_id', chatId).maybeSingle()
  // Not Record<string, number>: the pending entries in here are objects, and
  // typing the bag as numbers is part of why this went unnoticed for so long.
  const counters = (data?.counters ?? {}) as Record<string, unknown>
  const key = `${name}:${day}`
  const next = (Number(counters[key]) || 0) + 1

  const kept: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(counters)) {
    const m = k.match(DAY_KEYED)
    if (m && m[1] !== day) continue     // a counter from another day: genuinely stale
    kept[k] = v                         // today's counters, and anyone else's state
  }
  kept[key] = next

  await supabase.from('bot_memory').upsert({ chat_id: chatId, counters: kept, updated_at: new Date().toISOString() })
  return next
}
