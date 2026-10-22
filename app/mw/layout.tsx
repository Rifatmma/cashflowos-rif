import './mw.css'
import { Poppins } from 'next/font/google'
import { currentGuest } from '@/lib/guest'
import { notePresence } from '@/lib/mw-presence'

// Moving Walls brand type. Downloaded at BUILD time and served from this site,
// so no page load calls Google — same approach as the Jaosamut faces.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-mw',
  display: 'swap',
})

// Every /mw page lives inside .mw, which scopes the whole Moving Walls palette.
// Nothing in mw.css can reach the rest of CashFlowOS.
//
// It also notes who opened the app (lib/mw-presence.ts): the owner session as
// 'owner', a guest by their email. That is what the People view's "last
// opened" and "never opened" come from.
export default async function MwLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts lets nobody into /mw unsigned, so not-a-guest is the owner
  // (the same rule as actor() in ./actions).
  const guest = await currentGuest()
  await notePresence(guest ?? 'owner')
  return <div className={`mw ${poppins.variable}`}>{children}</div>
}
