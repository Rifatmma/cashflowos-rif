// ✏️ Correct one receipt: the photo beside every line, all editable.
// Reached from each receipt on Cash Out, the one-receipt page, and Jarvis.
//
// The photo stays private: a short-lived signed URL minted here on the server,
// the same as /vault/<record>.
import Link from 'next/link'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { getRecords, rm } from '@/lib/records'
import { shortDate, mytDate } from '@/lib/period'
import { taughtAliases } from '@/lib/stock-data'
import CorrectForm, { type Line } from './CorrectForm'

export const dynamic = 'force-dynamic'
const SIGNED_URL_TTL = 60 * 60

export default async function CorrectReceipt({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ need?: string }>
}) {
  const { id } = await params
  const { need } = await searchParams
  const recordId = Number(id)
  const row = (await getRecords()).find(r => r.id === recordId && r.category === 'cash_out')

  let url: string | null = null
  let mime = ''
  if (row && supabaseConfigured) {
    const { data } = await supabase.from('vault_files').select('storage_path, mime')
      .eq('record_id', recordId).order('created_at', { ascending: false }).limit(1)
    const file = data?.[0]
    mime = String(file?.mime ?? '')
    if (file?.storage_path) {
      const { data: signed } = await supabase.storage.from('vault').createSignedUrl(file.storage_path, SIGNED_URL_TTL)
      url = signed?.signedUrl ?? null
    }
  }
  const aliases = row ? await taughtAliases() : {}

  const items: any[] = Array.isArray(row?.meta?.items) ? row!.meta.items : []
  const lines: Line[] = items.map(it => ({
    name: String(it.name ?? ''),
    qty: Number(it.qty) || 1,
    unit: String(it.unit ?? 'unit'),
    unit_price: Number(it.unit_price) || 0,
    line_total: Number(it.line_total) || 0,
    // The owner's own stock answer, if they gave one; else it is worked out.
    stock: it.stock && typeof it.stock.item === 'string' ? it.stock : null,
    expense_type: String(it.expense_type ?? ''),
  }))

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">Correct receipt</h1>
        <Link href="/cash-out" className="co-dim">← Cash Out</Link>
      </div>

      {!row ? (
        <section className="co-card"><p className="co-sub" style={{ marginTop: 0 }}>That receipt isn&rsquo;t in the books (any more).</p></section>
      ) : (
        <div className="cr-layout">
          <div className="cr-photo">
            <section className="co-card co-hero">
              <div className="eyebrow">
                Record #{row.id} · {shortDate(row.due_date || mytDate(row.created_at))}
                {row.meta?.receipt_no ? ` · #${row.meta.receipt_no}` : ''}
              </div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{String(row.meta?.merchant || row.title)}</div>
              <div className="co-big num">{rm(Number(row.amount))}</div>
              {row.meta?.filed_by && <p className="co-sub">Sent by {String(row.meta.filed_by)}</p>}
            </section>
            <section className="co-card">
              {url && mime.startsWith('image/') ? (
                <a href={url} target="_blank" rel="noopener" title="Open full size">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Receipt photo for record ${row.id}`} className="rcpt-img" />
                </a>
              ) : url ? (
                <p className="co-sub" style={{ marginTop: 0 }}><a href={url} target="_blank" rel="noopener">Open the file</a> (PDF)</p>
              ) : (
                <p className="co-sub" style={{ marginTop: 0 }}>No photo kept for this one &mdash; it was typed in, or filed before photos were saved.</p>
              )}
              {url && mime.startsWith('image/') && <p className="co-meta">Tap the photo to open it full size and zoom.</p>}
            </section>
          </div>

          <section className="co-card cr-form">
            {need && <p className="co-meta co-flag" role="alert" style={{ marginTop: 0 }}>{String(need).slice(0, 200)}</p>}
            <div className="eyebrow" style={{ marginBottom: 4 }}>The lines</div>
            <p className="co-meta" style={{ marginTop: 0 }}>
              Fix a price or a quantity as printed. Then say what went on the shelf: pick the stock item
              (chicken breast, beef, fresh or frozen shrimp&hellip;), the amount and its unit &mdash; 2 packs
              of 2 kg chicken is <b>4 kg</b>. Stock uses exactly that.
            </p>
            {lines.length === 0 && <p className="co-meta">No lines were read on this one &mdash; add them below.</p>}
            <CorrectForm id={row.id} total={Number(row.amount)} discount={Number(row.meta?.discount) || 0} lines={lines} aliases={aliases}
              receiptTypeInit={lines.length ? '' : String(row.meta?.expense_type ?? '')} />
          </section>
        </div>
      )}
    </div>
  )
}
