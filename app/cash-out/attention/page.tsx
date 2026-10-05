import { redirect } from 'next/navigation'

// Also folded back in. "Needs a look" is a filter on the ledger, not a place:
// "it could live in Cash Out as a filter as well… Just add a filter stating the
// problems (No proof, Lines do not match, etc)" (owner, 6 Oct 2026).
//
// `?show=any` opens /cash-out with that filter already applied, so an old link
// lands on the same list it used to.

export default function AttentionMoved() {
  redirect('/cash-out?show=any')
}
