// npx -y tsx --conditions=react-server tests/mw-cliq.test.mts
import { parseLead, fields, pageSlug, slugOfPath, isBuyer, hashEmail, pageLabel, sourceMedium, tally } from '../lib/mw-cliq'

let bad = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }

const post = (o: Record<string, string>, form = 'Contact Us Form') =>
  `We have received a new lead on ${form} :\n*Name:* ${o.name ?? 'Test Person'}\n*Company Name:* ${o.company ?? 'Acme Foods'}\n` +
  `*Email:* ${o.email ?? 'Test.Person@Acme.com'}\n*Phone:* +60 12 345 6789\n*I am a:* ${o.role ?? 'Brand'}\n*Country:* ${o.country ?? 'India'}\n` +
  `*I am interested in:* ${o.interest ?? 'Advertising on OOH/DOOH'}\n*Inquiry:* ${o.inquiry ?? 'We want billboards in Bengaluru for a launch.'}\n` +
  `*This Lead's Source/Medium:* ${o.srcmed ?? 'google / cpc'}\n*Submitted on this page:* ${o.page ?? 'https://www.movingwalls.com/locations/india/bengaluru/?utm_source=x'}`

// ── the whole post
const l = parseLead({ id: 'm1', time: 1793250372000, text: post({}) })!
check(!!l && l.form === 'Contact Us Form', 'the form name comes from "new lead on … :"')
check(l.role === 'Brand' && l.country === 'India' && l.interest === 'Advertising on OOH/DOOH', 'role, country and interest')
check(l.source === 'google' && l.medium === 'cpc', 'source / medium split and lower-cased')
check(l.page === 'bengaluru', 'a full URL becomes its last path segment, query dropped')
check(l.emailHash === hashEmail('test.person@acme.com') && l.emailHash!.length === 64, 'the email is kept only as a hash, any letter case')
check(l.isBuyer, 'a brand asking for billboards is a buyer')
check(!JSON.stringify(l).includes('Test Person') && !JSON.stringify(l).includes('345 6789') && !JSON.stringify(l).includes('launch'), 'no name, phone or inquiry text survives')
check(l.at === new Date(1793250372000).toISOString(), 'epoch milliseconds become an ISO time')

// ── labels
const f = fields(post({}))
check(f.company === 'Acme Foods' && f.name === 'Test Person', '"Company Name:" is not read as a second "Name:"')

// ── pages
check(pageSlug('bengaluru') === 'bengaluru' && pageSlug('Homepage') === 'homepage', 'a bare slug stays, lower case')
check(pageSlug('https://www.movingwalls.com/') === 'homepage' && pageSlug('https://movingwalls.com') === 'homepage', 'the home URL is "homepage"')
check(parseLead({ id: 'x', time: '2026-10-01T00:00:00Z', text: post({ page: '[movingwalls.com/contact](https://www.movingwalls.com/contact/)' }) })!.page === 'contact', 'a markdown link resolves to its URL')
check(pageSlug('-') === null && pageSlug('') === null, 'a dash or nothing is no page')
check(slugOfPath('/locations/india/bengaluru') === 'bengaluru' && slugOfPath('/') === 'homepage', 'card paths map to the same slugs')
check(pageLabel('kuala-lumpur') === 'Kuala Lumpur' && pageLabel('contact') === 'Contact page' && pageLabel(null) === 'Not given', 'labels for slugs')

// ── buyers
check(!isBuyer({ role: 'Media Owner' }), 'a media owner is not a buyer')
check(!isBuyer({ role: 'Brand', interest: 'Selling/Connecting Media Networks' }), 'selling or connecting media networks is not a buyer')
check(!isBuyer({ role: 'Student' }) && !isBuyer({ role: 'Others', inquiry: 'I am a student working on my thesis about DOOH' }), 'students are not buyers')
check(!isBuyer({ role: 'Others', inquiry: 'Looking for a job opening in your Bengaluru office, attaching my resume' }), 'job applications are not buyers')
check(!isBuyer({ role: 'Others', inquiry: 'I want to put a birthday message for my idol on a LED screen' }), 'fan and birthday LED requests are not buyers')
check(isBuyer({ role: 'Agency', interest: 'Advertising on OOH/DOOH', inquiry: 'Client wants a 4-week campaign in Penang' }), 'an agency planning a campaign is a buyer')

// ── not leads
check(parseLead({ id: 'h', time: '2026-10-01T00:00:00Z', text: 'Called him, not interested' }) === null, 'a human reply is not a lead')
const noSrc = parseLead({ id: 'n', time: '2026-10-01T00:00:00Z', text: post({ srcmed: '(none) / (none)', page: 'homepage' }) })!
check(noSrc.source === null && noSrc.medium === null && sourceMedium(noSrc) === '(none) / (none)', 'a blank source reads "(none) / (none)"')

// ── tally
const rows = [
  { at: '2026-10-03T00:00:00Z', isBuyer: true, page: 'india' },
  { at: '2026-10-05T00:00:00Z', isBuyer: false, page: 'india' },
  { at: '2026-09-05T00:00:00Z', isBuyer: true, page: 'india' },
  { at: '2026-09-07T00:00:00Z', isBuyer: true, page: 'penang' },
  { at: '2026-08-07T00:00:00Z', isBuyer: true, page: 'penang' },
]
const t = tally(rows, r => r.page, at => at.startsWith('2026-10'), at => at.startsWith('2026-09'))
check(t.length === 2 && t[0].key === 'india' && t[0].a === 2 && t[0].aBuy === 1 && t[0].b === 1, 'per page: all and buyers in A, and B')
check(t[1].key === 'penang' && t[1].a === 0 && t[1].b === 1, 'a page only in B still shows; months outside both are left out')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
