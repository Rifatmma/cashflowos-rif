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
  TEMPLATES, templateById, wantsPhoto, usesPhotoAnywhere, photoTemplatesFor,
  type SlideKind,
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
for (const t of TEMPLATES) {
  for (const [name, kinds] of [['single', SINGLE], ['carousel', CAROUSEL]] as const) {
    const offered = usesPhotoAnywhere(t, kinds)
    const drawn = kinds.some(k => wantsPhoto(t, k))
    is(offered === drawn,
      `${t.id}/${name}: the picker is offered exactly when a slide will draw the photo`)
  }
}

// ── the two regressions, named ─────────────────────────────────────────────
is(usesPhotoAnywhere(templateById('editorial'), SINGLE) === false,
  'v2 regression: Editorial on a single image does NOT claim it will use a photo')
is(usesPhotoAnywhere(templateById('editorial'), CAROUSEL) === true,
  'Editorial on a carousel does use one, on the cover')
is(usesPhotoAnywhere(templateById('bleed'), SINGLE) === true,
  'v1 regression: Full bleed on a single image DOES use a photo, picker or no cover')
is(usesPhotoAnywhere(templateById('split'), SINGLE) === true,
  'Split on a single image uses a photo')

// ── there is always a way out ──────────────────────────────────────────────
//
// When the chosen look will not use a picture, the screen names the ones
// that would. That advice has to be true, and non-empty, or it is worse
// than silence.
for (const [name, kinds] of [['single', SINGLE], ['carousel', CAROUSEL]] as const) {
  const names = photoTemplatesFor(kinds)
  is(names.length > 0, `${name}: at least one look is suggested for using a photograph`)
  const ids = TEMPLATES.filter(t => names.includes(t.name)).map(t => t.id)
  is(ids.every(id => usesPhotoAnywhere(templateById(id), kinds)),
    `${name}: every look it suggests really does use a photograph`)
  const missed = TEMPLATES.filter(t => usesPhotoAnywhere(t, kinds) && !names.includes(t.name))
  is(missed.length === 0, `${name}: no look that uses a photograph is left out of the advice`)
}

// ── 'none' means none ──────────────────────────────────────────────────────
for (const t of TEMPLATES.filter(t => t.photo === 'none')) {
  is(!usesPhotoAnywhere(t, CAROUSEL) && !usesPhotoAnywhere(t, SINGLE),
    `${t.id}: says it uses no photography, and uses none on either format`)
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
