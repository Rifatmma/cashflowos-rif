'use client'

// Logging a meal from the tab: a photo, or type it. Phone first -- the camera
// button is the big one, because the point is to do this at the table.
import { useActionState, useState } from 'react'
import { addPhoto, addTyped, type Result } from './actions'

function Says({ res }: { res: Result }) {
  if (!res) return null
  return <p className={`co-meta ${res.ok ? '' : 'co-flag'}`} role="status">{res.message}</p>
}

export default function AddMeal({ dishes, today }: { dishes: string[]; today: string }) {
  const [photoRes, photoAction, photoPending] = useActionState<Result, FormData>(addPhoto, null)
  const [typedRes, typedAction, typedPending] = useActionState<Result, FormData>(addTyped, null)
  const [what, setWhat] = useState('')

  return (
    <section className="co-card">
      <div className="eyebrow" style={{ marginBottom: 8 }}>Log a meal</div>

      {/* No `capture` attribute: with it, the phone opens the camera and the
          gallery is unreachable, so a photo taken earlier could never be used
          (owner, 24 Sep 2026). Without it the phone offers both. */}
      <form action={photoAction} className="me-photo">
        <label className="ci-file">
          <input type="file" name="photo" accept="image/*" required />
        </label>
        <label className="me-small">
          <span className="co-dim">When</span>
          <input type="date" name="day" defaultValue={today} max={today} />
        </label>
        <button className="btn" disabled={photoPending}>{photoPending ? 'Looking…' : 'Count it'}</button>
      </form>
      <Says res={photoRes} />

      <form action={typedAction} className="me-typed">
        <div className="st-input">
          <input
            type="text" name="what" placeholder="or type it — nasi lemak, tomyam seafood…"
            list="me-dishes" value={what} onChange={e => setWhat(e.target.value)} required
          />
        </div>
        <datalist id="me-dishes">{dishes.map(d => <option key={d} value={d} />)}</datalist>
        <div className="me-typed-row">
          <label className="me-small">
            <span className="co-dim">Portions</span>
            <input type="number" name="portions" step="0.25" min="0.25" defaultValue="1" />
          </label>
          <label className="me-small">
            <span className="co-dim">kcal, if you know</span>
            <input type="number" name="kcal" step="10" min="0" placeholder="—" />
          </label>
          <label className="me-small">
            <span className="co-dim">When</span>
            <input type="date" name="day" defaultValue={today} max={today} />
          </label>
          <button className="btn ghost" disabled={typedPending}>{typedPending ? 'Saving…' : 'Add'}</button>
        </div>
      </form>
      <Says res={typedRes} />
      <p className="co-meta">
        Your own dishes are costed from the recipe book — real grams, not a guess. Everything else is a photo or a known dish.
      </p>
    </section>
  )
}
