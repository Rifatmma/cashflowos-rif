import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { supabase, supabaseConfigured } from './supabase'
import { photoKey } from './mw-brandfilm'

// 👉 The cut-out library: stock photos with their background removed, kept
//    so the next video that wants "a megaphone" does not search and cut again.
//
// Shared by /mw/studio and the mw-brand-video skill (through
// /api/mw-cutouts), so a cut-out made in either is available to both.
//
// The flow for one scene that wants a photo:
//
//   1 library      — anything already cut for these words? use it.
//   2 Pexels       — search, asking for the subject on a plain background,
//                    because a white or green backdrop keys out cleanly and
//                    for free; anything else needs the AI model.
//   3 relevance    — Pexels never says "no match" (see mw-photos), so every
//                    candidate is LOOKED AT by Claude before it is offered:
//                    is it the thing, is the background plain, which colour.
//   4 cut + save   — happens in the browser (mw-cutout-client), then the PNG
//                    comes back here to be stored.

const BUCKET = 'mw-cutouts'
const MODEL = 'claude-sonnet-5-5'

export type Cutout = {
  id: number; key: string; url: string; subject?: string
  width?: number; height?: number; credit?: string; creditUrl?: string
}
export type Candidate = {
  id: string
  /** Proxied, so the browser's canvas stays clean. */
  src: string
  /** The Pexels URL itself, for a caller (the skill) that is not a browser. */
  original: string
  subject: string
  background: 'white' | 'green' | 'other'
  credit: string; creditUrl: string
}

