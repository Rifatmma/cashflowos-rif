// 👉 ONE receipt, full size. Reached from the Stock page ("see the receipt") and
// anywhere else that names a filed receipt — the owner asked for the photo he
// clicked on, not the whole Vault to hunt through (23 Sep 2026).
//
// The file itself stays private: the browser gets a short-lived signed URL,
// minted here on the server, exactly like the Vault list does.
import Link from 'next/link'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { getRecords, rm } from '@/lib/records'
import { shortDate, mytDate } from '@/lib/period'

export const dynamic = 'force-dynamic'
const SIGNED_URL_TTL = 60 * 60

type Item = { name: string; qty: number; unit: string; unit_price: number; line_total: number }

export default async function OneReceipt({ params }: { params: Promise<{ record: string }> }) {
  const { record } = await params
  const recordId = Number(record)
  const all = await getRecords()
  const row = all.find(r => r.id === recordId)

  let url: string | null = null
  let mime = ''
  if (supabaseConfigured && Number.isFinite(recordId)) {
    const { data } = await supabase.from('vault_files').select('storage_path, mime')
      .eq('record_id', recordId).order('created_at', { ascending: false }).limit(1)
    const file = data?.[0]
    mime = String(file?.mime ?? '')
    if (file?.storage_path) {
      const { data: signed } = await supabase.storage.from('vault').createSignedUrl(file.storage_path, SIGNED_URL_TTL)
      url = signed?.signedUrl ?? null
    }
  }
  const items = (Array.isArray(row?.meta?.items) ? row!.meta.items : []) as Item[]
  const money = (n: number) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">{row ? String(row.meta?.merchant || row.title) : 'Receipt'}</h1>
        <Link href="/stock" className="co-dim">← Back</Link>
      </div>

      {!row ? (
        <section className="co-card"><p className="co-sub" style={{ marginTop: 0 }}>That receipt isn&rsquo;t in the books (any more).</p></section>
      ) : (
        <>
          <section className="co-card co-hero">
            <div className="eyebrow">{shortDate(row.due_date || mytDate(row.created_at))}{row.meta?.receipt_no ? ` · #${row.meta.receipt_no}` : ''}</div>
            <div className="co-big num">{money(Number(row.amount))}</div>
            {row.meta?.filed_by && <p className="co-sub">Sent by {String(row.meta.filed_by)}</p>}
          </section>

          <section className="co-card">
            {url && mime.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="The receipt" className="rcpt-img" />
            ) : url ? (
              <p className="co-sub" style={{ marginTop: 0 }}><a href={url} target="_blank" rel="noopener">Open the file</a> (PDF)</p>
            ) : (
              <p className="co-sub" style={{ marginTop: 0 }}>
                No photo kept for this one &mdash; it was typed in, or filed before the photo was saved.
              </p>
            )}
          </section>

          {items.length > 0 && (
            <section className="co-card">
              <div className="eyebrow" style={{ marginBottom: 6 }}>What it says</div>
              <ul className="co-lines">
                {items.map((it, i) => (
                  <li key={i}>
                    <span>{it.name}<span className="co-dim"> · {it.qty} {it.unit !== 'unit' ? it.unit : ''} × {money(it.unit_price)}</span></span>
                    <span className="num">{money(it.line_total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="co-meta">
            <Link href={`/cash-out`}>Cash Out</Link> · <Link href="/vault">All receipts</Link>
          </p>
        </>
      )}
    </div>
  )
}
