// ✅ Corrected receipts: the record of what was fixed, kept off the Cash Out
// front page (owner, 27 Sep 2026: "the receipt that I already check should be
// removed or moved to another place where it gets recorded ... keep things
// clean"). Newest first; each opens its correction page again.
import Link from 'next/link'
import { getRecords, rm } from '@/lib/records'
import { shortDate, mytDate } from '@/lib/period'

export const dynamic = 'force-dynamic'

const r2 = (n: number) => Math.round(n * 100) / 100

export default async function CorrectedReceipts() {
  const rows = (await getRecords())
    .filter(r => r.category === 'cash_out' && (r.meta?.corrected_at || r.meta?.fixed_at))
    .sort((a, b) => String(b.meta?.fixed_at || b.meta?.corrected_at).localeCompare(String(a.meta?.fixed_at || a.meta?.corrected_at)) || b.id - a.id)

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">Corrected receipts</h1>
        <Link href="/cash-out" className="co-dim">← Cash Out</Link>
      </div>
      <section className="co-card co-hero">
        <p className="co-sub" style={{ marginTop: 0 }}>
          Every receipt fixed after it was filed &mdash; on its correction page or through Jarvis. The old
          lines are kept on each one.
        </p>
        {rows.length === 0 ? (
          <p className="co-meta">None yet.</p>
        ) : (
          <ul className="co-lines" style={{ marginTop: 10 }}>
            {rows.map(r => {
              const m = r.meta ?? {}
              const lines = Array.isArray(m.items) ? r2(m.items.reduce((t: number, i: any) => t + (Number(i?.line_total) || 0), 0)) : null
              const off = !m.checked_ok && lines !== null && Math.abs(lines - (Number(m.discount) || 0) - Number(r.amount)) > Math.max(0.05, Number(r.amount) * 0.02)
              const how = m.corrected_via === 'checked' ? 'checked as correct'
                : m.corrected_via === 'web' || m.fixed_at ? 'on Cash Out' : 'via Jarvis'
              const when = String(m.fixed_at || m.corrected_at).slice(0, 10)
              return (
                <li key={r.id}>
                  <span>
                    <Link href={`/cash-out/${r.id}`}>#{r.id} · {String(m.merchant || r.title)}</Link>
                    <span className="co-dim">
                      {' '}· bought {shortDate(r.due_date || mytDate(r.created_at))} · {m.corrected_via === 'checked' ? '' : 'fixed '}{shortDate(when)} {how}
                      {Number(m.discount) > 0 && ` · discount ${rm(Number(m.discount))}`}
                    </span>
                    {off && <span className="co-flag"> · still doesn&rsquo;t add up</span>}
                    {m.fix_later && <span className="co-flag"> · parked to fix in the app</span>}
                  </span>
                  <span className="num">{rm(Number(r.amount))}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
