// The photo picker must never be offered where nothing will draw the result.
//   npx -y tsx --conditions=react-server tests/mw-studio-photo.test.mts
//
// This exact defect has now shipped twice, in two different disguises, and
// both times the person using it chose a photograph and watched it not
// appear. Both times the cause was the same: the code asked a question that
// was easier than the real one.
//
//   v1  showed the picker when SLIDE ONE WAS A COVER.
//       A single image is a closer, so the picker never appeared at all.
//
//   v2  showed the picker when THE TEMPLATE WAS NOT 'none'.
//       Editorial — the default — is 'cover', and a single image has no
//       cover, so the picker appeared and nothing drew the photo.
//
// The real question is "will this deck, in this look, draw a photograph
// anywhere", and that question takes the deck. This file checks every
// template against both formats, so a sixth template or a new slide kind
// cannot reintroduce it quietly.

import {
  TEMPLATES, CAROUSEL_TEMPLATES, SINGLE_TEMPLATES, templatesFor, templateById,
  wantsPhoto, usesPhotoAnywhere, photoTemplatesFor,
  type SlideKind, type FormatFamily,
} from '../lib/mw-studio-design'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

// What each format actually produces — see compose() in lib/mw-studio.ts.
const SINGLE: SlideKind[] = ['closer']
const CAROUSEL: SlideKind[] = ['cover', 'stat', 'point', 'stat', 'closer']

// ── the invariant ──────────────────────────────────────────────────────────
//
// The UI shows the picker exactly when usesPhotoAnywhere is true, so the
// thing to prove is that usesPhotoAnywhere agrees with what drawSlide will
// really do, for every template and both formats.
for (const [fam, kinds] of [['single', SINGLE], ['carousel', CAROUSEL]] as const) {
  for (const t of templatesFor(fam as FormatFamily)) {
    const offered = usesPhotoAnywhere(t, kinds)
    const drawn = kinds.some(k => wantsPhoto(t, k))
    is(offered === drawn,
      `${t.id}/${fam}: the picker is offered exactly when a slide will draw the photo`)
  }
}

// ── the two regressions, named ─────────────────────────────────────────────
// Editorial is now a CAROUSEL look and can no longer reach a single image
// at all — which is the structural fix for the bug, not a patch over it.
is(usesPhotoAnywhere(templateById('editorial', 'carousel'), CAROUSEL) === true,
  'Editorial on a carousel uses a photo, on the cover')
is(templateById('editorial', 'single').family === 'single',
  'asking for a carousel look as a single-image look gives a single-image look back')

// Every single-image look is all-or-nothing, so the v2 bug — a picker shown
// for a look whose only slide role never takes a photo — cannot recur.
for (const t of SINGLE_TEMPLATES) {
  is(t.photo !== 'cover',
    `${t.id}: a single-image look never says 'cover', which a single image does not have`)
}
is(usesPhotoAnywhere(templateById('poster', 'single'), SINGLE) === true,
  'Poster uses a photo on a single image')
is(usesPhotoAnywhere(templateById('inset', 'single'), SINGLE) === true,
  'Inset card uses a photo on a single image')

// ── there is always a way out ──────────────────────────────────────────────
//
// When the chosen look will not use a picture, the screen names the ones
// that would. That advice has to be true, and non-empty, or it is worse
// than silence.
for (const [fam, kinds] of [['single', SINGLE], ['carousel', CAROUSEL]] as const) {
  const f = fam as FormatFamily
  const names = photoTemplatesFor(kinds, f)
  is(names.length > 0, `${fam}: at least one look is suggested for using a photograph`)
  const set = templatesFor(f)
  is(set.filter(t => names.includes(t.name)).every(t => usesPhotoAnywhere(t, kinds)),
    `${fam}: every look it suggests really does use a photograph`)
  is(set.filter(t => usesPhotoAnywhere(t, kinds) && !names.includes(t.name)).length === 0,
    `${fam}: no look that uses a photograph is left out of the advice`)
  is(set.every(t => t.family === f), `${fam}: only looks from its own family are offered`)
}

// ── 'none' means none ──────────────────────────────────────────────────────
for (const t of TEMPLATES.filter(t => t.photo === 'none')) {
  is(!usesPhotoAnywhere(t, CAROUSEL) && !usesPhotoAnywhere(t, SINGLE),
    `${t.id}: says it uses no photography, and uses none on either format`)
}

is(CAROUSEL_TEMPLATES.length === 5 && SINGLE_TEMPLATES.length === 5,
  'five looks for each format, as asked')
is(new Set(TEMPLATES.map(t => t.id)).size === TEMPLATES.length,
  'every look has its own id across both sets')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
