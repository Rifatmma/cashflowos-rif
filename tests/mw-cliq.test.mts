// npx -y tsx --conditions=react-server tests/mw-cliq.test.mts
import { parseLead, fields, pageSlug, slugOfPath, isBuyer, hashEmail, pageLabel, sourceMedium, tally, splitSourceMedium, pageOfForm } from '../lib/mw-cliq'
import { leadIntent } from '../lib/mw-lead-intent'

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
check(l.emailHash === hashEmail('test.person@acme.com') && l.emailHash!.length === 32, 'the email is kept only as a hash, any letter case')
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

// ── the real Cliq format (29 Oct 2026): \r\n lines, a footer, older posts without a page
const real = (o: { form?: string; role?: string; inquiry?: string; srcmed?: string; page?: string }) =>
  `Hi Team,\r\n\r\nWe have received a new lead on ${o.form ?? 'MWContactUs'} :\r\n\r\nName: A B\r\nCompany: C\r\nEmail: a@b.co\r\nI am a: ${o.role ?? 'Agency'}\r\n` +
  `Country: India\r\nPhone: 123\r\n${o.inquiry ? `Inquiry: ${o.inquiry}\r\n` : ''}\r\nPlease check the notification email for further information.\r\n\r\n` +
  `This Lead's Source/Medium: ${o.srcmed ?? ' /'}${o.page ? `\r\n\r\nSubmitted on this page: ${o.page}` : ''}`
const r1 = parseLead({ id: 'r1', time: '1791739649776', text: real({ srcmed: 'https://www.movingwalls.com/market/india/ / referral', inquiry: 'Need hoardings' }) })!
check(r1.source === 'movingwalls.com' && r1.medium === 'referral' && r1.page === 'india', 'an own-site referrer URL keeps its slashes, and gives the page when none is named')
const r2 = parseLead({ id: 'r2', time: 1791739649776, text: real({ form: 'PuneContact' }) })!
check(r2.page === 'pune' && r2.source === null && r2.medium === null, 'a city form names the page; a blank " /" is no source')
check(r1.at === r2.at, 'epoch as a string or a number')
check(splitSourceMedium('Google Ads / cpc').source === 'google ads' && pageOfForm('MWContactUs') === null && pageOfForm('BookDemo') === null, 'source names and general forms')
const r3 = parseLead({ id: 'r3', time: 1, text: real({ inquiry: 'Require quotation', srcmed: 'www.movingwalls.com / referral', page: 'homepage' }) })!
check(r3.page === 'homepage' && r3.source === 'movingwalls.com' && !/notification/.test(JSON.stringify(r3)), 'the footer never reaches a field')

// ── lead intent (Rif's examples, 29 Oct 2026)
const it = (inquiry: string, role = 'Brand/Agency', interest = 'Advertising on OOH/DOOH') => leadIntent({ role, interest, inquiry })
check(it('DOOH quotation for Jalan Song Ban Kheng and Aeon Mall Bukit Mertajam, 1 month').intent === 'high', 'ViTrox: site + duration + quote is high')
check(it('We are planning a 30-day OOH campaign for a product launch, lift screens in KLCC, TRX').intent === 'high', 'KCS: 30-day campaign, lift screens in KLCC is high')
check(it('I need advertisement on Billboard in Ahmedabad').intent === 'medium', '"billboard in Ahmedabad" is medium: a format does not count twice')
check(it('3D Static Hoardings').intent === 'medium', 'a format alone is medium')
check(it('residential advertising for property').intent === 'medium', 'a clear but vague ask is medium')
check(it('Require quotation').intent === 'medium', 'a quote ask alone is medium')
check(it('Yes').intent === 'low' && it('asdf').intent === 'low' && it('').intent === 'low', 'no detail is low')
check(it('Birthday LED for my idol, our fan club wants to celebrate', 'Others', '').intent === 'low', 'a fan request is low')
check(it('Applying for the marketing executive job, CV attached', 'Others', '').intent === 'not a buyer', 'a job seeker is not a buyer')
check(it('I would like to host panels in my society so that I can earn', 'Others', 'Partnerships & Integrations').intent === 'not a buyer', 'offering their own space is not a buyer')
check(leadIntent({ role: 'Media Owner', inquiry: 'billboards in Pune for 3 months, rates' }).intent === 'not a buyer', 'a media owner is never a buyer')
check(it('We offer printing services for flex banners').intent === 'not a buyer', 'a vendor selling to us is not a buyer')
check(/^[a-z +]+$/.test(it('DOOH quotation for Jalan Song Ban Kheng, 1 month').reason), 'the reason is a generic phrase, not their words')
check(it('Test - Thailand').intent === 'not a buyer' && it('Test Website Lead - SL').reason === 'internal test', 'our own test entries are not buyers')
check(it('Hello, I am interested to know more about the offerings for a client of mine.').intent === 'medium', 'an agency asking for a client is a clear ask')
check(splitSourceMedium('google.com / organic').source === 'google' && splitSourceMedium('https://www.google.com.hk/ / organic').source === 'google', 'google.com is google')
const one = parseLead({ id: 'o', time: 1, text: real({ role: 'Brand Interested in: Advertising on OOH/DOOH' }) })!
check(one.role === 'Brand' && one.interest === 'Advertising on OOH/DOOH', 'role and interest on one line')
const leak = parseLead({ id: 'k', time: 1, text: real({ inquiry: 'We need LED in Makati. Interested in: high-frequency placements along EDSA for 3 months, send rates to my Viber 0975 172 6298' }) })!
check(leak.interest === null && !JSON.stringify(leak).includes('6298') && !JSON.stringify(leak).includes('Makati'), 'an "Interested in:" inside the inquiry never stores its text or a phone number')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
