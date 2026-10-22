// The Studio's pre-export check: loudness to BS.1770, and the timing fixer.
//   npx -y tsx --conditions=react-server tests/mw-video-audit.test.mts
//
// Loudness is checked against the standard's own reference: a 997 Hz sine at
// full scale in one channel reads −3.01 LUFS, so the same tone at amplitude A
// in both channels reads 20·log10(A). The fixer is checked on the cases the
// 5-article test hit: a credit landing 3.9s after its word, a burst word up
// 0.1s too briefly.

import { loudness, normaliseMix, autoFix, type Finding } from '../lib/mw-video-audit.ts'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const near = (a: number, b: number, tol: number, m: string) =>
  Math.abs(a - b) <= tol ? ok(`${m} (${a.toFixed(2)})`) : (bad++, console.log(`FAIL ${m}\n       got    ${a}\n       wanted ${b} ± ${tol}`))
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m)
    : (bad++, console.log(`FAIL ${m}\n       got    ${JSON.stringify(a)}\n       wanted ${JSON.stringify(b)}`))

const SR = 48_000
const tone = (amp: number, secs = 5) => Float32Array.from({ length: SR * secs }, (_, i) => amp * Math.sin(2 * Math.PI * 997 * i / SR))
near(loudness(tone(0.1), tone(0.1)), -20, 0.15, 'a 997 Hz tone at 0.1 in both channels is −20 LUFS')
near(loudness(tone(0.5), tone(0.5)), -6.02, 0.15, 'at 0.5 it is −6 LUFS')
eq(loudness(new Float32Array(SR * 2), new Float32Array(SR * 2)), -Infinity, 'silence has no loudness (absolute gate)')

const quiet = normaliseMix({ left: tone(0.05), right: tone(0.05) })
near(quiet.after, -14, 0.15, 'a quiet mix is raised to −14 LUFS')
near(loudness(quiet.left, quiet.right), -14, 0.15, '… and measures −14 LUFS after')
const hot = normaliseMix({ left: tone(0.95), right: tone(0.95) })
const peak = hot.left.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
eq(peak <= Math.pow(10, -2 / 20) + 1e-6, true, `a hot mix comes down (${(20 * Math.log10(peak)).toFixed(2)} dBFS peak)`)
// a quiet mix with one hit (a whoosh, a stinger): raising it to −14 would clip, so the peak caps the gain
const spiky = tone(0.01); spiky[SR] = 0.9
const capped = normaliseMix({ left: spiky, right: spiky.slice() })
const cpk = capped.left.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
near(20 * Math.log10(cpk), -2, 0.01, 'when the peak would clip, the peak sets the gain at −2 dBFS')
eq(capped.after < -14, true, `… and the loudness stays under target rather than clipping (${capped.after.toFixed(1)} LUFS)`)

const film: any = {
  dur: 12, starts: [0, 4],
  scenes: [
    { kind: 'panel', a: 4, b: 9, text: [{ s: 'Source: eMarketer', st: 'b', t: 7.88 }] },
    { kind: 'burst', a: 9, b: 12, words: [{ s: 'Plan.', t: 9.3 }, { s: 'MW Science.', t: 10.6 }, { s: 'Buy.', t: 11.4 }] },
  ],
}
const f = (o: Partial<Finding>): Finding => ({ severity: 'should fix', source: 'layout', fix: 'auto', scene: '', t: 0, text: '', detail: '', rule: '', kind: 'late', ...o })
const r = autoFix(film, [
  f({ kind: 'late', si: 0, text: 'Source: eMarketer', wordAt: 4.1 }),
  f({ kind: 'hold', si: 1, text: 'MW Science.', burst: true, readable: 0.5, need: 0.6 }),
])
eq(r.film.scenes[0].text[0].t, 4.15, 'a late credit moves to its scene opening, the nearest it can get to Ava’s word')
eq(r.film.scenes[1].words[1].t, 10.45, 'a burst word comes in 0.15s earlier to be up long enough')
eq(film.scenes[0].text[0].t, 7.88, 'the original film is not changed')
eq(r.changed.length, 2, 'both changes are reported')
eq(autoFix(film, [f({ kind: 'sequence', fix: 'approve', si: 0, text: 'Feature 4' })]).changed, [], 'approve findings are never touched')

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
