// Templates the team copies. Kept as data rather than markup so the page and
// any future Cliq reminder read from one source and cannot drift apart.

export type Template = {
  id: string
  when: string
  object: 'Note' | 'Call' | 'Meeting' | 'Task'
  title: string
  body: string
  why: string
}

export const TEMPLATES: Template[] = [
  {
    id: 'offcrm',
    when: 'LinkedIn, WhatsApp, a phone call, a corridor conversation at a show',
    object: 'Note',
    title: 'Something happened outside the CRM',
    why:
      'The CRM sees email and nothing else. If it happened on LinkedIn it did not happen, '
      + 'as far as anyone covering for you is concerned.',
    body: `LINKEDIN — 14 Oct
Who: Ahmed Nasser, Head of Media

They said: Running a Q1 campaign across Riyadh, unhappy with
  their current vendor's reporting. Asked whether we do
  proof-of-play.
I said: Yes, sent the Dubai case study.

Next: he comes back after their internal review, 21 Oct.`,
  },
  {
    id: 'meeting',
    when: 'Google Meet, Teams, or a face-to-face meeting',
    object: 'Meeting',
    title: 'A meeting happened',
    why:
      'A calendar invite proves a meeting was booked, not what came out of it. The summary is '
      + 'the asset — it is what lets someone else pick this up, and what tells us why we won or lost '
      + 'six months from now.',
    body: `MEETING — 14 Oct — Ahmed Nasser, Layla Said (procurement)

Their situation: 40 static sites in Riyadh, moving 12 to digital
  in Q1. No central booking system today — spreadsheets.
What they need: inventory management first, programmatic later.
Concerns: worried about training their ops team.
Budget / timing: approved in principle, decision in Nov.

Agreed next step: I send implementation timeline by 18 Oct.
Their decision maker: Layla signs, Ahmed recommends.`,
  },
  {
    id: 'thread',
    when: 'An email thread has run past three or four messages',
    object: 'Note',
    title: 'A long email thread',
    why:
      'The emails are all in the CRM already. Nobody is going to read fourteen of them to find out '
      + 'where this stands. One paragraph saves the next person half an hour.',
    body: `THREAD SUMMARY — as at 14 Oct

Where it stands: They want pricing for 30 faces across two
  cities. I have sent the rate card; they came back asking for
  a 12-month committed rate.
Open question: Can we hold 2026 rates for 12 months?
Waiting on: us — I need Finance to confirm.
Next: answer by 16 Oct or tell them when I can.`,
  },
  {
    id: 'handoff',
    when: 'You are passing a lead to someone else',
    object: 'Note',
    title: 'A handoff',
    why:
      'This is the biggest gap we have. Leads change hands constantly here and arrive at the next '
      + 'person with no context, so they start the conversation again and the prospect notices.',
    body: `HANDOFF — to Rukshana — 14 Oct

Why: MENA market, belongs with you.
Contact so far: one email from me on 12 Oct introducing us,
  no reply yet.
What they asked for: billboard availability in Dubai, Q1.
What I promised: nothing beyond an introduction.
Watch out for: they asked twice about pricing — they are
  price-led, not feature-led.

Next step for you: send the MENA inventory deck.`,
  },
  {
    id: 'won',
    when: 'A deal closes and we won it',
    object: 'Note',
    title: 'We won',
    why:
      'We spend money generating these leads and almost never record why one converted. Without '
      + 'that, every new campaign is a guess.',
    body: `WON — 14 Oct — USD 48k, Moving Audiences, 12 months

Why we won: proof-of-play reporting. Their incumbent could not
  show play logs and they had been burned by it.
Who decided: Layla (procurement) signed; Ahmed championed it.
What tipped it: the Dubai case study, specifically the
  discrepancy report.
Came to us via: website form, searched "DOOH inventory software".
Took: 6 weeks, 3 meetings.`,
  },
  {
    id: 'lost',
    when: 'A deal ends and we did not win it — including going quiet',
    object: 'Note',
    title: 'We lost, or it went nowhere',
    why:
      'The most valuable note on this list and the one nobody writes. Ten of these and the pattern '
      + 'is obvious; none of them and we keep losing the same way.',
    body: `LOST — 14 Oct

Why: price. We were ~30% above Broadsign on the software line.
Competitor: Broadsign.
Could we have changed it: possibly — they never saw the
  programmatic module, which is where we are stronger. I led
  with inventory because that is what they asked for.
Revisit: Mar 2027, when their Broadsign contract renews.`,
  },
]

export function TemplateCard({ t }: { t: Template }) {
  return (
    <details className="mw-lead" id={t.id}>
      <summary>
        <span className="mw-rt ok">{t.object}</span>
        <span className="mw-task-main">
          <b>{t.title}</b>
          <small>{t.when}</small>
        </span>
      </summary>
      <div className="mw-task-body">
        <p className="lede"><b>Why it matters.</b> {t.why}</p>
        <h4>Copy this</h4>
        <pre className="mw-template">{t.body}</pre>
      </div>
    </details>
  )
}
