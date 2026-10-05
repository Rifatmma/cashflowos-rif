'use client'

import { useState } from 'react'

// A download button for a generated page section.
//
// The HTML is built on the server and passed in whole, so this component only
// turns it into a file. Kept client-side because a Blob download needs the
// browser; everything that decides what the file SAYS stays in a pure module
// where it can be tested (owner, 5 Oct 2026).

export function DownloadHtml({ html, filename }: { html: string; filename: string }) {
  const [done, setDone] = useState(false)

  const save = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoked on a later tick: Safari cancels the download if the URL dies
    // while it is still reading it.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setDone(true)
    setTimeout(() => setDone(false), 2500)
  }

  return (
    <button type="button" className="mw-dl" onClick={save}>
      {done ? '✓ Saved' : `⬇ Download ${filename}`}
    </button>
  )
}
