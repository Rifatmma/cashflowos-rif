'use server'

import { research, composeChecked, suggestScript, type Research } from '@/lib/mw-studio'
import { searchPhotos, type Photo } from '@/lib/mw-photos'
import type { Deck, Format, Segment } from '@/lib/mw-studio-design'

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
