// A meeting is an answer. Against the MeetSocial case.
//   npx -y tsx --conditions=react-server tests/mw-journey-meeting.test.mts
//
// Manson Chan held a 45-minute meeting with Lucy at MeetSocial on 16 Sept.
// The dashboard filed the lead under "nobody ever answered", because the only
// kind of contact it could see was email. The meeting WAS the answer.
//
// What is genuinely missing is the recap: no email to the client afterwards
// and no note for us, so the substance of a 45-minute conversation exists
// only in one person's head. That is a different failure from silence and is
// counted separately (owner, 1 Oct 2026).

import { buildLeadJourney, makeResolver } from '../lib/mw-journey'
import type { Lead, LeadEvent } from '../lib/mw-sales'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m) : (bad++, console.log(`FAIL ${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`))

const name = makeResolver([
  { id: '1', name: 'Manson Chan', email: 'manson.chan@movingwalls.com' },
])

const lead: Lead = {
  id: 'ms', createdTime: '2026-09-14T09:00:00+08:00',
  fullName: 'Lucy', company: 'MeetSocial', email: 'lucy@meetsocial.com',
  leadStatus: 'Pre-Qualified', ownerName: 'Manson Chan', country: 'China',
}

const meeting: LeadEvent = {
  id: 'ev1', kind: 'meeting', at: '2026-09-16T12:00:00+08:00', direction: null,
  actor: 'Manson Chan', actorEmail: null,
  subject: 'Lucy@MeetSocial x Manson@MW', body: null, meta: {},
}

const met = buildLeadJourney(lead, [meeting], [], name)
eq(met.firstResponder, 'Manson Chan', 'the meeting counts as the first response')
eq(met.firstContactKind, 'meeting', 'recorded as a meeting, not an email')
eq(met.teamHours, 51, 'the prospect was reached 51h after the form came in')
eq(met.noRecap, true, 'flagged: nothing written or sent after the meeting')

const recapped = buildLeadJourney(lead, [meeting, {
  id: 'em1', kind: 'email', at: '2026-09-17T09:30:00+08:00', direction: 'out',
  actor: 'Manson Chan', actorEmail: null, subject: 'Recap of our call', body: null, meta: {},
}], [], name)
eq(recapped.noRecap, false, 'a recap email the next morning clears the flag')
eq(recapped.firstContactKind, 'meeting', 'the meeting is still what reached them first')

const noted = buildLeadJourney(lead, [meeting, {
  id: 'n1', kind: 'note', at: '2026-09-16T13:10:00+08:00', direction: null,
  actor: 'Manson Chan', actorEmail: null, subject: null,
  body: 'They want programmatic in Q1. Sending the deck.', meta: {},
}], [], name)
eq(noted.noRecap, false, 'a note written straight after also clears it')

const future = buildLeadJourney(lead, [{
  ...meeting, id: 'ev2', at: '2099-01-01T12:00:00+08:00', subject: 'Kickoff',
}], [], name)
eq(future.noRecap, false, 'a meeting still in the diary is not an un-recapped one')

const stale = buildLeadJourney(lead, [meeting, {
  id: 'em2', kind: 'email', at: '2026-09-25T09:00:00+08:00', direction: 'out',
  actor: 'Manson Chan', actorEmail: null, subject: 'Following up', body: null, meta: {},
}], [], name)
eq(stale.noRecap, true, 'an email nine days later is a follow-up, not a recap')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
