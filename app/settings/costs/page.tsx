// 👉 Fixed costs — the money that goes out whether or not anyone takes a photo.
//
// Owner, 23 Sep 2026: wages and rent are paid in cash, so nothing reaches the
// Vault. He gives the figures once; Jarvis files them every day and every month
// (lib/fixed-costs.ts). "Unless when I increase my staff salary I'll update the
// salary again to you so you remember it" -- hence this page, and hence a change
// starting from a date instead of overwriting what is already filed.
import Link from 'next/link'
import { getFixedHistory, costsOn, fixedPerDay, fixedBreakdown } from '@/lib/fixed-costs'
import { mytDate, shortDate } from '@/lib/period'
import ActionForm from '@/app/stock/ActionForm'
import { saveCosts } from './actions'

export const dynamic = 'force-dynamic'

const rm2 = (n: number) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function Costs() {
  const today = mytDate()
  const history = await getFixedHistory()
  const cur = costsOn(history, today)
  const perDay = fixedPerDay(cur, today)
  const rows = fixedBreakdown(cur, today)

  const Field = ({ name, label, value, hint }: { name: string; label: string; value: number; hint?: string }) => (
    <label className="st-field">
      <span>{label}</span>
      <span className="st-input">
        <input type="number" name={name} inputMode="decimal" step="any" min="0" defaultValue={value} />
        <span className="co-dim st-unit">RM</span>
      </span>
      {hint && <span className="co-meta">{hint}</span>}
    </label>
  )

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">Fixed costs</h1>
        <Link href="/" className="co-dim">← Dashboard</Link>
      </div>
      <p className="co-sub" style={{ marginTop: 0 }}>
        Paid in cash, so no receipt ever reaches Jarvis. He files wages every day and rent on the 1st,
        and they show up in Cash Out and in profit like any other cost.
      </p>

      <section className="co-card">
        <div className="co-row" style={{ marginBottom: 6 }}>
          <span className="eyebrow">A day costs</span>
          <span className="num">{rm2(perDay)}</span>
        </div>
        <ul className="co-lines">
          {rows.map(r => (
            <li key={r.what}>
              <span>{r.what} <span className="co-dim">{r.how}</span></span>
              <span className="num">{rm2(r.perDay)}</span>
            </li>
          ))}
          <li className="co-total"><span>Before a single plate is sold</span><span className="num">{rm2(perDay)}</span></li>
        </ul>
      </section>

      <section className="co-card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Change a figure</div>
        <ActionForm action={saveCosts} submit="Save from this date">
          <Field name="wages_per_day" label="Wages, whole team, per day" value={cur.wages_per_day}
            hint="Chef 120 · cook helper 100 · 2 kitchen helpers 60 · waiter 60 · manager 80 · dishwasher 35" />
          <Field name="unit_rent" label="Unit rent, per month" value={cur.unit_rent} />
          <Field name="staff_house" label="Staff house, per month" value={cur.staff_house} />
          <Field name="wifi_per_month" label="Wifi and phone, per month" value={cur.wifi_per_month}
            hint="Leave at 0 until the bill lands." />
          <Field name="pos_per_year" label="POS (EasyEat), per year" value={cur.pos_per_year} />
          <Field name="licence_per_year" label="Licence, per year" value={cur.licence_per_year} />
          <label className="st-field">
            <span>Starts from</span>
            <span className="st-input"><input type="date" name="from" defaultValue={today} /></span>
            <span className="co-meta">Everything already filed before this date keeps the old figures.</span>
          </label>
          <label className="st-field">
            <span>Why it changed (optional)</span>
            <span className="st-input"><input type="text" name="note" placeholder="e.g. chef pay rise" /></span>
          </label>
        </ActionForm>
      </section>

      {history.length > 1 && (
        <details className="co-card co-fold">
          <summary><span>Earlier figures</span><span className="co-dim num">{history.length}</span></summary>
          <ul className="co-lines">
            {[...history].reverse().map(h => (
              <li key={h.from}>
                <span>From {shortDate(h.from)} <span className="co-dim">{h.note ?? ''}</span></span>
                <span className="num">{rm2(h.wages_per_day)}/day wages</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
