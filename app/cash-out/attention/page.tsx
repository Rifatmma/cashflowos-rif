import Link from 'next/link'
import { needsAttention, dayOf } from '@/lib/ledger'
import { recordsWithPhotos } from '@/lib/receipt-photo'
import { merchantOf, money2, problemOf, type Problem, type ProblemKind } from '@/lib/receipt-view'
import { QuickPhoto } from './QuickPhoto'

// 👉 What is wrong right now. All of it, with no date window.
//
// The old "to check" list lived at the top of Cash Out and inherited that
// page's calendar-month window, so a problem simply aged out of view on the 1st
// instead of being fixed. A bill with no photo from three weeks ago is still a
// bill with no photo (owner, 5 Oct 2026).

export const dynamic = 'force-dynamic'

const GROUPS: { kind: ProblemKind; title: string; blurb: string }[] = [
  {
    kind: 'no-photo',
    title: 'No proof',
    blurb: 'Money went out and nothing shows what for. A photo of the bill, a bank transfer slip '
      + 'or a Touch ’n Go receipt all count — you can add one here without opening the receipt.',
  },
  {
    kind: 'bad-proof',
    title: 'The proof is a handwritten list',
    blurb: 'Someone photographed their own note rather than a bill from the seller. It is filed, '
      + 'but it is not evidence of anything until a real receipt replaces it.',
  },
  {
    kind: 'wont-add-up',
    title: 'The lines do not match the total',
    blurb: 'Either a line was misread or the receipt had a discount nobody recorded. '
      + 'Both are two taps on the receipt itself.',
  },
  {
    kind: 'no-category',
    title: 'Not categorised',
    blurb: 'This spending is in no category, so it is missing from every total on every other screen.',
  },
  {
    kind: 'parked',
    title: 'You said you would fix these',
    blurb: 'Parked from Telegram with “I’ll fix it in the app”.',
  },
]

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}

export default async function Attention() {
  const rows = await needsAttention()
  const withPhoto = await recordsWithPhotos(rows.map(r => r.id))

  const found = rows
    .map(r => ({ r, p: problemOf(r, withPhoto.has(r.id)) }))
    .filter((x): x is { r: typeof rows[number]; p: Problem } => x.p !== null)

  const money = found.reduce((t, x) => t + Number(x.r.amount || 0), 0)

  return (
    <div className="co">
      <h1 className="ph">What needs a look</h1>

      {found.length === 0 ? (
        <p className="led-empty" style={{ padding: '32px 0' }}>
          Nothing. Every receipt has its proof, adds up, and has a category.
        </p>
      ) : (
        <p className="led-note" style={{ marginBottom: 24 }}>
          <b>{found.length}</b> {found.length === 1 ? 'receipt needs' : 'receipts need'} something,
          worth <b className="num">{money2(money)}</b> between them. No date limit here on purpose —
          a bill with no photo from three weeks ago is still a bill with no photo.
        </p>
      )}

      {GROUPS.map(g => {
        const mine = found.filter(x => x.p.kind === g.kind)
        if (!mine.length) return null
        return (
          <section key={g.kind} className="att-group">
            <h2>
              {g.title}
              <span className="att-count">{mine.length}</span>
            </h2>
            <p className="att-blurb">{g.blurb}</p>
            <ol className="led">
              {mine.map(({ r, p }) => (
                <li key={r.id} className="led-row has-problem att-row">
                  <Link href={`/cash-out/${r.id}`} className="att-main">
                    <span className="led-name">{merchantOf(r)}</span>
                    <span className="led-amount num">{money2(Number(r.amount))}</span>
                    <span className="led-meta">
                      {dayOf(r)} · filed {ago(r.created_at)}
                      {r.meta?.filed_by && ` · ${r.meta.filed_by}`}
                    </span>
                    <span className="led-problem">{p.detail}</span>
                  </Link>
                  {/* Proof can be fixed from here. Everything else needs the
                      receipt open, because it is a judgement about the lines. */}
                  {(p.kind === 'no-photo' || p.kind === 'bad-proof') && <QuickPhoto id={r.id} />}
                </li>
              ))}
            </ol>
          </section>
        )
      })}

      <p className="led-foot">
        <Link href="/cash-out/day">Today&rsquo;s ledger</Link> · <Link href="/cash-out">The month</Link>
      </p>
    </div>
  )
}
