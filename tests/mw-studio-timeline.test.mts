// A slide's animation must play once.
//   npx -y tsx --conditions=react-server tests/mw-studio-timeline.test.mts
//
//   "Every time it changes the slide from the current slide to next slide
//    the animation played twice."                     (owner, 20 Oct 2026)
//
// He was describing a real thing and the cause was arithmetic, not feel.
// The cross-fade drew the incoming slide with an animation time of 0→0.6 so
// its text started arriving under the outgoing one. Then its own slot began
// and the time was recomputed as `time - index * seconds`, which is zero.
// The text snapped back to invisible and entered a second time.
//
// The invariant that catches it is simple and absolute: ACROSS THE WHOLE
// VIDEO, A GIVEN SLIDE'S ANIMATION CLOCK ONLY EVER GOES FORWARD. Everything
// else here is secondary.

import { layersAt, CROSSFADE } from '../lib/mw-studio-video'
import { TIMING } from '../lib/mw-studio-design'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const FPS = 30

/** Every frame of a video, as the renderers see it. */
function walk(n: number, seconds: number) {
  const frames: { t: number; layers: ReturnType<typeof layersAt> }[] = []
  const total = n * seconds
  for (let f = 0; f < Math.round(total * FPS); f++) {
    const t = f / FPS
    frames.push({ t: +t.toFixed(4), layers: layersAt(t, n, seconds) })
  }
  return frames
}

// ── THE BUG ────────────────────────────────────────────────────────────────
for (const [n, seconds] of [[3, 4], [5, 4], [2, 5], [8, 2.5]] as const) {
  const frames = walk(n, seconds)
  const last = new Map<number, number>()
  let rewound: string | null = null

  for (const { t, layers } of frames) {
    for (const L of layers) {
      const prev = last.get(L.index)
      if (prev !== undefined && L.at < prev - 1e-9) {
        rewound ??= `slide ${L.index} went from ${prev.toFixed(3)}s back to ${L.at.toFixed(3)}s at t=${t}`
      }
      last.set(L.index, L.at)
    }
  }
  is(!rewound, `${n}×${seconds}s: no slide's clock ever rewinds${rewound ? ` — ${rewound}` : ''}`)
}

// ── and it really would have caught the old code ───────────────────────────
//
// The previous implementation, reproduced, so the test is shown to have
// teeth rather than merely passing.
function oldWay(time: number, n: number, seconds: number) {
  const i = Math.min(n - 1, Math.floor(time / seconds))
  const local = time - i * seconds
  const out = [{ index: i, at: local }]
  const into = local - (seconds - CROSSFADE)
  if (into > 0 && i + 1 < n) out.push({ index: i + 1, at: into })
  return out
}
{
  const last = new Map<number, number>()
  let rewound = false
  for (let f = 0; f < 3 * 4 * FPS; f++) {
    for (const L of oldWay(f / FPS, 3, 4)) {
      const prev = last.get(L.index)
      if (prev !== undefined && L.at < prev - 1e-9) rewound = true
      last.set(L.index, L.at)
    }
  }
  is(rewound, 'the previous implementation does rewind — this test would have caught it')
}

// ── the entrance outlives the dissolve, so it is never cut off ─────────────
{
  const entrance = TIMING.in + TIMING.stagger * 2
  is(entrance > CROSSFADE,
    `the entrance (${entrance.toFixed(2)}s) is longer than the dissolve (${CROSSFADE}s), so it carries past the join`)
}

// ── exactly one slide, or two mid-dissolve ─────────────────────────────────
{
  const frames = walk(3, 4)
  is(frames.every(f => f.layers.length === 1 || f.layers.length === 2),
    'never more than two slides on screen at once')
  is(frames[0].layers.length === 1 && frames[0].layers[0].index === 0 && frames[0].layers[0].at === 0,
    'the video opens on slide 1 at the very start of its entrance')

  const dissolving = frames.filter(f => f.layers.length === 2)
  is(dissolving.length > 0, 'a dissolve happens at all')
  is(dissolving.every(f => f.layers[0].alpha === 1),
    'the outgoing slide stays fully opaque underneath — the incoming one does the fading')
  is(dissolving.every(f => f.layers[1].alpha > 0 && f.layers[1].alpha <= 1),
    'the incoming slide is always partly visible once it has started')
  // Two joins in a three-slide video, each CROSSFADE long.
  is(Math.abs(dissolving.length - 2 * CROSSFADE * FPS) <= 2,
    `the dissolves last ${CROSSFADE}s each and no longer`)
}

// ── the dissolve ramps smoothly, with no jump ──────────────────────────────
{
  const alphas = walk(3, 4)
    .filter(f => f.layers.length === 2)
    .filter(f => f.t < 4)            // the first join only
    .map(f => f.layers[1].alpha)
  is(alphas.length > 10, 'the first join has enough frames to judge')
  is(alphas[0] < 0.1, 'it starts from nothing rather than popping in')
  is(alphas[alphas.length - 1] > 0.9, 'and reaches full opacity by the end of the join')
  let worst = 0
  for (let i = 1; i < alphas.length; i++) worst = Math.max(worst, alphas[i] - alphas[i - 1])
  is(worst < 0.1, `no single frame jumps more than 10% of the fade (worst ${(worst * 100).toFixed(1)}%)`)

  // THE STEP AT THE HAND-OVER. The frame after the last dissolve frame
  // draws the incoming slide alone, at full opacity. Whatever opacity the
  // dissolve had reached is therefore a jump, and at full contrast between
  // a dark photograph and a white page a linear fade's 5.5% shortfall
  // measured as a spike of 18.5 grey levels in an otherwise still moment.
  const landed = alphas[alphas.length - 1]
  is(landed > 0.98,
    `the dissolve lands on ${(landed * 100).toFixed(1)}% before the hand-over, so there is no step`)
}

// ── only the last slide animates its text out ──────────────────────────────
//
// Fading the text out AND dissolving the slide is two exits at once, which
// is what a stumble looks like.
{
  const frames = walk(3, 4)
  const seen = new Map<number, number>()
  for (const f of frames) for (const L of f.layers) seen.set(L.index, L.total)
  is(seen.get(0)! > 1e6 && seen.get(1)! > 1e6,
    'slides that dissolve away are given no exit of their own')
  is(seen.get(2)! === 4 + CROSSFADE,
    'the last slide, with nothing to dissolve into, does animate its text out')
}

// ── a single slide still works ─────────────────────────────────────────────
{
  const only = layersAt(0, 1, 4)
  is(only.length === 1 && only[0].total === 4,
    'a one-slide video exits inside its own length rather than running past the end')
}

// ── nothing is dropped at the very end ─────────────────────────────────────
{
  const n = 3, seconds = 4
  const end = layersAt(n * seconds - 1 / FPS, n, seconds)
  is(end.length === 1 && end[0].index === n - 1,
    'the final frame belongs to the last slide and nothing else')
}

console.log(bad ? `\n${bad} failed` : '\nall passed — each slide animates once')
process.exit(bad ? 1 : 0)
