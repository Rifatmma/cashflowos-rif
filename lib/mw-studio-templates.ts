// 👉 Ten looks: five built for a carousel, five built for a single image.
//
// THEY USED TO BE ONE SET OF FIVE AND THAT WAS WRONG.
//
// A template described how each SLIDE ROLE should look — cover, stat, point,
// closer — which is a carousel's vocabulary. A single image is one slide of
// role "closer", so single images fell through whatever each template
// happened to say about closers. Three of the five said "primary gradient",
// so Deep, Editorial and Air rendered a single image BYTE FOR BYTE
// IDENTICALLY. The owner reported them as looking the same; they were the
// same. And Editorial's "photo on the cover" meant a single image got no
// photograph at all, because it has no cover.
//
// Splitting the sets fixes both at the root rather than patching around
// them. A single-image look now answers for its own whole design, including
// whether it is photographic, and the format is chosen before the look so
// only the applicable five are ever offered.
//
// Everything is from the Visual Identity Guidelines, p11-13. What varies is
// which of the guide's own surfaces carries the design:
//
//   Primary gradient    #2554A2 → #1B1E2B      large areas, white type
//   Secondary gradient  #BFE7FB → #66C9F3      large areas, navy type
//   White                                      the default page
//   Photography         under a navy scrim
//
// Sunburst, Crimson and Emerald stay where the guide puts them: supporting
// accents, never a field — the chevron, a 132px rule, and the cover pill.

export type SurfaceKind = 'paper' | 'field' | 'light' | 'photo' | 'split' | 'card'

export type Surface = {
  kind: SurfaceKind
  /** Type is drawn light when true. Decided here, never guessed at draw time. */
  onDark: boolean
  /** Where the zigzag divider sits, as a fraction of height. null = no wave. */
  wave: number | null
  /** 'split' only: how much of the frame the photograph takes. */
  photoShare?: number
  /** A band of primary gradient across the top, as a fraction of height. */
  band?: number
  /** 'card' only: where the white panel starts, as a fraction of height. */
  cardTop?: number
}

export type SlideKind = 'cover' | 'stat' | 'point' | 'closer'

/** A single image is one slide; a carousel is a sequence. */
export type FormatFamily = 'single' | 'carousel'

export type Template = {
  id: string
  name: string
  /** Which family it belongs to. A look is never offered to the wrong one. */
  family: FormatFamily
  /** One line for the picker. Says what it is FOR, not what it looks like. */
  blurb: string
  /**
   *   'every'  every slide is photographic — needs a good picture
   *   'cover'  only the opening slide (carousel only; meaningless alone)
   *   'none'   no photography at all
   */
  photo: 'every' | 'cover' | 'none'
  surfaceFor: (kind: SlideKind) => Surface
}

const paper = (band?: number): Surface =>
  ({ kind: 'paper', onDark: false, wave: band ?? null, band })
const plain = (wave: number | null = 0.97): Surface =>
  ({ kind: 'paper', onDark: false, wave })
const field = (wave: number | null = 0.98): Surface =>
  ({ kind: 'field', onDark: true, wave })
const lightS = (wave: number | null = 0.98): Surface =>
  ({ kind: 'light', onDark: false, wave })
const photoS = (wave: number | null = 0.98): Surface =>
  ({ kind: 'photo', onDark: true, wave })
const splitS = (share = 0.46): Surface =>
  ({ kind: 'split', onDark: false, wave: share, photoShare: share })
const cardS = (cardTop = 0.5): Surface =>
  ({ kind: 'card', onDark: false, wave: null, cardTop })

// ────────────────────────────────────────────────────────── carousel looks
//
// Here the slide ROLE genuinely varies — a cover is not a data slide — so
// each look still answers per role. Air no longer falls back to the primary
// gradient on its closer, which is half of why it was indistinguishable
// from Deep.

