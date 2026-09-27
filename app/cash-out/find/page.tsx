// 🔎 Find a receipt: by record number ("174", "#174") or by shop name.
//
// Cash Out shows the newest eight and folds the rest under "show more", so an
// older receipt Jarvis names by number could not be found (Sri Ternak #174,
// 27 Sep 2026). A number goes straight to its correction page.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getRecords, rm } from '@/lib/records'
import { shortDate, mytDate } from '@/lib/period'
import FindBox from '../FindBox'

export const dynamic = 'force-dynamic'

export default async function FindReceipt({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = String((await searchParams).q ?? '').trim()
  const rows = (await getRecords()).filter(r => r.category === 'cash_out')

  const asId = q.match(/^#?\s*(\d+)$/)?.[1]
  if (asId && rows.some(r => r.id === Number(asId))) redirect(`/cash-out/${asId}`)

  const needle = q.toLowerCase()
  const hits = needle && !asId
    ? rows.filter(r => `${r.title} ${r.meta?.merchant ?? ''} ${r.meta?.receipt_no ?? ''}`.toLowerCase().includes(needle))
        .sort((a, b) => b.id - a.id).slice(0, 50)
    : []

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">Find a receipt</h1>
        <Link href="/cash-out" className="co-dim">← Cash Out</Link>
      </div>
      <section className="co-card co-hero">
        <FindBox q={q} />
        {asId && <p className="co-meta co-flag">There&rsquo;s no receipt #{asId}.</p>}
        {needle && !asId && hits.length === 0 && <p className="co-meta">Nothing matches &ldquo;{q}&rdquo;.</p>}
        {hits.length > 0 && (
          <ul className="co-lines" style={{ marginTop: 10 }}>
            {hits.map(r => (
              <li key={r.id}>
                <Link href={`/cash-out/${r.id}`}>
                  #{r.id} · {String(r.meta?.merchant || r.title)}
                  <span className="co-dim"> · {shortDate(r.due_date || mytDate(r.created_at))}</span>
                </Link>
                <span className="num">{rm(Number(r.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
