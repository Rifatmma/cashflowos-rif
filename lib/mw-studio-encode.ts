import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { SIZE, type Format } from './mw-studio-design'

// 👉 Encoding frames, instead of filming the screen.
//
// WHY THIS REPLACED MediaRecorder, measured rather than assumed.
//
// The first video the owner actually made was analysed frame by frame: 602
// samples at 1/30s across a 20-second clip, fingerprinting each one. Of
// those, 211 were duplicates of the frame before — an effective 19.6 frames
// a second against a target of 30 — and one run of SEVENTY identical frames
// sat at 4.93s, a 2.3-second freeze that swallowed the whole entrance of
// the second beat.
//
// That is not a tuning problem. MediaRecorder films a canvas in real time
// off requestAnimationFrame, so the output is only ever as smooth as the
// machine happened to be during those twenty seconds. A background tab, an
// occluded window, a garbage collection pause, or simply a display that
// cannot sustain 30fps all land straight in the file, and the person
// recording has no way to know until they watch it. Guarding it, which is
// what the previous version did, turns a silent bad file into a loud
// failure — better, but it still cannot produce a good one.
//
// WebCodecs removes the clock from the problem. Frames are handed to the
// encoder with explicit timestamps and muxed in order, so frame 7 is at
// exactly 7/30 of a second whether it took one millisecond to draw or four
// hundred. The result is 30fps by construction. It also encodes faster than
// real time, and — the part that matters for how this feels to use — the
// tab no longer has to stay in front.
//
// mp4-muxer is the one dependency: VideoEncoder produces h.264 chunks and
// something has to wrap them in an MP4 container. It is small, pure JS, and
// does nothing else.

export type EncodeOpts = {
  fps?: number
  /** 0..1, called a few times a second. */
  onProgress?: (done: number) => void
  signal?: AbortSignal
}

/** Is frame-exact encoding available? Chrome and Safari yes, Firefox not yet. */
export function canEncode(): boolean {
  return typeof window !== 'undefined'
    && typeof (window as any).VideoEncoder === 'function'
    && typeof (window as any).VideoFrame === 'function'
}

/**
 * Encode a sequence of drawn frames to MP4.
 *
 * `paint` is called once per frame with the exact media time that frame
 * represents — never with "how long has elapsed", which is the whole point.
 * It draws onto the canvas it is given and returns nothing.
 */
export async function encodeFrames(
  format: Format,
  seconds: number,
  paint: (ctx: CanvasRenderingContext2D, at: number, frame: number) => void,
  opts: EncodeOpts = {},
): Promise<Blob> {
  const { w, h } = SIZE[format]
  const fps = opts.fps ?? 30
  const total = Math.max(1, Math.round(seconds * fps))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a drawing context.')

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: w, height: h },
    fastStart: 'in-memory',        // the moov atom first, so it streams
  })

  let failure: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { failure = e instanceof Error ? e : new Error(String(e)) },
  })

  // 8 Mbps at 1080 wide. These slides are flat colour and sharp type, which
  // compresses to far less than that in practice — the ceiling is there so
  // the entrance of a headline never smears.
  encoder.configure({
    codec: 'avc1.4d0032',          // h.264 Main, level 5.0 — covers 1080x1920
    width: w,
    height: h,
    bitrate: 8_000_000,
    framerate: fps,
  })

  const usPerFrame = 1_000_000 / fps

  try {
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new Error('Cancelled.')
      if (failure) throw failure

      paint(ctx, i / fps, i)

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(i * usPerFrame),
        duration: Math.round(usPerFrame),
      })
      // A keyframe every second keeps seeking responsive and costs little
      // on content this static.
      encoder.encode(frame, { keyFrame: i % fps === 0 })
      frame.close()

      // Without this the whole clip is queued before anything is encoded,
      // which spikes memory on a 20-second 1080x1920 and makes progress a
      // lie. Letting the queue drain keeps both honest.
      if (encoder.encodeQueueSize > 8) {
        await new Promise<void>(r => {
          const check = () => (encoder.encodeQueueSize <= 4 ? r() : setTimeout(check, 4))
          check()
        })
      }
      if (i % 10 === 0) {
        opts.onProgress?.(i / total)
        // Yield so the progress bar can actually paint.
        await new Promise(r => setTimeout(r, 0))
      }
    }

    await encoder.flush()
    if (failure) throw failure
    muxer.finalize()
    opts.onProgress?.(1)
    const { buffer } = muxer.target as ArrayBufferTarget
    return new Blob([buffer], { type: 'video/mp4' })
  } finally {
    // close() throws if the encoder is already closed, and a throw inside a
    // finally would replace the real error with a meaningless one.
    try { if (encoder.state !== 'closed') encoder.close() } catch { /* already gone */ }
  }
}
