'use client'

import { useRouter } from 'next/navigation'
import { useRef } from 'react'

// The date in the middle of the stepper.
//
// It reads as text and behaves as a date picker: a real <input type="date">,
// visually hidden, with the heading as its label. Native pickers beat anything
// hand-built — they work with a screen reader, they know what month it is, and
// they cost no JavaScript beyond this navigation.

export function DayPicker({ day, label }: { day: string; label: string }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)

  return (
    <span className="led-date">
      <button
        type="button"
        onClick={() => {
          // showPicker() is the only way to open it from a tap on the text.
          // Not in every browser, so fall back to focusing the input.
          const el = input.current
          if (!el) return
          try { (el as any).showPicker?.() ?? el.focus() } catch { el.focus() }
        }}
      >
        {label}
      </button>
      <input
        ref={input}
        type="date"
        value={day}
        aria-label="Pick a day"
        onChange={e => {
          const v = e.target.value
          if (v) router.push(`/cash-out/day?d=${v}`)
        }}
      />
    </span>
  )
}
