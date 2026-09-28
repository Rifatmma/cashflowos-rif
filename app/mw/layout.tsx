import './mw.css'
import { Poppins } from 'next/font/google'

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
export default function MwLayout({ children }: { children: React.ReactNode }) {
  return <div className={`mw ${poppins.variable}`}>{children}</div>
}
