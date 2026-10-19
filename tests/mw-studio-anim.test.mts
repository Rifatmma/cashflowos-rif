// Only the text moves.
//   npx -y tsx --conditions=react-server tests/mw-studio-anim.test.mts
//
//   "The animation will only animate the entry and exit of the text only,
//    most of the element will still be static image."   (owner, 19 Oct 2026)
//
// That is a requirement a reviewer cannot check by eye — a logo drifting two
// pixels over four seconds is invisible in review and obvious once it is on
// LinkedIn. So it is checked mechanically, by recording every drawing call
// with the alpha and vertical offset in force at the time.
//
// THE TEST IS A DIFF, not an absolute check, and the first version of it was
// wrong for exactly that reason. It asserted every call happens at alpha 1,
// which fails on the still: the zigzag is drawn semi-transparent on purpose.
// "Nothing moves" cannot be expressed as "everything is opaque". It has to be
// expressed as "this frame is identical to the still except for the text" —
// which is also the real requirement, stated in the owner's own terms.
//
// TWO PIECES OF TEXT STAY PUT BY DESIGN: the source line and the wordmark.
// They are attribution, not message. A source that fades out while the number
// it supports is still on screen would be worse than no animation at all, so
// footer() is drawn outside every animated block and these tests pin that.

import {
  drawSlide, TIMING, TEMPLATES, CAROUSEL_TEMPLATES, SINGLE_TEMPLATES, templateById,
  type Slide, type Template,
} from '../lib/mw-studio-design'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

type Call = { op: string; text?: string; alpha: number; dy: number }

/**
 * A canvas context that draws nothing and remembers everything.
 *
 * save/restore keep a real stack, because part of what is being asked is
 * whether a transform applied to one block leaked into the next.
 */
function spy() {
  const calls: Call[] = []
  let alpha = 1
  let dy = 0
  const stack: { alpha: number; dy: number }[] = []
  const note = (op: string, text?: string) => calls.push({ op, text, alpha, dy })

  const ctx: any = {
    get globalAlpha() { return alpha },
    set globalAlpha(v: number) { alpha = v },
    font: '', textAlign: '', textBaseline: '',
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
    save() { stack.push({ alpha, dy }) },
    restore() { const p = stack.pop(); if (p) { alpha = p.alpha; dy = p.dy } },
    translate(_x: number, y: number) { dy += y },
    measureText: (t: string) => ({ width: t.length * 11 }),
    fillText: (t: string) => note('text', t),
    clearRect: () => {}, fillRect: () => note('rect'),
    beginPath: () => {}, closePath: () => {},
    moveTo: () => {}, lineTo: () => {}, arcTo: () => {},
    // Path construction and clipping draw nothing, so they record nothing.
    rect: () => {}, clip: () => {},
    fill: () => note('fill'), stroke: () => note('stroke'),
    drawImage: () => note('image'),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  }
  return { ctx: ctx as CanvasRenderingContext2D, calls }
}

const draw = (s: Slide, at?: number, photo?: CanvasImageSource, template?: Template) => {
  const { ctx, calls } = spy()
  drawSlide(
    ctx, s, 'carousel', photo ? { photo } : {},
    at === undefined ? undefined : { at, total: 4 },
    template,
  )
  return calls
}

/** Everything that is not identical between the still and one frame. */
function changed(still: Call[], frame: Call[]): Call[] {
  const out: Call[] = []
  const seen = new Map<string, Call>()
  for (const c of still) seen.set(`${c.op}|${c.text ?? ''}|${seen.size}`, c)
  // Compared positionally: the two draws run the same code in the same order,
  // so a call that has moved is a call at the same index with a different
  // alpha or offset. A call missing entirely (a block not yet arrived) counts
  // as changed too.
  const n = Math.max(still.length, frame.length)
  for (let i = 0; i < n; i++) {
    const a = still[i]
    const b = frame[i]
    if (!a || !b || a.op !== b.op || a.text !== b.text || a.alpha !== b.alpha || a.dy !== b.dy) {
      out.push(b ?? a)
    }
  }
  return out
}

