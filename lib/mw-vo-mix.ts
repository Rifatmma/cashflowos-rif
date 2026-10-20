// 👉 Laying a narration track out in time, and mixing it under music.
//
// Each line is its own mp3 (see mw-voice), so building the finished
// narration means decoding each one and dropping it at its own offset in a
// single buffer. Doing it here rather than in an ffmpeg filter graph keeps
// the arithmetic in one place: the same `start` value positions the audio
// and drives the card on screen, so a caption cannot disagree with the
// voice saying it.
//
// The music is ducked rather than merely quiet. A bed at a fixed low volume
// either fights the voice in the loud bars or disappears in the quiet ones;
// pulling it down only while she is speaking keeps the hits audible between
// lines, which is where a cut usually lands.

import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import { SAMPLE_RATE } from './mw-score'

/** Decode any audio file to mono float samples at the score's rate. */
export function decodePcm(file: string): Promise<Float32Array> {
  return new Promise((res, rej) => {
    const p = spawn(ffmpegPath as string, [
      '-v', 'error', '-i', file,
      '-f', 'f32le', '-ac', '1', '-ar', String(SAMPLE_RATE), 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let err = ''
    p.stdout.on('data', c => chunks.push(c))
    p.stderr.on('data', d => { err += d.toString() })
    p.on('close', code => {
      if (code !== 0) return rej(new Error(`decode failed for ${file}: ${err.slice(-300)}`))
      const b = Buffer.concat(chunks)
      res(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)))
    })
  })
}

export type Placed = { file: string; start: number }

/**
 * Build one narration track with each line at its own second.
 *
 * Lines are faded in and out over 8ms. Neural TTS clips can begin on a
 * non-zero sample, and dropping one straight into a buffer puts a click at
 * the top of every sentence — audible, and exactly the kind of thing that
 * makes a piece sound homemade.
 */
export async function buildNarration(lines: Placed[], seconds: number): Promise<Float32Array> {
  const out = new Float32Array(Math.ceil(seconds * SAMPLE_RATE))
  const fade = Math.round(0.008 * SAMPLE_RATE)
  for (const l of lines) {
    const pcm = await decodePcm(l.file)
    const at = Math.round(l.start * SAMPLE_RATE)
    for (let i = 0; i < pcm.length; i++) {
      const j = at + i
      if (j >= out.length) break
      const g = Math.min(1, i / fade, (pcm.length - i) / fade)
      out[j] += pcm[i] * g
    }
  }
  return out
}

/**
 * How loud the music may be at each sample: full, except under the voice.
 *
 * The envelope opens and closes over a fifth of a second — fast enough that
 * the bed is back before the next hit, slow enough that it is not heard
 * moving.
 */
export function duckEnvelope(
  narration: Float32Array, floorGain = 0.3, attack = 0.12, release = 0.35,
): Float32Array {
  const n = narration.length
  const env = new Float32Array(n)

  // Follow the voice's energy rather than its waveform, so the duck tracks
  // phrases instead of flapping on every syllable.
  let follow = 0
  const aCo = Math.exp(-1 / (attack * SAMPLE_RATE))
  const rCo = Math.exp(-1 / (release * SAMPLE_RATE))
  for (let i = 0; i < n; i++) {
    const level = Math.abs(narration[i])
    follow = level > follow ? aCo * follow + (1 - aCo) * level : rCo * follow + (1 - rCo) * level
    // 0 when silent, 1 when she is clearly speaking.
    const speech = Math.min(1, follow / 0.08)
    env[i] = 1 - (1 - floorGain) * speech
  }
  return env
}

/** Mix a ducked music bed under the narration into one stereo pair. */
export function mixUnder(
  musicL: Float32Array, musicR: Float32Array, narration: Float32Array,
  musicGain = 0.85, voiceGain = 1.25,
): { left: Float32Array; right: Float32Array } {
  const n = Math.max(musicL.length, narration.length)
  const env = duckEnvelope(narration)
  const left = new Float32Array(n)
  const right = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const duck = i < env.length ? env[i] : 1
    const v = i < narration.length ? narration[i] * voiceGain : 0
    left[i] = Math.tanh(((musicL[i] ?? 0) * musicGain * duck + v) * 0.85)
    right[i] = Math.tanh(((musicR[i] ?? 0) * musicGain * duck + v) * 0.85)
  }
  return { left, right }
}
