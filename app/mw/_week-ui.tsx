import type { WeekTask, WeekKind } from '@/lib/mw-week'
import { weekSubmit, weekPublished, weekDone, weekCant, weekApply } from './actions'

// 👉 One "My week" card: who, exactly what, where, and the one button that
// finishes it. No ranking scores, no hours, no analysis — those decided which
// cards exist; the card itself only says what to do (owner, 26 Oct 2026).

const KIND: Record<WeekKind, string> = {
  'content-new': 'New blog post',
  'content-improve': 'Improve a page',
  publish: 'Publish',
  tech: 'Website fix',
  'paid-apply': 'Google Ads',
  facts: 'Question for you',
  check: 'Check',
}

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export function WeekCard({ t, canAct }: { t: WeekTask; canAct: boolean }) {
  const doc = String(t.payload?.doc ?? t.links.find(l => /docs\.google\.com/.test(l.url))?.url ?? '')
  const open = t.state === 'todo'
  return (
    <article className={`mw-week-card is-${t.state}`} id={`w-${t.id.replace(/[^a-z0-9]/gi, '-')}`}>
      <div className="mw-week-head">
        <span className="mw-pill is-focus">{KIND[t.kind]}</span>
        {t.market && <span className="mw-planner-lab">{t.market.toUpperCase()}</span>}
        {open && <span className="mw-planner-lab">Due {day(t.due)}</span>}
        {t.carried > 0 && open && <span className="mw-pill is-warn">Carried over{t.carried > 1 ? ` ×${t.carried}` : ''}</span>}
      </div>
      <h3 className="mw-week-title">{t.title}</h3>
      {t.why && <p className="mw-week-why">{t.why}</p>}

      {t.links.length > 0 && (
        <p className="mw-week-links">
          {t.links.map(l => (
            <a key={l.url} href={l.url} target={l.url.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer" className="mw-planner-btn is-quiet is-small">{l.label} ↗</a>
          ))}
        </p>
      )}

      {open && (
        <ol className="mw-week-steps">
          {t.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}

      <p className="mw-week-done"><span className="mw-planner-lab">Done when</span> {t.doneWhen}</p>

      {!open ? (
        <p className="mw-week-state">
          {t.state === 'submitted' && <>Submitted to Dinesh{doc ? <> · <a href={doc} target="_blank" rel="noopener noreferrer">the doc</a></> : null}</>}
          {t.state === 'done' && t.kind === 'paid-apply' && t.payload?.applied ? <>Applied in Google Ads ✓</> : null}
          {t.state === 'done' && !(t.kind === 'paid-apply' && t.payload?.applied) && <>Done ✓{t.payload?.url ? <> · <a href={String(t.payload.url)} target="_blank" rel="noopener noreferrer">live page</a></> : null}</>}
          {t.state === 'cant' && <>Can&apos;t do this — &ldquo;{t.reason}&rdquo;</>}
        </p>
      ) : canAct ? (
        <div className="mw-week-act">
          {(t.kind === 'content-new' || t.kind === 'content-improve') && (
            <form action={weekSubmit} className="mw-week-form">
              <input type="hidden" name="id" value={t.id} />
              <label className="mw-planner-lab" htmlFor={`doc-${t.id}`}>Your edited Google Doc</label>
              <input id={`doc-${t.id}`} name="doc" type="url" required defaultValue={doc} pattern="https://docs\.google\.com/.*" />
              <button className="mw-planner-btn">Submit to Dinesh</button>
            </form>
          )}
          {t.kind === 'publish' && (
            <form action={weekPublished} className="mw-week-form">
              <input type="hidden" name="id" value={t.id} />
              <label className="mw-planner-lab" htmlFor={`url-${t.id}`}>Live URL</label>
              <input id={`url-${t.id}`} name="url" type="url" required placeholder="https://www.movingwalls.com/…" pattern="https://(www\.)?movingwalls\.com/.*" />
              <button className="mw-planner-btn">Published</button>
            </form>
          )}
          {t.kind === 'facts' && (
            <form action={weekDone} className="mw-week-form">
              <input type="hidden" name="id" value={t.id} />
              <label className="mw-planner-lab" htmlFor={`note-${t.id}`}>Your answer</label>
              <textarea id={`note-${t.id}`} name="note" rows={3} required maxLength={1000} />
              <button className="mw-planner-btn">Send answer</button>
            </form>
          )}
          {t.kind === 'paid-apply' && (
            <form action={weekApply} className="mw-week-form">
              <input type="hidden" name="id" value={t.id} />
              <span className="mw-planner-lab">The change Apply makes in Google Ads</span>
              <ul className="mw-week-ops">
                {((t.payload?.summary as string[] | undefined) ?? []).map((l, i) => <li key={i}>{l}</li>)}
              </ul>
              {t.payload?.lastError ? <p className="mw-week-err">Not applied: {String(t.payload.lastError)}</p> : null}
              <button className="mw-planner-btn">Apply in Google Ads</button>
            </form>
          )}
          {(t.kind === 'tech' || t.kind === 'check') && (
            <form action={weekDone}>
              <input type="hidden" name="id" value={t.id} />
              <button className="mw-planner-btn">Done</button>
            </form>
          )}
          <details className="mw-week-cant">
            <summary>Can&apos;t do this</summary>
            <form action={weekCant} className="mw-week-form">
              <input type="hidden" name="id" value={t.id} />
              <textarea name="reason" rows={2} required maxLength={300} placeholder="Why not? (it won't be given to you again)" />
              <button className="mw-planner-btn is-quiet">Send</button>
            </form>
          </details>
        </div>
      ) : null}
    </article>
  )
}

export function WeekList({ tasks, canAct, empty }: { tasks: WeekTask[]; canAct: (t: WeekTask) => boolean; empty?: string }) {
  if (!tasks.length) return <p className="mw-planner-lab">{empty ?? 'Nothing this week.'}</p>
  const order = (t: WeekTask) => (t.state === 'todo' ? 0 : 1)
  return (
    <div className="mw-week-list">
      {[...tasks].sort((a, b) => order(a) - order(b) || b.value - a.value).map(t => <WeekCard key={t.id} t={t} canAct={canAct(t)} />)}
    </div>
  )
}
