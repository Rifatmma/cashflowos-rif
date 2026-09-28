import 'server-only'
import crypto from 'crypto'
import { cookies } from 'next/headers'

// 🔒 Guest access — the Moving Walls tier.
//
// A guest signs in with THEIR OWN EMAIL as the passcode. That gives two things a
// single shared guest code cannot:
//   • identity  — we know it's safwaan@movingwalls.com, not "somebody with the code"
//   • revocation — delete the address from GUEST_EMAILS and that person is out
//     immediately, including any cookie already sitting in their browser
//     (readGuestToken re-checks the allow-list on every request, below).
//
// Be clear-eyed about the trade-off: an email address is NOT a secret. Anyone who
// knows a colleague's address can sign in as them. That is acceptable here ONLY
// because a guest can reach nothing but /mw — no cash, no stock, no vault, no
// employees. See proxy.ts for the route allow-list that enforces that.
//
// To tighten it later without changing anything else, require a shared suffix in
// isGuestEmail(): e.g. accept `safwaan@movingwalls.com#someword` and compare the
// part before '#' against the list, the part after against a GUEST_WORD env var.

export const GUEST_COOKIE = 'cfo_guest'

// The signing secret is APP_PASSCODE — the same server secret cfo_session uses.
// No APP_PASSCODE means the app isn't gated at all, so guest tokens are pointless.
function secret(): string {
  return (process.env.APP_PASSCODE ?? '').trim()
}

/** The allow-list, from GUEST_EMAILS: "a@x.com, b@x.com" → ["a@x.com","b@x.com"] */
export function guestEmails(): string[] {
  return (process.env.GUEST_EMAILS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Is this submitted string one of the allowed emails?
 * Returns the canonical (lowercased) address, or null.
 * Compares SHA-256 digests so the check time doesn't leak which address matched.
 */
export function isGuestEmail(submitted: string): string | null {
  const e = submitted.trim().toLowerCase()
  if (!e) return null
  const a = crypto.createHash('sha256').update(e).digest()
  for (const allowed of guestEmails()) {
    const b = crypto.createHash('sha256').update(allowed).digest()
    if (crypto.timingSafeEqual(a, b)) return allowed
  }
  return null
}

/** Opaque cookie value: base64(email).nonce.HMAC(base64(email).nonce) */
export function mintGuestToken(email: string): string {
  const s = secret()
  if (!s) return ''
  const e64 = Buffer.from(email, 'utf8').toString('base64url')
  const nonce = crypto.randomUUID()
  const sig = crypto.createHmac('sha256', s).update(`${e64}.${nonce}`).digest('hex')
  return `${e64}.${nonce}.${sig}`
}

/**
 * Verify a guest cookie and return the email inside it, or null.
 * Two gates: the HMAC must check out (nobody can forge one), AND the address
 * must still be in GUEST_EMAILS (so removing someone logs them out at once).
 */
export function readGuestToken(token: string | undefined | null): string | null {
  if (!token) return null
  const s = secret()
  if (!s) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [e64, nonce, sig] = parts
  const expect = crypto.createHmac('sha256', s).update(`${e64}.${nonce}`).digest('hex')
  const A = Buffer.from(sig, 'utf8')
  const B = Buffer.from(expect, 'utf8')
  if (A.length !== B.length || !crypto.timingSafeEqual(A, B)) return null
  let email = ''
  try {
    email = Buffer.from(e64, 'base64url').toString('utf8')
  } catch {
    return null
  }
  return isGuestEmail(email)
}

/** The signed-in guest for this request, or null. Server components only. */
export async function currentGuest(): Promise<string | null> {
  const jar = await cookies()
  return readGuestToken(jar.get(GUEST_COOKIE)?.value)
}
