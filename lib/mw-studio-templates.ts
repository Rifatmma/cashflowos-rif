// 👉 Five looks, one brand.
//
// The first version had exactly one design, so every post Moving Walls made
// would have looked identical — which defeats the point of posting often.
// It also used the chosen photograph on the cover slide and nowhere else, so
// on a single image (which is a "closer") the picture was selected and then
// silently never drawn. That was a design decision of mine and it was the
// wrong one: how photography is used is part of the LOOK, so it belongs to
// the template rather than being fixed for everything.
//
// All five come out of the Visual Identity Guidelines and nothing here
// invents a colour. What varies is which of the guide's own surfaces carries
// the slide:
//
//   Primary gradient    #2554A2 → #1B1E2B      large areas, white type
//   Secondary gradient  #BFE7FB → #66C9F3      large areas, navy type
//   White                                      the default page
//   Photography         under a navy scrim
//
// Sunburst, Crimson and Emerald stay where the guide puts them: supporting
// accents, never a field. In practice that means the chevron, a 132px rule
// and the cover's pill, in every template.

export type SurfaceKind = 'paper' | 'field' | 'light' | 'photo' | 'split'

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
}

export type SlideKind = 'cover' | 'stat' | 'point' | 'closer'

export type Template = {
  id: string
  name: string
  /** One line, shown on the picker. Says what it is FOR, not what it looks like. */
  blurb: string
  /**
   * Which slides take the photograph.
   *
   *   'every'  every slide is photographic — needs a good picture
   *   'cover'  only the opening slide
   *   'none'   no photography at all; the picker is hidden
   */
  photo: 'every' | 'cover' | 'none'
  surfaceFor: (kind: SlideKind) => Surface
}

const paper = (band?: number): Surface =>
  ({ kind: 'paper', onDark: false, wave: band ?? null, band })
const field = (wave: number | null = 0.98): Surface =>
  ({ kind: 'field', onDark: true, wave })
const light = (wave: number | null = 0.98): Surface =>
  ({ kind: 'light', onDark: false, wave })
const photo = (wave: number | null = 0.98): Surface =>
  ({ kind: 'photo', onDark: true, wave })
const split = (share = 0.46): Surface =>
  ({ kind: 'split', onDark: false, wave: share, photoShare: share })

export const TEMPLATES: Template[] = [
  {
    id: 'editorial',
    name: 'Editorial',
    blurb: 'White page, a blue band at the top, the number in brand gradient. The default for data.',
    photo: 'cover',
    surfaceFor: k =>
      k === 'cover' ? photo(0.98)
      : k === 'closer' ? field()
      : paper(0.222),              // the 300px band at 1350, kept proportional
  },
  {
    id: 'bleed',
    name: 'Full bleed',
    blurb: 'Every slide is a photograph under a navy scrim, white type over it. Strongest in a feed.',
    photo: 'every',
    surfaceFor: () => photo(0.98),
  },
  {
    id: 'split',
    name: 'Split',
    blurb: 'Photograph on top, white panel beneath. Calmer than full bleed, and long text still reads.',
    photo: 'every',
    surfaceFor: () => split(),
  },
  {
    id: 'deep',
    name: 'Deep',
    blurb: 'Solid brand gradient, no photography. Use when the words are the whole point.',
    photo: 'none',
    surfaceFor: () => field(),
  },
  {
    id: 'air',
    name: 'Air',
    blurb: 'The pale blue secondary gradient with navy type. Light and quiet — good for a statement.',
    photo: 'none',
    surfaceFor: k => (k === 'closer' ? field() : light()),
  },
]

export const DEFAULT_TEMPLATE = TEMPLATES[0]

export function templateById(id: string | undefined): Template {
  return TEMPLATES.find(t => t.id === id) ?? DEFAULT_TEMPLATE
}

/** Does this template want a photograph for this slide? */
export function wantsPhoto(t: Template, kind: SlideKind): boolean {
  return t.photo === 'every' || (t.photo === 'cover' && kind === 'cover')
}