export function cutoutsConfigured(): boolean {
  return supabaseConfigured && Boolean(process.env.PEXELS_API_KEY?.trim()) && Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

function publicUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Most-used first: a cut-out that has worked before is the safest pick. */
export async function libraryFind(query: string): Promise<Cutout[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_cutouts')
    .select('id, key, path, subject, width, height, credit, credit_url')
    .eq('key', photoKey(query)).order('uses', { ascending: false }).limit(5)
  return (data ?? []).map((r: any) => ({
    id: r.id, key: r.key, url: publicUrl(r.path), subject: r.subject ?? undefined,
    width: r.width ?? undefined, height: r.height ?? undefined,
    credit: r.credit ?? undefined, creditUrl: r.credit_url ?? undefined,
  }))
}

export async function libraryUsed(id: number): Promise<void> {
  if (!supabaseConfigured) return
  const { data } = await supabase.from('mw_cutouts').select('uses').eq('id', id).single()
  await supabase.from('mw_cutouts').update({ uses: (Number(data?.uses) || 0) + 1, last_used_at: new Date().toISOString() }).eq('id', id)
}

/** Pexels results for the query, unchecked. */
async function pexels(query: string, per = 10): Promise<{ id: number; url: string; thumb: string; alt: string; credit: string; creditUrl: string }[]> {
  const key = process.env.PEXELS_API_KEY?.trim()
  if (!key) return []
  // Ask for the plain backdrop explicitly unless the query already does.
  const q = /white|green|isolated|studio|background/i.test(query) ? query : `${query} isolated white background`
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${per}`, {
    headers: { Authorization: key, 'User-Agent': 'MovingWallsStudio/1.0' },   // 403 without a UA
    next: { revalidate: 3600 },
  })
  if (!res.ok) return []
  const body = await res.json()
  return (body.photos ?? []).map((p: any) => ({
    id: p.id, url: String(p.src?.large2x ?? p.src?.large ?? p.src?.original),
    thumb: String(p.src?.medium ?? p.src?.small), alt: String(p.alt ?? ''),
    credit: String(p.photographer ?? ''), creditUrl: String(p.photographer_url ?? p.url ?? ''),
  }))
}

/**
 * Pexels candidates that Claude has looked at and judged to be the thing.
 *
 * One vision call over the thumbnails, not one per photo: it is the same
 * judgement eight times, and comparing them side by side is how a person
 * would pick too. Ranked plain-background-first, because those cut out
 * cleanly without the model.
 */
export async function candidates(query: string, word?: string): Promise<Candidate[] | { error: string }> {
  const found = await pexels(query)
  if (!found.length) return { error: `Pexels found nothing for “${query}”.` }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY is not set, so photos cannot be checked for relevance.' }

  const list = found.slice(0, 8)
  const a = new Anthropic({ apiKey })
  let res: Anthropic.Message
  try {
    res = await a.messages.create({
      model: MODEL, max_tokens: 1200,
      messages: [{
        role: 'user',
        content: [
          ...list.flatMap((p, i) => [
            { type: 'text' as const, text: `Photo ${i + 1}:` },
            { type: 'image' as const, source: { type: 'url' as const, url: p.thumb } },
          ]),
          {
            type: 'text' as const,
            text: `These are stock photo results for "${query}"${word ? ` (it will illustrate the word "${word}")` : ''}.
For each photo, judge: does it clearly show that subject, as ONE main object or person that could be cut
out and placed on a flat background? And is the background plain enough to remove with a colour key?
Reply with JSON only: {"photos":[{"n":1,"relevant":true,"subject":"red megaphone held in a hand","background":"white"|"green"|"other"}]}
"relevant" is false for scenes, groups, text-heavy images, or anything that is not the subject.`,
          },
        ],
      }],
    })
  } catch (e: any) {
    return { error: `The relevance check failed: ${String(e?.message ?? e).slice(0, 160)}` }
  }
  const raw = res.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n')
  const m = raw.match(/\{[\s\S]*\}/)
  let verdicts: any[] = []
  try { verdicts = JSON.parse(m?.[0] ?? '{}').photos ?? [] } catch { /* treated as none relevant */ }

  const rank = { white: 0, green: 1, other: 2 } as const
  const out: Candidate[] = []
  for (const v of verdicts) {
    const p = list[Number(v?.n) - 1]
    if (!p || v?.relevant !== true) continue
    const background = (['white', 'green'].includes(v.background) ? v.background : 'other') as Candidate['background']
    out.push({
      id: String(p.id), src: `/api/mw-photo?u=${encodeURIComponent(p.url)}`, original: p.url,
      subject: String(v.subject ?? p.alt).slice(0, 120), background, credit: p.credit, creditUrl: p.creditUrl,
    })
  }
  out.sort((x, y) => rank[x.background] - rank[y.background])
  return out.length ? out : { error: `None of the Pexels results for “${query}” actually showed it. Try other words.` }
}

/** Store a finished cut-out (PNG with transparency) and index it. */
export async function librarySave(meta: {
  query: string; subject?: string; method: 'key' | 'model'; sourceId?: string
  credit?: string; creditUrl?: string; width?: number; height?: number
}, png: Uint8Array): Promise<Cutout | { error: string }> {
  if (!supabaseConfigured) return { error: 'Supabase is not configured.' }
  if (png.length < 1000 || png.length > 8_000_000) return { error: 'That cut-out is empty or too large.' }
  // A PNG starts with these eight bytes; anything else is not what we store.
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!sig.every((b, i) => png[i] === b)) return { error: 'That is not a PNG.' }

  const key = photoKey(meta.query)
  const path = `${key}/${meta.sourceId ?? 'x'}-${Date.now().toString(36)}.png`
  const up = await supabase.storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: false })
  if (up.error) return { error: `Could not store the cut-out: ${up.error.message}` }
  const { data, error } = await supabase.from('mw_cutouts').insert({
    key, query: meta.query.slice(0, 200), subject: meta.subject?.slice(0, 200), path,
    width: meta.width, height: meta.height, method: meta.method, source: 'pexels',
    source_id: meta.sourceId, credit: meta.credit?.slice(0, 120), credit_url: meta.creditUrl?.slice(0, 300), uses: 1,
    last_used_at: new Date().toISOString(),
  }).select('id').single()
  if (error) return { error: `Could not index the cut-out: ${error.message}` }
  return { id: data.id, key, url: publicUrl(path), subject: meta.subject, width: meta.width, height: meta.height, credit: meta.credit, creditUrl: meta.creditUrl }
}
