'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { researchTopic, composeDeck } from './actions'
import type { Research } from '@/lib/mw-studio'
import type { Photo } from '@/lib/mw-photos'
import { drawSlide, faults, SIZE, SLIDE_SECONDS, type Deck, type Format, type Slide } from '@/lib/mw-studio-design'
import { recordDeck, pickMime, estimateSeconds, type Clip, type VideoKind } from '@/lib/mw-studio-video'

// The Studio screen. Four steps down one column, each appearing only once the
// one above it has an answer:
//
//   1  topic          2  what is true      3  format      4  the deck
//
// Nothing is shown speculatively. The format question in particular waits for
// the research, because "carousel or single" is not answerable until you know
// whether there are five facts or one.

// ---------------------------------------------------------------- the canvas
//
// One component, used for both the on-screen preview and the full-size export.
// It draws at 1080 and is scaled down with CSS, so what is reviewed and what
// is downloaded are the same pixels.

function SlideCanvas({
  slide, format, photo, onReady, onImage,
}: {
  slide: Slide
  format: Format
  photo?: string
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

    const paint = (img?: HTMLImageElement) => {
      if (dead) return
      drawSlide(ctx, slide, format, img ? { photo: img } : {})
      onReady?.(c)
      onImage?.(img ?? null)
    }

    // Poppins must be loaded before the first stroke or the slide is drawn in
    // the fallback face and silently stays that way — canvas text does not
    // reflow when a font arrives later, unlike DOM text.
    const fonts = (document as any).fonts
    const ready: Promise<unknown> = fonts
      ? Promise.all([
          fonts.load(`700 92px Poppins`),
          fonts.load(`600 26px Poppins`),
          fonts.load(`500 30px Poppins`),
          fonts.load(`400 32px Poppins`),
        ]).catch(() => undefined)
      : Promise.resolve()

    ready.then(() => {
      if (dead) return
      if (!photo) return paint()
      const img = new Image()
      // Proxied through our own origin, so this never taints the canvas and
      // toBlob() keeps working. See app/api/mw-photo.
      img.onload = () => paint(img)
      img.onerror = () => paint()      // a missing photo falls back to the blue field
      img.src = photo
    })

    return () => { dead = true }
  }, [slide, format, photo, onReady, onImage])

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
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function save(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    // Revoking immediately races the download in Safari; a tick is enough.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}

// -------------------------------------------------------------------- screen

export function Studio() {
  const [topic, setTopic] = useState('')
  const [res, setRes] = useState<Research | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photo, setPhoto] = useState<string | undefined>()
  const [deck, setDeck] = useState<Deck | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const [step, setStep] = useState<'research' | 'compose'>('research')

  // Video. Recording happens in real time, so progress is a real number and
  // the whole thing is abortable — a thirty-second wait with a spinner and
  // no way out is not acceptable.
  const [clips, setClips] = useState<Clip[]>([])
  const [recording, setRecording] = useState(false)
  const [recProgress, setRecProgress] = useState(0)
  const [recError, setRecError] = useState('')
  const [seconds, setSeconds] = useState(SLIDE_SECONDS)
  const abort = useRef<AbortController | null>(null)
  const images = useRef(new Map<number, HTMLImageElement>())

  // Canvases register themselves so "Download all" does not have to go
  // hunting through the DOM for them.
  const canvases = useRef(new Map<number, HTMLCanvasElement>())
  const register = useCallback((i: number) => (c: HTMLCanvasElement) => { canvases.current.set(i, c) }, [])
  const keepImage = useCallback(
    (i: number) => (img: HTMLImageElement | null) => {
      if (img) images.current.set(i, img); else images.current.delete(i)
    },
    [],
  )

  const doResearch = () => {
    setError(''); setDeck(null); setRes(null); setProblems([])
    start(async () => {
      const r = await researchTopic(topic)
      if (!r.ok) return setError(r.error)
      setRes(r.research)
      setPhotos(r.photos)
      setPhoto(r.photos[0]?.src)
      setStep('compose')
    })
  }

  const doCompose = (format: Format, count: number) => {
    if (!res) return
    setError(''); setDeck(null); setProblems([])
    start(async () => {
      const d = await composeDeck(res, format, count)
      if (!d.ok) return setError(d.error)
      canvases.current.clear()
      images.current.clear()
      setClips([])
      setDeck(d.deck)
      setProblems(d.faults)
    })
  }

  /** Editing re-runs the same checks, so the warnings follow what is on screen. */
  const edit = (i: number, patch: Partial<Slide>) => {
    setDeck(d => {
      if (!d) return d
      const slides = d.slides.map((s, j) => (j === i ? { ...s, ...patch } : s))
      const next = { ...d, slides }
      setProblems(faults(next))
      // Any recorded clip now shows copy that is no longer on the slide, so
      // it is thrown away rather than left there looking current.
      setClips([])
      return next
    })
  }

  const makeVideo = async (kind: VideoKind) => {
    if (!deck) return
    setRecError('')
    setClips([])
    setRecProgress(0)
    setRecording(true)
    abort.current = new AbortController()
    try {
      const out = await recordDeck(deck, images.current, kind, {
        seconds,
        onProgress: setRecProgress,
        signal: abort.current.signal,
      })
      setClips(out)
      if (out[0]?.ext === 'webm') {
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

  const downloadAll = () => {
    if (!deck) return
    deck.slides.forEach((_, i) => {
      const c = canvases.current.get(i)
      // Staggered: a browser asked for eight downloads in one tick blocks all
      // but the first and shows a permission prompt nobody expects.
      if (c) setTimeout(() => save(c, fileName(deck.topic, i + 1, deck.slides.length)), i * 350)
    })
  }

  return (
    <div className="mw-studio">
      {/* 1 ─────────────────────────────────────────────── the topic */}
      <div className="mw-studio-ask">
        <label htmlFor="topic">What should this post be about?</label>
        <textarea
          id="topic"
          rows={2}
          value={topic}
          placeholder="e.g. programmatic DOOH adoption in Southeast Asia"
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => {
            // Enter sends, Shift+Enter makes a new line — the convention
            // everyone already has in their fingers from every chat box.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (topic.trim()) doResearch() }
          }}
        />
        <button type="button" onClick={doResearch} disabled={busy || !topic.trim()}>
          {busy && step === 'research' ? 'Researching…' : 'Research this'}
        </button>
      </div>

      {error && <p className="mw-studio-error">{error}</p>}

      {/* 2 ─────────────────────────────── what is true, before any design */}
      {res && (
        <section className="mw-studio-facts">
          <h3>What I found</h3>
          {res.caveat && <p className="mw-studio-warn">{res.caveat}</p>}
          {res.angle && <p className="lede">{res.angle}</p>}
          <ol>
            {res.facts.map((f, i) => (
              <li key={i}>
                {f.claim}
                <small>
                  {f.url
                    ? <a href={f.url} target="_blank" rel="noreferrer">{f.source} ↗</a>
                    : f.source}
                </small>
              </li>
            ))}
          </ol>
          {res.reinforces.length > 0 && (
            <p className="mw-studio-reinforce">
              {/* Joined with a visible separator, not just a CSS margin: these
                  render as one unbroken path when the styles have not loaded,
                  which is exactly how it looked the first time. */}
              This supports {res.reinforces.map((u, i) => (
                <span key={u}>{i > 0 ? ', ' : ''}<code>{u}</code></span>
              ))} — pages Google already shows. Worth linking from the caption.
            </p>
          )}
          <p className="mw-studio-check">
            Read these before you generate. Everything on the slides comes from this list and nothing else.
          </p>
        </section>
      )}

      {/* 3 ───────────────────────────────────────────── single or carousel */}
      {res && (
        <section className="mw-studio-format">
          <h3>Which format?</h3>
          <div className="mw-studio-choice">
            <button type="button" onClick={() => doCompose('single', 1)} disabled={busy}>
              <b>Single image</b>
              <small>1080 × 1080. One slide, the strongest fact. Good for LinkedIn.</small>
            </button>
            <button type="button" onClick={() => doCompose('carousel', 5)} disabled={busy}>
              <b>Carousel</b>
              <small>1080 × 1350, 5 slides. Cover, the numbers, then what we think.</small>
            </button>
          </div>
          {busy && step === 'compose' && <p className="lede">Writing the slides…</p>}
        </section>
      )}

      {/* 4 ──────────────────────────────────────────────────── the deck */}
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

          {/* The cover photo picker. The alt text is shown because Pexels
              returns confident, unrelated pictures rather than admitting it
              found nothing. */}
          {deck.slides[0]?.kind === 'cover' && photos.length > 0 && (
            <div className="mw-studio-photos">
              <h4>Cover photo</h4>
              <div className="mw-studio-strip">
                <button
                  type="button" onClick={() => setPhoto(undefined)}
                  aria-current={!photo ? 'true' : undefined}
                  className="mw-studio-nophoto"
                >No photo<small>blue field</small></button>
                {photos.map(p => (
                  <button
                    key={p.id} type="button" onClick={() => setPhoto(p.src)}
                    aria-current={photo === p.src ? 'true' : undefined}
                    title={`${p.alt} — ${p.credit}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={p.alt} />
                    <small>{p.alt}</small>
                  </button>
                ))}
              </div>
              <p className="lede">
                Credit the photographer in the caption:{' '}
                {photos.find(p => p.src === photo)?.credit ?? '—'} on Pexels.
              </p>
            </div>
          )}

          <div className="mw-studio-slides">
            {deck.slides.map((s, i) => (
              <figure key={i} className="mw-studio-slide">
                <SlideCanvas
                  slide={s}
                  format={deck.format}
                  photo={s.kind === 'cover' ? photo : undefined}
                  onReady={register(i)}
                  onImage={keepImage(i)}
                />
                <figcaption>
                  <span className="mw-studio-n">{i + 1}</span>
                  <input
                    value={s.kicker} aria-label={`Slide ${i + 1} kicker`}
                    onChange={e => edit(i, { kicker: e.target.value })}
                  />
                  <textarea
                    rows={2} value={s.headline} aria-label={`Slide ${i + 1} headline`}
                    onChange={e => edit(i, { headline: e.target.value })}
                  />
                  {s.figure !== undefined && (
                    <input
                      value={s.figure} aria-label={`Slide ${i + 1} figure`}
                      onChange={e => edit(i, { figure: e.target.value })}
                    />
                  )}
                  {s.body !== undefined && (
                    <textarea
                      rows={3} value={s.body} aria-label={`Slide ${i + 1} body`}
                      onChange={e => edit(i, { body: e.target.value })}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const c = canvases.current.get(i)
                      if (c) save(c, fileName(deck.topic, i + 1, deck.slides.length))
                    }}
                  >Download this one</button>
                </figcaption>
              </figure>
            ))}
          </div>

          {/* ── video ─────────────────────────────────────────────────────
              Deliberately below the slides. The still is the thing being
              approved; the video is made FROM it, which is the order he
              asked for — "the static image needs to be created first then
              the animation can come after". */}
          <div className="mw-studio-video">
            <h4>Make it move</h4>
            <p className="lede">
              Only the text animates — it rises in, holds, and lifts out. The photo, the wave,
              the logo and the source line never move, so the video is the same design as the
              image above it. <b>Keep this tab in front while it records</b> — browsers stop
              drawing in a background tab, and the clip would come out nearly empty.
            </p>

            {!pickMime() ? (
              <p className="mw-studio-warn">
                This browser cannot record video. Chrome or Safari will produce an MP4.
              </p>
            ) : (
              <>
                <label className="mw-studio-secs">
                  Seconds per slide
                  <input
                    type="range" min={2.5} max={7} step={0.5} value={seconds}
                    disabled={recording}
                    onChange={e => { setSeconds(Number(e.target.value)); setClips([]) }}
                  />
                  <b>{seconds.toFixed(1)}s</b>
                </label>

                <div className="mw-studio-choice">
                  <button type="button" disabled={recording} onClick={() => makeVideo('reel')}>
                    <b>One video, all slides</b>
                    <small>
                      A single film for Reels or a LinkedIn video.{' '}
                      {estimateSeconds(deck, { seconds })}s to record.
                    </small>
                  </button>
                  <button type="button" disabled={recording} onClick={() => makeVideo('per-slide')}>
                    <b>One video per slide</b>
                    <small>
                      Post the carousel with moving slides.{' '}
                      {estimateSeconds(deck, { seconds })}s to record.
                    </small>
                  </button>
                </div>

                {recording && (
                  <div className="mw-studio-rec">
                    {/* Real progress, because recording is real time — a
                        spinner here would be hiding a known number. */}
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
                          <b>{c.index === null ? 'The whole deck' : `Slide ${c.index + 1}`}</b>
                          <small>
                            {c.ext.toUpperCase()} · {c.seconds}s · {(c.blob.size / 1e6).toFixed(1)} MB
                          </small>
                          <button
                            type="button"
                            onClick={() => saveBlob(
                              c.blob,
                              fileName(deck.topic, (c.index ?? 0) + 1, clips.length).replace(/\.png$/, `.${c.ext}`),
                            )}
                          >Download</button>
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
