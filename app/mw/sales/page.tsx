import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { getLeads } from '@/lib/mw-sales-run'
import { sayHours, SLA_HOURS, type Lead, type LeadEvent } from '@/lib/mw-sales'
import {
  buildLeadJourney, contributions, makeResolver, median,
  type LeadJourney, type TimelineLike,
} from '@/lib/mw-journey'
import { MwHero, Tiles, Section } from '../_ui'
import { Contributions, TeamQueue, NoRecap, JourneyRow } from './_sales-ui'
import { PersonPicker } from './_person-picker'

// 👉 Moving Walls → Sales. What happened after the lead arrived.
//
// Marketing spends money generating these; this is whether anyone acted on
// them, and who.
//
// THIS PAGE WAS WRONG TWICE, both times about named people, and both times
// the team caught it rather than me. First it reported thirty-six leads as
// ignored because Zoho only returns the mail the connecting account may see.
// Then it scored everyone by the leads they currently own, which showed the
// person who answered thirty-three leads first as having one.
//
// So it is now built on the audit trail instead of on ownership: who held
// the lead, when it changed hands, and which actions a person actually took
// as opposed to a rule firing in their name (owner, 1 Oct 2026).

export const dynamic = 'force-dynamic'

type Q = { who?: string; show?: string; days?: string }

const WINDOWS = [30, 60, 90] as const

