'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { researchTopic, composeDeck, suggestFilmScript, researchArticleUrl } from './actions'
import type { Research } from '@/lib/mw-studio'
import type { Photo } from '@/lib/mw-photos'
import {
  drawSlide, drawFilmSurface, drawSegmentText, faults, segmentFaults,
  SIZE, SLIDE_SECONDS, SEGMENT_SECONDS, templatesFor, templateById,
  wantsPhoto, usesPhotoAnywhere, photoTemplatesFor, familyOf, DEFAULT_TEMPLATE,
  type Deck, type Format, type Slide, type Segment, type FormatFamily,
} from '@/lib/mw-studio-design'
import {
  recordSlidesVideo, recordFilm, encodeSlidesVideo, encodeFilm,
  canEncode, pickMime, filmSeconds, type Clip,
} from '@/lib/mw-studio-video'

// The Studio screen.
//
// THE ORDER OF THE QUESTIONS IS THE DESIGN, and it used to be wrong. It
// asked for a topic, researched it, offered a look, then a format — so the
// look was picked before anyone knew whether it was dressing one image or
// five, and the same five looks were offered either way. Three of them
// rendered a single image identically and a fourth drew no photograph at
// all. The owner's fix is the right one: decide what you are making first,
// and everything else follows from it.
//
//   1  what are you making      a single image, or a carousel
//   2  where the words are from research a topic, or write them yourself
//   3  which look               five, built for that format
//   4  the picture              stock, your own, or none
//   5  edit, download, and optionally record one video
//
// Each step appears only once the one above it has an answer.

type Mode = 'research' | 'article' | 'own'

// ---------------------------------------------------------------- the canvas

function SlideCanvas({
  slide, format, photo, template, onReady, onImage,
}: {
  slide: Slide
  format: Format
  photo?: string
  template: string
  onReady?: (c: HTMLCanvasElement) => void
  /** Hands the decoded photo up, so recording does not re-fetch or re-decode it. */
  onImage?: (img: HTMLImageElement | null) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    let dead = false
    const t = templateById(template, familyOf(format))

    const paint = (img?: HTMLImageElement) => {
      if (dead) return
      drawSlide(ctx, slide, format, img ? { photo: img } : {}, undefined, t)
      onReady?.(c)
      onImage?.(img ?? null)
    }

    // Poppins must be loaded before the first stroke or the slide is drawn
    // in the fallback face and silently stays that way — canvas text does
    // not reflow when a font arrives later, unlike DOM text.
    const fonts = (document as any).fonts
    const ready: Promise<unknown> = fonts
      ? Promise.all([
          fonts.load('700 92px Poppins'), fonts.load('600 26px Poppins'),
          fonts.load('500 30px Poppins'), fonts.load('400 32px Poppins'),
        ]).catch(() => undefined)
      : Promise.resolve()

    ready.then(() => {
      if (dead) return
      if (!photo) return paint()
      const img = new Image()
      // Stock photos come through our own proxy and uploads are blob: URLs,
      // so neither taints the canvas and toBlob keeps working.
      img.onload = () => paint(img)
      img.onerror = () => paint()
      img.src = photo
    })

    return () => { dead = true }
  }, [slide, format, photo, template, onReady, onImage])

  const { w, h } = SIZE[format]
  return <canvas ref={ref} width={w} height={h} className="mw-studio-canvas" />
}

/**
 * A tiny picture of what a look is.
 *
 * CSS, not the real engine: the picker appears before any deck exists, so
 * there is nothing to render, and five live 1080px canvases to choose
 * between would be absurd. The gradients are the same tokens as the real
 * surfaces.
 */
