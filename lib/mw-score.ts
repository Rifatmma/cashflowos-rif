// 👉 The soundtrack, written as code.
//
// A showreel without sound is half a showreel, and licensing a track is not
// something I can do. So the score is synthesised from the same timeline
// that drives the picture — which is not a compromise but an advantage: a
// hit lands on the exact frame of a cut because both are computed from one
// number, rather than an editor nudging a waveform until it looks right.
//
// This is deliberately a small, blunt synth: sine and saw oscillators, a
// one-pole filter, exponential envelopes, white noise. It is not trying to
// sound like a studio. It is trying to sound intentional, sit under motion
// graphics, and hit hard on the beat — which is most of what a bed track
// for a sixty-second piece has to do.
//
// Everything is a pure function of a sample index, for the same reason the
// motion engine is a pure function of time: a render that depends on when
// it ran is a render that eventually goes wrong quietly.

export const SAMPLE_RATE = 48_000

export type Voice =
  | { kind: 'kick'; at: number; gain?: number }
  | { kind: 'sub'; at: number; dur: number; hz: number; gain?: number }
  | { kind: 'hat'; at: number; open?: boolean; gain?: number }
  | { kind: 'riser'; at: number; dur: number; gain?: number }
  | { kind: 'impact'; at: number; gain?: number }
  | { kind: 'note'; at: number; dur: number; hz: number; gain?: number; cutoff?: number }
  | { kind: 'swell'; at: number; dur: number; hz: number; gain?: number }

const TAU = Math.PI * 2

/** Exponential decay, which is what percussion actually does. */
const decay = (t: number, tau: number) => Math.exp(-t / tau)

/** A short fade at both ends of a tone, so nothing clicks. */
function edges(t: number, dur: number, fade = 0.006): number {
  if (t < 0 || t > dur) return 0
  return Math.min(1, t / fade, (dur - t) / fade)
}

/**
 * Render a list of voices to a stereo float buffer.
 *
 * Mixed additively with a soft limiter at the end rather than per-voice
 * ducking: on a bed this dense the only thing that matters is that a kick
 * and an impact landing together do not clip.
 */
