import { NextResponse, type NextRequest } from 'next/server'

// 🔒 Don't edit — this keeps your robot safe.
// The passcode gate. In Next 16 this file is called `proxy.ts` (the old name
// `middleware.ts` is deprecated and would print scary warnings for beginners).
//
// It's "a lock on the door, not bank-grade auth": if APP_PASSCODE is set and the
// visitor has no session cookie, we bounce them to /login. If APP_PASSCODE is NOT
// set, we DON'T gate anything — the app shows a calm setup banner instead, so a
// half-configured clone never locks you out of your own HQ.
export function proxy(req: NextRequest) {
  // PUBLIC: the pre-class checklist a consulting client opens from a link she
  // was sent. It is allowed before the passcode is even read, because meeting a
  // login screen is exactly where a non-technical client stops. The header it
  // sets tells app/layout.tsx to render the bare shell -- without it she'd get
  // the restaurant's sidebar (Cash Out, Stock, Approvals) around her checklist.
  // Only /class itself: /class/signups is the owner's view and stays gated.
  // The header picks a SHELL, never an access decision -- somebody sending it
  // by hand on another path only loses their own menu, and every real guard
  // below still runs.
  if (req.nextUrl.pathname === '/class') {
    const headers = new Headers(req.headers)
    headers.set('x-cfo-public', '1')
    return NextResponse.next({ request: { headers } })
  }

  const passcode = (process.env.APP_PASSCODE ?? '').trim()
  if (!passcode) return NextResponse.next()          // no lock installed → open door

  const session = req.cookies.get('cfo_session')?.value
  if (session) return NextResponse.next()            // has the opaque session cookie → allow

  // Anyone else under /class (the owner's /class/signups, a mistyped path) goes
  // back to the client checklist, NOT to /login: the login page carries the
  // full sidebar, and a client sent the wrong link must never see what this
  // app holds (owner, 1 Nov 2026).
  if (req.nextUrl.pathname.startsWith('/class/')) {
    const back = req.nextUrl.clone()
    back.pathname = '/class'
    back.search = ''
    return NextResponse.redirect(back)
  }

  // GUEST TIER (Moving Walls). Reached only when there is NO cfo_session, i.e. on
  // the path that used to end in "redirect to /login" — so nothing above changes.
  // A guest may open /mw and its own APIs and NOTHING else; every other path sends
  // them back to /mw. It's an ALLOW-LIST, so anything added to this app in future
  // is closed to guests by default. Signature and allow-list are verified in
  // lib/guest.ts (Node crypto); here we only check presence, exactly as the
  // cfo_session line above does.
  const guest = req.cookies.get('cfo_guest')?.value
  if (guest) {
    const p = req.nextUrl.pathname
    if (p === '/mw' || p.startsWith('/mw/') || p.startsWith('/api/mw/')) {
      return NextResponse.next()
    }
    const back = req.nextUrl.clone()
    back.pathname = '/mw'
    back.search = ''
    return NextResponse.redirect(back)
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

// The matcher protects every page EXCEPT the ones below, which must stay reachable
// without the cookie:
//   • /login, /api/login      — you can't log in through a locked login page
//   • /api/telegram           — Telegram's webhook (has its own secret-header guard)
//   • /api/cron-daily         — the daily cron (has its own fail-closed Bearer guard)
//   • /api/cron-sales-reminder — the 11 pm sales nudge (same fail-closed Bearer guard).
//     Leave it out of this list and Vercel's call is bounced to /login, and the
//     reminder silently never runs -- nothing errors, it just never arrives.
//   • /api/mw-refresh         — the Moving Walls 9am pull (Bearer OR owner cookie,
//     both checked inside the route). This is the warning above coming true: it
//     was missing from this list, so every morning cron-daily's call got a 307
//     to /login, the fetch followed it, /login answered 200, and the cron
//     reported "started (200)". Nothing errored and the numbers never moved
//     (owner, 29 Sep 2026).
//   • /api/mw-cutouts         — the cut-out library for the mw-brand-video skill
//     (Bearer MW_STUDIO_TOKEN checked inside the route; closed if unset).
//   • /api/mw-act             — Done / Can't links in the Monday email. Signed per
//     task and person (lib/mw-sign.ts), so they work for someone not signed in.
//   • /api/mw-digest          — the Monday emails (Bearer CRON_SECRET or owner cookie).
//   • /manifest.webmanifest   — the REAL PWA manifest (app/manifest.ts serves HERE);
//     /manifest.json          — belt-and-braces extra so install never silently breaks
//   • /icons/*, /favicon.ico, /_next/* — static assets the install/render needs
// A single missed exclusion here = a locked webhook on class day, so this list is tested.
export const config = {
  matcher: [
    // `class` is the pre-class checklist a consulting client opens from a
    // link. It has to work without a login — meeting one is where a
    // non-technical client stops. /class/signups, the owner's view of who
    // filled it in, checks the session itself inside the page.
    '/((?!login|api/login|api/telegram|api/cron-daily|api/cron-sales-reminder|api/mw-refresh|api/mw-cutouts|api/mw-act|api/mw-digest|manifest\\.webmanifest|manifest\\.json|icons|_next|favicon\\.ico).*)',
  ],
}
