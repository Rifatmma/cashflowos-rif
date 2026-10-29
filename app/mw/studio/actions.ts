'use server'

import { research, composeChecked, suggestScript, type Research } from '@/lib/mw-studio'
import { searchPhotos, type Photo } from '@/lib/mw-photos'
import { researchArticle } from '@/lib/mw-article'
import type { Deck, Format, Segment } from '@/lib/mw-studio-design'
import { writeBrandFilm } from '@/lib/mw-brandfilm-write'
import { speakAll, type SpokenLine } from '@/lib/mw-brandfilm-voice'
import type { Audience, Plan, SubLang } from '@/lib/mw-brandfilm'
import { readLocation, type LocationRead } from '@/lib/mw-locations'
import { writeLocationFilm } from '@/lib/mw-locationfilm-write'

// Server actions for the Studio tab. Three steps, each returning on its own,
// because the whole point of the screen is that you see the facts before a
// design exists.

export type ResearchResult = { ok: true; research: Research; photos: Photo[] } | { ok: false; error: string }

export async function researchTopic(topic: string): Promise<ResearchResult> {
  const r = await research(topic)
  if ('error' in r) return { ok: false, error: r.error }
  // Photos are fetched alongside rather than after: the cover needs one, and
  // asking for it later would add a second wait in the middle of the flow.
  // A failure here is not fatal — the cover falls back to the blue field.
  const photos = await searchPhotos(r.topic).catch(() => [] as Photo[])
  return { ok: true, research: r, photos }
}

export type ComposeResult =
  | { ok: true; deck: Deck; faults: string[] }
  | { ok: false; error: string }

export async function composeDeck(
  r: Research, format: Format, slides: number, template: string,
): Promise<ComposeResult> {
  const out = await composeChecked(r, format, slides, template)
  if ('error' in out) return { ok: false, error: out.error }
  return { ok: true, deck: out.deck, faults: out.faults }
}

export type ScriptResult =
  | { ok: true; segments: Segment[]; faults: string[] }
  | { ok: false; error: string }

/** First-draft words for a film, taken from the research he has already read. */
export async function suggestFilmScript(r: Research, beats: number): Promise<ScriptResult> {
  const out = await suggestScript(r, beats)
  if ('error' in out) return { ok: false, error: out.error }
  return { ok: true, segments: out.segments, faults: out.faults }
}

export type ArticleResult =
  | { ok: true; research: Research; photos: Photo[] }
  | { ok: false; error: string }

/**
 * Build a post from something already published on movingwalls.com.
 *
 * Returns the same shape as topic research, so every step after this one —
 * the fact list, the look, the composer, the film script — is unchanged.
 * What differs is only where the facts came from, and that shows on the
 * slides: the source line names the article.
 */
export async function researchArticleUrl(url: string): Promise<ArticleResult> {
  const r = await researchArticle(url)
  if ('error' in r) return { ok: false, error: r.error }
  const photos = await searchPhotos(r.topic).catch(() => [] as Photo[])
  return { ok: true, research: r, photos }
}

// ------------------------------------------------------------ brand video

export type BrandPlanResult = { ok: true; plan: Plan; notes: string[] } | { ok: false; error: string }

/** Ava's script and the scene under each line, written from the article. */
export async function writeBrandVideo(
  r: Research, audience: Audience, lang: SubLang, seconds: number, recentArts: string[] = [],
): Promise<BrandPlanResult> {
  const out = await writeBrandFilm(r, audience, lang, seconds, recentArts.map(String).slice(0, 20))
  if ('error' in out) return { ok: false, error: out.error }
  return { ok: true, plan: out.plan, notes: out.notes }
}

export type VoiceResult = { ok: true; lines: SpokenLine[] } | { ok: false; error: string }

/** Ava reads every line; each comes back as mp3 with its word timings. */
export async function speakBrandVideo(lines: string[], lang: SubLang = 'none'): Promise<VoiceResult> {
  const clean = lines.map(l => String(l ?? '').trim().slice(0, 240)).filter(Boolean).slice(0, 10)
  if (!clean.length) return { ok: false, error: 'There is nothing for Ava to say.' }
  try {
    return { ok: true, lines: await speakAll(clean, lang === 'zh-voice' ? 'xiaoxiao' : 'ava') }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 220) }
  }
}

// ------------------------------------------------------- location video

export type LocationResult = { ok: true; read: LocationRead } | { ok: false; error: string }

/** Every site on a /locations page (and the pages it links to) with a photo, reach and impressions. */
export async function readLocationPage(url: string): Promise<LocationResult> {
  const r = await readLocation(String(url ?? '').slice(0, 300))
  if ('error' in r) return { ok: false, error: r.error }
  return { ok: true, read: r }
}

/**
 * Ava's script and a card per chosen site. The page is read again here
 * rather than trusting sites sent from the browser, so the numbers on the
 * cards are always the page's own.
 */
export async function writeLocationVideo(url: string, siteIds: string[], lang: SubLang = 'none'): Promise<BrandPlanResult> {
  const r = await readLocation(String(url ?? '').slice(0, 300))
  if ('error' in r) return { ok: false, error: r.error }
  const all = r.cities.flatMap(c => c.sites)
  const ids = (Array.isArray(siteIds) ? siteIds : []).map(String).slice(0, 6)
  const sites = ids.map(id => all.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s)
  if (!sites.length) return { ok: false, error: 'None of those sites is on the page any more. Read it again.' }
  const cities = [...new Set(sites.map(s => s.city))]
  const label = r.cities.filter(c => cities.includes(c.city)).map(c => c.label).join(' & ')
  const pages = r.pages.filter(p => p.kind === 'country' || cities.includes(p.city))
  const out = await writeLocationFilm(label, pages, sites, lang === 'zh-voice' ? 'zh-voice' : 'none')
  if ('error' in out) return { ok: false, error: out.error }
  return { ok: true, plan: out.plan, notes: out.notes }
}

// ---------------------------------------------------------------------------
// The check before an export (lib/mw-video-audit.ts runs in the browser; these
// two read). Nothing is written here — the upload, the email and the inbox row
// are in app/mw/actions.ts.
// ---------------------------------------------------------------------------

/** The article's text, for the audit's figure and cut-off checks. */
export async function videoSourceText(url: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const { fetchArticle } = await import('@/lib/mw-article')
  const got = await fetchArticle(url)
  return 'error' in got ? { ok: false, error: got.error } : { ok: true, text: got.text.slice(0, 40_000) }
}

/** Claude looks at one settled frame per scene and reads the script against the source. */
export async function reviewExport(input: import('@/lib/mw-video-review').ReviewInput) {
  const { reviewVideo } = await import('@/lib/mw-video-review')
  if (input.frames.length > 16) return { error: 'Too many frames.' }
  return reviewVideo(input)
}
