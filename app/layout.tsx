import './globals.css'
import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'

// Jaosamut brand type (guideline section 06). next/font downloads these at
// BUILD time and serves them from this site, so no page load calls Google.
// Two faces only -- the guideline's own limit.
const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' })
import Nav from './_components/Nav'
import BottomNav from './_components/BottomNav'
import ConnStatus from './_components/ConnStatus'
import { getPendingCount } from '@/lib/records'

export const metadata: Metadata = {
  title: 'CashFlowOS AI Agents 🤖',
  description: 'Your Money Robot — one AI HQ for the whole business.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'CashFlowOS', statusBarStyle: 'default' },
  // iOS ignores the PWA manifest for Add-to-Home-Screen and reads apple-touch-icon,
  // so the home-screen icon must be declared here as well as in app/manifest.ts.
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

// theme-color drives the phone status-bar tint when installed to the home screen.
export const viewport: Viewport = {
  // The phone's status bar matches the page: Rice Paper by day, Kaffir Ink at night.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F1F4EC' },
    { media: '(prefers-color-scheme: dark)', color: '#0C2B18' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pending = await getPendingCount()
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <div className="app">
          {/* Desktop sidebar — hidden on phones (BottomNav takes over ≤768px). */}
          <aside className="side">
            <div className="brand"><span className="logo" aria-hidden="true">🤖</span> CashFlowOS AI Agents</div>
            <Nav pendingCount={pending} />
            <p className="hint">One <code>records</code> table behind every tab. Your robots live in <code>agents/</code>.</p>
          </aside>
          <main className="main"><ConnStatus />{children}</main>
        </div>
        {/* Phone bottom bar — hidden on desktop. */}
        <BottomNav />
      </body>
    </html>
  )
}
