// 👉 The one way to say how far along something is.
//
// A market lead's screen carried three different gestures for the same
// question: three submit buttons plus a separate "clear" link and an
// afterthought reason box on a task, a button that cycled through states when
// you clicked it on a city page, and Approve / Reject… / Change my mind on a
// proposal. The three vocabularies had already been normalised for reading
// (lib/mw-status.ts); the controls had not, so the screen still asked three
// ways.
//
//   "unify the three status controls"                  (owner, 13 Oct 2026)
//
// NO CLIENT JAVASCRIPT, DELIBERATELY. The first version of this was a client
// component with useState and useTransition, which would have quietly broken a
// decision already written down one file over:
//
//   "Plain <form> posts to server actions, so this works with no client
//    JavaScript at all — which matters on a phone and on the guest tier,
//    where we ship as little as possible."       (app/mw/_actions-ui.tsx)
//
// So it is plain forms and a <details>. Every button is a submit; the reason
// box is disclosure, not state. It works with JS off, on a slow phone, and
// before hydration.
//
// Which buttons appear comes from stagesFor(), so a city page is never offered
// "Not doing" — it cannot hold that, and a control must not offer a state its
// store will silently drop.
//
// The click-to-cycle button is gone on purpose: it took three clicks to get
// from Done back to Not started, you could not see the other states without
// changing something, and it had nowhere to put a reason. The reason is the
// point — a decision whose reason is recorded can be re-raised when the data
// disagrees with it, and one without is a dead end.

import { setStage } from './actions'
import { STAGE_VERB, stagesFor, type Stage } from '@/lib/mw-status'

export function StatusControl({
  kind, id, stage, size = 'normal', reason,
}: {
  kind: 'action' | 'city' | 'proposal'
  /** The action id, the city page URL, or the proposal id. */
  id: string
  stage: Stage
  size?: 'normal' | 'small'
  /** Whatever reason is already stored, so editing it does not start blank. */
  reason?: string | null
}) {
  // `moot` is set by the planner, never by a person — the finding stopped
  // applying, which is not something a lead decides. Shown, not offered.
  if (stage === 'moot') {
    return <span className="mw-stage is-moot">{STAGE_VERB.moot}</span>
  }

  const offered = stagesFor(kind)
  const canDecline = offered.includes('declined')

  return (
    <div className={`mw-stage-set${size === 'small' ? ' is-small' : ''}`}>
      <form action={setStage} className="mw-stage-btns" role="group" aria-label="How far along is this">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        {/* Carried through so moving between states does not wipe a reason
            that was already given. */}
        <input type="hidden" name="reason" value={reason ?? ''} />
        {offered.filter(s => s !== 'declined').map(s => (
          <button
            key={s}
            type="submit"
            name="stage"
            value={s}
            data-on={stage === s ? '1' : '0'}
            data-stage={s}
            aria-pressed={stage === s}
          >
            {STAGE_VERB[s]}
          </button>
        ))}
        {canDecline && stage === 'declined' && (
          <button type="submit" name="stage" value="declined" data-on="1" data-stage="declined" aria-pressed>
            {STAGE_VERB.declined}
          </button>
        )}
      </form>

      {/* Declining asks why, because that is the moment the person knows it.
          A <details> gives disclosure with no state to manage — and unlike the
          old design, the box is there BEFORE you decline rather than appearing
          afterwards, when the reason has already become an afterthought. */}
      {canDecline && stage !== 'declined' && (
        <details className="mw-stage-why">
          <summary>{STAGE_VERB.declined}…</summary>
          <form action={setStage}>
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="stage" value="declined" />
            <label htmlFor={`why-${kind}-${id}`}>
              Why not? It is kept, and the finding comes back if the numbers later disagree with it.
            </label>
            <input
              id={`why-${kind}-${id}`}
              name="reason"
              defaultValue={reason ?? ''}
              maxLength={300}
              placeholder="e.g. no capacity this quarter"
            />
            <button type="submit">Save</button>
          </form>
        </details>
      )}
    </div>
  )
}
