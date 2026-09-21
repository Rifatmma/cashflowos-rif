// 👉 This is your Cash Out tab — money going OUT, including receipts your robot
// files for you. Safe to edit the columns/labels. It reads the ONE `records`
// table, filtered to category='cash_out'. Rows with meta.auto_filed = the Vault
// agent filed them on autopilot (🟢) — we badge those so you can spot them.
//
// ONE RECEIPT STAYS ONE ROW. The line items from a photographed receipt live in
// `meta.items[]` on that row, not as child rows — so the money totals on this tab,
// the Dashboard and the daily brief all stay correct while the detail sits
// underneath. See lib/vision.ts for how those items are read and validated.
import { getRecords, rm, m, todayISO, type Rec } from '@/lib/records'
import Empty from '@/app/_components/Empty'
import Stat from '@/app/_components/Stat'

export const dynamic = 'force-dynamic'

type Item = {
  name: string; key?: string; qty: number; unit: string
  unit_price: number; line_total: number; group?: string
  pack_size?: number; pack_unit?: string
  base_qty?: number; base_unit?: string; price_per_base?: number
}

// What the money was FOR. COGS = the cost of what you sell; everything else is
// overhead. Keeping them apart is what makes food cost % computable at all.
const TYPE_LABEL: Record<string, string> = {
  cogs_food: 'Food',
  cogs_beverage: 'Beverage',
  cogs_packaging: 'Packaging',
  labour: 'Labour',
  rent: 'Rent',
  utilities: 'Utilities',
  marketing: 'Marketing',
  equipment: 'Equipment',
  services: 'Services',
  other: 'Other',
}
const IS_COGS = (t?: string) => !!t && t.startsWith('cogs_')

const money2 = (n: number) => 'RM ' + Number(n || 0).toFixed(2)
const itemsOf = (r: Rec): Item[] => (Array.isArray(r.meta?.items) ? (r.meta.items as Item[]) : [])