const SWATCH: Record<string, React.CSSProperties[]> = {
  editorial: [{ inset: 0, background: '#fff' }, { inset: '0 0 72% 0', background: 'linear-gradient(135deg,#2554A2,#1B1E2B)' }],
  bleed: [{ inset: 0, background: 'linear-gradient(160deg,#5b6b84,#1B1E2B 70%)' }],
  split: [{ inset: 0, background: '#fff' }, { inset: '0 0 54% 0', background: 'linear-gradient(135deg,#2554A2,#1B1E2B)' }],
  deep: [{ inset: 0, background: 'linear-gradient(135deg,#2554A2,#1B1E2B)' }],
  air: [{ inset: 0, background: 'linear-gradient(135deg,#BFE7FB,#66C9F3)' }],
  poster: [{ inset: 0, background: 'linear-gradient(160deg,#5b6b84,#1B1E2B 70%)' }],
  inset: [
    { inset: 0, background: 'linear-gradient(160deg,#6b7b94,#2a3346 70%)' },
    { inset: '48% 12% 10% 12%', background: '#fff', borderRadius: 6 },
  ],
  statement: [{ inset: 0, background: 'linear-gradient(135deg,#2554A2,#1B1E2B)' }],
  calm: [{ inset: 0, background: 'linear-gradient(135deg,#BFE7FB,#66C9F3)' }],
  paper: [{ inset: 0, background: '#fff' }, { inset: '80% 0 0 0', background: 'linear-gradient(135deg,#BFE7FB,#66C9F3)', opacity: 0.55 }],
}

function Swatch({ id }: { id: string }) {
  return (
    <span className="mw-studio-swatch" aria-hidden="true">
      {(SWATCH[id] ?? SWATCH.deep).map((st, i) => (
        <span key={i} style={{ position: 'absolute', ...st }} />
      ))}
    </span>
  )
}

/** One frozen moment of a film, for the beat editor's thumbnail. */
function FilmFrame({
  segment, format, template, photo, source, at,
}: {
  segment: Segment; format: Format; template: string
  photo?: string; source?: string; at: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    let dead = false
    const t = templateById(template, familyOf(format))

    const paint = (img?: HTMLImageElement) => {
      if (dead) return
      const surface = drawFilmSurface(ctx, format, t, img ? { photo: img } : {}, source)
      drawSegmentText(ctx, segment, format, surface, { at, total: SEGMENT_SECONDS })
    }

    const fonts = (document as any).fonts
    const ready: Promise<unknown> = fonts
      ? Promise.all([fonts.load('700 88px Poppins'), fonts.load('600 26px Poppins')]).catch(() => undefined)
      : Promise.resolve()

    ready.then(() => {
      if (dead) return
      if (!photo || t.photo === 'none') return paint()
      const img = new Image()
      img.onload = () => paint(img)
      img.onerror = () => paint()
      img.src = photo
    })
    return () => { dead = true }
  }, [segment, format, template, photo, source, at])

  const { w, h } = SIZE[format]
  return <canvas ref={ref} width={w} height={h} className="mw-studio-canvas" />
}

// ------------------------------------------------------------------ download

function fileName(topic: string, n: number, total: number): string {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'post'
  return total === 1 ? `${slug}.png` : `${slug}-${String(n).padStart(2, '0')}.png`
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // Revoking immediately races the download in Safari; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function save(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob(blob => { if (blob) saveBlob(blob, name) }, 'image/png')
}

/** An empty deck to type into, when the words are already in someone's head. */
function blankDeck(format: Format, template: string): Deck {
  const slides: Slide[] = format === 'carousel'
    ? [
        { kind: 'cover', kicker: 'OOH Intelligence', headline: '', cta: 'Swipe →' },
        { kind: 'stat', kicker: 'The number', headline: '', figure: '', body: '' },
        { kind: 'closer', kicker: 'What we think', headline: '', body: '' },
      ]
    : [{ kind: 'closer', kicker: 'OOH Intelligence', headline: '', body: '' }]
  return { topic: 'post', format, template, slides }
}

// -------------------------------------------------------------------- screen

