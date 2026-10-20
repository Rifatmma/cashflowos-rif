// Three candidate voices saying the same line, so the owner can pick.
//   npx -y tsx --conditions=react-server scripts/voice-samples.mts

import { speak, VOICES, type VoiceId } from '../lib/mw-voice'
import { mkdirSync } from 'node:fs'

const LINE =
  'Okay so — out of home advertising was basically the last medium you could not measure. ' +
  'That just changed, and here is how.'

const out = 'C:/Users/MOVING WELLS/mw-social/vo'
mkdirSync(out, { recursive: true })

const picks: VoiceId[] = ['ava', 'emma', 'jenny']
for (const v of picks) {
  const s = await speak(LINE, `${out}/voice-${v}.mp3`, v, '+12%')
  console.log(v.padEnd(7), s.dur.toFixed(2) + 's', '·', VOICES[v].note)
}
console.log('done')
