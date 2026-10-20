// Can we get a natural American female voice AND word-level timings?
//   npx -y tsx --conditions=react-server scripts/vo-test.mts
//
// Timings are the whole question. Audio alone would mean captions guessed
// from word counts, which drift within a sentence and are obvious the
// moment a number or a long word appears. Word boundaries make the text
// land on the syllable.

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import { writeFileSync } from 'node:fs'

const LINE = 'Out of home advertising was the last medium you could not measure. That just changed.'

const tts = new MsEdgeTTS()
await tts.setMetadata('en-US-AvaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
const r = await tts.toStream(LINE)

const audio: Buffer[] = []
const meta: any[] = []

const audioDone = new Promise<void>(res => {
  r.audioStream.on('data', (c: Buffer) => audio.push(c))
  r.audioStream.on('end', () => res())
})
const metaDone = new Promise<void>(res => {
  if (!r.metadataStream) return res()
  r.metadataStream.on('data', (d: any) => {
    const s = typeof d === 'string' ? d : d.toString()
    for (const line of s.split('\n')) {
      const t = line.trim()
      if (!t.startsWith('{')) continue
      try { meta.push(JSON.parse(t)) } catch { /* partial */ }
    }
  })
  r.metadataStream.on('end', () => res())
})

await Promise.all([audioDone, metaDone])

const buf = Buffer.concat(audio)
writeFileSync('C:/Users/MOVING WELLS/mw-social/showreel/vo-test.mp3', buf)
console.log('audio bytes:', buf.length)
console.log('metadata events:', meta.length)

const words = meta
  .flatMap(m => m?.Metadata ?? [])
  .filter((m: any) => m.Type === 'WordBoundary')
  .map((m: any) => ({
    // Offsets are in 100-nanosecond ticks.
    at: +(m.Data.Offset / 1e7).toFixed(3),
    dur: +(m.Data.Duration / 1e7).toFixed(3),
    text: m.Data.text?.Text,
  }))

console.log('word boundaries:', words.length)
console.log(words.slice(0, 10).map(w => `${w.at}s ${w.text}`).join('  |  '))
if (words.length) {
  const last = words[words.length - 1]
  console.log('last word ends at', (last.at + last.dur).toFixed(2), 's')
}
