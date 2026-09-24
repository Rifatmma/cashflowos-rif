'use client'

// Logging a meal from the tab: a photo, or type it. Phone first -- the camera
// button is the big one, because the point is to do this at the table.
import { useActionState, useState } from 'react'
import { addPhoto, addTyped, type Result } from './actions'

function Says({ res }: { res: Result }) {
  if (!res) return null
  return <p className={`co-meta ${res.ok ? '' : 'co-flag'}`} role="status">{res.message}</p>
}

/**
 * Shrink a photo in the browser before it is sent.
 *
 * A phone photo is 2-5 MB and a server action's body is capped at 1 MB, so
 * "Count it" failed on every real photo (owner, 24 Sep 2026). 1,280 px is far
 * more than enough to see what is on a plate, and it makes the upload quick on
 * restaurant wifi. If anything about the resize fails, the original is sent.
 */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 400_000) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export default function AddMeal({ dishes }: { dishes: string[] }) {
  const [photoRes, photoAction, photoPending] = useActionState<Result, FormData>(addPhoto, null)
  const [typedRes, typedAction, typedPending] = useActionState<Result, FormData>(addTyped, null)
  const [what, setWhat] = useState('')
  const [preparing, setPreparing] = useState(false)

  async function sendPhoto(form: FormData) {
    const file = form.get('photo')
    if (file instanceof File && file.size) {
      setPreparing(true)
      try {
        form.set('photo', await shrink(file))
      } finally {
        setPreparing(false)
      }
    }
    photoAction(form)
  }
  const busy = preparing || photoPending

  return (
    <section className="co-card">
      <div className="eyebrow" style={{ marginBottom: 8 }}>Log a meal</div>

      {/* No `capture` attribute: with it, the phone opens the camera and the
          gallery is unreachable, so a photo taken earlier could never be used
          (owner, 24 Sep 2026). Without it the phone offers both.
          No date field either -- he asked for the gallery, not for back-dating:
          "I should have enough discipline to do it myself". Everything logs
          against today. */}
      <form action={sendPhoto} className="me-photo">
        <label className="ci-file">
          <input type="file" name="photo" accept="image/*" required />
        </label>
        <button className="btn" disabled={busy}>
          {preparing ? 'Preparing…' : photoPending ? 'Looking…' : 'Count it'}
        </button>
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
