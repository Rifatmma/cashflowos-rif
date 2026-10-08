'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { addReceiptPhoto, rotateReceiptPhoto, type PhotoResult } from './photo-actions'

// 📷 The bill, kept on screen while the lines are edited.
//
// THE COMPLAINT: "When correcting a receipt on the phone I always found myself
// scrolling up to see what line is wrong. So I have to constantly scroll up and
// down to check each line."
//
// Desktop already pinned the photo at ≥900px (globals.css). Below that it was a
// plain image at the top of the page that scrolled away entirely, so line 6 was
// edited from memory.
//
// WHAT THIS DOES ON A PHONE: a 96px band stuck to the top of the form, cropped
// to the TOP of the bill — where the shop name and date print, which is what
// gets re-checked most. Tap it and it grows with pinch-zoom and pan inside; the
// form keeps scrolling underneath.
//
// Rejected alternatives, both worked through on paper first:
//   A split pane — halves an already tight 375px form and fights the collapsing
//   URL bar. The complaint was about scrolling; this doubles it.
//   A "show photo" button per line — the need is to GLANCE WHILE TYPING, not to
//   alternate between two states.
//
// The expanded view also fixes a data-loss bug: the only way to read a blurry
// line used to be "tap to open full size", which left the page and lost every
// unsaved edit in the form (owner, 5 Oct 2026).

export function ReceiptPhoto({ id, url, mime, rotate, mailText = null }: {
  id: number
  url: string | null
  mime: string
  /** An email saved as proof, already made readable (lib/email-proof.ts). */
  mailText?: string | null
  rotate: number
}) {
  const [open, setOpen] = useState(false)
  const [added, addAction, adding] = useActionState(addReceiptPhoto, null as PhotoResult)
  const [turned, turnAction, turning] = useActionState(rotateReceiptPhoto, null as PhotoResult)

  const fileRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLFormElement>(null)

  // Picking a file submits immediately. A second "upload" tap is a step with no
  // decision in it, and this is used one-handed in a kitchen.
  const onPicked = () => { if (fileRef.current?.files?.length) uploadRef.current?.requestSubmit() }

  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open])

  const [mail, setMail] = useState(false)
  const isImage = mime.startsWith('image/')
  const msg = added ?? turned
  const spin = rotate ? { transform: `rotate(${rotate}deg)` } : undefined

  return (
    <div className={`rp${open ? ' is-open' : ''}`}>
      {url && isImage && (
        <button
          type="button" className="rp-band" onClick={() => setOpen(o => !o)}
          aria-expanded={open} aria-label={open ? 'Shrink the bill' : 'Enlarge the bill'}
        >
          <img src={url} alt="The bill" style={spin} />
          <span className="rp-grip">{open ? 'Tap to shrink' : 'Tap to enlarge'}</span>
        </button>
      )}

      {/* Proof is not always a photograph. A payment that only existed as an
          email is proved by the seller's attached invoice, or failing that by
          the email itself, saved as a page (lib/email-proof.ts).

          IT OPENS HERE, NOT IN A NEW TAB. Installed to the home screen there is
          no browser chrome, so a new view has no back button: "I couldn't go
          back to editing the receipt and save it" (owner, 8 Oct 2026). Reading
          the proof is something you do WHILE correcting the lines, exactly like
          the photo band above, so it belongs on the same page. */}
      {url && !isImage && mime === 'text/html' && (
        <div className="rp-mail">
          <button type="button" className="btn ghost" onClick={() => setMail(m => !m)} aria-expanded={mail}>
            {mail ? 'Hide the email' : 'Show the email this came from'}
          </button>
          {mail && (
            <div className="rp-mail-box">
              {mailText
                ? <pre className="rp-mail-text">{mailText}</pre>
                : <p className="co-meta">
                    This one was saved before the text was kept on the record. Tap{' '}
                    <b>Fetch it from your email again</b> below to bring it here, or{' '}
                    <a href={`/api/proof/${id}`} target="_blank" rel="noopener">open it full screen</a>.
                  </p>}
              <p className="co-meta rp-mail-foot">
                Saved from your mailbox &mdash; not a photo.{' '}
                <a href={`/api/proof/${id}`} target="_blank" rel="noopener">Open it full screen</a>
              </p>
            </div>
          )}
        </div>
      )}

      {url && !isImage && mime !== 'text/html' && (
        <p className="co-sub rp-file">
          <a href={url} target="_blank" rel="noopener">Open the file</a> &mdash; it is a PDF, not a photo.
        </p>
      )}

      {!url && (
        <p className="rp-none">
          <b>No proof on this one.</b> A photo of the bill, a bank transfer slip or a
          Touch&nbsp;&rsquo;n&nbsp;Go receipt all count.
        </p>
      )}

      <div className="rp-tools">
        <form ref={uploadRef} action={addAction}>
          <input type="hidden" name="id" value={id} />
          <input
            ref={fileRef} type="file" name="photo" accept="image/*,application/pdf"
            onChange={onPicked} hidden
          />
          <button type="button" className="btn ghost" disabled={adding}
            onClick={() => fileRef.current?.click()}>
            {adding ? 'Saving…' : url ? 'Replace it' : 'Add a photo or screenshot'}
          </button>
        </form>

        {url && isImage && (
          <form action={turnAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="by" value="90" />
            <button type="submit" className="btn ghost" disabled={turning}>
              {turning ? 'Turning…' : 'Turn it'}
            </button>
          </form>
        )}
      </div>

      {msg && <p className={msg.ok ? 'rp-ok' : 'rp-bad'}>{msg.message}</p>}
    </div>
  )
}
