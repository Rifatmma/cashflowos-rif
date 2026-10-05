'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { QuickPhoto } from './QuickPhoto'

// 📒 Every receipt, in one place, opening downwards.
//
// WHAT WAS WRONG WITH WHAT I BUILT FIRST. The owner asked for Cash Out to be
// easier to use and I added two more tabs — a day view and a problem list. That
// is more navigation, not less, and it is the opposite of what he asked for:
// "why not make the cash out tab more user friendly… I don't know why you build
// a separate tab for filtering the date."
//
// So: month → day → receipt, nested, on the page he already uses. A closed
// month is one line, which is what makes it safe to hold every month ever.
//
// AND NOTHING NAVIGATES. Opening a day, opening a receipt and changing a filter
// are all local state. Every one of them used to be a link that re-rendered the
// route, which jumped the scroll and flickered — "a filter only suppose to load
// the content of that particular section not the whole page" (owner, 6 Oct 2026).

export type LedgerLine = {
  name: string; qty: number; unit: string; total: number; type: string
}
export type LedgerRow = {
  id: number
  day: string            // YYYY-MM-DD, the day the receipt belongs to
  merchant: string
  amount: number
  type: string
  filedBy: string | null
  lines: LedgerLine[]
  problem: { kind: string; says: string; detail: string } | null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const money = (n: number) =>
  'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dayLabel = (iso: string, today: string) => {
  const d = new Date(iso + 'T00:00:00Z')
  const long = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  if (iso === today) return `Today · ${long}`
  const y = new Date(new Date(today + 'T00:00:00Z').getTime() - 86_400_000).toISOString().slice(0, 10)
  return iso === y ? `Yesterday · ${long}` : long
}

const FILTERS: { key: string; label: string; match: (r: LedgerRow) => boolean }[] = [
  { key: 'all', label: 'Everything', match: () => true },
  { key: 'any', label: 'Needs a look', match: r => !!r.problem },
  { key: 'no-photo', label: 'No proof', match: r => r.problem?.kind === 'no-photo' },
  { key: 'bad-proof', label: 'Proof not valid', match: r => r.problem?.kind === 'bad-proof' },
  { key: 'wont-add-up', label: "Lines don't match", match: r => r.problem?.kind === 'wont-add-up' },
  { key: 'no-category', label: 'Not categorised', match: r => r.problem?.kind === 'no-category' },
  { key: 'parked', label: 'You parked these', match: r => r.problem?.kind === 'parked' },
]