export default async function CashOut() {
  const all = await getRecords()
  const rows = all.filter(r => r.category === 'cash_out')

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const monthPrefix = todayISO().slice(0, 7) // YYYY-MM
  const monthRows = rows.filter(r => (r.due_date || '').slice(0, 7) === monthPrefix)
  const thisMonth = monthRows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const autoFiled = rows.filter(r => r.meta?.auto_filed).length

  // COGS vs overhead. Rows with no expense_type yet are counted as unclassified
  // rather than quietly folded into overhead — an unknown is not a zero.
  const cogs = rows.filter(r => IS_COGS(r.meta?.expense_type)).reduce((s, r) => s + Number(r.amount || 0), 0)
  const classified = rows.filter(r => r.meta?.expense_type).reduce((s, r) => s + Number(r.amount || 0), 0)
  const unclassified = total - classified
  const cogsPctOfSpend = classified > 0 ? (cogs / classified) * 100 : null

  // Spend by expense type, biggest first.
  const byType = new Map<string, number>()
  for (const r of rows) {
    const t = (r.meta?.expense_type as string) || 'unclassified'
    byType.set(t, (byType.get(t) ?? 0) + Number(r.amount || 0))
  }
  const typeRows = [...byType.entries()].sort((a, b) => b[1] - a[1])

  // ---- What you are paying per unit -----------------------------------------
  // Every line item across every receipt, grouped by its normalised `key`. This
  // is the whole point of itemising: RM 25 for 2kg of chicken is RM 12.50/kg, and
  // seeing that move from 12.50 to 15.80 is how you catch a supplier price rise
  // before it quietly eats the margin.
  //
  // Two tracks per ingredient, and the difference between them matters:
  //   PRINTED  — RM per pack, exactly as the receipt says. Honest, but a 100g pack
  //              and a 250g pack are not comparable, so a price DROP can look like
  //              a rise.
  //   COMPARABLE — RM per kg / per litre, derived only when a weight was printed.
  // We show the comparable price whenever we have one, and say so when some
  // purchases had no weight on the label and therefore sit outside the comparison.
  type Price = {
    key: string; name: string; unit: string
    buys: number; qty: number; spend: number
    lo: number; hi: number; latest: number; latestDate: string
    base?: string; bBuys: number
    bLo: number; bHi: number; bLatest: number; bDate: string
  }
  const prices = new Map<string, Price>()
  for (const r of rows) {
    for (const it of itemsOf(r)) {
      if (!it || typeof it.unit_price !== 'number') continue
      const k = (it.key || it.name || '').toLowerCase()
      if (!k) continue
      const date = r.due_date || r.created_at.slice(0, 10)
      const per = typeof it.price_per_base === 'number' ? it.price_per_base : null
      const p = prices.get(k)
      if (!p) {
        prices.set(k, {
          key: k, name: it.name, unit: it.unit, buys: 1, qty: it.qty, spend: it.line_total,
          lo: it.unit_price, hi: it.unit_price, latest: it.unit_price, latestDate: date,
          base: per !== null ? it.base_unit : undefined,
          bBuys: per !== null ? 1 : 0,
          bLo: per ?? 0, bHi: per ?? 0, bLatest: per ?? 0, bDate: date,
        })
      } else {
        p.buys++; p.qty += it.qty; p.spend += it.line_total
        p.lo = Math.min(p.lo, it.unit_price); p.hi = Math.max(p.hi, it.unit_price)
        if (date >= p.latestDate) { p.latest = it.unit_price; p.latestDate = date }
        // Only fold in a comparable price measured in the SAME base unit — never
        // average a per-kg figure together with a per-litre one.
        if (per !== null && (!p.base || p.base === it.base_unit)) {
          if (!p.base) { p.base = it.base_unit; p.bLo = per; p.bHi = per; p.bLatest = per; p.bDate = date }
          else { p.bLo = Math.min(p.bLo, per); p.bHi = Math.max(p.bHi, per) }
          p.bBuys++
          if (date >= p.bDate) { p.bLatest = per; p.bDate = date }
        }
      }
    }
  }
  const priceRows = [...prices.values()].sort((a, b) => b.spend - a.spend)
  const anyItems = priceRows.length > 0

  const sorted = [...rows].sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''))

  return (
    <>
      <h1 className="ph">Cash Out 🧾</h1>
      <p className="cap">Money going out — including receipts your robot files for you, line by line.</p>

      <div className="grid">
        <Stat label="Total out" value={rm(total)} />
        <Stat label="This month" value={rm(thisMonth)} />
        <Stat label="Cost of goods" value={rm(cogs)} />
        <Stat label="COGS share of spend" value={cogsPctOfSpend === null ? '—' : cogsPctOfSpend.toFixed(0) + '%'} />
        <Stat label="🤖 Auto-filed" value={autoFiled} />
      </div>

      {unclassified > 0 && (
        <div className="banner warn" style={{ marginTop: 14 }}>
          <strong>{rm(unclassified)} is unclassified.</strong> Those rows have no expense type, so they are
          left out of the cost-of-goods figure rather than guessed at. New receipts photographed into the
          Vault get typed automatically; older rows need it added by hand.
        </div>
      )}

      {all.length === 0 ? (
        <Empty />
      ) : rows.length === 0 ? (
        <Empty label="money-out" />
      ) : (
        <>
          {/* ── Where the money goes ─────────────────────── */}
          <p className="rowlabel" style={{ marginTop: 22 }}>Where it goes</p>
          <table className="tbl">
            <thead><tr><th>Type</th><th>Spend</th><th>Share</th></tr></thead>
            <tbody>
              {typeRows.map(([t, v]) => (
                <tr key={t}>
                  <td data-label="Type">
                    {TYPE_LABEL[t] ?? 'Unclassified'}
                    {IS_COGS(t) && <> <span className="pill won">COGS</span></>}
                  </td>
                  <td data-label="Spend">{rm(v)}</td>
                  <td data-label="Share">
                    {total > 0 ? ((v / total) * 100).toFixed(0) + '%' : '—'}
                    <div aria-hidden="true" style={{
                      height: 3, marginTop: 4, borderRadius: 2,
                      background: IS_COGS(t) ? 'rgba(75,122,90,.55)' : 'var(--clay-tint)',
                      width: total > 0 ? Math.max(2, Math.round((v / total) * 100)) + '%' : '2%',
                    }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Unit cost tracking ───────────────────────── */}
          <p className="rowlabel" style={{ marginTop: 26 }}>What you pay per unit</p>
          {!anyItems ? (
            <div className="empty">
              No itemised receipts yet.<br />
              Photograph a receipt into Telegram and the Vault reads every line — item, quantity, unit
              and price — so this table fills itself.
            </div>
          ) : (
            <>
              <table className="tbl">
                <thead>
                  <tr><th>Item</th><th>Comparable price</th><th>Range seen</th><th>On the receipt</th><th>Bought</th><th>Total spend</th></tr>
                </thead>
                <tbody>
                  {priceRows.map(p => {
                    // Judge "highest yet" on the comparable price when we have one —
                    // a per-pack price says nothing once the pack size changes.
                    const cmp = !!p.base && p.bBuys > 0
                    const rising = cmp
                      ? p.bHi > p.bLo && p.bLatest >= p.bHi && p.bBuys > 1
                      : p.hi > p.lo && p.latest >= p.hi && p.buys > 1
                    const partial = cmp && p.bBuys < p.buys
                    return (
                      <tr key={p.key}>
                        <td data-label="Item">
                          {p.name}
                          <span style={{ color: 'var(--dim)', fontSize: 12 }}> · {p.key}</span>
                        </td>
                        <td data-label="Comparable price">
                          {cmp ? (
                            <>
                              <strong>{money2(p.bLatest)}</strong>
                              <span style={{ color: 'var(--dim)', fontSize: 12 }}>/{p.base}</span>
                              {rising && <> <span className="pill overdue">highest yet</span></>}
                              {partial && (
                                <div style={{ color: 'var(--dim)', fontSize: 11 }}>
                                  {p.bBuys} of {p.buys} buys had a weight printed
                                </div>
                              )}
                            </>
                          ) : (
                            <span style={{ color: 'var(--dim)' }} title="No weight or volume printed on the label, so there is nothing to compare across pack sizes.">
                              no weight printed
                            </span>
                          )}
                        </td>
                        <td data-label="Range seen">
                          {cmp
                            ? (p.bLo === p.bHi ? '—' : `${money2(p.bLo)} – ${money2(p.bHi)}/${p.base}`)
                            : (p.lo === p.hi ? '—' : `${money2(p.lo)} – ${money2(p.hi)}`)}
                        </td>
                        <td data-label="On the receipt">
                          {money2(p.latest)}
                          <span style={{ color: 'var(--dim)', fontSize: 12 }}>/{p.unit}</span>
                          {!cmp && rising && <> <span className="pill overdue">highest yet</span></>}
                        </td>
                        <td data-label="Bought">
                          {p.qty.toLocaleString('en-MY')} {p.unit}
                          <span style={{ color: 'var(--dim)', fontSize: 12 }}> · {p.buys}×</span>
                        </td>
                        <td data-label="Total spend">{rm(p.spend)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: 'var(--dim)', margin: '8px 0 0', lineHeight: 1.6 }}>
                <strong>Comparable price</strong> is RM per kg or per litre, worked out from the weight
                printed on the label — so a 100g pack and a 1kg bag can finally be compared. Where no weight
                was printed, only the per-pack price exists and no comparison is possible.
                &ldquo;Highest yet&rdquo; means the most recent purchase sat at the top of the range you have
                paid — worth a look before the next order.
              </p>
            </>
          )}

          {/* ── The receipts ─────────────────────────────── */}
          <p className="rowlabel" style={{ marginTop: 26 }}>Every payment</p>
          <table className="tbl">
            <thead>
              <tr>
                <th>What</th><th>Type</th><th>Supplier</th><th>Status</th><th>Date</th><th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const items = itemsOf(r)
                const type = r.meta?.expense_type as string | undefined
                return (
                  <tr key={r.id}>
                    <td data-label="What">
                      {r.title}
                      {r.meta?.auto_filed ? (
                        <span className="pill filed" style={{ marginLeft: 8 }}>🤖 auto-filed</span>
                      ) : null}
                      {r.meta?.receipt_no ? (
                        <span style={{ color: 'var(--dim)', fontSize: 12 }}> · #{r.meta.receipt_no}</span>
                      ) : null}

                      {items.length > 0 && (
                        <details style={{ marginTop: 6 }}>
                          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--clay)' }}>
                            {items.length} item{items.length === 1 ? '' : 's'}
                          </summary>
                          <table className="tbl" style={{ marginTop: 6 }}>
                            <thead>
                              <tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr>
                            </thead>
                            <tbody>
                              {items.map((it, i) => (
                                <tr key={`${r.id}-${i}`}>
                                  <td data-label="Item">
                                    {it.name}
                                    {it.group && <span style={{ color: 'var(--dim)', fontSize: 12 }}> · {it.group}</span>}
                                  </td>
                                  <td data-label="Qty">{it.qty} {it.unit}</td>
                                  <td data-label="Unit price">
                                    {money2(it.unit_price)}/{it.unit}
                                    {typeof it.price_per_base === 'number' && (
                                      <span style={{ color: 'var(--dim)', fontSize: 12 }}>
                                        {' '}= {money2(it.price_per_base)}/{it.base_unit}
                                      </span>
                                    )}
                                  </td>
                                  <td data-label="Line total">{money2(it.line_total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {(r.meta?.subtotal != null || r.meta?.tax != null) && (
                            <p style={{ fontSize: 12, color: 'var(--dim)', margin: '6px 0 0' }}>
                              {r.meta?.subtotal != null && <>Subtotal {money2(r.meta.subtotal)} · </>}
                              {r.meta?.tax != null && <>Tax {money2(r.meta.tax)} · </>}
                              Total {money2(Number(r.amount || 0))}
                            </p>
                          )}
                          {r.meta?.items_note && (
                            <p style={{ fontSize: 12, color: '#8A3E2D', margin: '6px 0 0', lineHeight: 1.5 }}>
                              ⚠️ {r.meta.items_note}
                            </p>
                          )}
                        </details>
                      )}
                    </td>
                    <td data-label="Type">
                      {type ? (
                        <span className={`pill ${IS_COGS(type) ? 'won' : 'nurture'}`}>{TYPE_LABEL[type] ?? type}</span>
                      ) : (
                        <span style={{ color: 'var(--dim)', fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td data-label="Supplier">{m(r, 'merchant')}</td>
                    <td data-label="Status">
                      <span className={`pill ${r.status || '—'}`}>{r.status || '—'}</span>
                    </td>
                    <td data-label="Date">{r.due_date || '—'}</td>
                    <td data-label="Amount">{rm(r.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      <p className="hint" style={{ marginTop: 20 }}>
        Photograph a receipt into Telegram and the Vault reads every line, checks the items add up to the
        printed total, and files it here. Anything it cannot read cleanly is left out and flagged rather
        than guessed — a wrong unit price is worse than a missing one.
      </p>
    </>
  )
}
