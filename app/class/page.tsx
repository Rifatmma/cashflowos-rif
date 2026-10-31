import type { Metadata } from 'next'
import { Checklist } from './Checklist'
import './class.css'

// 👉 The pre-class checklist, for a consulting client.
//
// PUBLIC on purpose: she gets a link and must not meet a login. The route is
// excluded from the proxy matcher for that reason, and nothing on it reads or
// writes anything belonging to the businesses in this app.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Get set up for Claude Code — before our session',
  description: 'The accounts and installs to do before your Claude Code session. About an hour, no coding.',
  robots: { index: false, follow: false },   // a client link, not a public page
  // The root layout names the app "CashFlowOS" for the home-screen install.
  // A client saving her checklist must not get that name, or the manifest
  // that lists it.
  manifest: null,
  applicationName: 'Claude Code setup',
  appleWebApp: { capable: false, title: 'Claude Code setup' },
}

export default function ClassPage() {
  const base = process.env.APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  return <Checklist shareUrl={`${base}/class`} />
}
