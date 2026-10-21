import { NextResponse } from 'next/server'

// Same-origin proxy for the one stock-photo host the Studio uses.
//
// WHY THIS EXISTS AT ALL: the Studio draws the cover on a <canvas> and then
// calls toBlob() to produce the download. A canvas that has drawn an image
// from another origin is "tainted" and toBlob() throws a SecurityError —
// which would show up as the download button simply not working, with the
// reason buried in the console. Serving the bytes from our own origin makes
// the canvas clean.
//
// The host allow-list is the whole security of this route. Without it this is
// an open proxy: anyone could point it at an internal address and read the
// response through our server. One host, exact match, no wildcards.

// cdn.sanity.io: the published inventory photos on movingwalls.com/locations
// pages, drawn by the location video.
const ALLOWED = new Set(['images.pexels.com', 'cdn.sanity.io'])

export const runtime = 'edge'

/**
 * Our own cut-out library (Supabase storage, bucket mw-cutouts) — the brand
 * video draws these on a canvas too. Exact host from SUPABASE_URL, and only
 * the public path of that one bucket, so this is not a door into storage.
 */
function isOurCutout(u: URL): boolean {
  let host = ''
  try { host = new URL((process.env.SUPABASE_URL ?? '').trim()).hostname } catch { return false }
  return !!host && u.hostname === host && u.pathname.startsWith('/storage/v1/object/public/mw-cutouts/') && !u.pathname.includes('..')
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('u')
  if (!raw) return new NextResponse('missing u', { status: 400 })

  let target: URL
  try { target = new URL(raw) } catch { return new NextResponse('bad url', { status: 400 }) }
  if (target.protocol !== 'https:' || !(ALLOWED.has(target.hostname) || isOurCutout(target))) {
    return new NextResponse('host not allowed', { status: 403 })
  }

  const res = await fetch(target.toString(), { headers: { 'User-Agent': 'MovingWallsStudio/1.0' } })
  if (!res.ok) return new NextResponse('upstream failed', { status: 502 })

  const type = res.headers.get('content-type') ?? ''
  // The allow-list already settles the host; this settles what came back from
  // it. A proxy that will return anything is a proxy for anything.
  if (!type.startsWith('image/')) return new NextResponse('not an image', { status: 415 })

  return new NextResponse(res.body, {
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=86400, immutable',
    },
  })
}
