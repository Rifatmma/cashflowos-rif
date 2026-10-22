// The Monday emails and their one-click links.
//   npx -y tsx --conditions=react-server tests/mw-digest.test.mts
import { signAct, readAct, LINK_TTL_S } from '../lib/mw-sign'
import { personEmail, bossEmail, asPreview } from '../lib/mw-digest'
import { PEOPLE_SEED } from '../lib/mw-people'
import type { Ranked } from '../lib/mw-priorities'

let bad = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }

// ── signed links
const S = 'test-secret'
const t = signAct({ id: 'gap:india:x', by: 'sukriti.taneja@movingwalls.com', stage: 'done' }, S)
check(readAct(t, S)?.id === 'gap:india:x', 'a signed link reads back')
check(readAct(t, 'other-secret') === null, 'a link signed with another secret is refused')
const [body, sig] = t.split('.')
const forged = Buffer.from(JSON.stringify({ id: 'trk:ga4-cross-domain', by: 'x@y', stage: 'done', exp: 9e9 })).toString('base64url')
check(readAct(`${forged}.${sig}`, S) === null, 'a link edited to another task is refused')
check(readAct(`${body}.${sig}x`, S) === null && readAct('junk', S) === null && readAct(null, S) === null, 'tampered or malformed links are refused')
const old = signAct({ id: 'a', by: 'b', stage: 'declined' }, S, Date.now() - (LINK_TTL_S + 60) * 1000)
check(readAct(old, S) === null, 'an expired link is refused')
check(readAct(signAct({ id: 'a', by: 'b', stage: 'declined' }, S), S)?.stage === 'declined', "the Can't link carries its own answer")

// ── emails
const r = (id: string, o: Partial<Ranked> = {}): Ranked => ({
  id, source: 'gap-topic', channel: 'Content', title: `Task ${id} <script>`, why: 'Why & how', owner: 'Sukrithi', market: 'india',
  effortHours: 1, value: 1, valueLabel: '', confidence: 1, doneWhen: 'Live', stage: 'not_started',
  score: 1, total: 1, rank: 1, when: 'now', ...o,
})
const suk = PEOPLE_SEED.find(p => p.name === 'Sukrithi')!
const cc = ['mehul@movingwalls.com', 'safwaan@movingwalls.com']
const e = personEmail(suk, [r('1'), r('2'), r('3'), r('4'), r('5', { when: 'later' })], { appUrl: 'https://x.test', link: (id, s) => `https://x.test/a?${s}-${id}`, cc })!
check(e.to === suk.email && e.cc.join() === cc.join(), "a person's email goes to them, copied to Mehul and Safwaan")
check((e.html.match(/Task \d/g) ?? []).length === 3, 'at most three tasks')
check(!e.html.includes('<script>') && e.html.includes('&lt;script&gt;'), 'data is escaped in the email')
check(e.html.includes('done-1') && e.html.includes('declined-1'), 'each task has Done and Can\'t links')
check(/2 more tasks are waiting/.test(e.html), 'it says how much is waiting, without listing it')
check(personEmail(suk, [r('9', { when: 'later' })], { appUrl: '', link: () => '', cc }) === null, 'nobody gets an email with nothing to do this week')

const bosses = PEOPLE_SEED.filter(p => p.role === 'boss')
const b = bossEmail(bosses, [{ name: 'Sukrithi', title: 'India', now: 1, waiting: 3, done: 0, lastOpened: 'Never opened the app' }], [r('1')], { appUrl: 'https://x.test' })!
check(b.to === 'mehul@movingwalls.com' && b.cc.includes('safwaan@movingwalls.com'), 'the summary goes to Mehul and Safwaan')
check(/0 of 1 opened the app/.test(b.subject), 'its subject says who has opened the app')

const p = asPreview(e, 'rif-at.wanwang@movingwalls.com')
check(p.to === 'rif-at.wanwang@movingwalls.com' && p.cc.length === 0 && /^\[Preview\]/.test(p.subject), 'a preview goes to Rif alone')
check(p.html.includes(suk.email) && p.html.includes('mehul@movingwalls.com'), 'and says who it would have gone to')

console.log(bad ? `\n${bad} FAILED` : '\nall passed')
process.exit(bad ? 1 : 0)
