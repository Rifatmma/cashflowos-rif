import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { getLeads } from '@/lib/mw-sales-run'
import {
  rollUpLead, scoreByRep, summarise, sayHours, SLA_HOURS,
  type Lead, type LeadEvent, type LeadRollup,
} from '@/lib/mw-sales'
import { MwHero, Tiles, Section } from '../_ui'
import { Scoreboard, LeadRow } from './_sales-ui'

// 👉 Moving Walls → Sales. What happened after the lead arrived.
//
// Marketing spends money generating these; this is whether anyone acted on
// them. Two separate questions, deliberately kept apart:
//
//   Was the lead answered, and how fast — from the email trail, which is
//   automatic and cannot be forgotten or massaged.
//
//   Was any of it written down — which, on the first sample, four leads in
//   five were not. That gap is reported rather than scored as inactivity,
//   because the emails prove the work happened (owner, 1 Oct 2026).

export const dynamic = 'force-dynamic'

type Q = { who?: string; show?: string }

export default async function MwSales({ searchParams }: { searchParams: Promise<Q> }) {
  const guest = await currentGuest()
  const jar = await cookies()
  const isOwner = !!jar.get('cfo_session')?.value
  if (!isOwner && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  const { who, show } = await searchParams
  const { leads, events } = await getLeads('2026-09-01')

  const byLead = new Map<string, LeadEvent[]>()
  for (const e of events as any[]) {
    const ev: LeadEvent = {
      id: e.id, kind: e.kind, at: e.at, direction: e.direction,
      actor: e.actor, actorEmail: e.actor_email, subject: e.subject,
      body: e.body, meta: e.meta ?? {},
    }
    byLead.set(e.lead_id, [...(byLead.get(e.lead_id) ?? []), ev])
  }

  const all: LeadRollup[] = (leads as any[]).map(l => {
    const lead: Lead = {
      id: l.id, createdTime: l.created_time, fullName: l.full_name, company: l.company,
      email: l.email, leadStatus: l.lead_status, ownerName: l.owner_name, country: l.country,
    }
    return rollUpLead(lead, byLead.get(l.id) ?? [])
  })

  const owners = [...new Set(all.map(r => r.lead.ownerName ?? 'Unassigned'))].sort()
  let rows = who ? all.filter(r => (r.lead.ownerName ?? 'Unassigned') === who) : all
  if (show === 'never') rows = rows.filter(r => r.band === 'never')
  if (show === 'late') rows = rows.filter(r => r.band === 'late')
  if (show === 'blank') rows = rows.filter(r => r.unrecordedWork)
  if (show === 'silent') rows = rows.filter(r => r.prospectReplied && (r.silentDays ?? 0) >= 7)

  const sum = summarise(all)
  const reps = scoreByRep(all)

  const link = (o: Q) => {
    const q = new URLSearchParams()
    if (o.who) q.set('who', o.who)
    if (o.show) q.set('show', o.show)
    const s = q.toString()
    return s ? `/mw/sales?${s}` : '/mw/sales'
  }

  if (!all.length) {
    return (
      <div className="mw-wrap">
        <MwHero tab="sales" pulled="—" stale={false} headline="Sales follow-up" />
        <Section title="Nothing pulled yet">
          <p className="lede">
            The lead trail comes from Zoho CRM through Composio on the daily run. Once it has run,
            every webform lead appears here with how long it took to answer and what was recorded.
          </p>
        </Section>
      </div>
    )
  }

  return (
    <div className="mw-wrap">
      <MwHero tab="sales" pulled={`${sum.leads} webform leads`} stale={false}
        headline={sum.never > 0
          ? `${sum.never} of ${sum.leads} leads were never answered`
          : `Every lead answered, median ${sayHours(sum.medianHours)}`}>
        <p>
          What happened after each webform lead arrived: how long before anyone replied, whether the
          prospect wrote back, and whether any of it was written down. Response times come from the
          email trail, so nobody has to remember to log anything for this to be true.
          {guest ? ` Signed in as ${guest}.` : ''}
        </p>
      </MwHero>

      <Tiles items={[
        { k: 'Webform leads', v: String(sum.leads) },
        { k: 'Median first reply', v: sayHours(sum.medianHours), tone: (sum.medianHours ?? 99) <= SLA_HOURS ? 'up' : 'dn' },
        { k: 'Never answered', v: String(sum.never), tone: sum.never ? 'dn' : 'up' },
        { k: `Slower than ${SLA_HOURS}h`, v: String(sum.late) },
        { k: 'Prospect replied', v: `${sum.replyRate}%` },
        { k: 'Written up', v: `${sum.recordedRate}%`, d: `${sum.unrecorded} with none`, tone: sum.recordedRate < 50 ? 'dn' : 'up' },
      ]} />

      {sum.unrecorded > 0 && (
        <Section title="The CRM is not being kept up"
          sub="This is the gap worth fixing first — and it is not the same as nobody doing the work.">
          <p className="lede">
            <b>{sum.unrecorded} of {sum.leads} leads have a real email conversation and no note, call log
              or task against them.</b> On those leads the emails prove somebody was working; the CRM
            just cannot show you what was said or agreed. Anyone picking one of them up — covering a
            holiday, or after somebody leaves — starts from nothing.
            {' '}<Link href={link({ show: 'blank' })}>See them</Link>.
          </p>
        </Section>
      )}

      <Section title="By person"
        sub={`Median first reply, how many went unanswered, and how much got written up. Median rather than average, so one bad week does not define a month.`}>
        <Scoreboard reps={reps} />
      </Section>

      <Section title="Filter">
        <div className="mw-filters">
          <Link href={link({ show })} aria-current={!who ? 'page' : undefined}>Everyone</Link>
          {owners.map(o => (
            <Link key={o} href={link({ who: o, show })} aria-current={who === o ? 'page' : undefined}>{o}</Link>
          ))}
        </div>
        <div className="mw-filters">
          <Link href={link({ who })} aria-current={!show ? 'page' : undefined}>All leads</Link>
          <Link href={link({ who, show: 'never' })} aria-current={show === 'never' ? 'page' : undefined}>Never answered ({sum.never})</Link>
          <Link href={link({ who, show: 'late' })} aria-current={show === 'late' ? 'page' : undefined}>Past {SLA_HOURS}h ({sum.late})</Link>
          <Link href={link({ who, show: 'blank' })} aria-current={show === 'blank' ? 'page' : undefined}>No write-up ({sum.unrecorded})</Link>
          <Link href={link({ who, show: 'silent' })} aria-current={show === 'silent' ? 'page' : undefined}>Gone quiet ({sum.silent})</Link>
        </div>
      </Section>

      <Section title={`${rows.length} ${rows.length === 1 ? 'lead' : 'leads'}`}
        sub="Newest first. Open one to see every email, note and meeting in order.">
        {rows.length === 0
          ? <p className="lede">Nothing matches that filter — which is good news.</p>
          : rows.map(r => (
            <LeadRow key={r.lead.id} r={r} events={byLead.get(r.lead.id) ?? []} owner={isOwner} />
          ))}
      </Section>

      <p className="lede" style={{ marginTop: 8 }}>
        Email bodies are not shown because Zoho does not expose them for mail synced from a mailbox —
        only mail composed inside the CRM carries readable content. Notes, call logs and meeting
        records do, and appear in full wherever the team wrote them.
      </p>
    </div>
  )
}
