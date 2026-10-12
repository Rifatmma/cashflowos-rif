// 👉 One word for "how far along is this", across three different stores.
//
// The plan grew three tracking vocabularies, all visible on one screen:
//
//   mw_actions         not | part | done | moot, plus a separate accept/reject
//   mw_city_audit      not_started | in_progress | done
//   mw_page_proposals  open | approved | rejected | gone
//
// A lead looking at their market saw all three and had to learn which meant
// what. So everything is normalised to the same three states for DISPLAY, and
// each control still writes back to its own store.
//
//   "Three tracking vocabularies exist today. Which wins?" → "Not started /
//    In progress / Done, everywhere"                       (owner, 12 Oct 2026)
//
// Normalising rather than migrating is deliberate. The stores answer slightly
// different questions — a proposal can be REJECTED, which is not a stage of
// doing it — and flattening them in the database would lose that. Mapping at
// the edge keeps the distinction where it matters and hides it where it does
// not.

export type Stage = 'not_started' | 'in_progress' | 'done' | 'declined' | 'moot'

export const STAGE_LABEL: Record<Stage, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  declined: 'Not doing',
  moot: 'No longer applies',
}

/** Open means it is still somebody's problem. */
export const isOpen = (s: Stage) => s === 'not_started' || s === 'in_progress'

/** mw_actions: its own status, plus whatever the lead decided. */
export function stageOfAction(status: string | null, choice?: string | null): Stage {
  if (status === 'moot') return 'moot'
  if (status === 'done' || choice === 'done') return 'done'
  if (choice === 'reject') return 'declined'
  // 'part' is the planner's word for started-but-not-finished, and 'accept'
  // is a lead saying they will do it. Both are in progress.
  if (status === 'part' || choice === 'accept') return 'in_progress'
  return 'not_started'
}

export function stageOfCity(status: string | null): Stage {
  return status === 'done' ? 'done' : status === 'in_progress' ? 'in_progress' : 'not_started'
}

export function stageOfProposal(status: string | null): Stage {
  if (status === 'approved') return 'in_progress'   // decided, not yet shipped
  if (status === 'rejected') return 'declined'
  if (status === 'gone') return 'moot'
  return 'not_started'
}

/** What a market's list adds up to. */
export type Rollup = { total: number; open: number; inProgress: number; done: number; declined: number }

export function rollup(stages: Stage[]): Rollup {
  return {
    total: stages.length,
    open: stages.filter(isOpen).length,
    inProgress: stages.filter(s => s === 'in_progress').length,
    done: stages.filter(s => s === 'done').length,
    declined: stages.filter(s => s === 'declined' || s === 'moot').length,
  }
}

/** One line a lead can read without opening anything. */
export function rollupLine(r: Rollup, money = 0): string {
  if (!r.total) return 'Nothing open'
  const bits: string[] = []
  if (r.open) bits.push(`${r.open} open`)
  if (r.inProgress) bits.push(`${r.inProgress} started`)
  if (r.done) bits.push(`${r.done} done`)
  if (money > 0) bits.push(`S$${money.toFixed(2)} a month at stake`)
  return bits.join(' · ') || `${r.total} closed`
}
