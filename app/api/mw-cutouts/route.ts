import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { candidates, cutoutsConfigured, libraryFind, librarySave, libraryUsed } from '@/lib/mw-cutouts'

// The cut-out library, for the mw-brand-video skill.
//
// The skill runs in Claude sessions (cloud or someone's laptop) and must not
// hold the Pexels, Anthropic or Supabase keys. It holds one shared secret,
// MW_STUDIO_TOKEN, and asks this app instead — so there is one place where
// keys live and one library both the skill and /mw/studio add to.
//
//   GET  ?q=<query>&word=<word>   → { cutouts, candidates }
//   GET  ?used=<id>               → counts a reuse
//   POST { meta, png }            → stores a cut-out (png = base64)
//
// Excluded from the passcode gate in proxy.ts; the Bearer check below is the
// lock, and with no token configured the route is closed, not open.

export const maxDuration = 60

function authorised(req: Request): boolean {
  const want = (process.env.MW_STUDIO_TOKEN ?? '').trim()
  if (want.length < 16) return false
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const a = Buffer.from(got), b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  if (!cutoutsConfigured()) return NextResponse.json({ error: 'photos are not configured on this deployment' }, { status: 503 })
  const u = new URL(req.url)
  const used = Number(u.searchParams.get('used'))
  if (Number.isInteger(used) && used > 0) { await libraryUsed(used); return NextResponse.json({ ok: true }) }
  const q = (u.searchParams.get('q') ?? '').trim().slice(0, 100)
  if (!q) return NextResponse.json({ error: 'q is required' }, { status: 400 })
  const cutouts = await libraryFind(q)
  if (cutouts.length) return NextResponse.json({ cutouts, candidates: [] })
  const c = await candidates(q, (u.searchParams.get('word') ?? '').slice(0, 20) || undefined)
  return NextResponse.json('error' in c ? { cutouts: [], candidates: [], error: c.error } : { cutouts: [], candidates: c })
}

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const m = body?.meta ?? {}
  const png = Uint8Array.from(Buffer.from(String(body?.png ?? ''), 'base64'))
  const out = await librarySave({
    query: String(m.query ?? '').slice(0, 100), subject: m.subject, method: m.method === 'model' ? 'model' : 'key',
    sourceId: m.sourceId ? String(m.sourceId).replace(/[^\w-]/g, '').slice(0, 30) : undefined,
    credit: m.credit, creditUrl: m.creditUrl, width: Number(m.width) || undefined, height: Number(m.height) || undefined,
  }, png)
  return 'error' in out ? NextResponse.json(out, { status: 400 }) : NextResponse.json({ cutout: out })
}
