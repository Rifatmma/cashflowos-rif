import { saveRivals } from '../actions'

/**
 * Naming the competitors for one market.
 *
 * A plain form and a server action, like the rest of /mw — no client JS. The
 * list is the team's, not Semrush's: its suggestions for India included
 * iabseaindia.com and ioaa.co.in, which are industry associations, and for
 * Malaysia moving-walls.com, which is a near-miss of our own domain
 * (owner, 29 Sep 2026).
 */
export function RivalEditor({ country, label, rivals }: { country: string; label: string; rivals: string[] }) {
  return (
    <form action={saveRivals} className="mw-rivals">
      <input type="hidden" name="country" value={country} />
      <label>
        Up to four competitors in {label}, one per line. Domains only.
        <textarea name="rivals" rows={4} defaultValue={rivals.join('\n')}
          placeholder={'gohoardings.com\noutofhome.com.my'} />
      </label>
      <div className="row">
        <button>Save</button>
        <small>
          {rivals.length
            ? `${rivals.length} named — the next quarterly pull measures against ${rivals.length === 1 ? 'it' : 'them'}.`
            : 'None named yet, so this market is skipped on the quarterly pull.'}
        </small>
      </div>
    </form>
  )
}
