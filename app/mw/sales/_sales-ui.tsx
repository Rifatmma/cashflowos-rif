import type { LeadRollup, RepScore, LeadEvent } from '@/lib/mw-sales'
import { sayHours, maskEmail, SLA_HOURS } from '@/lib/mw-sales'

// The sales tab. Server components and plain markup, like the rest of /mw.
//
// `owner` is the one thing that changes what is shown: a prospect's email
// address is personal data and this page is open to the whole team, so
// guests see enough to recognise a lead and not enough to contact them
// behind the account owner's back (owner, 1 Oct 2026).

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  : '—'

const whenTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function Scoreboard({ reps }: { reps: RepScore[] }) {
  if (!reps.length) return <p className="lede">No leads in this window.</p>
  return (
    <>
    <table className="mw-kw wide">
      <thead>
        <tr>
          <th>Who</th><th className="num">Leads</th>
          <th className="num">Typical reply time</th>
          <th className="num">Never answered</th>
          <th className="num">Slower than {SLA_HOURS}h</th>
          <th className="num">They wrote back</th>
          <th className="num">Notes in CRM</th>
        </tr>
      </thead>
      <tbody>
        {reps.map(r => (
          <tr key={r.owner}>
            <td><b>{r.owner}</b></td>
            <td className="num">{r.leads}</td>
            <td className="num">
              <span className={`mw-rt ${r.medianHours === null ? 'never' : r.medianHours <= 4 ? 'fast' : r.medianHours <= SLA_HOURS ? 'ok' : 'late'}`}>
                {sayHours(r.medianHours)}
              </span>
            </td>
            <td className="num">{r.never > 0 ? <b className="mw-bad">{r.never}</b> : '—'}</td>
            <td className="num">{r.late > 0 ? <b className="mw-warn">{r.late}</b> : '—'}</td>
            <td className="num">{r.replyRate}%</td>
            <td className="num">
              <span className={r.recordedRate < 50 ? 'mw-bad' : ''}>{r.recordedRate}%</span>
              {r.unrecorded > 0 && <small> · {r.unrecorded} with emails but no note</small>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="lede" style={{ marginTop: 12 }}>
      <b>Typical reply time</b> is the middle one: half their answered leads were faster, half slower.
      Median rather than average, so a single late reply does not define someone&rsquo;s month.{' '}
      <b>Never answered</b> means no email was ever sent to that lead by anyone.{' '}
      <b>Notes in CRM</b> is whether a person wrote down what happened — a note, a call log or a task.
      Emails do not count; they are automatic. A lead with emails but no note means the work happened
      and no record of it exists, so nobody else can pick it up.
    </p>
    </>
  )
}

/** One lead, open: what happened, in order. */
export function LeadRow({ r, events, owner }: { r: LeadRollup; events: LeadEvent[]; owner: boolean }) {
  const l = r.lead
  const notes = events.filter(e => e.kind === 'note')
  return (
    <details className={`mw-lead is-${r.band}`}>
      <summary>
        <span className={`mw-rt ${r.band}`}>{sayHours(r.responseHours)}</span>
        <span className="mw-task-main">
          <b>{l.company || l.fullName || 'Unnamed lead'}</b>
          <small>
            {when(l.createdTime)} · {l.ownerName ?? 'unassigned'} · {l.leadStatus ?? 'no status'}
            {r.prospectReplied && <> · <i className="mw-replied">they replied {r.emailsIn}×</i></>}
          </small>
        </span>
        <span className="mw-lead-flags">
          {r.unrecordedWork && <i className="warn" title="Emails exchanged, nothing written down">no write-up</i>}
          {r.prospectReplied && (r.silentDays ?? 0) >= 7 && <i className="bad" title="Prospect engaged, then silence">{r.silentDays}d silent</i>}
        </span>
      </summary>

      <div className="mw-task-body">
        <div className="mw-lead-facts">
          <span><b>Contact</b> {l.fullName ?? '—'}</span>
          <span><b>Email</b> {owner ? (l.email ?? '—') : maskEmail(l.email)}</span>
          <span><b>Country</b> {l.country ?? '—'}</span>
          <span><b>First answered by</b> {r.firstResponder ?? <em className="mw-bad">nobody</em>}</span>
        </div>

        {/* The point of the page: say plainly when nothing was recorded. */}
        {r.unrecordedWork ? (
          <p className="mw-waits">
            <b>Nothing written down.</b> {r.emailsOut + r.emailsIn} emails exchanged
            {r.meetings > 0 && `, ${r.meetings} meetings`} and not one note, call log or task on this
            lead. The conversation happened; the record of it did not.
          </p>
        ) : notes.length > 0 ? (
          <>
            <h4>What the team wrote</h4>
            {notes.map(n => (
              <p className="mw-note" key={n.id}>
                <span className="who">{n.actor ?? 'someone'} · {whenTime(n.at)}</span>
                {n.body || <em>empty note</em>}
              </p>
            ))}
          </>
        ) : null}

        <h4>Timeline</h4>
        {events.length === 0 ? (
          <p className="lede">Nothing recorded against this lead at all — no email, no note, no call.</p>
        ) : (
          <ul className="mw-timeline">
            {events.map(e => (
              <li key={e.id} className={`${e.kind} ${e.direction ?? ''}`}>
                <span className="t">{whenTime(e.at)}</span>
                <span className="w">
                  {e.kind === 'email'
                    ? (e.direction === 'out' ? '→ sent by ' : '← reply from ') + (e.actor ?? 'unknown')
                    : `${e.kind} · ${e.actor ?? 'unknown'}`}
                </span>
                <span className="s">
                  {e.subject || e.body?.slice(0, 90) || '—'}
                  {(e.meta as any)?.ziaIntent && (
                    <i className="zia" title="Zoho Zia's own label — it reads a cheerful email as a complaint often enough not to trust it">
                      Zia: {(e.meta as any).ziaIntent}
                    </i>
                  )}
                </span>
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
