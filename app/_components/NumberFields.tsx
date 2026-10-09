'use client'

import { useEffect } from 'react'

// Tap a number, type the number.
//
// "the default is 0 when I click on it I must remove the 0 or else that 0 will
// add up. For example if I just wanna put 10 with that 0 there it will become
// 100" (owner, 10 Oct 2026). Every money and quantity field in the app had the
// same shape: a real value sitting in the box, and a cursor that lands beside
// it rather than over it. Correcting a price meant deleting first, every time,
// on a phone, usually while holding a receipt.
//
// ONE LISTENER, NOT FIFTEEN EDITS. There are numeric inputs on the correction
// page, the stocktake, the recipes, the stock page and the fixed costs, and
// there will be more. Catching focus at the document means a field written
// next month behaves the same without anyone remembering to wire it up.
//
// Only numeric fields: `inputmode` decimal or numeric, or type="number". A
// name, a note or a search box must keep its cursor where it was put.

const NUMERIC = 'input[inputmode="decimal"], input[inputmode="numeric"], input[type="number"]'

/** setSelectionRange throws on type="number"; .select() works on both. */
function selectAll(el: HTMLInputElement) {
  try {
    if (el.type === 'number') el.select()
    else el.setSelectionRange(0, el.value.length)
  } catch {
    try { el.select() } catch { /* a browser that won't: leave the cursor be */ }
  }
}

export function NumberFields() {
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null
      if (!el || !(el instanceof HTMLInputElement)) return
      if (!el.matches(NUMERIC) || el.disabled || el.readOnly) return
      if (el.value === '') return
      // Twice, on purpose. Once now, so the field is ready the instant focus
      // lands and so this works in a tab that is not painting (a hidden tab
      // never runs requestAnimationFrame). Once a frame later, because iOS
      // puts its own caret in after focus and undoes a selection made in the
      // same tick.
      selectAll(el)
      requestAnimationFrame(() => {
        if (document.activeElement === el) selectAll(el)
      })
    }
    // focusin, not focus: focus does not bubble, and these inputs mount and
    // unmount constantly as lines are added and removed.
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [])
  return null
}
