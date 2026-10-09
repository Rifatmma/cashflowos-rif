// Which mailboxes the nightly scan reads.
//
// It read one -- the owner's rifatmma@gmail.com -- until he connected Tina's:
//
//   "I'm connected tuantinaa@gmail.com on composio can you also scan the email
//    everyday once just like how you scan rifatmma@gmail.com for any receipts
//    as well and file it?"  (owner, 10 Oct 2026)
//
// So the inbox stops being a constant and becomes a list. Pure and separate
// from the scan because getting this wrong is expensive in a way that is hard
// to see: a mis-parsed address means a mailbox is silently never read, and
// nothing in the nightly message would say so.
//
// CONFIG. PAYMENTS_EMAILS, comma separated, each entry `address` or
// `address:Label`:
//
//   PAYMENTS_EMAILS=rifatmma@gmail.com:Rif,tuantinaa@gmail.com:Tina
//
// The label is only ever shown to the owner, so he can tell at a glance whose
// mailbox a payment was found in. Without one the address is the label.
//
// PAYMENTS_EMAIL (singular, the old name) still works and still means the one
// inbox, so nothing breaks if PAYMENTS_EMAILS is never set.
//
// The Composio Gmail connection is addressed BY THE EMAIL ADDRESS, which means
// every inbox here needs its connection aliased to its own address in Composio.
// COMPOSIO_GMAIL_ACCOUNT overrides that for the first inbox only, which is
// what it always meant.
//
// EVERY MAILBOX IS READ THE SAME WAY, and that is the owner's decision, not an
// omission. I built per-inbox Gmail-label scoping for the second mailbox and he
// turned it down:
//
//   "No I need it to read everything I said the same way as rifatmma@gmail.com
//    any receipt goes doesn't matter. I can pick which one to remove later in
//    the app."  (owner, 10 Oct 2026)
//
// My argument was volume: a staff member's personal inbox showed ~200
// payment-looking emails in a two-day window, mostly gym bookings. His answer
// is that a receipt missed costs him more than a receipt he has to dismiss, and
// dismissing is a tap in an app he is already in. So: no label filter, no
// per-inbox query, nothing to keep in step between two mailboxes. Do not
// reintroduce one without asking him again.

export type Inbox = {
  /** The mailbox address. Also the Composio account alias. */
  address: string
  /** What the owner is shown. The address when he did not name it. */
  label: string
  /** The Composio connection to fetch through. */
  account: string
}

export const DEFAULT_INBOX = 'rifatmma@gmail.com'

/** Pure: the env strings in, the inbox list out. Order is config order. */
export function parseInboxes(list: string | undefined, single: string | undefined, firstAccount?: string): Inbox[] {
  const raw = (list ?? '').trim() || (single ?? '').trim() || DEFAULT_INBOX
  const out: Inbox[] = []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const [addrRaw, ...labelBits] = part.split(':')
    const address = (addrRaw ?? '').trim().toLowerCase()
    // An entry that is not an address is dropped rather than guessed at: a
    // typo must not become a mailbox nobody notices is missing.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) continue
    if (seen.has(address)) continue
    seen.add(address)
    const label = labelBits.join(':').trim()
    out.push({ address, label: label || address, account: address })
  }
  if (!out.length) out.push({ address: DEFAULT_INBOX, label: DEFAULT_INBOX, account: DEFAULT_INBOX })
  // COMPOSIO_GMAIL_ACCOUNT predates the list and named the one connection, so
  // it keeps applying to the first entry and nothing else.
  const override = (firstAccount ?? '').trim()
  if (override) out[0] = { ...out[0], account: override }
  return out
}

export function inboxes(): Inbox[] {
  return parseInboxes(process.env.PAYMENTS_EMAILS, process.env.PAYMENTS_EMAIL, process.env.COMPOSIO_GMAIL_ACCOUNT)
}

/** The Composio account for a stored row's inbox. Falls back to the address. */
export function accountFor(address: string | null | undefined): string {
  const a = (address ?? '').trim().toLowerCase()
  if (!a) return inboxes()[0].account
  return inboxes().find(i => i.address === a)?.account ?? a
}

/** The label for a stored row's inbox, for the owner's eyes. */
export function labelFor(address: string | null | undefined): string {
  const a = (address ?? '').trim().toLowerCase()
  if (!a) return inboxes()[0].label
  return inboxes().find(i => i.address === a)?.label ?? a
}
