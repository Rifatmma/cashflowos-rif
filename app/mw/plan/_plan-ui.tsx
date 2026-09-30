import Link from 'next/link'
import type { ActionRow } from '@/lib/mw-actions'
import { CHOICE_LABEL, STATUS_LABEL } from '@/lib/mw-actions'
import { setDecision, clearDecision, setProposedDue } from '../actions'

// The market plan, as a table you could read like a spreadsheet — which is how
// Rif asked for it: "assigned to who, what to do, how to do it, with the
// tracker whether it's already done or not yet" (29 Sep 2026).
//
// Server components and plain forms, like the rest of /mw: no client JS, so it
// works on a phone on bad wifi and there is nothing to hydrate.

const SIZE_HINT = { S: 'about an hour', M: 'half a day', L: 'a day or two' } as const

export function Load({ rows }: { rows: { owner: string; total: number; weight: number; done: number; undecided: number; markets: string[] }[] }) {
  const max = Math.max(...rows.map(r => r.weight), 1)
  return (
    <div className="mw-load">
      {rows.map(r => (
        <div className="mw-load-row" key={r.owner}>
          <span className="who">{r.owner}</span>
          <span className="bar"><i style={{ width: `${(r.weight / max) * 100}%` }} /></span>
          <span className="num">
            {r.total} task{r.total === 1 ? '' : 's'}
            {r.done > 0 && <b> · {r.done} done</b>}
            {r.undecided > 0 && <em> · {r.undecided} unanswered</em>}
          </span>
          <span className="mk">{r.markets.join(', ')}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * A market with nothing to act on says so quietly. It is not work, so it gets
 * no status pill, no size and no buttons -- otherwise "nothing to do" looks
 * like an unanswered task on somebody's pile.
 */
export function PlanNote({ r }: { r: ActionRow }) {
  return (
    <p className="mw-nothing">
      <b>Nothing to act on this cycle.</b> {r.sub}
      {r.how?.steps?.length ? <> {r.how.steps[0]}</> : null}
    </p>
  )
}

/** One task: the summary line, and everything needed to do it when opened. */
export function PlanRow({ r }: { r: ActionRow }) {
  const how = r.how
  const d = r.decision
  const done = r.status === 'done' || d?.choice === 'done'
  return (
    <details className="mw-task" open={false}>
      <summary>
        <span className={`mw-pill ${done ? 'is-done' : d?.choice === 'reject' ? 'is-no' : d ? 'is-yes' : ''}`}>
          {done ? 'Done' : d ? CHOICE_LABEL[d.choice] : STATUS_LABEL[r.status]}
        </span>
        <span className="mw-task-main">
          <b>{r.title}</b>
          <small>
            {r.owner ?? <u>no owner</u>} · {how?.country || r.market} · {r.size ?? 'S'}
            {r.size && <> ({SIZE_HINT[r.size]})</>}
            {d?.proposed_due && <> · they said {d.proposed_due}</>}
          </small>
        </span>
      </summary>

      <div className="mw-task-body">
        {r.sub && <p className="mw-why">{r.sub}</p>}

        {/* Say out loud that this one cannot be started yet, and by whom. */}
        {how?.blockedBy && (
          <p className="mw-waits">
            <b>Waits on {how.blockedBy.owner ?? 'the market lead'}:</b> {how.blockedBy.title}.
          </p>
        )}

        {how?.steps?.length ? (
          <>
            <h4>What to do</h4>
            <ol className="mw-steps">{how.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </>
        ) : null}

        {how?.keywords?.length ? (
          <>
            <h4>{how?.kind === 'cannibal' ? 'Our pages competing for it' : 'The searches to win'}</h4>
            <table className="mw-kw">
              <thead><tr>
                <th>{how?.kind === 'cannibal' ? 'Page' : 'Search'}</th>
                <th>Position</th><th>Searches/mo</th><th>Our visits</th>
              </tr></thead>
              <tbody>
                {how.keywords.map(k => (
                  <tr key={`${k.q}|${k.url ?? ''}|${k.pos}`}>
                    <td className={k.url && how?.kind === 'cannibal' ? 'path' : undefined}>
                      {how?.kind === 'cannibal' ? (k.url ?? k.q) : k.q}
                    </td>
                    <td className="num">#{k.pos.toFixed(0)}</td>
                    <td className="num">{Math.round(k.vol).toLocaleString('en-US')}</td>
                    <td className="num">{k.visits || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {/* What this page already wins. Shown as its own block, not buried in
            the steps, because losing it is the most common way a rewrite
            goes backwards (owner, 29 Sep 2026). */}
        {how?.holds?.length ? (
          <>
            <h4>Already ranking — do not lose these</h4>
            <table className="mw-kw">
              <thead><tr><th>Search</th><th>Position</th><th>Searches/mo</th><th>Our visits</th></tr></thead>
              <tbody>
                {how.holds.map(k => (
                  <tr key={k.q}>
                    <td>{k.q}</td>
                    <td className="num"><span className={`mw-rank ${k.pos <= 3 ? 'top' : 'good'}`}>#{k.pos.toFixed(0)}</span></td>
                    <td className="num">{Math.round(k.vol).toLocaleString('en-US')}</td>
                    <td className="num">{k.visits || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {how?.url && (
          <p className="mw-target">
            Page: <Link href={`https://www.movingwalls.com${how.url}`} target="_blank" rel="noreferrer">{how.url}</Link>
          </p>
        )}
        {how?.doneWhen && <p className="mw-done-when"><b>Done when:</b> {how.doneWhen}</p>}

        {/* The two things a lead does: answer, and say when. */}
        <div className="mw-decide">
          <form action={setDecision}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="reason" value={d?.reason ?? ''} />
            <button name="choice" value="accept" data-on={d?.choice === 'accept' || undefined}>Will do</button>
            <button name="choice" value="done" data-on={d?.choice === 'done' || undefined}>Already done</button>
            <button name="choice" value="reject" data-on={d?.choice === 'reject' || undefined}>Won&rsquo;t do</button>
          </form>

          <form action={setProposedDue} className="mw-due">
            <input type="hidden" name="id" value={r.id} />
            <label>When can you do this?
              <input type="date" name="proposed_due" defaultValue={d?.proposed_due ?? ''} />
            </label>
            <button>Save date</button>
          </form>
        </div>

        {d?.choice === 'reject' && (
          <form action={setDecision} className="mw-reason">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="choice" value="reject" />
            <label>Why not? This is how the suggestions learn.
              <input type="text" name="reason" defaultValue={d.reason ?? ''} maxLength={300}
                placeholder="e.g. no inventory in this market yet" />
            </label>
            <button>Save reason</button>
          </form>
        )}

        <p className="mw-decided">
          {d
            ? <>{CHOICE_LABEL[d.choice]} by {d.decided_by ?? 'someone'}{d.reason ? ` — “${d.reason}”` : ''}</>
            : 'No answer yet.'}
          {d && (
            <form action={clearDecision} style={{ display: 'inline' }}>
              <input type="hidden" name="id" value={r.id} />
              <button className="mw-clear">clear</button>
            </form>
          )}
        </p>
      </div>
    </details>
  )
}
