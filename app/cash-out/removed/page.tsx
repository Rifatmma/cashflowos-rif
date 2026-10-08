import Link from 'next/link'
import { removedRecords } from '@/lib/remove-record'
import { shortDate } from '@/lib/period'
import { RestoreRow } from './RestoreRow'

// 🗑 Receipts taken back out of the books.
//
// The remove button on a receipt really deletes its row, so every total is
// right everywhere with nothing to remember (lib/remove-record.ts). This is
// what makes that safe: the whole row, its stock movements and its photos were
// copied first, and "put it back" restores them under the same record number.

export const dynamic = 'force-dynamic'

const money = (n: number) =>
  'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default async function Removed() {
  const rows = await removedRecords(100)

  return (
    <div className="co">
      <h1 className="ph">Removed receipts</h1>

      <p className="led-note">
        Taken out of Cash Out and out of every total, and whatever they put on the shelf came off
        with them. Nothing here is deleted &mdash; put one back and it returns under the same
        record number, photo and all.
      </p>

      {rows.length === 0 ? (
        <p className="lg-empty">Nothing has been removed.</p>
      ) : (
        <ol className="lg-rows">
          {rows.map(r => {
            const rec = r.record ?? {}
            const merchant = String(rec.meta?.merchant || rec.title || `Record #${r.record_id}`)
            const day = String(rec.due_date || '').slice(0, 10)
            return (
              <li key={r.id} className="lg-row">
                <div className="rmd">
                  <div className="rmd-what">
                    <span className="lg-name">{merchant}</span>
                    <span className="lg-meta">
                      record <span className="num">#{r.record_id}</span>
                      {day && <> · {shortDate(day)}</>}
                      {r.removed_by && <> · removed by {r.removed_by}</>}
                      {' '}· {shortDate(String(r.removed_at).slice(0, 10))}
                    </span>
                    {r.reason && <span className="rmd-why">&ldquo;{r.reason}&rdquo;</span>}
                    {Array.isArray(r.moves) && r.moves.length > 0 && (
                      <span className="lg-meta">
                        {r.moves.length} stock movement{r.moves.length === 1 ? '' : 's'} came off with it
                      </span>
                    )}
                  </div>
                  <span className="lg-amount num">{money(Number(rec.amount) || 0)}</span>
                  <RestoreRow id={r.id} merchant={merchant} />
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <p className="led-foot">
        <Link href="/cash-out">Back to Cash Out</Link>
      </p>
    </div>
  )
}
