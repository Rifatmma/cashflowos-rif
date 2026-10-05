import Link from 'next/link'
import { cashOutOn, dayOf, previousDayWithSpend, nextDayWithSpend } from '@/lib/ledger'
import { recordsWithPhotos } from '@/lib/receipt-photo'
import {
  merchantOf, typeOf, money2, businessOf, drawingsOf, lineCount, problemOf,
} from '@/lib/receipt-view'
import { mytDate } from '@/lib/period'
import { DayPicker } from './DayPicker'

// 👉 One day of spending. The ledger page.
//
// Replaces the browse that hid everything older than the 1st of the month behind
// a 'month' window and then showed only the newest eight (app/cash-out/page.tsx
// :146 and :228). Here the day is the URL, so every day that ever existed is one
// link away and the back arrow never runs out of road.

export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const shift = (day: string, by: number) =>
  new Date(new Date(day + 'T00:00:00Z').getTime() + by * 86_400_000).toISOString().slice(0, 10)

const heading = (day: string, today: string) => {
  const d = new Date(day + 'T00:00:00Z')
  const long = d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  })
  if (day === today) return `Today — ${long}`
  if (day === shift(today, -1)) return `Yesterday — ${long}`
  return long
}

export default async function CashOutDay({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams
  const today = mytDate()
  const day = d && ISO.test(d) ? d : today

  const rows = await cashOutOn(day)
  const withPhoto = await recordsWithPhotos(rows.map(r => r.id))

  const spend = rows.reduce((t, r) => t + businessOf(r), 0)
  const drawings = rows.reduce((t, r) => t + drawingsOf(r), 0)

  // Where the arrows go. Stepping one calendar day at a time turns a quiet week
  // into a tapping game, so each arrow jumps to the next day that HAS something —
  // except for the day either side of today, which should always be reachable.
  const [prevDay, nextDay] = await Promise.all([
    previousDayWithSpend(day),
    day < today ? nextDayWithSpend(day) : Promise.resolve(null),
  ])
  const back = prevDay ?? (day > '2026-09-01' ? shift(day, -1) : null)
  const fwd = day < today ? (nextDay ?? shift(day, 1)) : null

  const needs = rows.filter(r => problemOf(r, withPhoto.has(r.id)))

  return (
    <div className="co">
      <nav className="led-step">
        {back
          ? <Link href={`/cash-out/day?d=${back}`} aria-label="Earlier day" className="led-arrow">‹</Link>
          : <span className="led-arrow is-off" aria-hidden>‹</span>}
        <DayPicker day={day} label={heading(day, today)} />
        {fwd
          ? <Link href={`/cash-out/day?d=${fwd}`} aria-label="Later day" className="led-arrow">›</Link>
          : <span className="led-arrow is-off" aria-hidden>›</span>}
      </nav>

      <p className="led-total">
        <b className="num">{money2(spend)}</b>
        <span>{rows.length === 0 ? 'nothing filed' : `${rows.length} bill${rows.length === 1 ? '' : 's'}`}</span>
      </p>
      {drawings > 0 && (
        <p className="led-note">
          Plus {money2(drawings)} of owner&rsquo;s drawings, kept out of the spending figure.
        </p>
      )}
      {needs.length > 0 && (
        <p className="led-note">
          {needs.length === 1 ? 'One bill needs' : `${needs.length} bills need`} a look — marked below.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="led-empty">
          <p>Nothing was filed on this day.</p>
          {back && (
            <p><Link href={`/cash-out/day?d=${back}`}>← {heading(back, today)}</Link></p>
          )}
        </div>
      ) : (
        <ol className="led">
          {rows.map(r => {
            const p = problemOf(r, withPhoto.has(r.id))
            return (
              <li key={r.id} className={p ? 'led-row has-problem' : 'led-row'}>
                <Link href={`/cash-out/${r.id}`}>
                  <span className="led-name">{merchantOf(r)}</span>
                  <span className="led-amount num">{money2(Number(r.amount))}</span>
                  <span className="led-meta">
                    {typeOf(r).toLowerCase()}
                    {lineCount(r) > 0 && ` · ${lineCount(r)} line${lineCount(r) === 1 ? '' : 's'}`}
                    {r.meta?.filed_by && ` · ${r.meta.filed_by}`}
                  </span>
                  {p && <span className="led-problem">{p.says}</span>}
                </Link>
              </li>
            )
          })}
        </ol>
      )}

      <p className="led-foot">
        <Link href="/cash-out">The month</Link> · <Link href="/cash-out/attention">What needs a look</Link>
        {day !== today && <> · <Link href="/cash-out/day">Today</Link></>}
      </p>
    </div>
  )
}
