'use client'

import { useActionState, useRef } from 'react'
import { addReceiptPhoto, type PhotoResult } from './[id]/photo-actions'

// Attach the proof without opening the receipt.
//
// The chase list exists to be emptied, and the fix for most of it is one photo.
// Making someone open a receipt, scroll, upload and come back turns a
// thirty-second job into a five-minute one, which is how a list stops being
// worked (owner, 5 Oct 2026).
//
// NO `capture` ATTRIBUTE. It opened the camera straight onto the bill, on the
// reasoning that the paper is usually in the person's other hand -- but it also
// HIDES the photo library, and proof is not always a photograph: "I took a
// screenshot on my screen to show as a proof but it only allows me to take a
// photo not upload a photo from my device" (owner, 8 Oct 2026). A bank app's
// transfer screen and a Touch 'n Go receipt are both screenshots. Without the
// attribute the phone offers Camera AND Photo Library, which is both cases.

export function QuickPhoto({ id }: { id: number }) {
  const [res, action, busy] = useActionState(addReceiptPhoto, null as PhotoResult)
  const file = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)

  if (res?.ok) return <p className="att-ok">Proof saved.</p>

  return (
    <form ref={form} action={action} className="att-photo">
      <input type="hidden" name="id" value={id} />
      <input
        ref={file} type="file" name="photo" accept="image/*,application/pdf"
        hidden
        onChange={() => { if (file.current?.files?.length) form.current?.requestSubmit() }}
      />
      <button type="button" className="btn ghost" disabled={busy}
        onClick={() => file.current?.click()}>
        {busy ? 'Saving…' : 'Add proof'}
      </button>
      {res && !res.ok && <span className="att-bad">{res.message}</span>}
    </form>
  )
}
