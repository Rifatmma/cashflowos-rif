// The lead journey, against the real Ali Magdy audit trail. No network.
//   npx -y tsx --conditions=react-server tests/mw-journey.test.mts
//
// This fixture is verbatim from Zoho on 1 Oct 2026, not invented, because
// every wrong number this dashboard has shown came from assuming a shape
// rather than reading one. The lead arrived from the webform on 29 Sep,
// sat with the assignment rule's default holder overnight, was taken by
// Rukshana on 30 Sep at 14:40, and answered on 1 Oct at 11:15.
//
// What must come out of that:
//   · the company took 38 hours, Rukshana took 21 — both stated
//   · Dineshgandhi is NOT credited with assigning it; a rule did, in his name
//   · Rukshana is credited with the first response, the email and the task

import {
  buildLeadJourney, contributions, makeResolver, holdings,
  type TimelineLike,
} from '../lib/mw-journey'
import type { Lead, LeadEvent } from '../lib/mw-sales'

let bad = 0
const fail = (m: string) => { console.log(`FAIL ${m}`); bad++ }
const ok = (m: string) => console.log(`ok   ${m}`)
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m) : fail(`${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`)

const users = [
  { id: '5289273000017034001', name: 'Dineshgandhi S', email: 'dineshgandhi@movingwalls.com' },
  { id: '5289273000000884534', name: 'Rukshana Rizwie', email: 'rukshana@movingwalls.com' },
  { id: '5289273000000526480', name: 'Franches Ramasamy', email: 'franches@movingwalls.com' },
]
const name = makeResolver(users)

const lead: Lead = {
  id: '5289273000124703003',
  createdTime: '2026-09-29T21:06:44+08:00',
  fullName: 'Ali Magdy', company: 'Ethraco', email: 'ali@example.com',
  leadStatus: 'New Lead', ownerName: 'Rukshana Rizwie', country: 'United Arab Emirates',
}

const tl = (o: Partial<TimelineLike>): TimelineLike => ({
  at: '', action: 'updated', byName: null, byId: null, changes: [],
  source: 'crm_ui', assignedTo: null, ruleName: null,
  recordModule: 'Leads', recordName: 'Ali Magdy', ...o,
})

const timeline: TimelineLike[] = [
  tl({ at: '2026-09-29T21:06:44+08:00', action: 'added', source: 'zoho_forms', byName: 'Dineshgandhi S' }),
  tl({
    at: '2026-09-29T21:06:44+08:00', action: 'owner_assigned', source: 'assignment_rules',
    byName: 'Dineshgandhi S', ruleName: 'Lead Assignment Rule - Website / Webform Leads',
    assignedTo: { id: '5289273000017034001', name: 'Dineshgandhi S' },
  }),
  tl({
    at: '2026-09-29T21:06:44+08:00', action: 'updated', source: 'scoringrule', byName: 'Dineshgandhi S',
    changes: [{ field: 'Record_Score', from: '0', to: '15' }],
  }),
  tl({
    at: '2026-09-29T21:08:06+08:00', action: 'tag_added', source: 'workflow', byName: 'Franches Ramasamy',
    ruleName: 'Auto Tag - Website / Webform',
    changes: [{ field: 'Tag', from: ' ', to: 'Website / Webform Leads' }],
  }),
  tl({ at: '2026-09-29T21:08:07+08:00', action: 'state_executed', source: 'pathfinder', byName: 'Dineshgandhi S' }),
  tl({
    at: '2026-09-30T14:40:01+08:00', action: 'updated', source: 'crm_ui', byName: 'Rukshana Rizwie',
    changes: [
      { field: 'Owner', from: 'Dineshgandhi S', to: 'Rukshana Rizwie' },
      { field: 'Lead_Status', from: 'Pre-Qualified', to: 'New Lead' },
    ],
  }),
  tl({
    at: '2026-10-01T11:16:54+08:00', action: 'added', source: 'crm_ui', byName: 'Rukshana Rizwie',
    recordModule: 'Tasks', recordName: 'Invite for discovery call',
  }),
  tl({
    at: '2026-10-01T11:16:54+08:00', action: 'state_executed', source: 'pathfinder',
    byName: 'Rukshana Rizwie', recordModule: 'Tasks', recordName: 'Invite for discovery call',
  }),
]

const events: LeadEvent[] = [
  {
    id: 'b2d15c84', kind: 'email', at: '2026-10-01T11:15:52+08:00', direction: 'out',
    actor: null, actorEmail: 'rukshana@movingwalls.com', subject: 'Moving Walls — billboard availability', body: null, meta: {},
  },
]

const j = buildLeadJourney(lead, events, timeline, name)

// ---- the two clocks -------------------------------------------------------
eq(j.teamHours, 38.2, 'the company took 38.2h from form to first reply')
eq(j.firstResponder, 'Rukshana Rizwie', 'first responder resolved from her email address')

const h = holdings(lead, timeline, events, name)
eq(h.map(x => x.who), ['Dineshgandhi S', 'Rukshana Rizwie'], 'both holders, in order')
eq(h[0].acted, false, 'the queue holder never emailed it')
eq(h[1].answeredInHours, 20.6, 'Rukshana answered 20.6h after she received it')

// ---- automation is not work ----------------------------------------------
const assigned = j.steps.find(s => s.kind === 'assigned')!
eq(assigned.byMachine, true, 'the assignment rule is marked as machinery')
eq(assigned.actor, null, 'nobody is credited for the rule firing in their name')

const tagStep = j.steps.find(s => s.detail.includes('Tag'))
eq(tagStep, undefined, 'the tagging workflow produces no step at all')

// ---- contribution ---------------------------------------------------------
const c = contributions([j])
const ruk = c.find(x => x.who === 'Rukshana Rizwie')!
const din = c.find(x => x.who === 'Dineshgandhi S')!

eq(ruk.firstResponses, 1, 'Rukshana credited with the first response')
eq(ruk.emailsSent, 1, 'and with the email')
eq(ruk.tasks, 1, 'and with the task she logged')
eq(ruk.routed, 1, 'and with taking it off the queue by hand')
eq(din.firstResponses, 0, 'the queue holder gets no first response')
eq(din.emailsSent, 0, 'and no emails')
eq(din.routed, 0, 'and no routing credit for a rule he did not run')
eq(din.wentQuiet, 1, 'but it is recorded that it sat with him untouched')
eq(din.leadsTouched, 1, 'he is still shown on the lead, not erased from it')

// ---- a lead nobody ever answered -----------------------------------------
const orphan = buildLeadJourney(
  { ...lead, id: 'x', ownerName: 'Dineshgandhi S' }, [],
  [timeline[0], timeline[1]], name,
)
eq(orphan.firstResponder, null, 'an unanswered lead has no first responder')
eq(orphan.teamHours, null, 'and no response time invented for it')
eq(contributions([orphan]).find(x => x.who === 'Rukshana Rizwie'), undefined,
  'and nobody uninvolved appears on it')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
