import Link from 'next/link'
import type { MonthOption } from '@/lib/mw-data'

// Which month the tab is showing.
//
// Every daily pull already stored a full snapshot of its month, so the history
// was sitting in the database from the first day — there was simply no way to
// ask for it. Chips rather than a dropdown: there will be twelve of these at
// most, and the point is to flick between two months quickly (owner, 5 Oct 2026).

export function MonthPicker({ months, month, base }: {
  months: MonthOption[]
  /** The key currently shown, or undefined for "latest". */
  month?: string
  /** The tab's path, e.g. "/mw/paid". */
  base: string
}) {
  if (months.length < 2) return null
  const current = months.find(m => m.current)?.key
  const shown = month ?? current ?? months[0]?.key

  return (
    <div className="mw-filters">
      {months.map(m => (
        <Link key={m.key} href={m.key === current ? base : `${base}?month=${m.key}`}
          aria-current={m.key === shown ? 'page' : undefined}>
          {m.label}{m.current ? ' (so far)' : ''}
        </Link>
      ))}
    </div>
  )
}

/**
 * How this month compares with the one before it, per day.
 *
 * PER DAY, NOT PER MONTH. Three days of October against a full September would
 * read as a collapse in spend and a collapse in leads, and mean nothing at all.
 * Comparing daily rates is the only honest way to look at a month in progress.
 */
export function MonthOverMonth({ now, prev, nowLabel, prevLabel }: {
  now: { spend: number; leads: number; clicks: number; days: number }
  prev: { spend: number; leads: number; clicks: number; days: number }
  nowLabel: string
  prevLabel: string
}) {
  const per = (v: number, d: number) => (d ? v / d : 0)
  const rows = [
    { k: 'Spend a day', a: per(now.spend, now.days), b: per(prev.spend, prev.days), money: true, goodUp: false },
    { k: 'Leads a day', a: per(now.leads, now.days), b: per(prev.leads, prev.days), money: false, goodUp: true },
    { k: 'Clicks a day', a: per(now.clicks, now.days), b: per(prev.clicks, prev.days), money: false, goodUp: true },
    {
      k: 'Cost per lead',
      a: now.leads ? now.spend / now.leads : 0,
      b: prev.leads ? prev.spend / prev.leads : 0,
      money: true, goodUp: false,
    },
  ]
  const fmt = (v: number, money: boolean) =>
    money ? `S$${v.toFixed(2)}` : v.toFixed(v < 10 ? 1 : 0)

  return (
    <>
      <div className="mw-scroll-x">
        <table className="mw-kw wide">
          <thead>
            <tr>
              <th>Per delivery day</th>
              <th className="num">{nowLabel}</th>
              <th className="num">{prevLabel}</th>
              <th className="num">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const pct = r.b ? ((r.a - r.b) / r.b) * 100 : null
              const better = pct === null ? null : (r.goodUp ? pct > 0 : pct < 0)
              return (
                <tr key={r.k}>
                  <td><b>{r.k}</b></td>
                  <td className="num">{fmt(r.a, r.money)}</td>
                  <td className="num">{fmt(r.b, r.money)}</td>
                  <td className="num">
                    {pct === null ? '—' : (
                      <span className={better ? 'mw-up' : 'mw-dn'}>
                        {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="lede" style={{ marginTop: 12 }}>
        Measured <b>per delivery day</b> — {nowLabel} has {now.days}, {prevLabel} had {prev.days}.
        Comparing month totals while a month is still running would read three days against thirty
        and call it a collapse. Weekends are not delivery days; no campaign runs then.
      </p>
    </>
  )
}
