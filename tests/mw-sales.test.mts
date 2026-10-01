// The scorecard decides how people are judged, so the edge cases matter more
// than the happy path. Built from the real Ethraco thread.
import { rollUpLead, scoreByRep, sayHours, maskEmail, bandOf, median, summarise, type LeadEvent } from '../lib/mw-sales'

let bad = 0
const ok = (m: string) => console.log('ok  ', m)
const fail = (m: string) => { bad++; console.log('FAIL', m) }

const lead = {
  id: 'L1', createdTime: '2026-09-09T20:31:53+08:00',
  fullName: 'Mohamed Khalid', company: 'Ethraco', email: 'm.khalid@ethraco.com',
  leadStatus: 'Qualified', ownerName: 'Venkatraj Radhakrishnan', country: 'Saudi Arabia',
}

const e = (at: string, kind: LeadEvent['kind'], direction: 'out' | 'in' | null, actor: string): LeadEvent =>
  ({ id: at + actor, kind, at, direction, actor })

// The real thread: a colleague answers first, the owner takes over later.
const ethraco: LeadEvent[] = [
  e('2026-09-10T17:06:04+08:00', 'email', 'out', 'rukshana@movingwalls.com'),
  e('2026-09-12T19:35:10+08:00', 'email', 'in', 'Mohamed Khalid'),
  e('2026-09-14T16:15:08+08:00', 'email', 'out', 'venkatraj@movingwalls.com'),
  e('2026-09-14T16:24:16+08:00', 'email', 'in', 'Mohamed Khalid'),
  e('2026-09-28T16:21:50+08:00', 'email', 'in', 'Mohamed Khalid'),
  e('2026-09-29T18:05:54+08:00', 'email', 'out', 'venkatraj@movingwalls.com'),
]

const r = rollUpLead(lead, ethraco)
if (r.firstResponder !== 'rukshana@movingwalls.com') fail(`first responder should be the colleague who actually answered, got ${r.firstResponder}`)
else ok('the clock stops at whoever answered, not at the assigned owner')

if (r.responseHours === null || Math.abs(r.responseHours - 20.6) > 0.2) fail(`expected ~20.6h, got ${r.responseHours}`)
else ok(`response time measured from lead creation: ${sayHours(r.responseHours)}`)

if (r.band !== 'ok') fail(`20.6h should be inside the 24h SLA, got "${r.band}"`)
else ok('20.6h sits inside the 24-hour SLA')

if (r.emailsOut !== 3 || r.emailsIn !== 3) fail(`counted ${r.emailsOut} out / ${r.emailsIn} in`)
else ok('emails counted by direction')

// The headline finding: ten emails, two meetings, nothing written down.
if (!r.unrecordedWork) fail('a thread with six emails and no notes was not flagged as unrecorded')
else ok('real conversation with no note is flagged as unrecorded work')

// ── nobody ever replied ─────────────────────────────────────────────────────
const ignored = rollUpLead(lead, [e('2026-09-11T09:00:00+08:00', 'email', 'in', 'Mohamed Khalid')])
if (ignored.responseHours !== null) fail('an inbound-only lead was scored as answered')
else if (ignored.band !== 'never') fail(`expected band "never", got "${ignored.band}"`)
else ok('a lead nobody answered reads as "never", not as zero hours')

// ── an email that predates the lead is not a response to it ─────────────────
const preexisting = rollUpLead(lead, [
  e('2026-09-01T09:00:00+08:00', 'email', 'out', 'rukshana@movingwalls.com'),
  e('2026-09-15T09:00:00+08:00', 'email', 'out', 'rukshana@movingwalls.com'),
])
if (preexisting.responseHours === null) fail('a later genuine response was missed')
else if (preexisting.responseHours < 0) fail(`negative response time: ${preexisting.responseHours}`)
else ok('an email sent before the lead existed never produces a negative response time')

// ── a note counts as recorded ───────────────────────────────────────────────
const withNote = rollUpLead(lead, [...ethraco, { id: 'n1', kind: 'note', at: '2026-09-28T13:55:38+08:00', actor: 'Rukshana Rizwie', body: 'We have reached out to Al Arabia Egypt.' }])
if (withNote.unrecordedWork) fail('a lead with a note is still flagged unrecorded')
else if (withNote.recorded !== 1) fail(`expected 1 recorded touch, got ${withNote.recorded}`)
else ok('a written note clears the unrecorded flag')

// ── the rep scorecard ───────────────────────────────────────────────────────
const rows = [
  r,
  ignored,
  rollUpLead({ ...lead, id: 'L3', ownerName: 'Rukshana Rizwie' }, [e('2026-09-09T21:31:53+08:00', 'email', 'out', 'Rukshana Rizwie')]),
]
const reps = scoreByRep(rows)
const venkat = reps.find(x => x.owner === 'Venkatraj Radhakrishnan')
if (!venkat) fail('the owner is missing from the scorecard')
else if (venkat.leads !== 2 || venkat.never !== 1) fail(`expected 2 leads / 1 never for the owner, got ${venkat.leads}/${venkat.never}`)
else ok(`scorecard: ${venkat.owner} — ${venkat.leads} leads, ${venkat.never} never answered, ${venkat.recordedRate}% recorded`)

if (reps.some(x => x.recordedRate > 100 || x.replyRate > 100)) fail('a rate exceeded 100%')
else ok('rates stay within 0–100')

// Median, not mean: one bad month must not be hidden by good ones.
if (median([1, 2, 100]) !== 2) fail(`median([1,2,100]) should be 2, got ${median([1, 2, 100])}`)
else ok('median resists a single outlier')
if (median([]) !== null) fail('median of nothing should be null, not 0')
else ok('median of no data is null, never a misleading zero')

// ── bands ───────────────────────────────────────────────────────────────────
if (bandOf(2) !== 'fast' || bandOf(20) !== 'ok' || bandOf(80) !== 'late' || bandOf(null) !== 'never') fail('bands are wrong')
else ok('bands: fast under 4h, ok to 24h, late beyond, never when unanswered')

// ── a prospect's address is not broadcast to the whole team ────────────────
const m = maskEmail('m.khalid@ethraco.com')
if (m.includes('khalid')) fail(`the address is still readable: ${m}`)
else if (!m.endsWith('@ethraco.com')) fail('the company domain was lost, so the lead is unrecognisable')
else ok(`guests see "${m}" — recognisable, not contactable`)
if (maskEmail(null) !== '—') fail('a missing address should render as a dash')
else ok('a missing address does not crash the row')

const s = summarise(rows)
if (s.leads !== 3 || s.never !== 1) fail(`summary wrong: ${JSON.stringify(s)}`)
else ok(`summary: ${s.leads} leads, ${s.answered} answered, median ${sayHours(s.medianHours)}, ${s.recordedRate}% recorded`)

if (sayHours(0.5) !== '30m' || sayHours(28) !== '1d 4h' || sayHours(null) !== 'never') fail('hours read badly')
else ok('times read as a person would say them')

console.log(bad ? `\n${bad} failing` : '\nall good — the scorecard measures what happened, and says when nothing was written down')
if (bad) process.exit(1)