const stat: Slide = {
  kind: 'stat',
  kicker: 'THE SHIFT',
  headline: 'of outdoor budgets now trade programmatically',
  figure: '34%',
  body: 'Up from 19% two years ago.',
  source: 'IAB 2026',
}

const cover: Slide = {
  kind: 'cover',
  kicker: 'OOH INTELLIGENCE',
  headline: 'A third of outdoor spend',
  cta: 'Swipe for the numbers',
  source: 'IAB 2026',
}

// ── mid-hold, an animated frame IS the still ───────────────────────────────
for (const [name, s] of [['stat', stat], ['cover', cover]] as const) {
  is(JSON.stringify(draw(s)) === JSON.stringify(draw(s, 2)),
    `${name}: halfway through, the moving slide is the still it was made from`)
}

// ── THE REQUIREMENT ────────────────────────────────────────────────────────
//
// "Most of the element will still be static image" names three things, and
// they map exactly onto three drawing operations:
//
//   rect    the gradient fields
//   stroke  the MW zigzag and the logo mark
//   image   the photograph
//
// None of them may ever move. This is the assertion that would catch a
// future change making the whole slide animate rather than just its words.
for (const [name, s] of [['stat', stat], ['cover', cover]] as const) {
  const still = draw(s)
  const frame = draw(s, 0.25)

  is(changed(still, frame).length > 0, `${name}: something is actually animating a quarter-second in`)

  for (const op of ['rect', 'stroke', 'image'] as const) {
    const moved = frame.filter(c => c.op === op && c.dy !== 0)
    is(moved.length === 0, `${name}: no ${op} moves — the field, wave, logo and photo are static`)
  }

  // Said the other way round, because the above would also pass if the
  // furniture had simply stopped being drawn at all.
  is(frame.filter(c => c.op !== 'text').length === still.filter(c => c.op !== 'text').length,
    `${name}: the field, the wave and the logo are all still being drawn`)
}

// ── the one deliberate exception, pinned ───────────────────────────────────
//
// The chevron is three filled triangles, not text, and it DOES move — it
// travels with its kicker. That is a decision, not an oversight: a chevron
// hanging in place while its own label flies in reads as a bug. It is
// asserted here so that if someone later decides the opposite, they have to
// change a test that says why.
{
  const frame = draw(stat, 0.25)
  const chevron = frame.filter(c => c.op === 'fill')
  const kicker = frame.find(c => c.op === 'text' && c.text === 'T')
  is(chevron.length === 3, 'the chevron is three shapes')
  is(!!kicker && chevron.every(c => c.alpha === kicker.alpha && c.dy === kicker.dy),
    'the chevron travels with its kicker, exactly in step — the one non-text thing that moves')
}

// ── the photograph never moves ─────────────────────────────────────────────
{
  const img = { width: 1080, height: 1350 } as unknown as CanvasImageSource
  const frame = draw(cover, 0.3, img)
  const photo = frame.filter(c => c.op === 'image')
  is(photo.length === 1 && photo[0].alpha === 1 && photo[0].dy === 0,
    'the cover photograph is drawn once, at rest')
}

// ── attribution is text, and stays put, on purpose ─────────────────────────
for (const at of [0, 0.25, 2, 3.9, 4]) {
  const frame = draw(stat, at)
  const src = frame.find(c => c.op === 'text' && c.text === 'IAB 2026')
  if (!src) { bad++; console.log(`FAIL the source line is missing at ${at}s`); continue }
  is(src.alpha === 1 && src.dy === 0, `at ${at}s the source line is fully visible and still`)
}

// ── blocks arrive in reading order ─────────────────────────────────────────
{
  const frame = draw(stat, TIMING.stagger * 0.5)
  const texts = frame.filter(c => c.op === 'text')
  is(texts.some(c => c.alpha > 0 && c.alpha < 1),
    'the kicker is mid-entrance before anything else has begun')
  is(!texts.some(c => c.text === '34%'),
    'the figure has not started yet — blocks are staggered, not simultaneous')
}

