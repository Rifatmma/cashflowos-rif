import { NextResponse } from 'next/server'
import { supabase, supabaseConfigured } from '@/lib/supabase'

// Serve a saved email as a PAGE.
//
// The snapshot was stored in Supabase storage and linked by signed URL, and it
// came back as source code on the screen: "I don't see any sort of proof but
// some kind of code" (owner, 8 Oct 2026). Supabase storage will not serve
// text/html as html — deliberately, so nobody can host a script on their
// domain — so the file arrives as plain text and the browser prints the tags.
//
// Serving it from here fixes that, and the Content-Security-Policy makes it
// safe to do: `sandbox` puts the page in a unique origin with scripts off, and
// default-src 'none' stops it fetching anything at all. Belt and braces, since
// lib/email-proof.ts already escapes the body into a <pre> — but this file
// holds text written by a stranger, and one layer is not enough for that.

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const recordId = Number(id)
  if (!supabaseConfigured || !(recordId > 0)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data: file } = await supabase.from('vault_files')
    .select('storage_path, mime').eq('record_id', recordId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!file?.storage_path) return new NextResponse('No proof on that receipt.', { status: 404 })

  // Only ever the email snapshots. A photo or a PDF already works through its
  // signed URL, and this route must not become a way to serve arbitrary bytes
  // from the vault under our own origin.
  if (file.mime !== 'text/html') {
    return new NextResponse('That proof is a file, not an email.', { status: 400 })
  }

  const { data: blob, error } = await supabase.storage.from('vault').download(file.storage_path)
  if (error || !blob) return new NextResponse('Could not read it.', { status: 404 })

  return new NextResponse(await blob.text(), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'private, no-store',
    },
  })
}
