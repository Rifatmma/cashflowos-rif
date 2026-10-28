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

// The English-only en-US Ava. The Multilingual voice guesses the language phrase
// by phrase, so a place or brand name (Diwali, AirAsia, Kuala Lumpur) could tip
// a phrase into another accent mid-line.
export const AVA = 'en-US-AvaNeural'
// The Mandarin voice for Chinese videos: warm and polished, picked by the
// owner over the livelier Xiaoyi (28 Oct 2026).
export const XIAOXIAO = 'zh-CN-XiaoxiaoNeural'
export type Narrator = 'ava' | 'xiaoxiao'
const VOICE: Record<Narrator, { id: string; rate: string }> = {
  ava: { id: AVA, rate: '+6%' },
  xiaoxiao: { id: XIAOXIAO, rate: '+4%' },
}

// Acronyms are read letter by letter ("L M X", not "lemex"). The service then
// times each letter as its own word (a plural rides on the last: C, P, Ms), so
// those are folded back into the written acronym for the on-screen cues.
const ACR = /\b([A-Z]{2,5})(s?)\b/g
export const spoken = (t: string) => t.replace(ACR, (_, a: string, s: string) => a.split('').join(' ') + s)
export function refold(text: string, words: [string, number][]): [string, number][] {
  const out: [string, number][] = []
  let i = 0
  for (const m of text.matchAll(ACR)) {
    const n = m[1].length
    while (i < words.length && words.slice(i, i + n).map(w => w[0]).join('') !== m[0]) out.push(words[i++])
    if (i < words.length) { out.push([m[0], words[i][1]]); i += n }
  }
  return out.concat(words.slice(i))
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export type SpokenLine = VoiceLine & { mp3: string }

async function speakOnce(text: string, who: Narrator): Promise<SpokenLine> {
  const tts = new MsEdgeTTS()
  try {
    await tts.setMetadata(VOICE[who].id, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true })
    const { audioStream, metadataStream } = tts.toStream(spoken(text), { rate: VOICE[who].rate })
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
    return { text, dur, words: refold(text, words), mp3: audio.toString('base64') }
  } finally {
    try { tts.close() } catch { /* already closed */ }
  }
}

/** One line, retried: the service drops requests that arrive back to back. */
export async function speakLine(text: string, who: Narrator = 'ava'): Promise<SpokenLine> {
  let last: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await speakOnce(text, who) } catch (e) { last = e; await sleep(600 * (attempt + 1)) }
  }
  throw new Error(`${who === 'ava' ? 'Ava' : 'Xiaoxiao'} could not say "${text.slice(0, 40)}…": ${String((last as any)?.message ?? last)}`)
}

/** Every line, three at a time — quick enough for a function's time limit, gentle enough not to be refused. */
export async function speakAll(lines: string[], who: Narrator = 'ava'): Promise<SpokenLine[]> {
  const out: SpokenLine[] = new Array(lines.length)
  let next = 0
  const worker = async () => {
    while (next < lines.length) { const i = next++; out[i] = await speakLine(lines[i], who) }
  }
  await Promise.all([worker(), worker(), worker()])
  return out
}
