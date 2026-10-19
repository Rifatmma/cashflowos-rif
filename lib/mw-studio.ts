import Anthropic from '@anthropic-ai/sdk'
import { supabase, supabaseConfigured } from './supabase'
import { type Deck, type Format, type Slide, type SlideKind, LIMITS, KICKER_MAX, faults } from './mw-studio-design'

// 👉 Moving Walls → Studio. Topic in, deck out.
//
// Two halves, deliberately separate:
//
//   research()  — what is true about this topic, with sources
//   compose()   — how that becomes slides
//
// Splitting them is what lets the screen show the findings BEFORE anything is
// designed. A post built on a number nobody checked is worse than no post,
// and for a company that sells measurement it is embarrassing. So the facts
// are shown with their sources, and only then does the format question get
// asked.
//
// Research draws on two sources, which was the owner's choice (19 Oct 2026):
// the open web, and Moving Walls' own Search Console. The second one is the
// point — a post about a topic the site already ranks for reinforces a page
// that exists, rather than floating free of everything else being worked on.

const MODEL = 'claude-sonnet-5-5'

export type Fact = {
  claim: string
  /** A real publication or dataset. The model is told never to invent one. */
  source: string
  url?: string
}

export type Research = {
  topic: string
  angle: string
  facts: Fact[]
  /** Pages on movingwalls.com this topic would reinforce. */
  reinforces: string[]
  /** Said plainly when the web search tool was unavailable. */
  caveat?: string
}

function client(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  return apiKey ? new Anthropic({ apiKey }) : null
}

/** The pages Google actually shows, so a post can be pointed at one. */
async function ourPages(limit = 25): Promise<{ url: string; impressions: number }[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase
    .from('mw_gsc_pages')
    .select('url, impressions')
    .order('impressions', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r: any) => ({ url: String(r.url), impressions: Number(r.impressions) || 0 }))
}

/**
 * Pull the first JSON object or array out of a model reply.
 *
 * Asking for "JSON only" works most of the time and fails the rest, usually
 * with a fenced block or a sentence in front. Both are cheap to survive.
 */
function parseJson<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.search(/[[{]/)
  if (start < 0) return null
  // Walk to the matching close rather than regexing — a URL containing a
  // brace in the middle of the payload should not truncate the parse.
  const open = body[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < body.length; i++) {
    const c = body[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === open) depth++
    else if (c === close && --depth === 0) {
      try { return JSON.parse(body.slice(start, i + 1)) as T } catch { return null }
    }
  }
  return null
}

function textOf(res: Anthropic.Message): string {
  return res.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n')
}

/**
 * What is true about this topic.
 *
 * The web search tool is requested, and if the API rejects it the call is
 * retried without and the result says so. A silent fallback to the model's
 * own memory would present a two-year-old figure as this morning's news,
 * which is exactly the failure this whole screen exists to prevent.
 */
export async function research(topic: string): Promise<Research | { error: string }> {
  const a = client()
  if (!a) return { error: 'ANTHROPIC_API_KEY is not set, so nothing can be researched.' }
  const clean = topic.trim().slice(0, 240)
  if (!clean) return { error: 'Type a topic first.' }

  const pages = await ourPages()
  const prompt = `You are researching a topic for a Moving Walls social post. Moving Walls is an
out-of-home (OOH) advertising measurement and technology company operating across South and
Southeast Asia and the Middle East.

TOPIC: ${clean}

Find 4 to 6 specific, checkable facts about this topic — figures, dated events, named studies.
Prefer the last 18 months. Every fact MUST carry a real, named source. If you cannot find a
source for a claim, drop the claim. Never invent a publication, a report name or a statistic.

These are the movingwalls.com pages Google shows most often. If the topic genuinely relates to
any of them, list those URLs under "reinforces" so the post can support a page that already
exists. If none relate, return an empty list rather than forcing a match:
${pages.map(p => `  ${p.url}`).join('\n') || '  (none recorded)'}

Reply with JSON only:
{"angle":"one sentence on the most interesting line to take",
 "facts":[{"claim":"...","source":"publication or dataset name","url":"https://..."}],
 "reinforces":["/locations/..."]}`

  const run = async (withSearch: boolean) => a.messages.create({
    model: MODEL,
    max_tokens: 3000,
    ...(withSearch
      ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as any] }
      : {}),
    messages: [{ role: 'user', content: prompt }],
  })

  let caveat: string | undefined
  let res: Anthropic.Message
  try {
    res = await run(true)
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    // Only fall back for a tool-availability problem. A credit or auth failure
    // must surface — the receipt reader spent a week filing RM 0.00 because a
    // zero balance looked like an unreadable photo.
    if (!/tool|not.*support|invalid.*request/i.test(msg)) {
      return { error: `Research failed: ${msg.slice(0, 180)}` }
    }
    try { res = await run(false) } catch (e2: any) {
      return { error: `Research failed: ${String(e2?.message ?? e2).slice(0, 180)}` }
    }
    caveat = 'Web search was unavailable, so this comes from the model’s own knowledge. Check every figure before posting.'
  }

  const out = parseJson<{ angle?: string; facts?: Fact[]; reinforces?: string[] }>(textOf(res))
  if (!out) return { error: 'The research came back in a shape I could not read. Try rewording the topic.' }

  const facts = (out.facts ?? [])
    .filter(f => f && typeof f.claim === 'string' && typeof f.source === 'string' && f.claim.trim() && f.source.trim())
    .slice(0, 6)
  if (!facts.length) return { error: 'Nothing checkable came back for that topic. Try something more specific.' }

  const known = new Set(pages.map(p => p.url))
  return {
    topic: clean,
    angle: String(out.angle ?? '').slice(0, 300),
    facts,
    // A URL the model made up is worse than none: it sends someone to a 404
    // and quietly implies the page exists. Only paths Google has actually
    // reported survive.
    reinforces: (out.reinforces ?? []).map(String).filter(u => known.has(u)).slice(0, 4),
    caveat,
  }
}

