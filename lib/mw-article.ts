import Anthropic from '@anthropic-ai/sdk'
import type { Research, Fact } from './mw-studio'

// 👉 Turning an article we already published into post material.
//
// The Studio could research a topic from scratch or take words typed by
// hand. The third case is the commonest one in practice: there is already a
// post on the site saying the thing, and it needs to become a carousel, an
// image or a film.
//
// This reads the article and returns the SAME shape the open-web research
// returns, so everything downstream — the fact list, the composer, the film
// script — works unchanged. The only difference is where the facts came
// from, and that difference shows up honestly in the source line on every
// slide: the article, by name.

const SITE = 'https://www.movingwalls.com'
const MODEL = 'claude-sonnet-5-5'

/**
 * Only our own site.
 *
 * Not a formality. A server action that fetches whatever URL it is handed
 * will happily fetch an internal address and hand the response back, so the
 * host is checked against an exact list rather than a pattern. It also
 * matches what this is for: turning Moving Walls articles into posts.
 */
const ALLOWED = new Set(['www.movingwalls.com', 'movingwalls.com'])

export function articleUrl(input: string): string | null {
  let u: URL
  try { u = new URL(input.trim()) } catch {
    // A pasted path rather than a full address is the likely slip, so it is
    // accepted rather than rejected on a technicality.
    try { u = new URL(input.trim().replace(/^\/+/, '/'), SITE) } catch { return null }
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!ALLOWED.has(u.hostname)) return null
  u.protocol = 'https:'
  u.hash = ''
  return u.toString()
}

/** Visible text, with the furniture taken out. */
function clean(html: string): string {
  return html
    // Spelled out rather than using a backreference: a `\1` written through
    // a shell heredoc once arrived in this codebase as the byte 0x01, so
    // the crawl silently indexed JSON-LD instead of article text for days.
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type Article = { url: string; title: string; text: string }

export async function fetchArticle(input: string): Promise<Article | { error: string }> {
  const url = articleUrl(input)
  if (!url) {
    return { error: 'That needs to be a movingwalls.com address — paste the article’s URL.' }
  }
  let html: string
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MovingWallsStudio)' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!r.ok) return { error: `The page came back ${r.status}. Check the address.` }
    html = await r.text()
  } catch (e: any) {
    return { error: `Could not fetch that page: ${String(e?.message ?? e).slice(0, 120)}` }
  }

  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
    .replace(/\s*[|–-]\s*Moving Walls.*$/i, '').trim()
  const text = clean(html)
  if (text.length < 400) {
    return { error: 'There is almost no text on that page — is it the article itself?' }
  }
  return { url, title: title || url, text: text.slice(0, 18_000) }
}

/**
 * Read the article and pull out what a post could be built on.
 *
 * Deliberately stricter than the open-web research: it may use ONLY what
 * the article says. An explainer that quietly adds a figure the article
 * never carried is worse than one that is thin, because the article is the
 * thing a reader will check it against.
 */
export async function researchArticle(input: string): Promise<Research | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY is not set.' }

  const got = await fetchArticle(input)
  if ('error' in got) return got

  const a = new Anthropic({ apiKey })
  const prompt = `Below is a Moving Walls article. Pull out what a short social post or explainer
video could be built on.

USE ONLY WHAT THIS ARTICLE SAYS. Do not add a figure, a date or a claim from anywhere else,
including your own knowledge. If the article does not give a number, do not supply one.

TITLE: ${got.title}
URL: ${got.url}

ARTICLE:
${got.text}

Return 4 to 7 findings. Prefer the specific over the general: a figure with its context beats a
sentence of positioning. Where the article names a case study or a result, that is usually the
strongest material.

For "source", say where inside the article it comes from in a few words — for example
"Lancôme case study" or "IAB forecast, cited in the article" — because every slide prints it.

Reply with JSON only:
{"angle":"one sentence on the most interesting line to take",
 "facts":[{"claim":"...","source":"..."}]}`

  let res: Anthropic.Message
  try {
    res = await a.messages.create({ model: MODEL, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] })
  } catch (e: any) {
    return { error: `Reading the article failed: ${String(e?.message ?? e).slice(0, 160)}` }
  }

  const raw = res.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n')
  const out = parseFirst<{ angle?: string; facts?: Fact[] }>(raw, 'facts')
  if (!out?.facts?.length) {
    return {
      error: res.stop_reason === 'max_tokens'
        ? 'The article was too long to read in one pass. Try a shorter one.'
        : 'I could not get anything postable out of that page.',
    }
  }

  const facts = out.facts
    .filter(f => f && typeof f.claim === 'string' && f.claim.trim())
    .slice(0, 7)
    .map(f => ({
      claim: String(f.claim).trim(),
      // Everything here traces to one article, so the source line names it
      // rather than leaving a reader to wonder.
      source: f.source ? `${String(f.source).trim()} · ${got.title}` : got.title,
      url: got.url,
    }))

  if (!facts.length) return { error: 'Nothing checkable came out of that article.' }

  return {
    topic: got.title,
    angle: String(out.angle ?? '').slice(0, 300),
    facts,
    // The article itself is the page this post should send people back to.
    reinforces: [new URL(got.url).pathname],
  }
}

/** The same keyed JSON reader the topic research uses, kept local to avoid a cycle. */
function parseFirst<T>(text: string, want: string): T | null {
  const bodies: string[] = []
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) bodies.push(m[1])
  bodies.push(text)
  let best: { value: unknown; size: number } | null = null
  for (const body of bodies) {
    for (let i = 0; i < body.length; i++) {
      if (body[i] !== '{') continue
      let depth = 0, inStr = false, esc = false, end = -1
      for (let k = i; k < body.length; k++) {
        const c = body[k]
        if (esc) { esc = false; continue }
        if (inStr && c === '\\') { esc = true; continue }
        if (c === '"') { inStr = !inStr; continue }
        if (inStr) continue
        if (c === '{') depth++
        else if (c === '}' && --depth === 0) { end = k; break }
      }
      if (end < 0) continue
      try {
        const value = JSON.parse(body.slice(i, end + 1))
        if (value && typeof value === 'object' && want in value) {
          const size = end - i
          if (!best || size > best.size) best = { value, size }
        }
      } catch { /* next */ }
    }
  }
  return best ? (best.value as T) : null
}
