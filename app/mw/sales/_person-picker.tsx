'use client'

import { useRouter } from 'next/navigation'

// The only client component on this tab.
//
// Thirty-one people as chips wrapped onto five rows and buried the filters
// that actually get used. A dropdown holds the same list in one line. The
// conversation categories stay as chips, because there are six of them, they
// carry counts worth seeing at a glance, and they are what gets clicked
// (owner, 2 Oct 2026).

export function PersonPicker({
  people, who, show, days,
}: {
  people: { name: string; touched: number }[]
  who?: string
  show?: string
  days: string
}) {
  const router = useRouter()

  const go = (value: string) => {
    const q = new URLSearchParams()
    if (value) q.set('who', value)
    if (show) q.set('show', show)
    if (days !== '30') q.set('days', days)
    const s = q.toString()
    router.push(s ? `/mw/sales?${s}` : '/mw/sales')
  }

  return (
    <div className="mw-picker">
      <label htmlFor="mw-who">Show the work of</label>
      <select id="mw-who" value={who ?? ''} onChange={e => go(e.target.value)}>
        <option value="">Everyone</option>
        {people.map(p => (
          <option key={p.name} value={p.name}>
            {p.name} — {p.touched} {p.touched === 1 ? 'lead' : 'leads'}
          </option>
        ))}
      </select>
      {who && (
        <button type="button" className="mw-clear" onClick={() => go('')}>
          Clear
        </button>
      )}
    </div>
  )
}
