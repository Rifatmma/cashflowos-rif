// Which mailboxes get read, and whose payment is whose.
//   npx -y tsx --conditions=react-server tests/email-inboxes.test.mts
//
// Worth testing because the failure is invisible: a mis-parsed entry means a
// mailbox is never read, and nothing in the nightly message would say a
// mailbox is missing. A wrong `account` is worse again -- the payment files
// fine and only the PROOF fetch fails, weeks later, on a different screen.

import { parseInboxes, DEFAULT_INBOX } from '../lib/email-inboxes'
import { query } from '../lib/email-payments'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

// ── the live configuration ──────────────────────────────────────────────────
{
  const b = parseInboxes('rifatmma@gmail.com:Rif,tuantinaa@gmail.com:Tina:Jaosamut', undefined, undefined)
  is(b.length === 2, 'both mailboxes are read')
  is(b[0].address === 'rifatmma@gmail.com' && b[1].address === 'tuantinaa@gmail.com', 'in the order configured')
  is(b[1].label === 'Tina', "and Tina's inbox is named, so he can tell whose payment it is")
  is(b[1].account === 'tuantinaa@gmail.com', 'each fetches through its own Composio connection')
  is(b[0].gmailLabel === null, "the owner's own mailbox is read whole")
  is(b[1].gmailLabel === 'Jaosamut', "and the staff mailbox only through its label")
}

// ── the label is the filter ─────────────────────────────────────────────────
// Her two-day window held ~200 payment-looking emails, nearly all gym bookings
// and refunds. Narrowing to a label is the whole point of this; getting the
// query wrong either reads her whole personal inbox or reads nothing at all.
{
  const q = query(2, 'Jaosamut')
  is(q.includes('label:"Jaosamut"'), 'a labelled inbox asks Gmail for that label')
  is(!/receipt OR invoice/.test(q), 'and applies no keyword guessing on top of her choice')
  is(q.includes('newer_than:2d'), 'still windowed, so the same mail is not re-read for ever')
}
{
  const q = query(2, 'Jaosamut Receipts')
  is(q.includes('label:"Jaosamut Receipts"'), 'a label with a space is quoted, not silently truncated')
}
{
  const q = query(2, null)
  is(/receipt OR invoice/.test(q), 'an unlabelled inbox keeps the keyword search it always had')
  is(!q.includes('label:'), 'and asks for no label')
}
{
  is(query(2, '   ') === query(2, null), 'a blank label is no label, not an empty label matching nothing')
}

// ── a label with a colon in it ──────────────────────────────────────────────
{
  const b = parseInboxes('a@x.com:Tina:Biz:Receipts', undefined, undefined)
  is(b[0].gmailLabel === 'Biz:Receipts', 'everything after the name is the label, colons included')
  is(b[0].label === 'Tina', 'and the name is still just the name')
}
{
  const b = parseInboxes('a@x.com::Jaosamut', undefined, undefined)
  is(b[0].gmailLabel === 'Jaosamut' && b[0].label === 'a@x.com',
     'a label with no name still works — the address stands in')
}

// ── nothing configured, and the old name ────────────────────────────────────
{
  const b = parseInboxes(undefined, undefined, undefined)
  is(b.length === 1 && b[0].address === DEFAULT_INBOX, 'with nothing set it still reads the owner inbox')
  is(b[0].gmailLabel === null, 'whole, exactly as it did before any of this')
  is(b[0].label === DEFAULT_INBOX, 'and the address stands in for a label nobody gave')
}
{
  // PAYMENTS_EMAIL is what production ran on before the second inbox existed.
  const b = parseInboxes(undefined, 'someone@else.com', undefined)
  is(b.length === 1 && b[0].address === 'someone@else.com', 'the old single-inbox variable still works')
}
{
  const b = parseInboxes('', 'someone@else.com', undefined)
  is(b[0].address === 'someone@else.com', 'and an empty list does not shadow it')
}

// ── COMPOSIO_GMAIL_ACCOUNT kept its old meaning ─────────────────────────────
{
  const b = parseInboxes('a@x.com,b@y.com', undefined, 'gmail_some-id')
  is(b[0].account === 'gmail_some-id', 'the account override still names the first connection')
  is(b[1].account === 'b@y.com', 'and does NOT silently redirect the second inbox at the first one')
}

// ── a typo must not become a mailbox nobody notices is gone ─────────────────
{
  const b = parseInboxes('rifatmma@gmail.com, not an address ,tuantinaa@gmail.com', undefined, undefined)
  is(b.length === 2, 'junk between two good entries is dropped, not guessed at')
  is(b.map(x => x.address).join() === 'rifatmma@gmail.com,tuantinaa@gmail.com', 'and both real ones survive it')
}
{
  const b = parseInboxes('nonsense', undefined, undefined)
  is(b.length === 1 && b[0].address === DEFAULT_INBOX,
     'a list with nothing usable falls back to the owner inbox rather than reading none')
}
{
  const b = parseInboxes('  RifAtMMA@Gmail.com  ', undefined, undefined)
  is(b[0].address === 'rifatmma@gmail.com', 'case and padding are normalised, because the alias lookup is exact')
}
{
  const b = parseInboxes('a@x.com:Rif,a@x.com:Rif again', undefined, undefined)
  is(b.length === 1, 'the same mailbox listed twice is read once, not billed twice to Claude')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