export function Ledger({ rows, today, initialFilter }: {
  rows: LedgerRow[]; today: string; initialFilter?: string
}) {
  // ?show=any is how an old /cash-out/attention link lands on the right list.
  const [filter, setFilter] = useState(
    FILTERS.some(f => f.key === initialFilter) ? initialFilter! : 'all')
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set([today.slice(0, 7)]))
  const [openDays, setOpenDays] = useState<Set<string>>(() => new Set([today]))
  const [openRow, setOpenRow] = useState<number | null>(null)

  // Only the counts move when a filter changes — nothing is fetched, nothing
  // navigates, and the page does not move under the reader.
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of FILTERS) c[f.key] = rows.filter(f.match).length
    return c
  }, [rows])

  const shown = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter) ?? FILTERS[0]
    return rows.filter(f.match)
  }, [rows, filter])

  // month → day → receipts, built from whatever survived the filter.
  const tree = useMemo(() => {
    const byMonth = new Map<string, Map<string, LedgerRow[]>>()
    for (const r of shown) {
      const m = r.day.slice(0, 7)
      if (!byMonth.has(m)) byMonth.set(m, new Map())
      const days = byMonth.get(m)!
      if (!days.has(r.day)) days.set(r.day, [])
      days.get(r.day)!.push(r)
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, days]) => ({
        month,
        days: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]))
          .map(([day, list]) => ({ day, list })),
      }))
  }, [shown])

  // A filter with a handful of matches left closed would look empty. So when
  // anything but "everything" is chosen, every month and day with a match opens.
  const forceOpen = filter !== 'all'
  const monthOpen = (m: string) => forceOpen || openMonths.has(m)
  const dayOpen = (d: string) => forceOpen || openDays.has(d)

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  }

  return (
    <div className="lg" id="ledger">
      <div className="lg-filters" role="group" aria-label="Show only">
        {FILTERS.map(f => (
          <button
            key={f.key} type="button"
            className={`lg-chip${filter === f.key ? ' is-on' : ''}`}
            aria-pressed={filter === f.key}
            disabled={counts[f.key] === 0 && f.key !== 'all'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <span className="lg-n">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="lg-empty">Nothing matches that — which is good news.</p>
      ) : (
        tree.map(({ month, days }) => {
          const total = days.reduce((t, d) => t + d.list.reduce((s, r) => s + r.amount, 0), 0)
          const bills = days.reduce((t, d) => t + d.list.length, 0)
          const [y, m] = month.split('-').map(Number)
          return (
            <section key={month} className="lg-month">
              <button type="button" className="lg-head lg-m-head" aria-expanded={monthOpen(month)}
                onClick={() => setOpenMonths(s => toggle(s, month))}>
                <span className="lg-caret" aria-hidden>{monthOpen(month) ? '▾' : '▸'}</span>
                <span className="lg-title">{MONTHS[m - 1]} {y}</span>
                <span className="lg-sum num">
                  {bills}{forceOpen ? ' of these' : ''} · {money(total)}
                </span>
              </button>

              {monthOpen(month) && days.map(({ day, list }) => {
                const dTotal = list.reduce((t, r) => t + r.amount, 0)
                const flagged = list.filter(r => r.problem).length
                return (
                  <div key={day} className="lg-day">
                    <button type="button" className="lg-head lg-d-head" aria-expanded={dayOpen(day)}
                      onClick={() => setOpenDays(s => toggle(s, day))}>
                      <span className="lg-caret" aria-hidden>{dayOpen(day) ? '▾' : '▸'}</span>
                      <span className="lg-title">{dayLabel(day, today)}</span>
                      <span className="lg-sum num">
                        {list.length}{forceOpen ? ' of these' : ''} · {money(dTotal)}
                        {flagged > 0 && <i className="lg-flag">{flagged}</i>}
                      </span>
                    </button>

                    {dayOpen(day) && (
                      <ol className="lg-rows">
                        {list.map(r => (
                          <li key={r.id} className={`lg-row${r.problem ? ' has-problem' : ''}`}>
                            <button type="button" className="lg-r-head" aria-expanded={openRow === r.id}
                              onClick={() => setOpenRow(o => (o === r.id ? null : r.id))}>
                              <span className="lg-name">{r.merchant}</span>
                              <span className="lg-amount num">{money(r.amount)}</span>
                              <span className="lg-meta">
                                {r.type.toLowerCase()}
                                {r.lines.length > 0 && ` · ${r.lines.length} line${r.lines.length === 1 ? '' : 's'}`}
                                {r.filedBy && ` · ${r.filedBy}`}
                              </span>
                              {r.problem && <span className="lg-problem">{r.problem.says}</span>}
                            </button>

                            {openRow === r.id && (
                              <div className="lg-detail">
                                {r.problem && <p className="lg-why">{r.problem.detail}</p>}
                                {r.lines.length === 0 ? (
                                  <p className="co-meta">No lines were read on this one.</p>
                                ) : (
                                  <table className="mw-kw lg-lines">
                                    <tbody>
                                      {r.lines.map((l, i) => (
                                        <tr key={i}>
                                          <td>{l.name}</td>
                                          <td className="num">{l.qty}{l.unit && l.unit !== 'unit' ? ` ${l.unit}` : ''}</td>
                                          <td className="num">{money(l.total)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                                <div className="lg-acts">
                                  <Link href={`/cash-out/${r.id}`} className="btn lg-fix">
                                    Open it — photo and every line
                                  </Link>
                                  {/* Most of the chase list is emptied by one
                                      photo. Asking someone to open the receipt
                                      first turns that into a five-minute job. */}
                                  {(r.problem?.kind === 'no-photo' || r.problem?.kind === 'bad-proof')
                                    && <QuickPhoto id={r.id} />}
                                </div>
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })
      )}
    </div>
  )
}
