import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { VIDEO_LESSONS } from './mw-video-lessons'
import { fixClass, type Finding, type Severity } from './mw-video-audit'

// 👉 The look a person would give an export, done by Claude before Rif sees it.
//
// The layout audit measures what was drawn; it cannot read. On the first
// 5-article test three real defects were found only by looking at the frames
// ("3050%", words cut mid-way, a chart icon drawn as a bare "L") and two only by
// reading the script against the article (a comparison without its "than",
// "Feature 1, 2, 4"). This sends one settled frame per scene, the script and
// the article, and asks for exactly that review. Copy findings come back as
// `approve` (the Studio never rewrites what a video says on its own).

const MODEL = 'claude-sonnet-5-5'

export type ReviewInput = {
  title: string
  format: string
  lines: string[]
  /** One per scene: its label ("3 panel · donut") and the words it shows. */
  scenes: { label: string; words: string[] }[]
  /** JPEG frames, base64 without the data: prefix, one per scene, in order. */
  frames: string[]
  /** The article or page text the video is made from. */
  source: string
}

const SEV = new Set<Severity>(['blocker', 'should fix', 'nice to have'])

export async function reviewVideo(r: ReviewInput): Promise<{ findings: Finding[] } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY is not set.' }
  const content: Anthropic.ContentBlockParam[] = [{
    type: 'text',
    text: `Review this Moving Walls video before it is handed over: "${r.title}" (${r.format}).

Ava's script, one line per scene:
${r.lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

The words each scene puts on screen:
${r.scenes.map(s => `${s.label}: ${s.words.map(w => `“${w}”`).join(' · ') || '(none)'}`).join('\n')}

The source it must be true to:
<source>
${r.source.slice(0, 14_000)}
</source>

Then one frame per scene follows, in order, each taken once the scene has settled.

Report only real problems, each once:
- claim: stronger than the source, a comparison without what it is compared with, a forecast shown as a fact, a figure not in the source or different from it
- copy: spelling, a word cut off, numbered labels with a gap, a line that will not make sense on its own
- visual: something that looks broken or wrong in a frame — a missing part of an icon or chart, text over text, a stray mark, a clipped photo, an illustration that says the wrong thing
Not taste, not things that are fine.

Answer with JSON only: {"findings":[{"severity":"blocker|should fix|nice to have","kind":"claim|copy|visual","scene":"<the scene label>","text":"<the words on screen it is about, if any>","detail":"<what is wrong, and the fix: for claim/copy the exact wording you propose>","rule":"<the rule, short>"}]}. An empty list is a fine answer.`,
  }]
  r.frames.forEach((b64, i) => {
    content.push({ type: 'text', text: `Frame — ${r.scenes[i]?.label ?? `scene ${i + 1}`}:` })
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })
  })
  try {
    const a = new Anthropic({ apiKey })
    const res = await a.messages.create({
      model: MODEL, max_tokens: 3000,
      system: `You are the creative QA for Moving Walls' videos. These are the mistakes past audits found; check for them first.\n\n${VIDEO_LESSONS}`,
      messages: [{ role: 'user', content }],
    })
    const body = res.content.map(c => (c.type === 'text' ? c.text : '')).join('')
    const i = body.indexOf('{'), j = body.lastIndexOf('}')
    const parsed = i >= 0 && j > i ? JSON.parse(body.slice(i, j + 1)) : { findings: [] }
    const findings: Finding[] = (Array.isArray(parsed.findings) ? parsed.findings : []).slice(0, 20).map((q: any) => {
      const kind = ['claim', 'copy', 'visual'].includes(q.kind) ? q.kind : 'visual'
      return {
        severity: SEV.has(q.severity) ? q.severity : 'should fix', kind, source: 'review' as const,
        fix: kind === 'visual' ? 'auto' : fixClass('copy'),
        scene: String(q.scene ?? '').slice(0, 60), t: null, text: String(q.text ?? '').slice(0, 120),
        detail: String(q.detail ?? '').slice(0, 500), rule: String(q.rule ?? '').slice(0, 160),
      }
    })
    return { findings }
  } catch (e: any) {
    return { error: `The review did not run: ${String(e?.message ?? e).slice(0, 160)}` }
  }
}
