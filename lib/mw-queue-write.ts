import 'server-only'
// 👉 Writing an answer to a task, whichever store the task lives in.
//
// Shared by the in-app Done / Can't buttons (app/mw/actions.ts) and the
// signed links in the Monday email (app/api/mw-act/route.ts), so the two can
// never record the same answer differently.

import { revalidatePath } from 'next/cache'
import { supabase } from './supabase'
import { actionChoiceFor, type Stage } from './mw-status'

export async function writeStage(id: string, stage: Stage, reason: string | null, by: string): Promise<void> {
  const now = new Date().toISOString()
  if (id.startsWith('task:')) {
    const actionId = id.slice(5)
    const choice = actionChoiceFor(stage)
    if (!choice) await supabase.from('mw_decisions').delete().eq('action_id', actionId)
    else await supabase.from('mw_decisions').upsert(
      { action_id: actionId, choice, reason: reason || null, decided_by: by, updated_at: now },
      { onConflict: 'action_id' },
    )
  } else {
    // Everything the app owns itself — SEO steps, tracking, paid, content,
    // sales, page reviews — keeps its progress in one table, keyed by id.
    const key = id.startsWith('seo:') ? id.slice(4) : id
    await supabase.from('mw_seo_step_state').upsert(
      { step_id: key, stage, reason: reason || null, updated_by: by, updated_at: now },
      { onConflict: 'step_id' },
    )
  }
  revalidatePath('/mw'); revalidatePath('/mw/people'); revalidatePath('/mw/seo')
}