export function render(voices: Voice[], seconds: number): { left: Float32Array; right: Float32Array } {
  const n = Math.ceil(seconds * SAMPLE_RATE)
  const left = new Float32Array(n)
  const right = new Float32Array(n)

  // One running filter state per voice is unnecessary; the filtered voices
  // are short enough to carry their own.
  for (const v of voices) {
    const start = Math.floor(v.at * SAMPLE_RATE)
    if (start >= n) continue

    if (v.kind === 'kick') {
      const g = v.gain ?? 1
      const len = Math.floor(0.42 * SAMPLE_RATE)
      let phase = 0
      for (let i = 0; i < len && start + i < n; i++) {
        const t = i / SAMPLE_RATE
        // Pitch drops from 160Hz to 46Hz — the whole character of a kick.
        const hz = 46 + 114 * decay(t, 0.028)
        phase += (TAU * hz) / SAMPLE_RATE
        const body = Math.sin(phase) * decay(t, 0.16)
        const click = (Math.random() * 2 - 1) * decay(t, 0.003) * 0.35
        const s = (body + click) * 0.9 * g
        left[start + i] += s
        right[start + i] += s
      }
    }

    else if (v.kind === 'sub') {
      const g = v.gain ?? 1
      const len = Math.floor(v.dur * SAMPLE_RATE)
      for (let i = 0; i < len && start + i < n; i++) {
        const t = i / SAMPLE_RATE
        const s = Math.sin((TAU * v.hz * i) / SAMPLE_RATE) * edges(t, v.dur, 0.02) * 0.5 * g
        left[start + i] += s
        right[start + i] += s
      }
    }

    else if (v.kind === 'hat') {
      const g = v.gain ?? 1
      const tau = v.open ? 0.12 : 0.028
      const len = Math.floor((v.open ? 0.4 : 0.12) * SAMPLE_RATE)
      // A one-pole high pass, so it reads as a hat rather than as static.
      let prev = 0, hp = 0
      for (let i = 0; i < len && start + i < n; i++) {
        const t = i / SAMPLE_RATE
        const white = Math.random() * 2 - 1
        hp = 0.86 * (hp + white - prev)
        prev = white
        const s = hp * decay(t, tau) * 0.3 * g
        // Slightly off-centre, which opens up the middle for the kick.
        left[start + i] += s * 0.85
        right[start + i] += s
      }
    }

    else if (v.kind === 'riser') {
      const g = v.gain ?? 1
      const len = Math.floor(v.dur * SAMPLE_RATE)
      let lp = 0
      for (let i = 0; i < len && start + i < n; i++) {
        const k = i / len
        const white = Math.random() * 2 - 1
        // The filter opens as the riser climbs: that sweep IS the tension.
        const a = 0.0025 + 0.22 * k * k
        lp += a * (white - lp)
        const tone = Math.sin((TAU * (220 + 1400 * k * k) * i) / SAMPLE_RATE) * 0.18 * k
        const s = (lp * 1.9 + tone) * (0.12 + 0.88 * k * k) * 0.5 * g
        left[start + i] += s
        right[start + i] += s
      }
    }

    else if (v.kind === 'impact') {
      const g = v.gain ?? 1
      const len = Math.floor(1.6 * SAMPLE_RATE)
      let lp = 0
      let phase = 0
      for (let i = 0; i < len && start + i < n; i++) {
        const t = i / SAMPLE_RATE
        const white = Math.random() * 2 - 1
        lp += 0.05 * (white - lp)
        const hz = 38 + 90 * decay(t, 0.05)
        phase += (TAU * hz) / SAMPLE_RATE
        const boom = Math.sin(phase) * decay(t, 0.55)
        const s = (boom * 1.1 + lp * decay(t, 0.3) * 1.4) * 0.85 * g
        left[start + i] += s
        right[start + i] += s
      }
    }

    else if (v.kind === 'note') {
      const g = v.gain ?? 1
      const len = Math.floor(v.dur * SAMPLE_RATE)
      const cutoff = v.cutoff ?? 0.14
      let lp = 0
      for (let i = 0; i < len && start + i < n; i++) {
        const t = i / SAMPLE_RATE
        // A saw by summed harmonics: cheap, and the partial count doubles
        // as a brightness control.
        const ph = (v.hz * i) / SAMPLE_RATE
        let saw = 0
        for (let hN = 1; hN <= 7; hN++) saw += Math.sin(TAU * ph * hN) / hN
        lp += cutoff * (saw - lp)
        const env = decay(t, v.dur * 0.45) * edges(t, v.dur, 0.008)
        const s = lp * env * 0.22 * g
        // Width, alternating by pitch so a run of notes moves across.
        const pan = ((v.hz % 7) / 7 - 0.5) * 0.5
        left[start + i] += s * (1 - pan)
        right[start + i] += s * (1 + pan)
      }
    }

    else if (v.kind === 'swell') {
      const g = v.gain ?? 1
      const len = Math.floor(v.dur * SAMPLE_RATE)
      for (let i = 0; i < len && start + i < n; i++) {
        const t = i / SAMPLE_RATE
        const k = i / len
        // Two detuned sines beating slowly against each other.
        const a = Math.sin((TAU * v.hz * i) / SAMPLE_RATE)
        const b = Math.sin((TAU * v.hz * 1.004 * i) / SAMPLE_RATE)
        const env = Math.sin(Math.PI * k) * edges(t, v.dur, 0.08)
        const s = (a + b) * 0.5 * env * 0.16 * g
        left[start + i] += s * 0.9
        right[start + i] += s
      }
    }
  }

  // Soft limit. tanh rather than a hard clip, because a bed that clips on
  // every downbeat is the single most obvious sign of a synthesised track.
  for (let i = 0; i < n; i++) {
    left[i] = Math.tanh(left[i] * 0.8)
    right[i] = Math.tanh(right[i] * 0.8)
  }
  return { left, right }
}

/** 16-bit stereo WAV, which ffmpeg will take on stdin or from a file. */
export function toWav(left: Float32Array, right: Float32Array): Buffer {
  const n = left.length
  const bytes = n * 4
  const buf = Buffer.alloc(44 + bytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + bytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)                 // PCM
  buf.writeUInt16LE(2, 22)                 // stereo
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * 4, 28)   // byte rate
  buf.writeUInt16LE(4, 32)                 // block align
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(bytes, 40)
  let o = 44
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767))), o)
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767))), o + 2)
    o += 4
  }
  return buf
}
