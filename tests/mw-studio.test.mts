// The Studio's copy limits and the wrapper.
//   npx -y tsx --conditions=react-server tests/mw-studio.test.mts
//
// Two things are worth testing here and the rest is pixels.
//
// The first is `faults`. Those character limits are measured from the real
// layouts: past them a headline takes an extra line and pushes the body under
// the in-feed crop. If the limits stop being enforced, the failure is a slide
// that looks subtly wrong and nobody can say why.
//
// The second is a rule rather than a measurement — a number on a slide must
// carry a source. Moving Walls sells measurement; posting an unattributed
// statistic is the one mistake the brand cannot afford. It is checked here so
// it cannot be quietly dropped later for being inconvenient.

import { faults, wrap, LIMITS, KICKER_MAX, type Deck } from '../lib/mw-studio-design'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const deck = (slides: Deck['slides'], format: Deck['format'] = 'carousel'): Deck =>
  ({ topic: 'test', format, slides })

// ── a deck that is fine stays quiet ────────────────────────────────────────
is(faults(deck([
  { kind: 'cover', kicker: 'OOH INTELLIGENCE', headline: 'A third of outdoor spend', cta: 'Swipe →' },
  { kind: 'stat', kicker: 'THE SHIFT', headline: 'now trades programmatically', figure: '34%', source: 'IAB 2026' },
  { kind: 'closer', kicker: 'WHAT WE THINK', headline: 'Measurement decides the next budget' },
])).length === 0, 'a well-formed carousel reports nothing')

// ── the limits actually bite ───────────────────────────────────────────────
const longHead = 'x'.repeat(LIMITS.cover.headline + 1)
is(faults(deck([
  { kind: 'cover', kicker: 'OK', headline: longHead },
  { kind: 'stat', kicker: 'OK', headline: 'fine', figure: '1', source: 's' },
  { kind: 'closer', kicker: 'OK', headline: 'fine' },
])).some(f => /Slide 1.*headline/.test(f)), 'a headline one character over is caught, and named by slide')

is(faults(deck([
  { kind: 'cover', kicker: 'x'.repeat(KICKER_MAX + 1), headline: 'fine' },
  { kind: 'stat', kicker: 'OK', headline: 'fine', figure: '1', source: 's' },
  { kind: 'closer', kicker: 'OK', headline: 'fine' },
])).some(f => /kicker/.test(f)), 'an over-long kicker is caught')

// ── the rule that matters most ─────────────────────────────────────────────
is(faults(deck([
  { kind: 'cover', kicker: 'OK', headline: 'fine' },
  { kind: 'stat', kicker: 'OK', headline: 'fine', figure: '34%' },   // no source
  { kind: 'closer', kicker: 'OK', headline: 'fine' },
])).some(f => /Slide 2 carries a number with no source/.test(f)),
  'a figure with no source is a fault, not a nicety')

is(faults(deck([
  { kind: 'cover', kicker: 'OK', headline: 'fine' },
  { kind: 'point', kicker: 'OK', headline: 'fine', figure: '2.1x' }, // not a stat slide, still a number
  { kind: 'closer', kicker: 'OK', headline: 'fine' },
])).some(f => /no source/.test(f)),
  'a number on a non-stat slide needs a source too — the kind does not excuse it')

// ── a stat slide with nothing to state ─────────────────────────────────────
is(faults(deck([
  { kind: 'cover', kicker: 'OK', headline: 'fine' },
  { kind: 'stat', kicker: 'OK', headline: 'fine', source: 's' },
  { kind: 'closer', kicker: 'OK', headline: 'fine' },
])).some(f => /no figure on it/.test(f)), 'a stat slide with no figure is caught')

// ── format rules ───────────────────────────────────────────────────────────
is(faults(deck([
  { kind: 'closer', kicker: 'OK', headline: 'a' },
  { kind: 'closer', kicker: 'OK', headline: 'b' },
], 'single')).some(f => /single image has 2 slides/.test(f)), 'a single image with two slides is caught')

is(faults(deck([
  { kind: 'cover', kicker: 'OK', headline: 'a' },
  { kind: 'closer', kicker: 'OK', headline: 'b' },
])).some(f => /not a carousel/.test(f)), 'a two-slide carousel is caught')

is(faults(deck(
  Array.from({ length: 9 }, () => ({ kind: 'point' as const, kicker: 'OK', headline: 'a' })),
)).some(f => /9 slides/.test(f)), 'a nine-slide carousel is caught')

// ── wrapping ───────────────────────────────────────────────────────────────
//
// wrap() measures real glyphs, so a fake context is used here: every
// character is 10 units wide. That is enough to prove the BREAKING logic,
// which is the part with bugs in it; the measuring is the browser's job.

const fake = {
  measureText: (t: string) => ({ width: t.length * 10 }),
} as unknown as CanvasRenderingContext2D

// "one two" is 70, "one two three" is 130 and breaks; "three four" is exactly
// 100 and fits, because the test is > not >=. That boundary is the whole
// behaviour, so it is asserted rather than approximated.
is(JSON.stringify(wrap(fake, 'one two three four', 100)) === JSON.stringify(['one two', 'three four']),
  'wraps on measured width, and a line exactly at the limit still fits')

is(JSON.stringify(wrap(fake, 'alpha\nbeta', 1000)) === JSON.stringify(['alpha', 'beta']),
  'an explicit newline is honoured even when the line would fit')

is(wrap(fake, 'supercalifragilistic', 50).length === 1,
  'a single word longer than the line is kept whole rather than dropped')

is(wrap(fake, '   spaced    out   ', 1000).join('|') === 'spaced out',
  'runs of whitespace collapse instead of producing empty words')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
