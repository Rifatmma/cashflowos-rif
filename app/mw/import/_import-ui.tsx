'use client'

import { useActionState } from 'react'
import { importSemrush } from '../actions'

// The one client component in /mw, and only because the result of an upload
// has to appear without losing the page. Everything else here is a plain form.

const EMPTY = { lines: [] as string[], ok: 0, skipped: 0 }

export function ImportForm({ countries }: { countries: { key: string; label: string; market: string }[] }) {
  const [state, action, pending] = useActionState(importSemrush, EMPTY)

  return (
    <>
      <form action={action} className="mw-import">
        <label className="drop">
          <input type="file" name="files" accept=".csv,text/csv" multiple />
          <span>Choose your Semrush CSV exports — several at once is fine.</span>
        </label>

        <label className="pick">
          Market
          <select name="country" defaultValue="">
            <option value="">Read it from each filename (recommended)</option>
            {countries.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <small>
            Only set this if a filename does not say which market it is — it then applies to
            <b> every</b> file in this upload.
          </small>
        </label>

        <button disabled={pending}>{pending ? 'Reading…' : 'Import'}</button>
      </form>

      {state.lines.length > 0 && (
        <div className={`mw-import-result ${state.skipped ? 'partial' : 'good'}`}>
          <b>
            {state.ok} file{state.ok === 1 ? '' : 's'} imported
            {state.skipped > 0 && `, ${state.skipped} skipped`}
          </b>
          <ul>
            {state.lines.map((l, i) => (
              <li key={i} className={/skipped|could not/.test(l) ? 'no' : 'yes'}>{l}</li>
            ))}
          </ul>
          {state.ok > 0 && (
            <p className="lede" style={{ marginTop: 10 }}>
              The SEO tab, the market plan and the content gap are already using these numbers.
              Tasks regenerate on the 1st, or you can run the plan now from the refresh endpoint.
            </p>
          )}
        </div>
      )}
    </>
  )
}