export function Studio() {
  const [format, setFormat] = useState<Format | null>(null)
  const family: FormatFamily = format ? familyOf(format) : 'carousel'
  const [mode, setMode] = useState<Mode | null>(null)

  const [topic, setTopic] = useState('')
  const [url, setUrl] = useState('')
  const [res, setRes] = useState<Research | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photo, setPhoto] = useState<string | undefined>()
  /** Per-slide override. Absent means "use the one chosen above". */
  const [slidePhoto, setSlidePhoto] = useState<Record<number, string>>({})

  const [template, setTemplate] = useState('')
  const [deck, setDeck] = useState<Deck | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, start] = useTransition()

  const [clips, setClips] = useState<Clip[]>([])
  const [recording, setRecording] = useState(false)
  const [recProgress, setRecProgress] = useState(0)
  const [recError, setRecError] = useState('')
  const [seconds, setSeconds] = useState(SLIDE_SECONDS)
  const [reel, setReel] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const [beats, setBeats] = useState<Segment[]>([])
  const [beatFaults, setBeatFaults] = useState<string[]>([])

  const canvases = useRef(new Map<number, HTMLCanvasElement>())
  const images = useRef(new Map<number, HTMLImageElement>())
  const register = useCallback((i: number) => (c: HTMLCanvasElement) => { canvases.current.set(i, c) }, [])
  const keepImage = useCallback(
    (i: number) => (img: HTMLImageElement | null) => {
      if (img) images.current.set(i, img); else images.current.delete(i)
    },
    [],
  )

  const tmpl = templateById(template, family)
  const photoFor = (i: number) => slidePhoto[i] ?? photo

  const pickFormat = (f: Format) => {
    setFormat(f)
    setTemplate(DEFAULT_TEMPLATE[familyOf(f)].id)
    setDeck(null); setClips([]); setBeats([]); setError('')
  }

  const doResearch = () => {
    setError(''); setDeck(null); setRes(null); setProblems([]); setBeats([])
    start(async () => {
      const r = await researchTopic(topic)
      if (!r.ok) return setError(r.error)
      setRes(r.research)
      setPhotos(r.photos)
      setPhoto(p => p ?? r.photos[0]?.src)
    })
  }

  const doArticle = () => {
    setError(''); setDeck(null); setRes(null); setProblems([]); setBeats([])
    start(async () => {
      const r = await researchArticleUrl(url)
      if (!r.ok) return setError(r.error)
      setRes(r.research)
      setPhotos(r.photos)
      setPhoto(p => p ?? r.photos[0]?.src)
    })
  }

  const doCompose = () => {
    if (!res || !format) return
    setError(''); setDeck(null); setProblems([]); setBeats([])
    start(async () => {
      const d = await composeDeck(res, format, format === 'carousel' ? 5 : 1, template)
      if (!d.ok) return setError(d.error)
      canvases.current.clear(); images.current.clear(); setClips([])
      setDeck(d.deck)
      setProblems(d.faults)
    })
  }

  const startOwn = (f: Format) => {
    canvases.current.clear(); images.current.clear()
    setClips([]); setBeats([]); setProblems([]); setError('')
    setDeck(blankDeck(f, templateById(template, familyOf(f)).id))
  }

  const edit = (i: number, patch: Partial<Slide>) => {
    setDeck(d => {
      if (!d) return d
      const next = { ...d, slides: d.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) }
      setProblems(faults(next))
      setClips([])          // any clip now shows copy that is no longer there
      return next
    })
  }

  const pickTemplate = (id: string) => {
    setTemplate(id)
    setClips([])
    setDeck(d => (d ? { ...d, template: id } : d))
  }

  /**
   * An uploaded picture.
   *
   * Kept as a blob: URL, which is same-origin, so the canvas stays clean and
   * the download keeps working. Nothing is uploaded anywhere — the file
   * never leaves the machine, which also means there is no size limit to
   * police and no privacy question to answer.
   */
  const upload = (file: File | undefined, slot: number | 'all') => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('That file is not an image.')
    const url = URL.createObjectURL(file)
    setError('')
    setClips([])
    if (slot === 'all') setPhoto(url)
    else setSlidePhoto(m => ({ ...m, [slot]: url }))
  }

  const downloadAll = () => {
    if (!deck) return
    deck.slides.forEach((_, i) => {
      const c = canvases.current.get(i)
      // Staggered: a browser asked for eight downloads in one tick blocks
      // all but the first and shows a permission prompt nobody expects.
      if (c) setTimeout(() => save(c, fileName(deck.topic, i + 1, deck.slides.length)), i * 350)
    })
  }

  const suggestBeats = (n: number) => {
    if (!res) return
    setRecError('')
    start(async () => {
      const out = await suggestFilmScript(res, n)
      if (!out.ok) return setRecError(out.error)
      setBeats(out.segments)
      setBeatFaults(out.faults)
      setClips([])
    })
  }

  const editBeat = (i: number, patch: Partial<Segment>) => {
    setBeats(bs => {
      const next = bs.map((b, j) => (j === i ? { ...b, ...patch } : b))
      setBeatFaults(segmentFaults(next))
      setClips([])
      return next
    })
  }

  /**
   * One video. Always.
   *
   * "Video should just be video there's no carousel." The old pair of
   * buttons offered "one video, all slides" and "one video per slide", the
   * second of which produced N files to be posted as a carousel of videos —
   * a format nobody asked for. What varies now is only the source: a
   * carousel dissolves between its slides, anything else changes its words
   * over a design that holds still.
   */
  const record = async () => {
    if (!deck || !format) return
    setRecError(''); setClips([]); setRecProgress(0); setRecording(true)
    abort.current = new AbortController()
    const vFormat: Format = reel ? 'reel' : format
    const vTemplate = templateById(template, familyOf(vFormat))
    try {
      const asSlides = deck.format === 'carousel' && beats.length === 0
      const asBeats = beats.length
        ? beats
        : deck.slides.map(s => ({ headline: s.headline, sub: s.kicker, body: s.body }))
      // The slider is "seconds per SLIDE" and belongs to the carousel path
      // only. Passing it to a film overrode SEGMENT_SECONDS and silently
      // produced a 4-second beat where the screen promised 5.
      const o = { onProgress: setRecProgress, signal: abort.current.signal }
      const slideOpts = { ...o, seconds }

      // Frame-exact where the browser allows it. The real-time path stays
      // for Firefox, and only that path needs the tab in front.
      const clip = canEncode()
        ? asSlides
          ? await encodeSlidesVideo(deck, vFormat, vTemplate, images.current, slideOpts)
          : await encodeFilm(asBeats, vFormat, vTemplate, images.current.get(0), deck.slides[0]?.source, o)
        : asSlides
          ? await recordSlidesVideo(deck, vFormat, vTemplate, images.current, slideOpts)
          : await recordFilm(asBeats, vFormat, vTemplate, images.current.get(0), deck.slides[0]?.source, o)
      setClips([clip])
      if (clip.ext === 'webm') {
        setRecError(
          'This browser could only record WebM. Instagram will not accept it — ' +
          'record in Chrome or Safari to get an MP4.',
        )
      }
    } catch (e: any) {
      setRecError(String(e?.message ?? e))
    } finally {
      setRecording(false)
      abort.current = null
    }
  }

  const kinds = deck?.slides.map(s => s.kind) ?? []
  const photoUsed = deck ? usesPhotoAnywhere(tmpl, kinds) : tmpl.photo !== 'none'

  return (
    <div className="mw-studio">
      {/* 1 ───────────────────────────────────────── what are you making */}
      <section>
        <h3>What are you making?</h3>
        <div className="mw-studio-choice">
          <button type="button" onClick={() => pickFormat('single')}
            aria-current={format === 'single' ? 'true' : undefined}>
            <b>A single image</b>
            <small>1080 × 1080. One design. Good for LinkedIn and a quick in-feed post.</small>
          </button>
          <button type="button" onClick={() => pickFormat('carousel')}
            aria-current={format === 'carousel' ? 'true' : undefined}>
            <b>A carousel</b>
            <small>1080 × 1350, up to 8 slides. Room to lay out an argument.</small>
          </button>
        </div>
        <p className="lede" style={{ marginTop: 10 }}>
          Either can also become a video at the end. There is one video, not a third format.
        </p>
      </section>

      {/* 2 ──────────────────────────────────── where the words come from */}
      {format && (
        <section>
          <h3>Where do the words come from?</h3>
          <div className="mw-studio-choice">
            <button type="button" onClick={() => { setMode('research'); setDeck(null) }}
              aria-current={mode === 'research' ? 'true' : undefined}>
              <b>Research a topic</b>
              <small>
                Type a subject. It finds checkable facts with named sources, shows them to you,
                then writes the post from those and nothing else.
              </small>
            </button>
            <button type="button" onClick={() => { setMode('article'); setDeck(null); setRes(null) }}
              aria-current={mode === 'article' ? 'true' : undefined}>
              <b>Use one of our articles</b>
              <small>
                Paste a movingwalls.com link. It reads the post and builds from what the article
                actually says — nothing added from anywhere else.
              </small>
            </button>
            <button type="button" onClick={() => { setMode('own'); setRes(null); startOwn(format) }}
              aria-current={mode === 'own' ? 'true' : undefined}>
              <b>Write it myself</b>
              <small>
                Empty fields for your headline, subheadline and description — and your own
                picture if you have one.
              </small>
            </button>
          </div>
        </section>
      )}

      {/* 2a ─────────────────────────────────────────────── the topic box */}
      {format && mode === 'research' && (
        <div className="mw-studio-ask">
          <label htmlFor="topic">What should this post be about?</label>
          <textarea
            id="topic" rows={2} value={topic}
            placeholder="e.g. programmatic DOOH adoption in Southeast Asia"
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => {
              // Enter sends, Shift+Enter makes a new line — the convention
              // everyone already has in their fingers from every chat box.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (topic.trim()) doResearch() }
            }}
          />
          <button type="button" onClick={doResearch} disabled={busy || !topic.trim()}>
            {busy && !res ? 'Researching…' : 'Research this'}
          </button>
        </div>
      )}

      {/* 2a (article) ──────────────────────────────── paste the link */}
      {format && mode === 'article' && (
        <div className="mw-studio-ask">
          <label htmlFor="arturl">Which article?</label>
          <input
            id="arturl" type="url" value={url}
            placeholder="https://www.movingwalls.com/blog/programmatic-dooh-explained"
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && url.trim()) { e.preventDefault(); doArticle() } }}
          />
          <button type="button" onClick={doArticle} disabled={busy || !url.trim()}>
            {busy && !res ? 'Reading…' : 'Read this article'}
          </button>
        </div>
      )}

      {error && <p className="mw-studio-error">{error}</p>}

      {/* 2b ───────────────────────── what is true, before any design */}
      {(mode === 'research' || mode === 'article') && res && (
        <section className="mw-studio-facts">
          <h3>{mode === 'article' ? 'What the article says' : 'What I found'}</h3>
          {res.caveat && <p className="mw-studio-warn">{res.caveat}</p>}
          {res.angle && <p className="lede">{res.angle}</p>}
          <ol>
            {res.facts.map((f, i) => (
              <li key={i}>
                {f.claim}
                <small>{f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.source} ↗</a> : f.source}</small>
              </li>
            ))}
          </ol>
          {res.reinforces.length > 0 && (
            <p className="mw-studio-reinforce">
              This supports {res.reinforces.map((u, i) => (
                <span key={u}>{i > 0 ? ', ' : ''}<code>{u}</code></span>
              ))} — pages Google already shows. Worth linking from the caption.
            </p>
          )}
          <p className="mw-studio-check">
            {mode === 'article'
              ? 'Everything on the slides comes from this article and nothing else — no figure is added from outside it.'
              : 'Read these before you generate. Everything on the slides comes from this list.'}
          </p>
        </section>
      )}

      {/* 3 ──────────────────────────────────────────────────── the look */}
      {format && mode && (mode === 'own' || res) && (
        <section className="mw-studio-templates">
          <h3>Which look?</h3>
          <p className="lede">
            Five built for {format === 'carousel' ? 'a carousel' : 'a single image'}. They differ
            in surface, not only colour — photograph, photograph behind a white card, brand
            gradient, pale blue, plain white. Switching later keeps the writing and repaints only
            the design.
          </p>
          <div className="mw-studio-looks">
            {templatesFor(family).map(t => (
              <button key={t.id} type="button" onClick={() => pickTemplate(t.id)}
                aria-current={template === t.id ? 'true' : undefined}>
                <Swatch id={t.id} />
                <b>{t.name}</b>
                <small>{t.blurb}</small>
                <em>
                  {t.photo === 'every' ? 'uses a photograph'
                    : t.photo === 'cover' ? 'photograph on the cover'
                    : 'no photography'}
                </em>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 4 ──────────────────────────────────────────────── generate it */}
      {format && (mode === 'research' || mode === 'article') && res && (
        <section>
          <button type="button" className="mw-dl" onClick={doCompose} disabled={busy}>
            {busy ? 'Writing…' : `Write the ${format === 'carousel' ? 'carousel' : 'image'}`}
          </button>
        </section>
      )}

      {/* 5 ────────────────────────────────────────────────── the result */}
      {deck && (
        <section className="mw-studio-deck">
          <div className="mw-studio-deck-head">
            <h3>{deck.slides.length === 1 ? 'Your image' : `Your carousel · ${deck.slides.length} slides`}</h3>
            <button type="button" className="mw-dl" onClick={downloadAll}>
              ⬇ Download {deck.slides.length === 1 ? 'the image' : 'all slides'}
            </button>
          </div>

          {problems.length > 0 && (
            <div className="mw-studio-faults">
              <b>These will not sit right:</b>
              <ul>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
              <p>Shorten the text below and the preview updates as you type.</p>
            </div>
          )}

          {/* ── the picture ─────────────────────────────────────────────
              Offered when THIS deck in THIS look will really draw one. It
              has twice been offered where nothing would, so when the chosen
              look does not use photography that is said out loud rather
              than the picker quietly vanishing. */}
          <div className="mw-studio-photos">
            <h4>Picture</h4>
            {!photoUsed ? (
              <p className="mw-studio-warn">
                <b>{tmpl.name}</b> does not use photography.{' '}
                {photoTemplatesFor(kinds, family).length > 0
                  && `For a picture, switch the look to ${photoTemplatesFor(kinds, family).join(' or ')}.`}
              </p>
            ) : (
              <>
                <div className="mw-studio-uploads">
                  <label className="mw-studio-upload">
                    ⬆ Upload your own
                    <input type="file" accept="image/*"
                      onChange={e => upload(e.target.files?.[0], 'all')} />
                  </label>
                  {photo?.startsWith('blob:') && (
                    <span className="lede">Your own picture. It never leaves this machine.</span>
                  )}
                </div>

                {photos.length > 0 && (
                  <>
                    <div className="mw-studio-strip">
                      <button type="button" onClick={() => { setPhoto(undefined); setClips([]) }}
                        aria-current={!photo ? 'true' : undefined} className="mw-studio-nophoto">
                        No photo<small>brand gradient</small>
                      </button>
                      {photos.map(p => (
                        <button key={p.id} type="button" onClick={() => { setPhoto(p.src); setClips([]) }}
                          aria-current={photo === p.src ? 'true' : undefined}
                          title={`${p.alt} — ${p.credit}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.src} alt={p.alt} />
                          <small>{p.alt}</small>
                        </button>
                      ))}
                    </div>
                    <p className="lede">
                      Pexels never says “no match” — it returns confident, unrelated pictures, so
                      read the captions. Credit the photographer:{' '}
                      {photos.find(p => p.src === photo)?.credit ?? '—'} on Pexels.
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          <div className="mw-studio-slides">
            {deck.slides.map((s, i) => (
              <figure key={i} className="mw-studio-slide">
                <SlideCanvas
                  slide={s} format={deck.format} template={template}
                  photo={wantsPhoto(tmpl, s.kind) ? photoFor(i) : undefined}
                  onReady={register(i)} onImage={keepImage(i)}
                />
                <figcaption>
                  <span className="mw-studio-n">{i + 1}</span>
                  <label>Subheadline
                    <input value={s.kicker} onChange={e => edit(i, { kicker: e.target.value })} />
                  </label>
                  <label>Headline
                    <textarea rows={2} value={s.headline} onChange={e => edit(i, { headline: e.target.value })} />
                  </label>
                  {(s.figure !== undefined || mode === 'own') && (
                    <label>Figure <small>(optional)</small>
                      <input value={s.figure ?? ''} onChange={e => edit(i, { figure: e.target.value })} />
                    </label>
                  )}
                  <label>Description
                    <textarea rows={3} value={s.body ?? ''} onChange={e => edit(i, { body: e.target.value })} />
                  </label>
                  {/* Blank by default when the words are his own: it is his
                      content, so it is his call, and the line simply does
                      not print when the field is empty. */}
                  <label>Source line <small>(optional)</small>
                    <input value={s.source ?? ''} placeholder="e.g. IAB Outlook 2026"
                      onChange={e => edit(i, { source: e.target.value })} />
                  </label>
                  {wantsPhoto(tmpl, s.kind) && (
                    <label className="mw-studio-upload small">
                      ⬆ A different picture for this slide
                      <input type="file" accept="image/*"
                        onChange={e => upload(e.target.files?.[0], i)} />
                    </label>
                  )}
                  <button type="button" onClick={() => {
                    const c = canvases.current.get(i)
                    if (c) save(c, fileName(deck.topic, i + 1, deck.slides.length))
                  }}>Download this one</button>
                </figcaption>
              </figure>
            ))}
          </div>

          {deck.format === 'carousel' && mode === 'own' && deck.slides.length < 8 && (
            <button type="button" className="mw-studio-addslide" onClick={() => setDeck(d => d && ({
              ...d, slides: [...d.slides, { kind: 'point', kicker: '', headline: '', body: '' }],
            }))}>+ Add a slide</button>
          )}

          {/* ── video ───────────────────────────────────────────────── */}
          <div className="mw-studio-video">
            <h4>Make a video</h4>
            <p className="lede">
              One video. {deck.format === 'carousel'
                ? 'The slides dissolve one into the next, and inside each slide only the words move.'
                : 'The design holds still and the words change.'}{' '}
              The photograph, the wave, the logo and the source line never move.
            </p>
            {!canEncode() && (
              <p className="mw-studio-warn">
                This browser cannot encode frame by frame, so the video is filmed in real time
                instead. <b>Keep this tab in front while it records</b> — otherwise frames are
                dropped and the clip stutters. Chrome or Safari encode properly.
              </p>
            )}

            {!pickMime() ? (
              <p className="mw-studio-warn">
                This browser cannot record video. Chrome or Safari will produce an MP4.
              </p>
            ) : (
              <>
                <div className="mw-studio-vidopts">
                  <label>
                    <input type="checkbox" checked={reel}
                      onChange={e => { setReel(e.target.checked); setClips([]) }} />
                    Reels / Stories size (1080 × 1920)
                  </label>
                  {deck.format === 'carousel' && beats.length === 0 && (
                    <label className="mw-studio-secs">
                      Seconds per slide
                      <input type="range" min={2.5} max={7} step={0.5} value={seconds}
                        disabled={recording}
                        onChange={e => { setSeconds(Number(e.target.value)); setClips([]) }} />
                      <b>{seconds.toFixed(1)}s</b>
                    </label>
                  )}
                </div>

                {/* Beats: a longer film whose words change on a design that
                    does not. Offered off the back of research, because the
                    first draft of the words comes from the facts. */}
                {(mode === 'research' || mode === 'article') && res && (
                  <div className="mw-studio-film">
                    <h5>
                      {deck.format === 'single'
                        ? `A longer video — new words every ${SEGMENT_SECONDS} seconds`
                        : `Or write beats instead of using the slides`}
                    </h5>
                    {beats.length === 0 ? (
                      <div className="mw-studio-beatpick">
                        {[3, 4, 6].map(n => (
                          <button key={n} type="button" disabled={busy} onClick={() => suggestBeats(n)}>
                            {busy ? 'Writing…' : `${filmSeconds(n)}s · ${n} beats`}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <>
                        <p className="lede">
                          {filmSeconds(beats.length)} seconds, {beats.length} beats. Every field is
                          yours to change — these are suggestions from the research, not decisions.
                        </p>
                        {beatFaults.length > 0 && (
                          <div className="mw-studio-faults">
                            <ul>{beatFaults.map((f, i) => <li key={i}>{f}</li>)}</ul>
                          </div>
                        )}
                        <div className="mw-studio-beats">
                          {beats.map((b, i) => (
                            <div className="mw-studio-beat" key={i}>
                              <FilmFrame
                                segment={b} format={reel ? 'reel' : deck.format} template={template}
                                photo={tmpl.photo === 'none' ? undefined : photo}
                                source={deck.slides[0]?.source} at={SEGMENT_SECONDS / 2}
                              />
                              <div className="mw-studio-beatfields">
                                <span className="mw-studio-n">
                                  {i * SEGMENT_SECONDS}–{(i + 1) * SEGMENT_SECONDS}s
                                </span>
                                <label>Subheadline
                                  <input value={b.sub ?? ''} onChange={e => editBeat(i, { sub: e.target.value })} />
                                </label>
                                <label>Headline
                                  <textarea rows={2} value={b.headline}
                                    onChange={e => editBeat(i, { headline: e.target.value })} />
                                </label>
                                <label>Description
                                  <textarea rows={3} value={b.body ?? ''}
                                    onChange={e => editBeat(i, { body: e.target.value })} />
                                </label>
                                <div className="mw-studio-beatbtns">
                                  <button type="button" disabled={recording}
                                    onClick={() => setBeats(bs => bs.filter((_, j) => j !== i))}>Remove</button>
                                  <button type="button" disabled={recording}
                                    onClick={() => setBeats(bs => [
                                      ...bs.slice(0, i + 1),
                                      { headline: 'New line', sub: b.sub, body: '' },
                                      ...bs.slice(i + 1),
                                    ])}>Add one after</button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mw-studio-beatpick">
                          <button type="button" disabled={busy} onClick={() => suggestBeats(beats.length)}>
                            Rewrite the words
                          </button>
                          <button type="button" disabled={recording} onClick={() => setBeats([])}>
                            Use the slides instead
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="mw-studio-beatpick">
                  <button type="button" className="mw-dl" disabled={recording} onClick={record}>
                    🎬 Record the video ·{' '}
                    {beats.length
                      ? `${filmSeconds(beats.length)}s`
                      : deck.format === 'carousel'
                        ? `${Math.round(deck.slides.length * seconds)}s`
                        : `${filmSeconds(deck.slides.length)}s`}
                  </button>
                </div>

                {recording && (
                  <div className="mw-studio-rec">
                    {/* Real progress, because recording is real time — a
                        spinner here would hide a known number. */}
                    <progress value={recProgress} max={1} />
                    <span>Recording… {Math.round(recProgress * 100)}%</span>
                    <button type="button" onClick={() => abort.current?.abort()}>Stop</button>
                  </div>
                )}

                {recError && <p className="mw-studio-warn">{recError}</p>}

                {clips.length > 0 && (
                  <div className="mw-studio-clips">
                    {clips.map((c, i) => (
                      <figure key={i}>
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <video src={URL.createObjectURL(c.blob)} controls loop playsInline />
                        <figcaption>
                          <small>{c.ext.toUpperCase()} · {c.seconds}s · {(c.blob.size / 1e6).toFixed(1)} MB</small>
                          <button type="button" onClick={() => saveBlob(
                            c.blob, fileName(deck.topic, 1, 1).replace(/\.png$/, `.${c.ext}`),
                          )}>Download</button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
