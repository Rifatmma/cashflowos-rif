// The source line must never reach the logo.
//   npx -y tsx --conditions=react-server tests/mw-studio-footer.test.mts
//
//   "I can see the source reference on the bottom sometimes when it's too
//    long it will overlap the logo. I want it to continue on the next line."
//                                                   (owner, 20 Oct 2026)
//
// It was one fillText at the full frame width, with the wordmark sitting in
// that same space — so any attribution past about forty characters ran
// straight through it. Real ones are longer than that: "invidis, reporting
// the WOO Global pDooH Expenditure Study (Sept 2026)" is eighty.
//
// The invariant is simply that every line fits the room left beside the
// mark, and that is checkable without a canvas.

import { sourceLines, sourceWidth, SIZE } from '../lib/mw-studio-design'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

// 22px Poppins averages near 11px a character for this kind of text. The
// exact figure does not matter — what is being tested is the BREAKING, and
// the browser does the measuring for real.
const PER_CHAR = 11
const ctx = {
  measureText: (t: string) => ({ width: t.length * PER_CHAR }),
  save() {}, restore() {}, font: '',
} as unknown as CanvasRenderingContext2D

const REAL_SOURCES = [
  'IAB 2026',
  'IAB Outlook 2026',
  'Mordor Intelligence, South East Asia Digital Out-of-Home Market report (2026–2031)',
  'invidis, reporting the WOO (World Out of Home Organization) Global pDooH Expenditure Study (Sept 2026)',
  'Yahoo Finance, “Programmatic DOOH Finally Has Global Number: $1.34B”',
  'Nord & Smith, The State of OOH in Indonesia 2026 (citing Mordor Intelligence)',
]

for (const format of ['carousel', 'single', 'reel'] as const) {
  const { w } = SIZE[format]
  const room = sourceWidth(w)
  is(room > 300, `${format}: there is a sensible amount of room beside the logo (${room}px)`)

  for (const src of REAL_SOURCES) {
    const ls = sourceLines(ctx, src, w)
    const widest = Math.max(...ls.map(l => l.length * PER_CHAR))
    is(widest <= room,
      `${format}: "${src.slice(0, 34)}…" fits in ${ls.length} line${ls.length === 1 ? '' : 's'}`)
  }
}

// ── the regression, stated plainly ─────────────────────────────────────────
{
  const { w } = SIZE.carousel
  const long = REAL_SOURCES[3]
  // What the old code did: one line, whatever its width.
  is(long.length * PER_CHAR > sourceWidth(w),
    'the longest real source WOULD have overrun as a single line — the bug was real')
  is(sourceLines(ctx, long, w).length > 1, 'and it is now broken over more than one line')
}

// ── a short one is still a single line ─────────────────────────────────────
is(sourceLines(ctx, 'IAB 2026', SIZE.carousel.w).length === 1,
  'a short source is left alone on one line')

// ── nothing runs away ──────────────────────────────────────────────────────
{
  const { w } = SIZE.carousel
  const silly = 'word '.repeat(200)
  const ls = sourceLines(ctx, silly, w)
  is(ls.length <= 3, `an absurd source is capped at three lines, not ${ls.length}`)
  is(ls[ls.length - 1].endsWith('…'), 'and says it was cut rather than ending mid-sentence')
}

// ── an unbroken token cannot overhang ──────────────────────────────────────
//
// wrap() keeps a word longer than the line whole, which is right for a
// headline and wrong here: a URL would hang over the mark.
{
  const { w } = SIZE.carousel
  const url = 'https://www.mordorintelligence.com/industry-reports/south-east-asia-digital-out-of-home-market'
  const ls = sourceLines(ctx, url, w)
  is(Math.max(...ls.map(l => l.length * PER_CHAR)) <= sourceWidth(w),
    'a single unbroken URL is trimmed to the room it has rather than overhanging')
  is(ls.some(l => l.endsWith('…')), 'and is marked as trimmed')
}

// ── the empty case ─────────────────────────────────────────────────────────
is(sourceLines(ctx, '', SIZE.carousel.w).length === 0, 'no source means no lines')

console.log(bad ? `\n${bad} failed` : '\nall passed — the source never reaches the logo')
process.exit(bad ? 1 : 0)
