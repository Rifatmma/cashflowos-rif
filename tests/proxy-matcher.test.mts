// The proxy matcher: routes with their own guard must NOT be bounced to /login.
//   npx -y tsx tests/proxy-matcher.test.mts
// A missed exclusion fails silently -- the call "succeeds" against /login -- so
// it is checked here rather than remembered (proxy.ts).
import { config, proxy } from '../proxy'

let bad = 0
const re = new RegExp('^' + config.matcher[0] + '$')
const gated = (p: string) => re.test(p)
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }

for (const p of ['/api/telegram', '/api/cron-daily', '/api/cron-sales-reminder', '/api/mw-refresh', '/api/mw-cutouts', '/api/mw-act', '/api/mw-digest', '/login', '/api/login', '/manifest.webmanifest'])
  check(!gated(p), `${p} is reachable without the cookie`)
for (const p of ['/mw/seo', '/cash-out', '/api/mw-photo', '/'])
  check(gated(p), `${p} is behind the gate`)

// The client checklist must open without a login, and the owner's view of it
// must not. A client who meets a login screen stops there.
// The client checklist. The proxy MUST run on /class (so it can tag the page
// public for the bare shell), and must then let it through without a cookie --
// a login screen is exactly where a non-technical client stops.
check(gated('/class'), '/class is matched, so the proxy runs on it')
check(gated('/class/signups'), '/class/signups is matched too, and stays behind the cookie')

const ask = (path: string, cookie?: string) => proxy({
  nextUrl: { pathname: path, clone: () => new URL('http://x' + path), search: '' },
  cookies: { get: (n: string) => (cookie === n ? { value: 'x' } : undefined) },
  headers: new Headers(),
} as any)

process.env.APP_PASSCODE = 'test-passcode'
check(ask('/class').headers.get('location') === null, '/class is let through with no cookie at all')
check(ask('/class').headers.get('x-middleware-override-headers')?.includes('x-cfo-public') === true,
      'and is tagged public, so the layout drops the sidebar and the pending-count query')
check((ask('/cash-out').headers.get('location') ?? '').includes('/login'),
      'while a gated page with no cookie still goes to /login')
check(ask('/cash-out', 'cfo_session').headers.get('location') === null,
      'and the owner, with the session cookie, is not redirected')
const to = (path: string, cookie?: string) => ask(path, cookie).headers.get('location') ?? ''
check(to('/class/signups').endsWith('/class') && !to('/class/signups').includes('login'),
      "a client sent the owner's /class/signups link lands on her checklist, never the login page and its sidebar")
check(to('/class/anything').endsWith('/class'), 'so does any other path under /class')
check(to('/class/signups', 'cfo_session') === '', 'the owner still reaches /class/signups')

console.log(bad ? `\n${bad} FAILED` : '\nall passed')
process.exit(bad ? 1 : 0)
