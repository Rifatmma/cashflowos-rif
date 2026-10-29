// 👉 Voiceover, one line at a time.
//
// Microsoft's neural voices are reachable without a key and sound genuinely
// conversational, which is what was asked for: a casual, friendly American
// woman rather than a newsreader.
//
// LINES ARE SYNTHESISED SEPARATELY, and that is the whole trick. The
// obvious approach — one long render plus word-boundary events to place the
// captions — does not work here, because this client never surfaces the
// metadata stream. Rendering each line on its own means its duration is
// simply the length of its own audio file, so a caption cannot drift from
// the speech: the line IS the clip. It also buys control over the pauses
// between lines, which is how the read gets a rhythm instead of running on.

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import { writeFileSync, mkdirSync, existsSync, statSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

/** The eight US female neural voices, with what each is actually like. */
export const VOICES = {
  ava: { id: 'en-US-AvaNeural', note: 'warm, conversational, light — the most casual' },
  emma: { id: 'en-US-EmmaNeural', note: 'bright and friendly, a little faster' },
  jenny: { id: 'en-US-JennyNeural', note: 'the familiar friendly assistant voice' },
  aria: { id: 'en-US-AriaNeural', note: 'clear and professional, more newsreader' },
  michelle: { id: 'en-US-MichelleNeural', note: 'calm, lower, unhurried' },
} as const

export type VoiceId = keyof typeof VOICES

export type Spoken = {
  text: string
  file: string
  /** Seconds of speech, measured from the rendered audio. */
  dur: number
}

/**
 * Speak one line to an mp3 and measure it.
 *
 * `rate` and `pitch` go through SSML. A showreel wants the read slightly
 * quicker than default — the owner asked for a faster beat, and a voice
 * ambling over a cut that has already happened is the thing that makes a
 * piece feel slow.
 */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** A line's identity: same words, voice and prosody means the same audio. */
const stamp = (text: string, voice: string, rate: string, pitch: string) =>
  createHash('sha1').update([text, voice, rate, pitch].join('|')).digest('hex').slice(0, 12)

export async function speak(
  text: string, file: string, voice: VoiceId = 'ava', rate = '+12%', pitch = '+2%',
): Promise<Spoken> {
  // CACHED BY CONTENT. A sixteen-line script re-rendered on every tweak of
  // the picture is both slow and a good way to get rate-limited; the stamp
  // file means only lines whose WORDS changed are spoken again.
  const key = stamp(text, voice, rate, pitch)
  const keyFile = file + '.key'
  if (existsSync(file) && statSync(file).size > 1000
      && existsSync(keyFile) && readFileSync(keyFile, 'utf8') === key) {
    return { text, file, dur: await durationOf(file) }
  }

  // The service answers 429 when a script is pushed at it back to back, so
  // this retries with a widening gap rather than failing the whole render
  // on one line.
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const tts = new MsEdgeTTS()
      await tts.setMetadata(VOICES[voice].id, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      // Escaped: a bare "&" in a line ends the request with no audio.
      const r = await tts.toStream(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), { rate, pitch } as any)
      const chunks: Buffer[] = []
      await new Promise<void>((res, rej) => {
        r.audioStream.on('data', (c: Buffer) => chunks.push(c))
        r.audioStream.on('end', () => res())
        r.audioStream.on('error', rej)
      })
      const buf = Buffer.concat(chunks)
      if (!buf.length) throw new Error('empty audio')
      writeFileSync(file, buf)
      writeFileSync(keyFile, key)
      return { text, file, dur: await durationOf(file) }
    } catch (e) {
      lastErr = e
      await sleep(900 * Math.pow(2, attempt))
    }
  }
  throw new Error(
    `Could not speak "${text.slice(0, 48)}…" after 5 attempts: ${String((lastErr as any)?.message ?? lastErr)}`,
  )
}

/** Length of an audio file in seconds, read from ffmpeg rather than guessed. */
export function durationOf(file: string): Promise<number> {
  return new Promise((res, rej) => {
    const p = spawn(ffmpegPath as string, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => { err += d.toString() })
    p.on('close', () => {
      const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(err)
      if (!m) return rej(new Error('Could not read a duration from ' + file))
      res(+m[1] * 3600 + +m[2] * 60 + +m[3])
    })
  })
}

export type Line = {
  /** What she says. */
  say: string
  /** What appears on screen. Defaults to the spoken text. */
  show?: string
  /** Seconds of silence held after this line, for the cut to breathe. */
  pause?: number
}

export type Timed = Line & { file: string; start: number; dur: number; end: number }

/**
 * Render a script and lay it out on a timeline.
 *
 * Returns each line with the exact second it starts and ends, which is what
 * the picture then follows — the film is cut to the read, not the other way
 * round.
 */
export async function narrate(
  lines: Line[], dir: string, voice: VoiceId = 'ava', rate = '+12%', startAt = 0,
): Promise<{ timed: Timed[]; total: number }> {
  mkdirSync(dir, { recursive: true })
  const timed: Timed[] = []
  let t = startAt
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const file = `${dir}/vo${String(i).padStart(2, '0')}.mp3`
    const s = await speak(l.say, file, voice, rate)
    timed.push({ ...l, file, start: t, dur: s.dur, end: t + s.dur })
    t += s.dur + (l.pause ?? 0.25)
    // Paced rather than hammered. Cached lines return instantly, so this
    // only costs anything the first time a script is rendered.
    await new Promise(r => setTimeout(r, 350))
  }
  return { timed, total: t }
}
