'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { researchArticleUrl, writeBrandVideo, speakBrandVideo } from './actions'
import type { Research } from '@/lib/mw-studio'
import {
  FILM_FORMATS, resolveFilm, estimateSeconds,
  type Audience, type Film, type FilmFormat, type Plan, type SubLang, type VoiceLine,
} from '@/lib/mw-brandfilm'
import { createEngine } from '@/lib/mw-brandfilm-engine'
import { buildMix, SR } from '@/lib/mw-brandfilm-score'
import { encodeAV, canEncode } from '@/lib/mw-studio-encode'

// 👉 Studio → Brand video. An article in, an Ava-voiced motion video out.
//
// The same engine as the mw-brand-video skill, so a video made here and one
// made by the skill look and sound alike. The order of the screen follows
// what costs what:
//
//   1  read the article            free to redo
//   2  who, what language, which ONE format, how long
//   3  write Ava's script          one model call — read it before going on
//   4  Ava reads it                one voice call — the timings come from her
//   5  preview, then export         in this browser; nothing is uploaded
//
// One format per export, on purpose: each one is a full encode, and the
// owner asked that people choose before spending the time.

type Assets = { shapes: any; dark: HTMLImageElement; light: HTMLImageElement }

let assetsOnce: Promise<Assets> | null = null
function loadAssets(): Promise<Assets> {
  const img = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src
  })
  assetsOnce ??= Promise.all([
    fetch('/mw/brandfilm/shapes.json').then(r => r.json()),
    img('/mw/brandfilm/dots-dark.jpg'), img('/mw/brandfilm/dots-light.jpg'),
  ]).then(([shapes, dark, light]) => ({ shapes, dark, light }))
  return assetsOnce
}

/**
 * Canvas text does not reflow when a font arrives late, so every weight the
 * engine draws is loaded before the first frame — otherwise the first frames
 * of an export come out in the fallback face and stay that way.
 */
async function loadFonts(zh: boolean) {
  const f = (document as any).fonts
  if (!f) return
  await Promise.all([
    ...['400', '600', '700', '800', 'italic 400', 'italic 600'].map(w => f.load(`${w} 40px Poppins`)),
    zh ? f.load("700 40px 'Noto Sans SC'", '中文字幕') : Promise.resolve(),
  ]).catch(() => undefined)
}

