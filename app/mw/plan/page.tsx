import { redirect } from 'next/navigation'

// 👉 The market plan index became People (21 Oct 2026).
//
// No market lead had ever answered a task here: every one of the 16 decisions
// on record was the owner's or Dinesh's. The work now lives on each person's
// own page, in the one ranked order, and this address sends old links there.
// The per-market pages (/mw/plan/<market>) stay for page changes and city cards.
export default function MwPlanIndex() {
  redirect('/mw/people')
}
