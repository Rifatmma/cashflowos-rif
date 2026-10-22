// 👉 One-click answers from an email, without signing in.
//
// A market lead who has never opened the app will not start by finding a
// passcode. So each task in the Monday email carries two links — Done, and
// Can't — that work on their own. Each link is signed: it names one task, one
// person and one answer, and expires, so it cannot be edited into a different
// task or replayed next month.
//
// HMAC-SHA256 over APP_PASSCODE, the same server secret the session and guest
// cookies use. Pure apart from node:crypto, so it is tested.

import crypto from 'node:crypto'

export type ActClaim = {
  /** Candidate id from lib/mw-priorities.ts. */
  id: string
  /** The person's email: who answered, recorded as decided_by. */
  by: string
  stage: 'done' | 'declined'
  /** Unix seconds. */
  exp: number
}

/** A Monday link stays good for two weeks: long enough to act, short enough to go stale. */
export const LINK_TTL_S = 14 * 86_400

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8')

export function signAct(c: Omit<ActClaim, 'exp'>, secret: string, now = Date.now()): string {
  if (!secret) throw new Error('no signing secret')
  const body = b64(JSON.stringify({ ...c, exp: Math.floor(now / 1000) + LINK_TTL_S }))
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

/** The claim inside a link, or null if it was tampered with, malformed or has expired. */
export function readAct(token: string | null | undefined, secret: string, now = Date.now()): ActClaim | null {
  if (!token || !secret) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(want)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const c = JSON.parse(unb64(body)) as ActClaim
    if (!c || typeof c.id !== 'string' || typeof c.by !== 'string') return null
    if (c.stage !== 'done' && c.stage !== 'declined') return null
    if (!Number.isFinite(c.exp) || c.exp * 1000 < now) return null
    return c
  } catch {
    return null
  }
}