// ── and leave again ────────────────────────────────────────────────────────
{
  const frame = draw(stat, 4 - TIMING.out / 2)
  // The message, as opposed to the attribution drawn by footer().
  const message = frame.filter(c => c.op === 'text' && c.text !== 'IAB 2026' && c.text !== undefined)
    .filter(c => c.dy !== 0 || c.alpha !== 1)
  is(message.length > 0 && message.every(c => c.alpha < 1), 'the message is fading on the way out')
  is(message.every(c => c.dy <= 0), 'the exit lifts rather than drops')
}

// ── nothing of the message is left at the very end ─────────────────────────
{
  const frame = draw(stat, 4)
  const message = frame.filter(c => c.op === 'text' && c.text === '34%')
  is(message.length === 0,
    'at the final frame the message is gone, so one slide cannot bleed into the next')
}

// ── a block cannot leak its transform into the next one ────────────────────
{
  const frame = draw(stat, 0.75)
  is(frame.filter(c => c.op === 'stroke').every(c => c.dy === 0),
    'the logo and wave, drawn around the animated blocks, keep their own position')
}


// ── EVERY TEMPLATE, not just the default ───────────────────────────────────
//
// Five looks multiply the ways this can go wrong, and the requirement is the
// same for all of them: the surface is a static image and only the words
// move. A new template added later gets this check for free, which is the
// point of iterating TEMPLATES rather than listing them.

const img = { width: 1080, height: 1350 } as unknown as CanvasImageSource

for (const t of TEMPLATES) {
  for (const s of [stat, cover]) {
    const still = draw(s, undefined, img, t)
    const frame = draw(s, 0.3, img, t)

    is(changed(still, frame).length > 0,
      `${t.id}/${s.kind}: something animates`)

    for (const op of ['rect', 'stroke', 'image'] as const) {
      is(frame.filter(c => c.op === op && c.dy !== 0).length === 0,
        `${t.id}/${s.kind}: no ${op} moves`)
    }

    is(JSON.stringify(draw(s, 2, img, t)) === JSON.stringify(still),
      `${t.id}/${s.kind}: mid-hold equals the still`)
  }
}

// ── the photograph reaches the templates that asked for one ───────────────
//
// This is the bug that prompted the whole template system: the picture was
// chosen in the UI and then silently never drawn, because only a "cover"
// slide consumed it and a single image is a "closer".
for (const t of TEMPLATES) {
  const drawn = draw({ ...stat, kind: 'closer' }, undefined, img, t).some(c => c.op === 'image')
  if (t.photo === 'every') {
    is(drawn, `${t.id}: says every slide is photographic, and a closer really gets the photo`)
  } else {
    is(!drawn, `${t.id}: does not claim to use a photo on a closer, and does not draw one`)
  }
}

is(templateById('nonsense', 'carousel').id === CAROUSEL_TEMPLATES[0].id,
  'an unknown id falls back to that family default rather than throwing')
is(templateById('nonsense', 'single').id === SINGLE_TEMPLATES[0].id,
  'and the fallback respects the family it was asked for')

// ── NO TWO LOOKS MAY RENDER THE SAME ──────────────────────────────────────
//
// The complaint that produced the split: "Deep, editorial, and air looks the
// same to me in single image." They did not merely look similar — a single
// image is one closer slide, and all three resolved a closer to the same
// primary gradient, so they were byte-identical. A reviewer cannot be
// expected to catch that; a diff can.
for (const [fam, set] of [['single', SINGLE_TEMPLATES], ['carousel', CAROUSEL_TEMPLATES]] as const) {
  const seen = new Map<string, string>()
  const probe: Slide = fam === 'single' ? { ...stat, kind: 'closer' } : stat
  for (const t of set) {
    const key = JSON.stringify(draw(probe, undefined, img, t))
    const clash = seen.get(key)
    is(!clash, `${fam}: ${t.id} renders differently from ${clash ?? 'every other look'}`)
    if (!clash) seen.set(key, t.id)
  }
}

console.log(bad ? `\n${bad} failed` : '\nall passed — only the text moves, in every template')
process.exit(bad ? 1 : 0)
