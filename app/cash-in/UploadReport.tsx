'use client'

// The daily upload: pick the EasyEat Excel, see at once what it did.
// The result names every dish it could NOT deduct, so a new menu item never
// silently goes uncosted.
import { useActionState } from 'react'
import Link from 'next/link'
import { importDishReport, type ImportResult } from './actions'

const money2 = (n: number) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const strip = (s: string) => s.replace(/[฀-๿]+/g, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim()

export default function UploadReport({ today }: { today: string }) {
  const [res, action, pending] = useActionState<ImportResult | null, FormData>(importDishReport, null)

  return (
    <div>
      <form action={action} className="ci-upload">
        {/* Only when a file had no date in it: the report's own date is used otherwise. */}
        {res && !res.ok && res.needDate && (
          <label className="ci-date">
            <span className="co-dim">Sales date</span>
            <input type="date" name="date" max={today} required />
          </label>
        )}
        <label className="ci-file">
          <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button className="btn" disabled={pending}>{pending ? 'Reading…' : 'Upload'}</button>
      </form>
      <p className="co-meta">
        EasyEat → Reports → <b>Dish Report Over Time</b> → one day → Excel. The date is read from the report. Uploading a day again replaces it.
      </p>

      {res && !res.ok && <p className="co-sub co-flag" role="alert">{res.message}</p>}
      {res && res.ok && (
        <div className="ci-result" role="status">
          <p className="ci-result-head">
            <b>{res.replaced ? 'Replaced' : 'Filed'} {res.date}</b>: <span className="num">{money2(res.total)}</span> · {res.qty} items
            {res.sets > 0 && <> · {res.sets} set{res.sets === 1 ? '' : 's'}</>}
          </p>
          {res.used.length > 0 && (
            <p className="co-meta">Stock used: {res.used.map(u => `${u.name} ${u.qty}`).join(' · ')}</p>
          )}
          {res.unmatched.length > 0 ? (
            <div className="co-sub co-flag">
              {res.unmatched.length} dish{res.unmatched.length === 1 ? '' : 'es'} had no recipe, so no stock was taken for them:
              <ul className="ci-list">
                {res.unmatched.map((u, i) => <li key={i}>{u.qty} × {strip(u.name)} {strip(u.variation)}</li>)}
              </ul>
              <Link href="/stock/recipes">Add their recipes →</Link>
            </div>
          ) : (
            <p className="co-meta">Every food dish matched a recipe.</p>
          )}
          {res.guesses > 0 && (
            <p className="co-meta">{res.guesses} used a recipe marked &ldquo;my guess&rdquo;. <Link href="/stock/recipes">Check them</Link></p>
          )}
        </div>
      )}
    </div>
  )
}