export default async function MwSales({ searchParams }: { searchParams: Promise<Q> }) {
  const guest = await currentGuest()
  const jar = await cookies()
  const isOwner = !!jar.get('cfo_session')?.value
  if (!isOwner && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  const { who, show, days } = await searchParams
  const window = WINDOWS.includes(Number(days) as any) ? Number(days) : 30
  // Pull the widest window once, then narrow in memory: switching the filter
  // should not cost another round of queries.
  const widest = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const { leads, events, timeline, users } = await getLeads(widest)

  // IDENTITY. The same colleague reaches this page three ways: a display name
  // on an audit entry, an address on an email, a user id on an assignment.
  // Without resolving them Sukriti appears twice — once with 33 first
  // responses and once with a single lead — which is the exact confusion this
  // rebuild exists to end.
  //
  // The CRM user list is the good source, cached by the daily run. Until that
  // has run, the owner_name/owner_email pairs already in our own leads table
  // cover most of the team, so the page is right from the first load rather
  // than right tomorrow.
  const fromLeads = (leads as any[])
    .filter(l => l.owner_email && l.owner_name)
    .map(l => ({ id: '', name: String(l.owner_name), email: String(l.owner_email) }))
  const name = makeResolver([...(users as any[]), ...fromLeads])

  const evByLead = new Map<string, LeadEvent[]>()
  for (const e of events as any[]) {
    const ev: LeadEvent = {
      id: e.id, kind: e.kind, at: e.at, direction: e.direction,
      actor: e.actor, actorEmail: e.actor_email, subject: e.subject,
      body: e.body, meta: e.meta ?? {},
    }
    evByLead.set(e.lead_id, [...(evByLead.get(e.lead_id) ?? []), ev])
  }

  const tlByLead = new Map<string, TimelineLike[]>()
  for (const t of timeline as any[]) {
    const row: TimelineLike = {
      at: t.at, action: t.action, byName: t.by_name, byId: t.by_id,
      changes: (t.changes ?? []) as any,
      source: t.source, ruleName: t.rule_name,
      assignedTo: t.assigned_to_name ? { id: t.assigned_to_id, name: t.assigned_to_name } : null,
      recordModule: t.record_module, recordName: t.record_name,
    }
    tlByLead.set(t.lead_id, [...(tlByLead.get(t.lead_id) ?? []), row])
  }

  const cut = Date.now() - window * 86_400_000
  const all: LeadJourney[] = (leads as any[])
    .filter(l => +new Date(l.created_time) >= cut)
    .map(l => {
      const lead: Lead = {
        id: l.id, createdTime: l.created_time, fullName: l.full_name, company: l.company,
        email: l.email, leadStatus: l.lead_status, ownerName: l.owner_name, country: l.country,
      }
      return buildLeadJourney(lead, evByLead.get(l.id) ?? [], tlByLead.get(l.id) ?? [], name)
    })

  const haveTimeline = all.filter(j => (tlByLead.get(j.lead.id) ?? []).length > 0).length
  const contrib = contributions(all)
  const unanswered = all.filter(j => j.firstResponder === null)
  const answered = all.filter(j => j.teamHours !== null)

  const teamMedian = median(answered.map(j => j.teamHours!))
  const late = answered.filter(j => j.teamHours! > SLA_HOURS).length
  const replied = all.filter(j => j.prospectReplied).length
  const noWriteUp = all.filter(j => j.emailsOut > 0 && j.recorded === 0).length
  const silent = all.filter(j => j.prospectReplied && (j.silentDays ?? 0) >= 7).length
  const noRecap = all.filter(j => j.noRecap)
  const metOrCalled = all.filter(j => j.firstContactKind && j.firstContactKind !== 'email').length
  const handedOn = all.filter(j => j.held.length > 1).length

  // Busiest first: the people a manager opens this page to look at are the
  // ones with the most on them, not the ones whose name starts with A.
  const people = contrib
    .map(c => ({ name: c.who, touched: c.leadsTouched }))
    .sort((a, b) => b.touched - a.touched || a.name.localeCompare(b.name))
  let rows = all
  if (who) rows = rows.filter(j => j.steps.some(s => !s.byMachine && s.actor === who) || j.held.some(h => h.who === who))
  if (show === 'never') rows = rows.filter(j => j.firstResponder === null)
  if (show === 'late') rows = rows.filter(j => (j.teamHours ?? 0) > SLA_HOURS)
  if (show === 'blank') rows = rows.filter(j => j.emailsOut > 0 && j.recorded === 0)
  if (show === 'silent') rows = rows.filter(j => j.prospectReplied && (j.silentDays ?? 0) >= 7)
  if (show === 'handed') rows = rows.filter(j => j.held.length > 1)
  if (show === 'norecap') rows = rows.filter(j => j.noRecap)

  const link = (o: Q) => {
    const q = new URLSearchParams()
    if (o.who) q.set('who', o.who)
    if (o.show) q.set('show', o.show)
    if (o.days && Number(o.days) !== 30) q.set('days', o.days)
    const s = q.toString()
    return s ? `/mw/sales?${s}` : '/mw/sales'
  }
  const d = String(window)

  if (!all.length) {
    return (
      <div className="mw-wrap">
        <MwHero tab="sales" pulled="—" stale={false} headline="Sales follow-up" />
        <Section title="Nothing pulled yet">
          <p className="lede">
            The lead trail comes from Zoho CRM on the daily run. Once it has run, every webform lead
            appears here with its whole journey: who it reached, who answered, and who passed it on.
          </p>
        </Section>
      </div>
    )
  }

  return (
    <div className="mw-wrap">
      <MwHero tab="sales" pulled={`${all.length} webform leads · last ${window} days`} stale={false}
        headline={unanswered.length > 0
          ? `${unanswered.length} of ${all.length} leads are still waiting for a first reply`
          : `Every lead answered, typically in ${sayHours(teamMedian)}`}>
        <p>
          Every webform lead, from the moment it arrived to the last thing anyone did with it.
          Response times come from the email trail and the CRM audit log, so nobody has to remember
          to log anything for this to be true — and nobody is credited for work a rule did in their
          name.{guest ? ` Signed in as ${guest}.` : ''}
        </p>
      </MwHero>

      <Section title="Window">
        <div className="mw-filters">
          {WINDOWS.map(w => (
            <Link key={w} href={link({ who, show, days: String(w) })}
              aria-current={window === w ? 'page' : undefined}>Last {w} days</Link>
          ))}
        </div>
      </Section>

      <Tiles items={[
        { k: 'Webform leads', v: String(all.length) },
        { k: 'Company reply time', v: sayHours(teamMedian), tone: (teamMedian ?? 99) <= SLA_HOURS ? 'up' : 'dn' },
        { k: 'Still waiting', v: String(unanswered.length), tone: unanswered.length ? 'dn' : 'up' },
        { k: `Slower than ${SLA_HOURS}h`, v: String(late) },
        { k: 'They wrote back', v: `${all.length ? Math.round((replied / all.length) * 100) : 0}%` },
        { k: 'Changed hands', v: String(handedOn), d: 'at least once' },
        { k: 'Spoke, never wrote it up', v: String(noRecap.length), d: 'call or meeting, no recap', tone: noRecap.length ? 'dn' : 'up' },
      ]} />

      {haveTimeline < all.length && (
        <Section title="Part of the trail is missing"
          sub="Said plainly rather than quietly averaged over.">
          <p className="lede">
            <b>{haveTimeline} of {all.length} leads</b> have their CRM audit trail pulled. For the rest,
            the handoff chain is not known yet, so they show only their email history and their
            current owner. The daily run fills these in a batch at a time; this number should climb
            to the full count within a few days.
          </p>
        </Section>
      )}

      <Section title="What everyone did"
        sub="Contribution counted four ways, because one number would have to decide whether answering a lead beats routing forty of them — and that is your call, not mine.">
        <Contributions rows={contrib} />
      </Section>

      {unanswered.length > 0 && (
        <Section title={`${unanswered.length} leads nobody has answered`}
          sub="A shared queue, not a list of failures.">
          <TeamQueue rows={unanswered} />
        </Section>
      )}

      {noRecap.length > 0 && (
        <Section title={`${noRecap.length} conversations happened and left no trace`}
          sub="A call or a meeting took place, and within two days nothing was sent to the prospect and nothing written for us.">
          <NoRecap rows={noRecap} />
          <p className="lede" style={{ marginTop: 12 }}>
            <b>Every call or meeting needs a recap email afterwards.</b> It gives the prospect a
            written record, it puts the substance where the rest of the team can see it, and it
            costs five minutes. Each of these is still worth writing even now — the detail fades,
            but a line saying what was agreed is better than nothing on the record.
          </p>
          <p className="lede" style={{ marginTop: 10 }}>
            A meeting is invisible to anyone who was not in it, which is why these leads looked
            untouched until the CRM activity lists were connected. They were not untouched; they
            were unwritten. {' '}
            <Link href={link({ show: 'norecap', days: d })}>Open them as journeys</Link> ·{' '}
            <Link href="/mw/playbook#recap">the recap rule</Link>.
          </p>
        </Section>
      )}

      {noWriteUp > 0 && (
        <Section title="The CRM is not being kept up"
          sub="Not the same as nobody doing the work — the emails prove otherwise.">
          <p className="lede">
            <b>{noWriteUp} of {all.length} leads have a real email conversation and nothing written
              against them</b> — no note, no call log, no task. The emails prove somebody was working;
            the CRM just cannot show what was said or agreed. Anyone picking one of these up —
            covering a holiday, or after somebody leaves — starts from nothing.
            {' '}<Link href={link({ show: 'blank', days: d })}>See them</Link>, or read{' '}
            <Link href="/mw/playbook">the standard for writing them up</Link>.
          </p>
        </Section>
      )}

      <Section title="Filter">
        <PersonPicker people={people} who={who} show={show} days={d} />
        <div className="mw-filters">
          <Link href={link({ who, days: d })} aria-current={!show ? 'page' : undefined}>All leads</Link>
          <Link href={link({ who, show: 'never', days: d })} aria-current={show === 'never' ? 'page' : undefined}>Still waiting ({unanswered.length})</Link>
          <Link href={link({ who, show: 'late', days: d })} aria-current={show === 'late' ? 'page' : undefined}>Past {SLA_HOURS}h ({late})</Link>
          <Link href={link({ who, show: 'handed', days: d })} aria-current={show === 'handed' ? 'page' : undefined}>Changed hands ({handedOn})</Link>
          <Link href={link({ who, show: 'norecap', days: d })} aria-current={show === 'norecap' ? 'page' : undefined}>No recap ({noRecap.length})</Link>
          <Link href={link({ who, show: 'blank', days: d })} aria-current={show === 'blank' ? 'page' : undefined}>No write-up ({noWriteUp})</Link>
          <Link href={link({ who, show: 'silent', days: d })} aria-current={show === 'silent' ? 'page' : undefined}>Gone quiet ({silent})</Link>
        </div>
        {who && (
          <p className="lede" style={{ marginTop: 10 }}>
            Showing every lead <b>{who}</b> touched in any way — answered, emailed, wrote up, or
            routed on — not only the ones they own.
          </p>
        )}
      </Section>

      <Section title={`${rows.length} ${rows.length === 1 ? 'lead' : 'leads'}`}
        sub="Newest first. Open one to see the whole journey, with every hand on it named.">
        {rows.length === 0
          ? <p className="lede">Nothing matches that filter — which is good news.</p>
          : rows.map(j => <JourneyRow key={j.lead.id} j={j} owner={isOwner} />)}
      </Section>

      <p className="lede" style={{ marginTop: 8 }}>
        Email bodies are not shown because Zoho does not expose them for mail synced from a
        mailbox — only mail composed inside the CRM carries readable content. Notes, call logs,
        tasks and meetings do, and appear in full wherever the team recorded them.
      </p>
    </div>
  )
}
