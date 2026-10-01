import { maskEmail, SLA_HOURS } from '@/lib/mw-sales'
import { sayHours } from '@/lib/mw-sales'
import type { Contribution, LeadJourney, JourneyStep } from '@/lib/mw-journey'

// The sales tab. Server components and plain markup, like the rest of /mw.
//
// `owner` is the one thing that changes what is shown: a prospect's email
// address is personal data and this page is open to the whole team, so guests
// see enough to recognise a lead and not enough to contact them behind the
// account owner's back (owner, 1 Oct 2026).

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  : '—'

const whenTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const band = (h: number | null) =>
  h === null ? 'never' : h <= 4 ? 'fast' : h <= SLA_HOURS ? 'ok' : 'late'

// ---------------------------------------------------------------- the team

/**
 * Contribution, four ways.
 *
 * Deliberately NOT one score. A single number would have to decide whether
 * answering a lead beats routing forty of them, and that is a judgement for
 * the manager reading this, not for me.
 */
export function Contributions({ rows }: { rows: Contribution[] }) {
  if (!rows.length) return <p className="lede">Nobody has touched a lead in this window.</p>
  return (
    <>
      <div className="mw-scroll-x">
      <table className="mw-kw wide">
        <thead>
          <tr>
            <th>Who</th>
            <th className="num">Answered first</th>
            <th className="num">Emails sent</th>
            <th className="num">Leads emailed</th>
            <th className="num">Wrote it down</th>
            <th className="num">Routed</th>
            <th className="num">Their own clock</th>
            <th className="num">Leads touched</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const wrote = c.notes + c.tasks + c.calls + c.meetings
            return (
              <tr key={c.who}>
                <td><b>{c.who}</b></td>
                <td className="num">{c.firstResponses || '—'}</td>
                <td className="num">{c.emailsSent || '—'}</td>
                <td className="num">{c.conversations || '—'}</td>
                <td className="num">
                  {wrote || '—'}
                  {wrote > 0 && (
                    <small> · {[
                      c.notes && `${c.notes} note${c.notes > 1 ? 's' : ''}`,
                      c.tasks && `${c.tasks} task${c.tasks > 1 ? 's' : ''}`,
                      c.calls && `${c.calls} call${c.calls > 1 ? 's' : ''}`,
                      c.meetings && `${c.meetings} meeting${c.meetings > 1 ? 's' : ''}`,
                    ].filter(Boolean).join(', ')}</small>
                  )}
                </td>
                <td className="num">{c.routed || '—'}</td>
                <td className="num">
                  <span className={`mw-rt ${band(c.medianOwnHours)}`}>{sayHours(c.medianOwnHours)}</span>
                </td>
                <td className="num">
                  {c.leadsTouched}
                  {c.wentQuiet > 0 && <small> · {c.wentQuiet} sat untouched</small>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      <p className="lede" style={{ marginTop: 12 }}>
        <b>Answered first</b> counts the leads where this person sent the first reply to the prospect,
        whoever owned the record. <b>Routed</b> counts leads they moved to the right person by hand —
        real work, and the easiest to miss. <b>Their own clock</b> is the median time from
        <i> them receiving a lead</i> to <i>them emailing it</i>: a lead that waited two days in a
        queue before reaching someone is not that person&rsquo;s delay.
      </p>
      <p className="lede" style={{ marginTop: 8 }}>
        Nothing a rule did is counted here. Zoho stamps automation with a person&rsquo;s name — the
        webform assignment rule records one colleague as having assigned every inbound lead, and a
        tagging workflow records another. Those are filtered out, which is why the numbers are
        smaller than the CRM&rsquo;s own activity counts and closer to the truth.
      </p>
    </>
  )
}

// ---------------------------------------------------------------- the queue

/** Unanswered leads, presented as a shared backlog rather than as anyone's failure. */
export function TeamQueue({ rows }: { rows: LeadJourney[] }) {
  if (!rows.length) return <p className="lede">Nothing is waiting. Every lead in this window was answered.</p>
  return (
    <>
      <div className="mw-scroll-x">
      <table className="mw-kw wide">
        <thead>
          <tr>
            <th>Lead</th><th>Arrived</th><th>Waiting</th><th>Sitting with</th><th>Country</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(j => {
            const waited = Math.floor((Date.now() - +new Date(j.lead.createdTime)) / 86_400_000)
            const holder = j.held.length ? j.held[j.held.length - 1].who : (j.lead.ownerName ?? 'unassigned')
            return (
              <tr key={j.lead.id}>
                <td><b>{j.lead.company || j.lead.fullName || 'Unnamed'}</b></td>
                <td>{when(j.lead.createdTime)}</td>
                <td><span className={`mw-rt ${waited >= 3 ? 'late' : 'ok'}`}>{waited}d</span></td>
                <td>{holder}</td>
                <td>{j.lead.country ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      <p className="lede" style={{ marginTop: 12 }}>
        These are listed against whoever currently holds them, not as anyone&rsquo;s fault. Most
        arrive through an assignment rule rather than being picked up, so a name here usually means
        a lead landed in a queue and nobody was told. The fix is a routing one.
      </p>
    </>
  )
}

// --------------------------------------------------------------- a journey

const ICON: Record<JourneyStep['kind'], string> = {
  created: '●', assigned: '→', transferred: '⇄', 'email-out': '↑', 'email-in': '↓',
  note: '✎', task: '☑', call: '☎', meeting: '◷', status: '·', automation: '⚙',
}

/** One lead, open: the whole journey with every hand on it named. */
export function JourneyRow({ j, owner }: { j: LeadJourney; owner: boolean }) {
  const l = j.lead
  // The prospect is not one of the hands. An inbound email carries their
  // name, and including it put a customer in the middle of the chain —
  // "Venkatraj → Hatem Sadek → Rukshana", where Hatem is the lead.
  const hands = [...new Set(
    j.steps.filter(s => !s.byMachine && s.actor && s.kind !== 'email-in').map(s => s.actor!),
  )]
  return (
    <details className={`mw-lead is-${band(j.teamHours)}`}>
      <summary>
        <span className={`mw-rt ${band(j.teamHours)}`}>{sayHours(j.teamHours)}</span>
        <span className="mw-task-main">
          <b>{l.company || l.fullName || 'Unnamed lead'}</b>
          <small>
            {when(l.createdTime)} · {hands.length ? hands.join(' → ') : 'nobody yet'}
            {' · '}{l.leadStatus ?? 'no status'}
            {j.prospectReplied && <> · <i className="mw-replied">they replied {j.emailsIn}×</i></>}
          </small>
        </span>
        <span className="mw-lead-flags">
          {j.held.length > 1 && <i title="Changed hands">{j.held.length} holders</i>}
          {j.emailsOut > 0 && j.recorded === 0 && <i className="warn" title="Emails exchanged, nothing written down">no write-up</i>}
          {j.prospectReplied && (j.silentDays ?? 0) >= 7 && <i className="bad" title="Prospect engaged, then silence">{j.silentDays}d silent</i>}
        </span>
      </summary>

      <div className="mw-task-body">
        <div className="mw-lead-facts">
          <span><b>Contact</b> {l.fullName ?? '—'}</span>
          <span><b>Email</b> {owner ? (l.email ?? '—') : maskEmail(l.email)}</span>
          <span><b>Country</b> {l.country ?? '—'}</span>
          <span><b>Answered by</b> {j.firstResponder ?? <em className="mw-bad">nobody yet</em>}</span>
        </div>

        {/* The two clocks, side by side, because they answer different questions. */}
        {j.held.length > 0 && (
          <>
            <h4>Whose hands it passed through</h4>
            <table className="mw-kw">
              <thead>
                <tr><th>Who</th><th>Received</th><th>Held for</th><th>Answered in</th></tr>
              </thead>
              <tbody>
                {j.held.map((h, i) => (
                  <tr key={i}>
                    <td><b>{h.who}</b></td>
                    <td>{whenTime(h.from)}</td>
                    <td>{h.heldHours === null ? 'still has it' : sayHours(h.heldHours)}</td>
                    <td>
                      {h.answeredInHours === null
                        ? <em className="mw-bad">didn&rsquo;t</em>
                        : <span className={`mw-rt ${band(h.answeredInHours)}`}>{sayHours(h.answeredInHours)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {j.teamHours !== null && j.held.length > 1 && (
              <p className="mw-waits">
                The company took <b>{sayHours(j.teamHours)}</b> to reply. The person who actually
                answered took <b>{sayHours(j.held.find(h => h.answeredInHours !== null)?.answeredInHours ?? null)}</b> from
                the moment it reached them. The difference is time spent in a queue, not time anyone sat on it.
              </p>
            )}
          </>
        )}

        {/* Lifted out of the timeline on purpose. What a colleague actually
            wrote is the thing a manager reads first, and hunting for it
            among forty automatic entries is how it gets missed. */}
        {(() => {
          const written = j.steps.filter(s =>
            !s.byMachine && ['note', 'task', 'call', 'meeting'].includes(s.kind))
          if (!written.length) {
            return (
              <p className="mw-waits">
                <b>Nothing written down.</b> {j.emailsOut + j.emailsIn} emails on this lead and not
                one note, call log or task. The conversation happened; the record of it did not.
              </p>
            )
          }
          return (
            <>
              <h4>What the team wrote</h4>
              {written.map(s => (
                <p className="mw-note" key={s.id}>
                  <span className="who">{s.actor ?? 'someone'} · {whenTime(s.at)}</span>
                  {s.detail.replace(/^[^:]*?(wrote|set a task|logged a call|booked a meeting): /, '')}
                </p>
              ))}
            </>
          )
        })()}

        <h4>Everything that happened</h4>
        {j.steps.length === 0 ? (
          <p className="lede">Nothing recorded against this lead at all — no email, no note, no call.</p>
        ) : (
          <ul className="mw-timeline">
            {j.steps.map(s => (
              <li key={s.id} className={`${s.kind} ${s.byMachine ? 'auto' : ''}`}>
                <span className="t">{whenTime(s.at)}</span>
                <span className="w">{ICON[s.kind]} {s.byMachine ? <i>automatic</i> : (s.actor ?? '—')}</span>
                <span className="s">{s.detail}</span>
              </li>
            ))}
          </ul>
        )}

        {!owner && (
          <p className="lede" style={{ marginTop: 10 }}>
            Email addresses are hidden outside the owner login. Email bodies are not stored at
            all — Zoho does not expose them for mail synced from a mailbox.
          </p>
        )}
      </div>
    </details>
  )
}