export const CAROUSEL_TEMPLATES: Template[] = [
  {
    id: 'editorial',
    name: 'Editorial',
    family: 'carousel',
    blurb: 'White pages under a blue band, photo on the cover. The default for data.',
    photo: 'cover',
    surfaceFor: k =>
      k === 'cover' ? photoS(0.98)
      : k === 'closer' ? field()
      : paper(0.222),
  },
  {
    id: 'bleed',
    name: 'Full bleed',
    family: 'carousel',
    blurb: 'Every slide a photograph under a navy scrim. Strongest in a feed.',
    photo: 'every',
    surfaceFor: () => photoS(0.98),
  },
  {
    id: 'split',
    name: 'Split',
    family: 'carousel',
    blurb: 'Photograph on top, white panel beneath. Long text still reads.',
    photo: 'every',
    surfaceFor: () => splitS(),
  },
  {
    id: 'deep',
    name: 'Deep',
    family: 'carousel',
    blurb: 'Solid brand gradient throughout. Use when the words are the point.',
    photo: 'none',
    surfaceFor: () => field(),
  },
  {
    id: 'air',
    name: 'Air',
    family: 'carousel',
    blurb: 'Pale blue throughout with navy type. Light and quiet.',
    photo: 'none',
    // Every slide pale, including the closer. Letting the closer fall back
    // to the primary gradient is what made this identical to Deep.
    surfaceFor: () => lightS(),
  },
]

// ──────────────────────────────────────────────────────── single-image looks
//
// One slide, so the role is irrelevant and each look is simply itself. They
// are deliberately distinct in SURFACE, not only in colour: photograph,
// photograph-with-a-card, blue, pale blue, white. Five looks that differ
// only by hue is the complaint that produced this file.

export const SINGLE_TEMPLATES: Template[] = [
  {
    id: 'poster',
    name: 'Poster',
    family: 'single',
    blurb: 'Full-bleed photograph, white type across the bottom. The loudest option.',
    photo: 'every',
    surfaceFor: () => photoS(0.98),
  },
  {
    id: 'inset',
    name: 'Inset card',
    family: 'single',
    blurb: 'Photograph behind a white card. Keeps long text readable over any picture.',
    photo: 'every',
    surfaceFor: () => cardS(0.32),
  },
  {
    id: 'statement',
    name: 'Statement',
    family: 'single',
    blurb: 'Solid brand gradient, type filling the frame. No photograph.',
    photo: 'none',
    surfaceFor: () => field(),
  },
  {
    id: 'calm',
    name: 'Calm',
    family: 'single',
    blurb: 'Pale blue with navy type. Quiet — good for a single sentence.',
    photo: 'none',
    surfaceFor: () => lightS(),
  },
  {
    id: 'paper',
    name: 'Paper',
    family: 'single',
    blurb: 'A white page and nothing else. The most restrained, and the most legible.',
    photo: 'none',
    surfaceFor: () => plain(),
  },
]

export const TEMPLATES: Template[] = [...CAROUSEL_TEMPLATES, ...SINGLE_TEMPLATES]

/** Only the looks built for what is being made. */
export function templatesFor(family: FormatFamily): Template[] {
  return family === 'single' ? SINGLE_TEMPLATES : CAROUSEL_TEMPLATES
}

export const DEFAULT_TEMPLATE: Record<FormatFamily, Template> = {
  carousel: CAROUSEL_TEMPLATES[0],
  single: SINGLE_TEMPLATES[0],
}

/**
 * Look up by id, falling back to the default for that family.
 *
 * The family matters: an id from the other set is not merely unknown, it
 * would render a single image with a carousel's idea of a closer, which is
 * the bug this whole file exists to end.
 */
export function templateById(id: string | undefined, family: FormatFamily = 'carousel'): Template {
  const found = TEMPLATES.find(t => t.id === id)
  if (found && found.family === family) return found
  return DEFAULT_TEMPLATE[family]
}

/** Does this look put the photograph on this particular slide role? */
export function wantsPhoto(t: Template, kind: SlideKind): boolean {
  return t.photo === 'every' || (t.photo === 'cover' && kind === 'cover')
}

/**
 * Will this look draw a photograph on ANY of these slides?
 *
 * The question to ask before offering a photo picker, and the one the first
 * two attempts both dodged in favour of something easier.
 *
 *   v1 asked "is slide one a cover" — a single image is a closer, so the
 *      picker never appeared for single images at all.
 *   v2 asked "is the template photographic in principle" — Editorial, the
 *      default, is 'cover', and a single image has no cover, so the picker
 *      appeared and nothing drew the result.
 *
 * Splitting the sets makes this mostly moot for single images, since a
 * single-image look is 'every' or 'none'. It stays because carousels still
 * have roles, and because the invariant is worth stating.
 */
export function usesPhotoAnywhere(t: Template, kinds: SlideKind[]): boolean {
  return kinds.some(k => wantsPhoto(t, k))
}

/** The looks that WOULD use a photograph here, by name, for telling someone. */
export function photoTemplatesFor(kinds: SlideKind[], family: FormatFamily): string[] {
  return templatesFor(family).filter(t => usesPhotoAnywhere(t, kinds)).map(t => t.name)
}
