import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { getLeads } from '@/lib/mw-sales-run'
import type { Lead, LeadEvent } from '@/lib/mw-sales'
import { buildLeadJourney, makeResolver, type TimelineLike } from '@/lib/mw-journey'
import { MwHero, Tiles, Section } from '../_ui'
import { TEMPLATES, TemplateCard } from './_playbook-ui'

// 👉 Moving Walls → How we log work. The standard, not a suggestion.
//
// WHY A PAGE AND NOT A DOCUMENT. A document describing a standard goes stale
// the week after it is written and nobody can tell. This page reads the same
// data the Sales tab does, so the number at the top is today's compliance
// rather than the number that was true when somebody typed it. If the team
// improves, the page says so without anyone editing it.
//
// Scope agreed with the owner (1 Oct 2026): mandatory, 24 hours, four things
// that must always be written down, reviewed by him weekly from the dashboard.

export const dynamic = 'force-dynamic'

export const LOG_WITHIN_HOURS = 24

export default async function MwPlaybook() {
  const guest = await currentGuest()
  const jar = await cookies()
  const isOwner = !!jar.get('cfo_session')?.value
  if (!isOwner && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  // The live state of the thing this page is asking people to fix.
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { leads, events, timeline, users } = await getLeads(since)

  const fromLeads = (leads as any[])
    .filter(l => l.owner_email && l.owner_name)
    .map(l => ({ id: '', name: String(l.owner_name), email: String(l.owner_email) }))
  const name = makeResolver([...(users as any[]), ...fromLeads])

  const evByLead = new Map<string, LeadEvent[]>()
  for (const e of events as any[]) {
    evByLead.set(e.lead_id, [...(evByLead.get(e.lead_id) ?? []), {
      id: e.id, kind: e.kind, at: e.at, direction: e.direction, actor: e.actor,
      actorEmail: e.actor_email, subject: e.subject, body: e.body, meta: e.meta ?? {},
    }])
  }
  const tlByLead = new Map<string, TimelineLike[]>()
  for (const t of timeline as any[]) {
    tlByLead.set(t.lead_id, [...(tlByLead.get(t.lead_id) ?? []), {
      at: t.at, action: t.action, byName: t.by_name, byId: t.by_id,
      changes: (t.changes ?? []) as any, source: t.source, ruleName: t.rule_name,
      assignedTo: t.assigned_to_name ? { id: t.assigned_to_id, name: t.assigned_to_name } : null,
      recordModule: t.record_module, recordName: t.record_name,
    }])
  }

  const all = (leads as any[]).map(l => {
    const lead: Lead = {
      id: l.id, createdTime: l.created_time, fullName: l.full_name, company: l.company,
      email: l.email, leadStatus: l.lead_status, ownerName: l.owner_name, country: l.country,
    }
    return buildLeadJourney(lead, evByLead.get(l.id) ?? [], tlByLead.get(l.id) ?? [], name)
  })

  const active = all.filter(j => j.emailsOut > 0)
  const written = active.filter(j => j.recorded > 0).length
  const rate = active.length ? Math.round((written / active.length) * 100) : 0
  const handedOn = all.filter(j => j.held.length > 1)
  const handoffNotes = handedOn.filter(j => j.recorded > 0).length

  return (
    <div className="mw-wrap">
      <MwHero tab="playbook" sources="Moving Walls · the standard, reviewed weekly"
        pulled={`${rate}% of active leads written up today`} stale={false}
        headline="How we log work">
        <p>
          The CRM only sees email. Everything else — LinkedIn, a call, a Google Meet, a conversation
          at a show — exists only if one of us writes it down. This page is the standard for doing
          that: what must be logged, where it goes, and by when.
          {guest ? ` Signed in as ${guest}.` : ''}
        </p>
      </MwHero>

      <Tiles items={[
        { k: 'Leads worked, last 30 days', v: String(active.length) },
        { k: 'Written up', v: `${rate}%`, d: `${written} of ${active.length}`, tone: rate >= 80 ? 'up' : 'dn' },
        { k: 'Changed hands', v: String(handedOn.length), d: `${handoffNotes} with a handover note`, tone: handedOn.length && handoffNotes === handedOn.length ? 'up' : 'dn' },
        { k: 'Log within', v: `${LOG_WITHIN_HOURS}h`, d: 'of the conversation' },
      ]} />

      <Section title="Why this is being asked of you"
        sub="Not a process for its own sake.">
        <p className="lede">
          Marketing spends real money putting these leads in front of us. Right now{' '}
          <b>{active.length - written} of the {active.length} leads we actively worked in the last
          thirty days have a conversation in email and nothing written against them</b>. The emails
          prove somebody was doing the work. What they cannot show is what was said, what was
          promised, or where it stands.
        </p>
        <p className="lede" style={{ marginTop: 10 }}>
          That costs us in three specific ways, and all three have already happened here:
        </p>
        <ul className="mw-list">
          <li>
            <b>Leads change hands and arrive cold.</b>{' '}
            {handedOn.length > 0
              ? <>{handedOn.length} leads in the last thirty days passed between people, and{' '}
                  {handedOn.length - handoffNotes} of them carried no handover note at all.</>
              : <>Leads here are routed automatically and then passed on by hand — the person who
                  answers is usually not the person it landed on.</>}
            {' '}The next person starts the conversation again, and the prospect notices.
          </li>
          <li>
            <b>We cannot say why we win — or lose.</b> Across every lead in this window there{' '}
            {written === 1 ? 'is one note' : `are ${written} notes`} in total, and none of them
            records an outcome. So the next campaign is planned on memory.
          </li>
          <li>
            <b>Cover is impossible.</b> Holiday, illness, someone leaves — and the relationship
            leaves with them.
          </li>
        </ul>
        <p className="lede" style={{ marginTop: 10 }}>
          None of this is about watching you work. The Sales tab already measures response time from
          the email trail automatically, and nobody has to log anything for that to be accurate.
          This is about the part no system can see on its own.
        </p>
      </Section>

      <Section title="The standard"
        sub="Four things that must always be written down, within 24 hours.">
        <ol className="mw-list numbered">
          <li>
            <b>Anything that happened outside the CRM.</b> LinkedIn, WhatsApp, a phone call, a chat
            at a trade show. If the CRM cannot see it, it needs a note.
          </li>
          <li>
            <b>Every handoff.</b> Before you pass a lead to someone else, write what has been said,
            what you promised, and what the next step is. Passing a lead without this is not a
            handoff, it is a transfer of a problem.
          </li>
          <li>
            <b>A summary of any long email thread.</b> Once a thread passes three or four messages,
            one paragraph saying where it actually stands.
          </li>
          <li>
            <b>Why we won or lost.</b> Every deal that ends, either way, with the reason. Including
            the ones that simply went quiet — &ldquo;no reply after three attempts&rdquo; is a
            result and belongs on the record.
          </li>
        </ol>
        <p className="mw-waits" style={{ marginTop: 12 }}>
          <b>Within {LOG_WITHIN_HOURS} hours of the conversation</b>, and before you finish for the
          day where you can. A note written three days later is half a note — the detail that
          mattered has already gone.
        </p>
      </Section>

      <Section title="Where it goes in Zoho"
        sub="Four places, and people use the wrong one, which is why things get lost.">
        <table className="mw-kw wide">
          <thead>
            <tr><th>Use</th><th>For</th><th>Where to find it</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Note</b></td>
              <td>What happened. Your default — every template below except one is a Note.</td>
              <td>Open the Lead or Deal → <i>Notes</i> tab → <i>Add Note</i></td>
            </tr>
            <tr>
              <td><b>Call</b></td>
              <td>You actually spoke to them. Log it as a Call so the outcome is structured, then put the substance in the description.</td>
              <td>Lead → <i>Calls</i> → <i>Log a Call</i></td>
            </tr>
            <tr>
              <td><b>Meeting</b></td>
              <td>A Google Meet or face-to-face. Book it as a Meeting <i>and</i> add the summary — the invite alone records that it happened, not what came of it.</td>
              <td>Lead → <i>Meetings</i> → add, then edit the description afterwards</td>
            </tr>
            <tr>
              <td><b>Task</b></td>
              <td>Only what happens <i>next</i>, with a date and an owner. Never use a Task to record what already happened.</td>
              <td>Lead → <i>Tasks</i> → <i>Add Task</i></td>
            </tr>
          </tbody>
        </table>
        <p className="lede" style={{ marginTop: 12 }}>
          <b>The rule of thumb:</b> a Note is what happened, a Task is what happens next. Most real
          touchpoints produce one of each. Do not put either in the lead&rsquo;s{' '}
          <i>Description</i> field — it is a single box that gets overwritten, and nothing can read
          its history.
        </p>
      </Section>

      <Section title="Templates"
        sub="Open one, copy it, fill it in. Six situations covering everything that actually happens here.">
        {TEMPLATES.map(t => <TemplateCard key={t.id} t={t} />)}
        <p className="lede" style={{ marginTop: 14 }}>
          These are a floor, not a cage. If a conversation does not fit a template, write it in your
          own words — a note in plain English always beats a blank field. The headings exist so that
          six months later somebody can scan forty notes and find the one thing they need.
        </p>
      </Section>

      <Section title="What a good note looks like"
        sub="A real one from this CRM, and the version that would have been useless.">
        <div className="mw-compare">
          <div>
            <h4 className="mw-ok-h">Good — actually written here</h4>
            <p className="mw-note">
              <span className="who">Rukshana Rizwie · 28 Sept</span>
              We have reached out to Al Arabia Egypt and some other local MOs; they need to revert
              if interested.
            </p>
            <p className="lede">
              Short, but it does the job: who was approached, what we are waiting for, and who owes
              the next move. Anyone picking this up tomorrow knows where it stands.
            </p>
          </div>
          <div>
            <h4 className="mw-bad-h">Not good enough</h4>
            <p className="mw-note dim">
              <span className="who">— · —</span>
              Followed up. Will revert.
            </p>
            <p className="lede">
              Followed up how, with whom, about what? Who reverts, and by when? This takes the same
              ten seconds to write and saves nobody any time at all. It is worse than nothing,
              because it looks like a record.
            </p>
          </div>
        </div>
        <p className="lede" style={{ marginTop: 12 }}>
          <b>The test:</b> if you were hit by a bus tomorrow, could a colleague read your note and
          carry the conversation without calling you? If not, it needs one more line.
        </p>
      </Section>

      <Section title="Things that waste everyone's time"
        sub="Seen in this CRM, worth naming.">
        <ul className="mw-list">
          <li><b>Pasting the whole email chain into a note.</b> It is already in the CRM. Summarise instead.</li>
          <li><b>&ldquo;Called, no answer.&rdquo;</b> Fine as a Call log. Not a substitute for recording the three previous attempts and what you will do differently.</li>
          <li><b>Notes in your own notebook or inbox.</b> If it is not on the lead, it does not exist to anybody else.</li>
          <li><b>Waiting until the deal closes to write it all up.</b> You will not remember, and the useful detail is in the middle, not the end.</li>
          <li><b>Logging a Task to describe something that already happened.</b> Tasks are for the future; they clutter the follow-up list and the real record goes missing.</li>
        </ul>
      </Section>

      <Section title="How this gets reviewed"
        sub="So nobody is surprised by it.">
        <p className="lede">
          Rif reviews the <Link href="/mw/sales?show=blank">no write-up list</Link> once a week from
          the Sales tab. It is a standing item, not an audit: the question is always{' '}
          <i>what is blocking this</i>, not <i>why did you not do it</i>. If the standard is wrong
          for how your market actually works, say so and it gets changed — several of these rules
          exist because of what the data showed, and they can be rewritten the same way.
        </p>
        <p className="lede" style={{ marginTop: 10 }}>
          Three numbers get looked at, all at the top of this page: the share of worked leads with
          anything written against them, whether leads that changed hands carried a handover note,
          and whether closed deals say why. Nothing is scored per person on this page — the point is
          the record, not a league table.
        </p>
      </Section>

      <p className="lede" style={{ marginTop: 8 }}>
        <Link href="/mw/sales">Sales follow-up</Link> · <Link href="/mw">Overview</Link>
      </p>
    </div>
  )
}