const KINDS: SlideKind[] = ['cover', 'stat', 'point', 'closer']

/** Turn researched facts into slides. */
export async function compose(
  r: Research, format: Format, slideCount = 5,
): Promise<Deck | { error: string }> {
  const a = client()
  if (!a) return { error: 'ANTHROPIC_API_KEY is not set.' }

  const n = format === 'single' ? 1 : Math.min(8, Math.max(3, slideCount))
  const shape = format === 'single'
    ? 'Exactly ONE slide, kind "closer". It has to work alone, so it carries the single strongest fact.'
    : `Exactly ${n} slides. The first is kind "cover". The last is kind "closer" and says what Moving Walls
       thinks, not another statistic. Between them use "stat" for a slide built on a figure and "point"
       for one built on an argument. At least one "stat".`

  const prompt = `Write the copy for a Moving Walls ${format === 'single' ? 'social image' : 'Instagram/LinkedIn carousel'}.

TOPIC: ${r.topic}
ANGLE: ${r.angle}

FACTS — use only these. Do not add a number that is not here:
${r.facts.map((f, i) => `${i + 1}. ${f.claim}  [${f.source}]`).join('\n')}

${shape}

Rules, all of them hard:
- "kicker": a short uppercase label, ${KICKER_MAX} characters MAX.
- "headline": ${LIMITS.cover.headline} characters MAX. Short headlines. Do not pad one to carry a keyword.
- "figure": on a "stat" slide only — the bare number, e.g. "34%" or "2.1x". Nothing else in it.
- "body": one or two plain sentences. Omit it on the cover.
- "source": the source name from the list above, on every slide that states a number.
- "cta": on the cover only, e.g. "Swipe for the numbers →".
- Plain English. No "unlock", "leverage", "game-changer", "in today's landscape".
- Never claim Moving Walls did something the facts do not say it did.

JSON only: {"slides":[{"kind":"cover","kicker":"...","headline":"...","body":"...","figure":"...","source":"...","cta":"..."}]}`

  let res: Anthropic.Message
  try {
    res = await a.messages.create({ model: MODEL, max_tokens: 2500, messages: [{ role: 'user', content: prompt }] })
  } catch (e: any) {
    return { error: `Writing the slides failed: ${String(e?.message ?? e).slice(0, 180)}` }
  }

  const out = parseJson<{ slides?: any[] }>(textOf(res))
  if (!out?.slides?.length) return { error: 'The slides came back unreadable. Try again.' }

  const slides: Slide[] = out.slides.slice(0, n).map((s: any, i: number) => ({
    kind: KINDS.includes(s?.kind) ? s.kind : i === 0 && format === 'carousel' ? 'cover' : 'point',
    kicker: String(s?.kicker ?? r.topic).slice(0, 40),
    headline: String(s?.headline ?? '').trim(),
    body: s?.body ? String(s.body).trim() : undefined,
    figure: s?.figure ? String(s.figure).trim().slice(0, 12) : undefined,
    source: s?.source ? String(s.source).trim().slice(0, 90) : undefined,
    cta: s?.cta ? String(s.cta).trim().slice(0, 40) : undefined,
  })).filter(s => s.headline)

  if (!slides.length) return { error: 'Every slide came back empty.' }
  return { topic: r.topic, format, slides }
}

/**
 * Compose, then check, then fix once.
 *
 * The limits in mw-studio-design are measured from the real layouts, so a
 * headline past them genuinely breaks the slide. Rather than show a broken
 * deck or silently truncate — which cuts a sentence mid-word and looks like a
 * bug — the faults go back to the model once with instructions to shorten.
 * If it still will not fit, the deck is returned WITH its faults listed, so
 * the screen can say what is wrong instead of pretending.
 */
export async function composeChecked(
  r: Research, format: Format, slideCount = 5,
): Promise<{ deck: Deck; faults: string[] } | { error: string }> {
  const first = await compose(r, format, slideCount)
  if ('error' in first) return first
  const bad = faults(first)
  if (!bad.length) return { deck: first, faults: [] }

  const a = client()
  if (!a) return { deck: first, faults: bad }
  try {
    const res = await a.messages.create({
      model: MODEL,
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: `These slides break the layout. Rewrite them SHORTER. Keep the meaning and the sources;
cut words, do not cut facts.

PROBLEMS:
${bad.map(b => `- ${b}`).join('\n')}

SLIDES:
${JSON.stringify(first.slides, null, 1)}

JSON only: {"slides":[...]} in the same shape.`,
      }],
    })
    const out = parseJson<{ slides?: any[] }>(textOf(res))
    if (out?.slides?.length) {
      const fixed: Deck = {
        ...first,
        slides: out.slides.slice(0, first.slides.length).map((s: any, i: number) => ({
          ...first.slides[i],
          kicker: String(s?.kicker ?? first.slides[i].kicker).slice(0, 40),
          headline: String(s?.headline ?? first.slides[i].headline).trim(),
          body: s?.body ? String(s.body).trim() : first.slides[i].body,
        })),
      }
      const still = faults(fixed)
      // Keep whichever attempt is actually better, not whichever came last.
      return still.length <= bad.length ? { deck: fixed, faults: still } : { deck: first, faults: bad }
    }
  } catch { /* the first deck plus its faults is still useful */ }
  return { deck: first, faults: bad }
}
