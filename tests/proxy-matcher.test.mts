// The proxy matcher: routes with their own guard must NOT be bounced to /login.
//   npx -y tsx tests/proxy-matcher.test.mts
// A missed exclusion fails silently -- the call "succeeds" against /login -- so
// it is checked here rather than remembered (proxy.ts).
import { config } from '../proxy'

let bad = 0
const re = new RegExp('^' + config.matcher[0] + '$')
const gated = (p: string) => re.test(p)
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }

for (const p of ['/api/telegram', '/api/cron-daily', '/api/cron-sales-reminder', '/api/mw-refresh', '/api/mw-cutouts', '/api/mw-inbox-notify', '/api/mw-act', '/api/mw-digest', '/login', '/api/login', '/manifest.webmanifest'])
  check(!gated(p), `${p} is reachable without the cookie`)
for (const p of ['/mw/seo', '/cash-out', '/api/mw-photo', '/'])
  check(gated(p), `${p} is behind the gate`)

console.log(bad ? `\n${bad} FAILED` : '\nall passed')
process.exit(bad ? 1 : 0)
