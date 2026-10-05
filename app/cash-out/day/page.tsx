import { redirect } from 'next/navigation'

// This tab should never have existed.
//
// I built a day ledger as its own route, and the owner's reply was exact: "what's
// the point in having that tab if only you'll have to go back to cash out tab and
// review it?… I don't know why you build a separate tab for filtering the date"
// (6 Oct 2026). The day is now a row you open inside /cash-out, where the
// receipts already are.
//
// The route stays as a redirect rather than a 404 because Telegram messages
// already sent carry links to it, and so may a bookmark.

export default function DayMoved() {
  redirect('/cash-out')
}
