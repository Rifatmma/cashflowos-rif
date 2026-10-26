// 👉 The SEO planner card: the plan, one step at a time, most important first.
//
// Server component. Every control is a link or a plain <form>, so it works on
// a phone with JS off; the three small client pieces in _planner-client.tsx
// only make it nicer. Model output (Claude's replies) is rendered as text,
// never as HTML.

import Link from 'next/link'
import { CHAPTERS, PLAN_TITLE, isDone, type PlanStep } from '@/lib/mw-seo-plan'
import type { Planner, InboxRow } from '@/lib/mw-seo-planner'
import type { Signal } from '@/lib/mw-seo-glance'
import { STAGE_LABEL } from '@/lib/mw-status'
import { setPlanStep, setStepAssignee, sendToClaude, cancelInbox } from '../actions'
import { AutoGo, CopyButton, InboxRefresh } from './_planner-client'

type Cut = 'focus' | 'all'

const ago = (iso: string | null) => {
  if (!iso) return ''
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`
}

const STATUS_WORD: Record<InboxRow['status'], string> = {
  queued: 'Waiting for Claude', claimed: 'Claude is working', done: 'Done', failed: 'Failed', cancelled: 'Cancelled',
}

/** The six signals: one look at what's working and what isn't. */
export function SeoGlance({ signals, top }: { signals: Signal[]; top: { step: PlanStep; leads: number; href: string } | null }) {
  return (
    <section className="mw-glance" aria-label="SEO at a glance">
      <div className="mw-glance-grid">
        {signals.map(s => (
          <a key={s.key} href={s.href} className={`mw-sig is-${s.tone}`}>
            <span className="mw-sig-dot" aria-hidden="true" />
            <span className="mw-sig-k">{s.label}</span>
            <span className="mw-sig-v">{s.value}</span>
            <span className="mw-sig-bar" aria-hidden="true"><i style={{ width: `${Math.round(s.fill * 100)}%` }} /></span>
            <span className="mw-sig-n">{s.note}</span>
          </a>
        ))}
      </div>
      {top && (
        <a className="mw-first" href={top.href}>
          <span className="mw-first-k">Do this first</span>
          <span className="mw-first-t">{top.step.title}</span>
          <span className="mw-first-g">≈ {top.leads.toFixed(1)} enquiries / mo</span>
          <span className="mw-first-go" aria-hidden="true">→</span>
        </a>
      )}
    </section>
  )
}

export function SeoPlanner({
  p, cut, list, step, nav, inList, replies, isOwner, href, keep,
}: {
  p: Planner
  cut: Cut
  list: PlanStep[]
  step: PlanStep
  nav: { index: number; prev: PlanStep | null; next: PlanStep | null; total: number }
  inList: boolean
  replies: InboxRow[]
  isOwner: boolean
  href: (o: { step?: string; cut?: Cut }) => string
  /** Other query params (market tabs) the picker must not drop. */
  keep: Record<string, string>
}) {
  const prog = p.prog.get(step.id)!
  const done = isDone(prog)
  const sc = p.scored.get(step.id)
  const maxLeads = Math.max(...[...p.scored.values()].map(s => s.gain.leads), 0.0001)
  const chapter = CHAPTERS.find(c => c.n === step.chapter)!
  const inChapter = p.steps.filter(s => s.chapter === step.chapter)
  const focusRank = p.focus.ids.indexOf(step.id)
  const carried = step.week < p.week && !done
  const assignee = p.own.get(step.id)?.assignee ?? (step.who === 'Dinesh' ? 'Dinesh' : null)
  const apply = step.apply ? `${assignee ? `Assigned to ${assignee}. ` : ''}${step.apply}` : null
  const pending = replies.some(r => r.status === 'queued' || r.status === 'claimed')
  // A step Claude has already answered must not look untouched. The prompt
  // box used to sit open and pre-filled above the answer, so a finished step
  // read as "not sent yet" (owner, 26 Oct 2026). The answer now comes first
  // and the box becomes a follow-up.
  const answered = replies.find(r => r.status === 'done')
  const side = cut === 'focus' && p.focus.ids.length ? list : inChapter
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

  return (
    <section className="mw-card mw-planner" id="planner">
      <InboxRefresh pending={pending} />

      <header className="mw-planner-head">
        <div>
          <p className="eyebrow mw-planner-eyebrow">Rif, SEO lead · Moving Walls</p>
          <h2>{PLAN_TITLE}</h2>
        </div>
        <dl className="mw-planner-meters">
          <dt>This week</dt><dd>{p.thisWeek.done} / {p.thisWeek.total}</dd>
          <dd className="mw-planner-bar"><i style={{ width: `${pct(p.thisWeek.done, p.thisWeek.total)}%` }} /></dd>
          <dt>Whole plan</dt><dd>{p.whole.done} / {p.whole.total}</dd>
          <dd className="mw-planner-bar"><i style={{ width: `${pct(p.whole.done, p.whole.total)}%` }} /></dd>
        </dl>
      </header>

      <nav className="mw-planner-cut" aria-label="Which steps to show">
        <Link href={href({ cut: 'focus' })} aria-current={cut === 'focus' ? 'true' : undefined} scroll={false}>
          Focus {p.focus.ids.length}
          {p.focus.measured && <small> · {Math.round(p.focus.share * 100)}% of expected gain</small>}
        </Link>
        <Link href={href({ cut: 'all' })} aria-current={cut === 'all' ? 'true' : undefined} scroll={false}>
          Whole plan {p.steps.length}
        </Link>
      </nav>
      {cut === 'focus' && (
        <p className="mw-planner-note">
          {p.focus.measured
            ? <span title="Expected gain ÷ effort, from this month's Search Console and GA4 numbers. A model, re-checked every Monday.">
                <b>{p.focus.ids.length} of {p.steps.length} steps</b> → <b>{Math.round(p.focus.share * 100)}%</b> of the expected gain. Highest return first.
              </span>
            : <>No Search Console or GA4 data yet — showing the whole plan.</>}
        </p>
      )}

      {/* Keyed on the step: these are uncontrolled (defaultValue), and on a
          client-side step change React would otherwise keep the previous
          step's choice in both pickers and its prompt in the box below — so
          "Send to Claude" filed one step's prompt under another. */}
      <AutoGo key={`nav-${step.id}`}>
        <input type="hidden" name="cut" value={cut} />
        <input type="hidden" name="from" value={step.id} />
        {Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label>
          <span className="mw-planner-lab">Chapter</span>
          <select name="ch" defaultValue={step.id} aria-label="Jump to a chapter">
            {CHAPTERS.map(c => {
              const st = p.steps.filter(s => s.chapter === c.n)
              const first = st.find(s => !isDone(p.prog.get(s.id)!)) ?? st[0]
              const d = st.filter(s => isDone(p.prog.get(s.id)!)).length
              return <option key={c.n} value={c.n === step.chapter ? step.id : first.id}>{c.n} · {c.title} · {d}/{st.length}</option>
            })}
          </select>
        </label>
        <label>
          <span className="mw-planner-lab">Jump to any step</span>
          <select name="step" defaultValue={step.id} aria-label="Jump to any step">
            {CHAPTERS.map(c => (
              <optgroup key={c.n} label={`${c.n} · ${c.title}`}>
                {p.steps.filter(s => s.chapter === c.n).map(s => (
                  <option key={s.id} value={s.id}>
                    {isDone(p.prog.get(s.id)!) ? '✓ ' : ''}{p.focus.ids.includes(s.id) ? '★ ' : ''}{s.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="submit" className="mw-planner-btn is-quiet mw-planner-go">Go</button>
      </AutoGo>

      <div className="mw-planner-grid">
        <article className={`mw-planner-step${done ? ' is-done' : ''}`}>
          <div className="mw-planner-pills">
            {focusRank >= 0 && <span className="mw-pill is-focus">{focusRank === 0 ? 'Do this first' : `Priority ${focusRank + 1}`}</span>}
            {step.week === p.week && <span className="mw-pill">This week</span>}
            {carried && <span className="mw-pill is-warn">Carried over</span>}
            {step.week > p.week && focusRank < 0 && <span className="mw-pill is-quiet">Week {step.week}</span>}
            <span className="mw-planner-lab">Step {inChapter.findIndex(s => s.id === step.id) + 1} of {inChapter.length} in &ldquo;{chapter.title}&rdquo;</span>
          </div>

          <h3 className="mw-planner-title">{step.title}</h3>
          <p className="mw-planner-why">{step.why}</p>

          <div className="mw-planner-facts">
            <span><span className="mw-planner-lab">Who</span> <b>{step.website && step.who !== 'Dinesh' ? `${step.who} prepares · ${assignee ?? 'Dinesh'} applies` : step.who === 'Dinesh' ? `Claude prepares · ${assignee ?? 'Dinesh'} applies` : step.who}</b></span>
            <span><span className="mw-planner-lab">Status</span> <b>{STAGE_LABEL[prog.stage]}</b></span>
          </div>

          {sc && sc.gain.leads > 0 && (
            <div className="mw-planner-gain" title="Expected gain ÷ effort. A model, not a promise.">
              <span className="mw-planner-bar is-gain"><i style={{ width: `${Math.max(4, Math.round((sc.gain.leads / maxLeads) * 100))}%` }} /></span>
              <span>≈ <b>{sc.gain.leads.toFixed(1)}</b> enquiries / mo · {sc.gain.basis}</span>
            </div>
          )}
          {sc && !sc.gain.leads && <p className="mw-planner-lab">No measurable gain in the model — this step is here because the rest depend on it, or the data can&apos;t see it yet.</p>}

          {prog.linked && (
            <p className="mw-planner-linked">
              Tracked on <Link href="/mw/plan">/mw/plan</Link> · {prog.linked.done} of {prog.linked.total} done
              {prog.linked.declined > 0 && <> · <b>held up by {prog.linked.declined} decline{prog.linked.declined === 1 ? '' : 's'}</b>{prog.linked.reasons[0] && <> — &ldquo;{prog.linked.reasons[0]}&rdquo;</>}</>}
              {prog.linked.owners.length > 0 && <> · waiting on {prog.linked.owners.join(', ')}</>}
            </p>
          )}

          {answered && !done && (
            <div className="mw-planner-answered">
              <p>
                <b>Claude finished this {ago(answered.finished_at ?? answered.created_at)}.</b>{' '}Read the answer below.
                If it did what &ldquo;Done when&rdquo; says, mark it done; if not, ask a follow-up.
              </p>
              {isOwner && !step.links && (
                <form action={setPlanStep}>
                  <input type="hidden" name="id" value={step.id} />
                  <input type="hidden" name="stage" value="done" />
                  <button className="mw-planner-btn">Mark done</button>
                </form>
              )}
            </div>
          )}

          {replies.length > 0 && (
            <ol className="mw-inbox">
              {replies.map(r => (
                <li key={r.id} className={`mw-inbox-row is-${r.status}`}>
                  <div className="mw-planner-row">
                    <span className={`mw-pill is-${r.status}`}>{STATUS_WORD[r.status]}</span>
                    <span className="mw-planner-lab">#{r.id} · {r.source === 'telegram' ? 'from Telegram (old)' : 'from the card'} · {ago(r.status === 'claimed' ? r.claimed_at : r.finished_at ?? r.created_at)}</span>
                    {isOwner && r.status === 'queued' && (
                      <form action={cancelInbox}><input type="hidden" name="id" value={r.id} /><button className="mw-planner-btn is-quiet is-small">Cancel</button></form>
                    )}
                  </div>
                  <p className="mw-inbox-q">{r.prompt.length > 160 ? `${r.prompt.slice(0, 160)}…` : r.prompt}</p>
                  {r.status === 'queued' && (
                    <p className="mw-planner-lab">Nothing runs until Claude Code is open on your PC and you say &ldquo;check the SEO inbox&rdquo;. The result comes back here.</p>
                  )}
                  {r.result && <p className="mw-inbox-a">{r.result}</p>}
                  {r.error && <p className="mw-inbox-a is-bad">{r.error}</p>}
                  {(r.result_links?.files?.length || r.result_links?.proposals?.length || r.result_links?.docs?.length) ? (
                    <p className="mw-planner-lab">
                      {[...(r.result_links?.files ?? []), ...(r.result_links?.docs ?? [])].map(f => <code key={f}>{f} </code>)}
                      {r.result_links?.proposals?.length ? <> · {r.result_links.proposals.length} proposal{r.result_links.proposals.length === 1 ? '' : 's'} on <Link href="/mw/plan">/mw/plan</Link></> : null}
                    </p>
                  ) : null}
                  {isOwner && r.status === 'done' && (r.result_links?.next?.length ?? 0) > 0 && (
                    <div className="mw-next">
                      <span className="mw-planner-lab">Suggested next</span>
                      {r.result_links!.next!.slice(0, 3).map((n, i) => (
                        <form key={i} action={sendToClaude}>
                          <input type="hidden" name="step_id" value={step.id} />
                          <input type="hidden" name="parent_id" value={r.id} />
                          <input type="hidden" name="prompt" value={n.prompt} />
                          <button className="mw-planner-btn is-chip" title={n.prompt}>▶ {n.label}</button>
                        </form>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}

          {isOwner ? (
            <div className="mw-planner-box">
              {answered || done ? (
                <details key={`ask-${step.id}`}>
                  <summary className="mw-planner-lab">Ask Claude a follow-up</summary>
                  <form action={sendToClaude}>
                    <input type="hidden" name="step_id" value={step.id} />
                    <textarea name="prompt" defaultValue="" placeholder="What should Claude do next on this step?" rows={3} maxLength={4000} required />
                    <div className="mw-planner-row">
                      <button type="submit" className="mw-planner-btn">Send to Claude</button>
                    </div>
                  </form>
                </details>
              ) : (
                <form action={sendToClaude} key={`ask-${step.id}`}>
                  <input type="hidden" name="step_id" value={step.id} />
                  <label className="mw-planner-lab" htmlFor={`go-${step.id}`}>Not sent yet — this is what Claude would be asked</label>
                  <textarea id={`go-${step.id}`} name="prompt" defaultValue={step.go} rows={4} maxLength={4000} required />
                  <div className="mw-planner-row">
                    <button type="submit" className="mw-planner-btn">Send to Claude</button>
                    <span className="mw-planner-lab">Claude picks it up when you say &ldquo;check the SEO inbox&rdquo; in Claude Code.</span>
                  </div>
                </form>
              )}
              <details className="mw-planner-told">
                <summary>What Claude will be told</summary>
                <ul>
                  <li>This step, why it matters, and when it counts as done</li>
                  {(step.targets?.length ?? 0) > 0 && <li>{step.targets!.length} target search{step.targets!.length === 1 ? '' : 'es'}, with this month&apos;s Search Console rows</li>}
                  <li>The rankings on these pages it must not lose</li>
                  {step.funnel && <li>Sessions and enquiries for {step.funnel.join(', ')}</li>}
                  {step.links && <li>The related tasks on /mw/plan, with any decline reasons</li>}
                  <li>Your last three replies on this step</li>
                  <li>The guardrails: non-brand only, no new page just for a keyword, never drop a protected ranking, prepare — don&apos;t publish</li>
                </ul>
              </details>
            </div>
          ) : (
            <p className="mw-planner-lab">Only Rif can send work to Claude.</p>
          )}

          {apply && (
            <div className="mw-planner-box">
              <div className="mw-planner-row is-split">
                <span className="mw-planner-lab">For whoever applies it on the website</span>
                {isOwner && (
                  <form action={setStepAssignee} className="mw-planner-row">
                    <input type="hidden" name="id" value={step.id} />
                    <select name="assignee" defaultValue={assignee ?? ''} aria-label="Who applies it">
                      <option value="">Nobody yet</option>
                      {p.assignees.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <button className="mw-planner-btn is-quiet is-small">Save</button>
                  </form>
                )}
              </div>
              <pre className="mw-planner-apply">{apply}</pre>
              <CopyButton text={apply} />
            </div>
          )}

          <div className="mw-planner-done">
            {isOwner && !step.links ? (
              <form action={setPlanStep}>
                <input type="hidden" name="id" value={step.id} />
                <input type="hidden" name="stage" value={done ? 'not_started' : 'done'} />
                <button className="mw-tick" aria-pressed={done} aria-label={done ? 'Mark not done' : 'Mark done'}
                  title={done ? 'Done — click to reopen' : 'Mark done'}>{done ? '✓' : ''}</button>
              </form>
            ) : <span className="mw-tick is-static" aria-hidden="true">{done ? '✓' : ''}</span>}
            <div>
              <span className="mw-planner-lab">{done ? 'Done · click the tick to reopen' : 'Done when'}</span>
              <p>{step.doneWhen}</p>
            </div>
          </div>
        </article>

        <aside className="mw-planner-list" aria-label={cut === 'focus' ? 'Focus steps' : chapter.title}>
          <p className="mw-planner-lab">{cut === 'focus' && p.focus.ids.length ? `Focus · highest return first` : chapter.title}</p>
          <ol>
            {side.map((s, i) => {
              const sp = p.prog.get(s.id)!
              const g = p.scored.get(s.id)?.gain.leads ?? 0
              return (
                <li key={s.id}>
                  <Link href={href({ step: s.id })} scroll={false}
                    className={`${s.id === step.id ? 'is-on' : ''}${isDone(sp) ? ' is-done' : ''}`}>
                    <span className="mw-tick is-small" aria-hidden="true">{isDone(sp) ? '✓' : ''}</span>
                    <span className="mw-planner-li">
                      {cut === 'focus' && p.focus.ids.length ? <b>{i + 1}.</b> : null} {s.title}
                      {s.links && <small> · /mw/plan</small>}
                    </span>
                    {g > 0 && <small className="mw-planner-li-g">≈{g.toFixed(1)}</small>}
                  </Link>
                </li>
              )
            })}
          </ol>
          {cut === 'focus' && p.focus.ids.length > 0 && (
            <p className="mw-planner-lab">The other {p.steps.length - p.focus.ids.length} steps carry the remaining {100 - Math.round(p.focus.share * 100)}% — <Link href={href({ cut: 'all' })} scroll={false}>see the whole plan</Link>.</p>
          )}
        </aside>
      </div>

      <footer className="mw-planner-foot">
        {nav.prev ? <Link href={href({ step: nav.prev.id })} scroll={false} className="mw-planner-btn is-quiet">‹ Prev</Link> : <span />}
        <span className="mw-planner-lab">{inList ? `${nav.index + 1} of ${nav.total}` : `Not in Focus · ${nav.index + 1} of ${nav.total}`}</span>
        {nav.next ? <Link href={href({ step: nav.next.id })} scroll={false} className="mw-planner-btn is-quiet">Next ›</Link> : <span />}
      </footer>
    </section>
  )
}
