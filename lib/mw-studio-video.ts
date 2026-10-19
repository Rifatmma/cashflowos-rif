import {
  drawSlide, drawFilmSurface, drawSegmentText, SIZE, SLIDE_SECONDS, SEGMENT_SECONDS,
  type Deck, type Format, type Slide, type Segment, type Template,
} from './mw-studio-design'

// 👉 Turning the slides into video, in the browser, with nothing installed.
//
// WHY NOT FFMPEG. The obvious plan was: render frames, encode with ffmpeg.
// That needs a binary this machine does not have and Vercel cannot run, so
// it would have meant either an npm-shipped ffmpeg build in the bundle or a
// render service. Both are a lot of machinery for a four-second clip.
//
// MediaRecorder on canvas.captureStream() needs none of it. The browser
// already contains a hardware video encoder; this hands the canvas to it and
// gets an MP4 back. No dependency, no server, no upload, and the file never
// leaves the machine.
//
// WHAT IT COSTS. MediaRecorder records in real time — a twenty-second deck
// takes twenty seconds to produce. That is the honest trade for having no
// encoder, and the UI says so rather than looking frozen.
//
// MP4 vs WEBM. Chrome has recorded MP4 since v126 and Safari does too.
// Firefox does not, and gets WebM — which Instagram will not accept. The
// caller is told which one it got so it can say so, because a file that
// silently will not upload is worse than a warning.
//
// THE TAB MUST STAY VISIBLE, and this is the sharp edge of the whole
// approach. Browsers throttle requestAnimationFrame to roughly one tick a
// second in a hidden tab, so recording from a background tab produces a file
// of the right duration containing almost no frames. The first run of this
// code did exactly that: a 4.7-second MP4 of 45 KB, which plays as a few
// frozen stills and looks like a corrupt export rather than a throttled one.
//
// It cannot be engineered around — timers are throttled too, and
// MediaRecorder stamps frames by wall clock, so there is no way to render
// faster than real time and still get the right duration. So it is guarded
// instead: recording refuses to start in a hidden tab, and aborts with an
// explanation if the tab is hidden part way through. A broken file that
// announces itself is survivable; a silent one is not.

export type VideoKind = 'per-slide' | 'reel' | 'film'

export type Clip = {
  blob: Blob
  /** 'mp4' posts anywhere. 'webm' does not — Instagram rejects it. */
  ext: 'mp4' | 'webm'
  /** Which slide, or null for the whole deck as one film. */
  index: number | null
  seconds: number
}

/**
 * Pick the best container this browser will actually encode.
 *
 * Ordered by what the platforms accept, not by quality. An h.264 MP4 is the
 * only thing every network takes without re-encoding it themselves.
 */
export function pickMime(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const tries: { mime: string; ext: 'mp4' | 'webm' }[] = [
    { mime: 'video/mp4;codecs=avc1.4d002a', ext: 'mp4' },   // h.264 main
    { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },   // h.264 baseline
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ]
  return tries.find(t => MediaRecorder.isTypeSupported(t.mime)) ?? null
}

export type RecordOpts = {
  /** Seconds each slide is on screen. */
  seconds?: number
  fps?: number
  /** Called with 0..1 so the screen can show real progress, not a spinner. */
  onProgress?: (done: number) => void
  /** Lets the person stop a long recording. */
  signal?: AbortSignal
}

/**
 * Record a run of slides onto one canvas as a single clip.
 *
 * Animating several slides into ONE recording is what makes a reel possible
 * without concatenating anything: the canvas simply changes what it is
 * drawing while the recorder keeps running.
 */