async function decodeMp3(b64: string): Promise<Float32Array> {
  const bin = atob(b64), bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ctx = new OfflineAudioContext(1, 1, SR)
  const buf = await ctx.decodeAudioData(bytes.buffer)
  return buf.getChannelData(0).slice()
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const AUD: { id: Audience; label: string; note: string }[] = [
  { id: 'agencies', label: 'Agencies', note: 'Their clients, their revenue' },
  { id: 'brands', label: 'Brands', note: 'Reach and results in new markets' },
  { id: 'media-owners', label: 'Media owners', note: 'Filling and proving inventory' },
]

export function BrandFilm() {
  const [url, setUrl] = useState('')
  const [res, setRes] = useState<Research | null>(null)
  const [audience, setAudience] = useState<Audience>('agencies')
  const [lang, setLang] = useState<SubLang>('none')
  const [format, setFormat] = useState<FilmFormat | null>(null)
  const [seconds, setSeconds] = useState(32)

  const [plan, setPlan] = useState<Plan | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  /** Ava's reading, decoded. Cleared whenever the words change. */
  const [voice, setVoice] = useState<{ lines: VoiceLine[]; pcm: Float32Array[] } | null>(null)
  const [error, setError] = useState('')
  const [busy, start] = useTransition()

  const [assets, setAssets] = useState<Assets | null>(null)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const [encoding, setEncoding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null)

  useEffect(() => { loadAssets().then(setAssets).catch(() => setError('The brand assets did not load. Refresh and try again.')) }, [])

  const film: Film | null = useMemo(
    () => (plan && voice ? resolveFilm(plan, voice.lines) : null),
    [plan, voice],
  )
  const mix = useMemo(() => (film && voice ? buildMix(film, voice.pcm) : null), [film, voice])

  // ---------------------------------------------------------------- steps

  const read = () => {
    setError(''); setRes(null); setPlan(null); setVoice(null); setClip(null)
    start(async () => {
      const r = await researchArticleUrl(url)
      if (!r.ok) return setError(r.error)
      setRes(r.research)
    })
  }

  const write = () => {
    if (!res) return
    setError(''); setPlan(null); setVoice(null); setClip(null); setNotes([])
    start(async () => {
      const r = await writeBrandVideo(res, audience, lang, seconds)
      if (!r.ok) return setError(r.error)
      setPlan(r.plan); setNotes(r.notes)
    })
  }

  const speak = () => {
    if (!plan) return
    setError(''); setVoice(null); setClip(null)
    start(async () => {
      const r = await speakBrandVideo(plan.lines)
      if (!r.ok) return setError(r.error)
      try {
        const pcm = await Promise.all(r.lines.map(l => decodeMp3(l.mp3)))
        // The decoded length is the truth; the server's figure was an estimate.
        const lines = r.lines.map((l, i) => ({ text: l.text, words: l.words, dur: pcm[i].length / SR }))
        await loadFonts(lang === 'zh')
        setVoice({ lines, pcm })
        setAt(0)
      } catch (e: any) {
        setError(`Ava’s audio could not be decoded: ${String(e?.message ?? e).slice(0, 120)}`)
      }
    })
  }

  /** Any change to the words makes the recorded voice wrong. */
  const editLine = (i: number, text: string) => {
    setPlan(p => p && { ...p, lines: p.lines.map((l, j) => (j === i ? text : l)) })
    setVoice(null); setClip(null)
  }
  const editText = (si: number, ti: number, s: string) => {
    setPlan(p => p && {
      ...p,
      scenes: p.scenes.map((sc, j) => (j !== si ? sc : { ...sc, text: sc.text?.map((t, k) => (k === ti ? { ...t, s } : t)) })),
    })
    setClip(null)
  }
  const editWord = (si: number, wi: number, s: string) => {
    setPlan(p => p && {
      ...p,
      scenes: p.scenes.map((sc, j) => (j !== si ? sc : { ...sc, words: sc.words?.map((w, k) => (k === wi ? { ...w, s } : w)) })),
    })
    setClip(null)
  }

  // ------------------------------------------------------------- preview

  const engineFor = (ctx: CanvasRenderingContext2D) => {
    const f = FILM_FORMATS[format!]
    return createEngine(ctx, f.w, f.h, film, assets!.shapes, { dark: assets!.dark, light: assets!.light })
  }

  // Redraw the still whenever the scrubber, the words or the format move.
  useEffect(() => {
    if (!film || !assets || !format || playing) return
    const c = preview.current, ctx = c?.getContext('2d')
    if (!ctx) return
    engineFor(ctx)(Math.min(at, film.dur - 0.01))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film, assets, format, at, playing])

  const stop = () => {
    try { audioRef.current?.src.stop() } catch { /* already stopped */ }
    audioRef.current?.ctx.close()
    audioRef.current = null
    setPlaying(false)
  }

  const play = async () => {
    if (!film || !mix || !assets || !format) return
    const c = preview.current, ctx2d = c?.getContext('2d')
    if (!ctx2d) return
    const draw = engineFor(ctx2d)
    const ac = new AudioContext({ sampleRate: SR })
    const buf = ac.createBuffer(2, mix.left.length, SR)
    buf.copyToChannel(mix.left as Float32Array<ArrayBuffer>, 0); buf.copyToChannel(mix.right as Float32Array<ArrayBuffer>, 1)
    const src = ac.createBufferSource()
    src.buffer = buf; src.connect(ac.destination)
    const from = at >= film.dur - 0.1 ? 0 : at
    src.start(0, from)
    const t0 = ac.currentTime - from
    audioRef.current = { ctx: ac, src }
    setPlaying(true)
    src.onended = () => { if (audioRef.current?.src === src) stop() }
    // The picture follows the audio clock, not requestAnimationFrame's, so
    // a dropped frame in preview never drifts the picture off the voice.
    const tick = () => {
      if (audioRef.current?.src !== src) return
      const t = ac.currentTime - t0
      draw(Math.min(t, film.dur - 0.01)); setAt(t)
      if (t < film.dur) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  useEffect(() => () => stop(), [])

  // -------------------------------------------------------------- export

  const exportMp4 = async () => {
    if (!film || !mix || !assets || !format) return
    stop()
    setError(''); setClip(null); setProgress(0); setEncoding(true)
    abort.current = new AbortController()
    try {
      await loadFonts(lang === 'zh')
      let draw: ((t: number) => void) | null = null
      const f = FILM_FORMATS[format]
      const blob = await encodeAV(
        { w: f.w, h: f.h }, film.dur,
        (ctx, t) => { draw ??= engineFor(ctx); draw(t) },
        { left: mix.left, right: mix.right, sampleRate: SR },
        { onProgress: setProgress, signal: abort.current.signal },
      )
      setClip({ blob, url: URL.createObjectURL(blob) })
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setEncoding(false); abort.current = null
    }
  }

  const slug = (res?.topic ?? 'brand-video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const fmt = format ? FILM_FORMATS[format] : null

  return (
    <div className="mw-studio mw-bf">
      {/* 1 ─────────────────────────────────────────────── the article */}
      <div className="mw-studio-ask">
        <label htmlFor="bfurl">Which article?</label>
        <input
          id="bfurl" type="url" value={url}
          placeholder="https://www.movingwalls.com/blog/overseas-ooh-agency-revenue-chinese-brands"
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && url.trim()) { e.preventDefault(); read() } }}
        />
        <button type="button" onClick={read} disabled={busy || !url.trim()}>
          {busy && !res ? 'Reading…' : 'Read this article'}
        </button>
      </div>

      {error && <p className="mw-studio-error">{error}</p>}

      {res && (
        <section className="mw-studio-facts">
          <h3>What the article says</h3>
          {res.angle && <p className="lede">{res.angle}</p>}
          <ol>{res.facts.map((f, i) => <li key={i}>{f.claim}<small>{f.source}</small></li>)}</ol>
          <p className="mw-studio-check">Ava only says what is in this article — no figure is added from outside it.</p>
        </section>
      )}

      {/* 2 ───────────────────────────────────────────── the choices */}
      {res && (
        <section>
          <h3>Who is it for?</h3>
          <div className="mw-studio-choice mw-bf-3">
            {AUD.map(a => (
              <button key={a.id} type="button" onClick={() => { setAudience(a.id); setPlan(null); setVoice(null) }}
                aria-current={audience === a.id ? 'true' : undefined}>
                <b>{a.label}</b><small>{a.note}</small>
              </button>
            ))}
          </div>

          <h3>Subtitles</h3>
          <div className="mw-studio-choice">
            <button type="button" onClick={() => { setLang('none'); setPlan(null); setVoice(null) }} aria-current={lang === 'none' ? 'true' : undefined}>
              <b>English only</b><small>Ava’s voice, no subtitles.</small>
            </button>
            <button type="button" onClick={() => { setLang('zh'); setPlan(null); setVoice(null) }} aria-current={lang === 'zh' ? 'true' : undefined}>
              <b>English voice + 中文 subtitles</b><small>Simplified Chinese. Have a native speaker check them before posting.</small>
            </button>
          </div>

          <h3>Which format?</h3>
          <p className="lede">Pick one. Each export is a full render, so choose the one you are posting.</p>
          <div className="mw-studio-choice mw-bf-4">
            {(Object.keys(FILM_FORMATS) as FilmFormat[]).map(k => (
              <button key={k} type="button" onClick={() => { setFormat(k); setClip(null) }}
                aria-current={format === k ? 'true' : undefined}>
                <b>{FILM_FORMATS[k].label}</b>
                <small>{FILM_FORMATS[k].w} × {FILM_FORMATS[k].h} · {FILM_FORMATS[k].use}</small>
              </button>
            ))}
          </div>

          <h3>How long?</h3>
          <div className="mw-studio-choice">
            {[30, 40].map(s => (
              <button key={s} type="button" onClick={() => { setSeconds(s); setPlan(null); setVoice(null) }}
                aria-current={seconds === s ? 'true' : undefined}>
                <b>About {s} seconds</b>
                <small>{s === 30 ? '7 lines. Hook, tension, Moving Walls, close.' : '8 lines. Room for a case study or proof point.'}</small>
              </button>
            ))}
          </div>

          <button type="button" className="mw-dl" style={{ marginTop: 18 }} onClick={write} disabled={busy || !format}>
            {busy && !plan ? 'Writing Ava’s script…' : plan ? 'Rewrite the script' : 'Write Ava’s script'}
          </button>
          {!format && <p className="lede">Choose a format first.</p>}
        </section>
      )}

      {/* 3 ─────────────────────────────────────────────── the script */}
      {plan && (
        <section className="mw-bf-script">
          <h3>Ava’s script · about {estimateSeconds(plan.lines)}s</h3>
          <p className="lede">
            Read it before Ava does. Each line has the scene that plays under it; change any words
            you like — the on-screen text is yours to edit too.
          </p>
          {notes.length > 0 && <div className="mw-studio-faults"><ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
          <ol className="mw-bf-lines">
            {plan.lines.map((line, i) => {
              const scenes = plan.scenes.map((s, si) => ({ s, si })).filter(x => x.s.line === i)
              return (
                <li key={i}>
                  <textarea rows={2} value={line} onChange={e => editLine(i, e.target.value)} />
                  {plan.supers?.[i]?.length ? <small className="mw-bf-zh">{plan.supers[i].join(' ')}</small> : null}
                  {scenes.map(({ s, si }) => (
                    <div key={si} className="mw-bf-scene">
                      <span className="mw-bf-tag">{s.kind}{s.art ? ` · ${s.art}` : ''}{s.bg ? ` · ${s.bg}` : ''}</span>
                      {s.text?.map((t, ti) => (
                        <input key={ti} value={t.s} title={`${t.st}${t.on ? ` · on “${t.on}”` : ''}`}
                          className={`mw-bf-t mw-bf-${t.st}`} onChange={e => editText(si, ti, e.target.value)} />
                      ))}
                      {s.words?.map((w, wi) => (
                        <input key={wi} value={w.s} title={`on “${w.on}”`} className="mw-bf-t mw-bf-h"
                          onChange={e => editWord(si, wi, e.target.value)} />
                      ))}
                    </div>
                  ))}
                </li>
              )
            })}
          </ol>
          <button type="button" className="mw-dl" onClick={speak} disabled={busy}>
            {busy && !voice ? 'Ava is reading…' : voice ? 'Record Ava again' : '🎙 Record Ava'}
          </button>
        </section>
      )}

      {/* 4 ───────────────────────────────────────── preview + export */}
      {film && fmt && (
        <section className="mw-bf-preview">
          <h3>Preview · {film.dur.toFixed(1)}s · {fmt.label}</h3>
          <canvas ref={preview} width={fmt.w} height={fmt.h}
            className={`mw-bf-canvas ${fmt.w > fmt.h ? 'is-wide' : ''}`} />
          <div className="mw-bf-controls">
            <button type="button" onClick={playing ? stop : play}>{playing ? '■ Stop' : '▶ Play with sound'}</button>
            <input type="range" min={0} max={film.dur} step={0.05} value={Math.min(at, film.dur)}
              disabled={playing} onChange={e => setAt(Number(e.target.value))} />
            <span>{at.toFixed(1)}s</span>
          </div>

          {!canEncode() && (
            <p className="mw-studio-warn">This browser cannot encode video. Use Chrome or Edge to export.</p>
          )}
          <button type="button" className="mw-dl" onClick={exportMp4} disabled={encoding || !canEncode()}>
            🎬 Export MP4 · {fmt.label}
          </button>
          {encoding && (
            <div className="mw-studio-rec">
              <progress value={progress} max={1} />
              <span>Encoding… {Math.round(progress * 100)}% — you can use another tab meanwhile.</span>
              <button type="button" onClick={() => abort.current?.abort()}>Stop</button>
            </div>
          )}
          {clip && (
            <div className="mw-studio-clips">
              <figure>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={clip.url} controls playsInline />
                <figcaption>
                  <small>MP4 · {film.dur.toFixed(1)}s · {(clip.blob.size / 1e6).toFixed(1)} MB</small>
                  <button type="button" onClick={() => saveBlob(clip.blob, `${slug}_${fmt.label.replace(':', 'x')}.mp4`)}>Download</button>
                </figcaption>
              </figure>
            </div>
          )}
          <p className="lede">
            Another format? Pick it above — the script and Ava’s reading are kept, only the layout
            changes. Then export again.
          </p>
        </section>
      )}

      {lang === 'zh' && (
        // Only fetched when Chinese subtitles are actually wanted: the full
        // CJK face is heavy and nothing else on this screen draws it.
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@700&display=swap" />
      )}
    </div>
  )
}
