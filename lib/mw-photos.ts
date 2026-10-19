// 👉 Stock photography for the cover slide.
//
// Pexels, because it is free, commercial use is allowed without a release,
// and it does not require attribution in the image — though it asks for the
// photographer to be credited, which we carry on the deck so whoever posts
// can put it in the caption.
//
// THE KEY LIVES IN THE ENVIRONMENT. It was previously written in plain text
// inside a local skill file; that is fine on one machine and wrong in a repo.
// PEXELS_API_KEY on Vercel, nowhere else.
//
// TWO THINGS THAT WILL BITE WHOEVER TOUCHES THIS NEXT:
//
//  1. Pexels returns 403 without a User-Agent header. No message, no hint.
//  2. Pexels NEVER says "no match". A search for a term it does not know
//     returns confident, well-lit, completely unrelated photographs. So the
//     alt text comes back with every result and is shown in the picker —
//     the only way anyone can tell "billboard at dusk" from "a woman at a
//     desk" before it is on the cover.

const ENDPOINT = 'https://api.pexels.com/v1/search'

export type Photo = {
  id: number
  /** Proxied, not the Pexels URL — see /api/mw-photo. */
  src: string
  /** What Pexels says the picture is of. Shown, because it is often wrong. */
  alt: string
  credit: string
  creditUrl: string
}

/** Same-origin proxy path, so the canvas is never tainted. */
export function proxied(pexelsUrl: string): string {
  return `/api/mw-photo?u=${encodeURIComponent(pexelsUrl)}`
}

export async function searchPhotos(topic: string, per = 8): Promise<Photo[]> {
  const key = process.env.PEXELS_API_KEY?.trim()
  if (!key) return []

  // The topic as typed is a sentence; Pexels wants a subject. Strip the
  // question words and keep the nouns, or every search returns office stock.
  const q = topic
    .replace(/\b(what|why|how|when|is|are|the|a|an|of|in|on|for|to|and|do|does)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ') || topic

  const url = `${ENDPOINT}?query=${encodeURIComponent(q)}&per_page=${per}&orientation=portrait&size=large`
  const res = await fetch(url, {
    headers: { Authorization: key, 'User-Agent': 'MovingWallsStudio/1.0' },
    // Pexels results for a term do not change minute to minute, and the tab
    // is used in bursts.
    next: { revalidate: 3600 },
  })
  if (!res.ok) return []

  const data = await res.json().catch(() => null) as any
  return (data?.photos ?? []).map((p: any): Photo => ({
    id: Number(p.id),
    src: proxied(String(p.src?.large2x ?? p.src?.large ?? p.src?.original ?? '')),
    alt: String(p.alt ?? '').trim() || '(Pexels gave no description for this one)',
    credit: String(p.photographer ?? 'Unknown'),
    creditUrl: String(p.photographer_url ?? ''),
  })).filter((p: Photo) => p.src.length > 20)
}
