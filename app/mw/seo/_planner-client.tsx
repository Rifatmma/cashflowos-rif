'use client'
// The only client code on the planner card, and each piece degrades:
//  • AutoGo submits the step/chapter picker on change; without JS the Go button shows.
//  • CopyButton copies the applier prompt; without JS the text is still selectable.
//  • InboxRefresh re-renders while Claude has a job open, then stops.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function AutoGo({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null)
  const [js, setJs] = useState(false)
  useEffect(() => setJs(true), [])
  return (
    <form ref={ref} method="get" action="/mw/seo#planner" className="mw-planner-nav"
      onChange={() => ref.current?.requestSubmit()} data-js={js ? '1' : '0'}>
      {children}
    </form>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className="mw-planner-btn is-quiet"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000) } catch {}
      }}>
      {done ? 'Copied ✓' : 'Copy prompt'}
    </button>
  )
}

/** Refresh every 15s while a job is queued or claimed, for at most 10 minutes. */
export function InboxRefresh({ pending }: { pending: boolean }) {
  const router = useRouter()
  useEffect(() => {
    if (!pending) return
    const started = Date.now()
    const t = setInterval(() => {
      if (Date.now() - started > 10 * 60_000) return clearInterval(t)
      router.refresh()
    }, 15_000)
    return () => clearInterval(t)
  }, [pending, router])
  return null
}