async function recordRun(
  slides: Slide[], format: Format, photos: Map<number, CanvasImageSource>,
  opts: RecordOpts, offset: number, totalSlides: number, template: Template,
): Promise<Omit<Clip, 'index'>> {
  const { w, h } = SIZE[format]
  const seconds = opts.seconds ?? SLIDE_SECONDS
  const fps = opts.fps ?? 30
  const chosen = pickMime()
  if (!chosen) throw new Error('This browser cannot record video.')

  if (document.hidden) {
    throw new Error('Keep this tab in front while recording — a hidden tab records almost no frames.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a drawing context.')

  // The first frame must already be on the canvas before capture starts, or
  // the clip opens on one blank frame — which looks like a broken file.
  drawSlide(ctx, slides[0], format, photoFor(photos, offset), { at: 0, total: seconds }, template)

  const stream = canvas.captureStream(fps)
  const rec = new MediaRecorder(stream, {
    mimeType: chosen.mime,
    videoBitsPerSecond: 8_000_000,       // 1080-wide text needs the headroom
  })
  const chunks: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }

  const done = new Promise<Blob>(resolve => {
    rec.onstop = () => resolve(new Blob(chunks, { type: chosen.mime }))
  })
  rec.start()

  const started = performance.now()
  let lastReport = 0
  const runSeconds = seconds * slides.length

  // If the tab goes away mid-take the remaining frames would be lost, so the
  // run is abandoned and the caller is told why rather than handed a file
  // that is three-quarters frozen.
  let wentAway = false
  let frames = 0
  const onHide = () => { if (document.hidden) wentAway = true }
  document.addEventListener('visibilitychange', onHide)

  await new Promise<void>(resolve => {
    const tick = () => {
      if (opts.signal?.aborted || wentAway) return resolve()
      const now = performance.now()
      const elapsed = (now - started) / 1000
      if (elapsed >= runSeconds) return resolve()

      frames++
      const i = Math.min(slides.length - 1, Math.floor(elapsed / seconds))
      drawSlide(
        ctx, slides[i], format, photoFor(photos, offset + i),
        { at: elapsed - i * seconds, total: seconds }, template,
      )

      // PROGRESS IS THROTTLED, and this was not a nicety. Reporting on every
      // frame means a React state change on every frame, which re-renders
      // the whole Studio — every slide preview included — in the middle of
      // the take. Measured: drawing a frame costs 0.28ms, but the recorder
      // was managing 13 frames a second against a display doing 26. Four
      // updates a second is plenty for a progress bar and costs nothing.
      if (now - lastReport > 250) {
        lastReport = now
        opts.onProgress?.((offset + i + (elapsed % seconds) / seconds) / totalSlides)
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  // One last frame at the very end of the exit, so the clip does not stop
  // mid-fade with the text half visible.
  drawSlide(
    ctx, slides[slides.length - 1], format,
    photoFor(photos, offset + slides.length - 1),
    { at: seconds, total: seconds }, template,
  )
  await new Promise(r => setTimeout(r, 120))

  rec.stop()
  stream.getTracks().forEach(t => t.stop())
  document.removeEventListener('visibilitychange', onHide)

  const blob = await done
  if (wentAway) {
    throw new Error('Recording stopped because the tab went into the background. Keep it in front and try again.')
  }
  // THE CHECK IS ON FRAMES DRAWN, NOT FILE SIZE.
  //
  // File size was the first instinct and it is a bad proxy. These slides are
  // a flat gradient with text on it, so once the words settle every frame is
  // identical to the last and h.264 spends almost nothing on them: a
  // perfectly good four-second clip came out at 165 KB and all but tripped a
  // 150 KB floor. Frames actually rendered is the thing that goes wrong when
  // a tab is throttled, so it is the thing measured.
  // Judged against what this display can actually manage, not an assumed 30 —
  // a 24Hz screen is not a fault, a throttled tab is.
  const expected = runSeconds * (opts.fps ?? 30)
  if (frames < expected * 0.5) {
    throw new Error(
      `Only ${frames} of about ${Math.round(expected)} frames were drawn, so the clip would stutter. ` +
      'This happens when the tab is not in front — keep it visible and try again.',
    )
  }
  return { blob, ext: chosen.ext, seconds: runSeconds }
}

function photoFor(photos: Map<number, CanvasImageSource>, i: number) {
  const p = photos.get(i)
  return p ? { photo: p } : {}
}

/**
 * Render a deck to video.
 *
 * 'reel' is one continuous film of every slide — what you post as a Reel or
 * a LinkedIn video. 'per-slide' is one clip each, so a carousel can be
 * posted as a carousel with moving slides rather than as a single film.
 */
export async function recordDeck(
  deck: Deck, photos: Map<number, CanvasImageSource>, kind: VideoKind,
  template: Template, opts: RecordOpts = {},
): Promise<Clip[]> {
  if (kind === 'reel') {
    const c = await recordRun(deck.slides, deck.format, photos, opts, 0, deck.slides.length, template)
    return [{ ...c, index: null }]
  }
  const out: Clip[] = []
  for (let i = 0; i < deck.slides.length; i++) {
    if (opts.signal?.aborted) break
    const c = await recordRun([deck.slides[i]], deck.format, photos, opts, i, deck.slides.length, template)
    out.push({ ...c, index: i })
  }
  return out
}

/**
 * Record a film: one unchanging design, the words changing every few seconds.
 *
 * This is the shape the owner asked for — fifteen seconds or more, with a new
 * headline, subheadline and description on each beat. It is also the cleanest
 * possible version of the original brief, because here the background really
 * IS a static image: it is painted once into an offscreen bitmap and blitted
 * for every frame, so nothing but the type can possibly move, and each frame
 * costs one drawImage plus the words.
 */
export async function recordFilm(
  segments: Segment[], format: Format, template: Template,
  photo: CanvasImageSource | undefined, source: string | undefined,
  opts: RecordOpts = {},
): Promise<Clip> {
  if (document.hidden) {
    throw new Error('Keep this tab in front while recording — a hidden tab records almost no frames.')
  }
  if (!segments.length) throw new Error('There are no beats to record.')

  const { w, h } = SIZE[format]
  const seconds = opts.seconds ?? SEGMENT_SECONDS
  const fps = opts.fps ?? 30
  const chosen = pickMime()
  if (!chosen) throw new Error('This browser cannot record video.')

  // The background, painted once. Everything the owner called "static image"
  // lives in here and is never redrawn.
  const back = document.createElement('canvas')
  back.width = w
  back.height = h
  const bctx = back.getContext('2d')
  if (!bctx) throw new Error('Could not get a drawing context.')
  const surface = drawFilmSurface(bctx, format, template, photo ? { photo } : {}, source)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a drawing context.')

  const frame = (at: number, i: number) => {
    ctx.globalAlpha = 1
    ctx.drawImage(back, 0, 0)
    drawSegmentText(ctx, segments[i], format, surface, { at, total: seconds })
  }
  frame(0, 0)

  const stream = canvas.captureStream(fps)
  const rec = new MediaRecorder(stream, { mimeType: chosen.mime, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  const done = new Promise<Blob>(resolve => {
    rec.onstop = () => resolve(new Blob(chunks, { type: chosen.mime }))
  })
  rec.start()

  const runSeconds = seconds * segments.length
  const started = performance.now()
  let lastReport = 0
  let frames = 0
  let wentAway = false
  const onHide = () => { if (document.hidden) wentAway = true }
  document.addEventListener('visibilitychange', onHide)

  await new Promise<void>(resolve => {
    const tick = () => {
      if (opts.signal?.aborted || wentAway) return resolve()
      const now = performance.now()
      const elapsed = (now - started) / 1000
      if (elapsed >= runSeconds) return resolve()
      frames++
      const i = Math.min(segments.length - 1, Math.floor(elapsed / seconds))
      frame(elapsed - i * seconds, i)
      if (now - lastReport > 250) {
        lastReport = now
        opts.onProgress?.(elapsed / runSeconds)
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  frame(seconds, segments.length - 1)
  await new Promise(r => setTimeout(r, 120))
  rec.stop()
  stream.getTracks().forEach(t => t.stop())
  document.removeEventListener('visibilitychange', onHide)

  const blob = await done
  if (wentAway) {
    throw new Error('Recording stopped because the tab went into the background. Keep it in front and try again.')
  }
  const expected = runSeconds * fps
  if (frames < expected * 0.5) {
    throw new Error(
      `Only ${frames} of about ${Math.round(expected)} frames were drawn, so the clip would stutter. ` +
      'This happens when the tab is not in front — keep it visible and try again.',
    )
  }
  return { blob, ext: chosen.ext, index: null, seconds: runSeconds }
}

/** How long a film of these beats will run. */
export function filmSeconds(beats: number, secondsEach = SEGMENT_SECONDS): number {
  return Math.round(beats * secondsEach)
}

/** Roughly how long the person is about to wait. Real time, so it is exact. */
export function estimateSeconds(deck: Deck, opts: RecordOpts = {}): number {
  return Math.round(deck.slides.length * (opts.seconds ?? SLIDE_SECONDS))
}
