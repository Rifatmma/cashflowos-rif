import 'server-only'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import type { VoiceLine } from './mw-brandfilm'

// 👉 Ava, with word timings, for the brand video.
//
// lib/mw-voice speaks lines for the local reel scripts and measures each
// clip with ffmpeg. That cannot run on a Vercel function, and it was written
// when this client was believed not to surface word timings. It does: with
// `wordBoundaryEnabled` the metadata stream carries every word's offset, and
// that is what lets a headline land on the word Ava is saying rather than
// somewhere in her line.
//
// The audio goes back to the browser as base64 mp3. The browser decodes it
// anyway (to mix it under the music), and that decode gives the exact length
// — so the duration here is only an estimate for the screen to show early.

export const AVA = 'en-US-AvaMultilingualNeural'
const RATE = '+6%'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export type SpokenLine = VoiceLine & { mp3: string }

async function speakOnce(text: string): Promise<SpokenLine> {
  const tts = new MsEdgeTTS()
  try {
    await tts.setMetadata(AVA, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true })
    const { audioStream, metadataStream } = tts.toStream(text, { rate: RATE })
    const chunks: Buffer[] = []
    let meta = ''
    metadataStream?.on('data', (c: Buffer) => { meta += c.toString() })
    await new Promise<void>((res, rej) => {
      audioStream.on('data', (c: Buffer) => chunks.push(c))
      audioStream.on('end', () => res())
      audioStream.on('error', rej)
    })
    const audio = Buffer.concat(chunks)
    if (audio.length < 2000) throw new Error('no audio came back')

    // The metadata arrives as concatenated JSON objects; the fields needed
    // are plain enough to read with one pattern rather than re-framing it.
    const words: [string, number][] = []
    for (const m of meta.matchAll(/"Offset":\s*(\d+)[\s\S]*?"Text":\s*"((?:[^"\\]|\\.)*)"/g)) {
      words.push([JSON.parse(`"${m[2]}"`), +(Number(m[1]) / 1e7).toFixed(3)])
    }
    // 48 kbit/s constant bitrate, so the byte count is the length.
    const dur = +(audio.length * 8 / 48_000).toFixed(3)
    return { text, dur, words, mp3: audio.toString('base64') }
  } finally {
    try { tts.close() } catch { /* already closed */ }
  }
}

/** One line, retried: the service drops requests that arrive back to back. */
export async function speakLine(text: string): Promise<SpokenLine> {
  let last: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await speakOnce(text) } catch (e) { last = e; await sleep(600 * (attempt + 1)) }
  }
  throw new Error(`Ava could not say "${text.slice(0, 40)}…": ${String((last as any)?.message ?? last)}`)
}

/** Every line, three at a time — quick enough for a function's time limit, gentle enough not to be refused. */
export async function speakAll(lines: string[]): Promise<SpokenLine[]> {
  const out: SpokenLine[] = new Array(lines.length)
  let next = 0
  const worker = async () => {
    while (next < lines.length) { const i = next++; out[i] = await speakLine(lines[i]) }
  }
  await Promise.all([worker(), worker(), worker()])
  return out
}
