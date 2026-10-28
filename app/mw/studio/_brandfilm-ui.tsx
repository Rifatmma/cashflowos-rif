'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { researchArticleUrl, writeBrandVideo, speakBrandVideo, readLocationPage, writeLocationVideo, videoSourceText, reviewExport } from './actions'
import { videoUploadTarget, finishVideoCheck } from '../actions'
import type { LocationRead, Site } from '@/lib/mw-locations'
import { loadCutout } from '@/lib/mw-cutout-client'
import type { Research } from '@/lib/mw-studio'
import {
  FILM_FORMATS, resolveFilm, estimateSeconds, pickRecipe,
  type Audience, type Film, type FilmFormat, type Plan, type PlanSite, type Recipe, type SubLang, type VoiceLine,
} from '@/lib/mw-brandfilm'
import { createEngine } from '@/lib/mw-brandfilm-engine'
import { buildMix, SR } from '@/lib/mw-brandfilm-score'
import { encodeAV, canEncode, audioCodec } from '@/lib/mw-studio-encode'
import { auditAndFix, normaliseMix, stillWrong, type Finding } from '@/lib/mw-video-audit'

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
//   5  preview, then export         checked first, silently (every frame, the
//                                   timing, the audio, a Claude review), fixed
//                                   where it is design or timing, then encoded
//                                   here. Only if something is still wrong: the
//                                   MP4 to a private bucket, the check to Rif's
//                                   email, engine bugs to Claude's inbox
//
// One format per export, on purpose: each one is a full encode, and the
// owner asked that people choose before spending the time.
//
// Two sources, one screen: an article ("Ava · blog post") or a
// movingwalls.com/locations page ("Ava · local page"), where step 1 reads
// the page's featured sites and each becomes a card with its real photo,
// format, monthly reach and impressions. Everything from the script on is
// shared.

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
    ...(zh ? ['400', '600', '700', '800'].map(w => f.load(`${w} 40px 'Noto Sans SC'`, '中文字幕')) : []),
  ]).catch(() => undefined)
}

/**
 * The last few videos' look, so the next one differs.
 *
 * Per browser for now: it is what one person making several videos in a
 * week sees repeat. (A team-wide memory arrives with the photo library,
 * which needs a table anyway.)
 */
const RECENT_KEY = 'mw-brandfilm-recent'
function readRecent(): Recipe[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 6) } catch { return [] }
}
function remember(r: Recipe) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...readRecent()].slice(0, 6))) } catch { /* private mode */ }
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
  { id: 'mixed', label: 'Mixed audience', note: 'Everyone in out-of-home — general terms' },
]

/** One scene's photo, as it is being found, cut and checked. */
/** The check before an export: what it found and fixed. Never shown on the page (Rif, 22 Oct 2026). */
type Check = {
  findings: Finding[]
  fixed: Finding[]
  changed: string[]
  rounds: number
  loud: { before: number; after: number } | null
  codec: string
  reviewError?: string
  film: Film
}

const SEV_ORDER = { blocker: 0, 'should fix': 1, 'nice to have': 2 } as const
const sceneLabel = (sc: any, i: number) => `${i + 1} ${sc.kind}${sc.art ? ` · ${sc.art}` : ''}`
/** The words a scene puts on screen, for Claude's review. */
const sceneWords = (sc: any): string[] => [
  ...(sc.text ?? []).map((t: any) => t.s), ...(sc.words ?? []).map((w: any) => w.s),
  ...(sc.site ? [sc.site.name, sc.site.format, sc.site.near].filter(Boolean) : []),
]

/** When a scene has settled: after its last word or line has landed (0.6s), or 80% through, whichever is later. */
const settledAt = (sc: any) => {
  const last = Math.max(0, ...[...(sc.text ?? []), ...(sc.words ?? [])].map((x: any) => x.t ?? 0))
  return Math.min(sc.b - 0.15, Math.max(sc.a + (sc.b - sc.a) * 0.8, last + 0.6))
}

/** One frame per scene, once it has settled, as small JPEGs for the review. */
function settledFrames(film: Film, engine: (ctx: CanvasRenderingContext2D, f: Film) => (t: number) => void, size: { w: number; h: number }): string[] {
  const big = document.createElement('canvas'); big.width = size.w; big.height = size.h
  const draw = engine(big.getContext('2d')!, film)
  const k = (size.w > size.h ? 960 : 540) / size.w                       // 540 wide, 960 for 16:9 — enough to read the text
  const small = document.createElement('canvas'); small.width = Math.round(size.w * k); small.height = Math.round(size.h * k)
  const sctx = small.getContext('2d')!
  return film.scenes.slice(0, 16).map((sc: any) => {
    draw(settledAt(sc))
    sctx.drawImage(big, 0, 0, small.width, small.height)
    return small.toDataURL('image/jpeg', 0.75).split(',')[1]
  })
}

/** Straight to the private bucket with a signed upload URL (the file is too big for a server action). */
async function uploadExport(blob: Blob, slug: string, fmt: string): Promise<string | null> {
  const t = await videoUploadTarget(slug, fmt)
  if (!t.ok) return null
  const body = new FormData()
  body.append('cacheControl', '3600'); body.append('', blob, 'video.mp4')
  const r = await fetch(t.url, { method: 'PUT', body, headers: { 'x-upsert': 'false' } }).catch(() => null)
  return r?.ok ? t.path : null
}

const asProxied = (u: string) => (u.startsWith('/api/') ? u : `/api/mw-photo?u=${encodeURIComponent(u)}`)
/** A published site photo, small enough for a thumbnail or full size for the video. */
const sitePhoto = (s: Site, w = 1600) => asProxied(`${s.image}?w=${w}&fm=jpg`)
const MAX_SITES = 6

export function BrandFilm({ source = 'article' }: { source?: 'article' | 'location' }) {
  const local = source === 'location'
  const [url, setUrl] = useState('')
  /** Ava · local page: what the page offers, and which sites are in the video. */
  const [loc, setLoc] = useState<LocationRead | null>(null)
  const [picked, setPicked] = useState<string[]>([])
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
  const [stage, setStage] = useState('')
  const abort = useRef<AbortController | null>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null)

  useEffect(() => { loadAssets().then(setAssets).catch(() => setError('The brand assets did not load. Refresh and try again.')) }, [])

  /** Site photos (Ava · local page), by site id, drawn by the engine. */
  const photoImgs = useRef<Record<string, HTMLImageElement>>({})
  /** Bumped when a site photo arrives, so the preview redraws with it. */
  const [photoTick, setPhotoTick] = useState(0)

  // Infographic only: the photo option was removed (Rif, 22 Oct 2026 — the illustrations are better).
  const film: Film | null = useMemo(
    () => (plan && voice ? resolveFilm(plan, voice.lines, 'infographic') : null),
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

  const readLocal = () => {
    setError(''); setLoc(null); setPicked([]); setPlan(null); setVoice(null); setClip(null)
    start(async () => {
      const r = await readLocationPage(url)
      if (!r.ok) return setError(r.error)
      setLoc(r.read)
      // A city page: its own city's sites, up to six, are the starting choice.
      const first = r.read.cities[0]
      setPicked(first ? first.sites.slice(0, MAX_SITES).map(s => s.id) : [])
    })
  }
  const allSites = useMemo(() => (loc ? loc.cities.flatMap(c => c.sites) : []), [loc])
  const toggleSite = (id: string) => {
    setPlan(null); setVoice(null); setClip(null)
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= MAX_SITES ? p : [...p, id]))
  }

  const writeLocal = () => {
    if (!loc || !picked.length) return
    setError(''); setPlan(null); setVoice(null); setClip(null); setNotes([])
    start(async () => {
      const recent = readRecent()
      const r = await writeLocationVideo(loc.url, picked)
      if (!r.ok) return setError(r.error)
      const chosen = pickRecipe(r.plan, recent)
      remember(chosen.recipe)
      setPlan(chosen.plan); setNotes(r.notes)
      // The engine draws each card from its photo, loaded once through our
      // own origin so the canvas can still be exported.
      for (const sc of chosen.plan.scenes) {
        const s = sc.site && allSites.find(x => x.id === sc.site!.id)
        if (s && !photoImgs.current[s.id]) loadCutout(sitePhoto(s)).then(img => { photoImgs.current[s.id] = img; setPhotoTick(n => n + 1) }).catch(() => setError(`The photo for ${s.name} did not load.`))
      }
    })
  }
  const editSite = (si: number, patch: Partial<PlanSite>) => {
    setPlan(p => p && { ...p, scenes: p.scenes.map((sc, j) => (j !== si || !sc.site ? sc : { ...sc, site: { ...sc.site, ...patch } })) })
    setClip(null)
  }

  const write = () => {
    if (!res) return
    setError(''); setPlan(null); setVoice(null); setClip(null); setNotes([])
    start(async () => {
      const recent = readRecent()
      const r = await writeBrandVideo(res, audience, lang, seconds, recent.flatMap(x => x.arts))
      if (!r.ok) return setError(r.error)
      // The model chose what to show; this chooses how it looks, unlike
      // the last few videos.
      const picked = pickRecipe(r.plan, recent)
      remember(picked.recipe)
      setPlan(picked.plan); setNotes(r.notes); photoImgs.current = {}
    })
  }

  const speak = () => {
    if (!plan) return
    setError(''); setVoice(null); setClip(null)
    start(async () => {
      const r = await speakBrandVideo(plan.lines, lang)
      if (!r.ok) return setError(r.error)
      try {
        const pcm = await Promise.all(r.lines.map(l => decodeMp3(l.mp3)))
        // The decoded length is the truth; the server's figure was an estimate.
        const lines = r.lines.map((l, i) => ({ text: l.text, words: l.words, dur: pcm[i].length / SR }))
        await loadFonts(lang !== 'none')
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

  /** A new burst word lands after the last one; it is said on no particular word. */
  const addWord = (si: number) => {
    setPlan(p => p && { ...p, scenes: p.scenes.map((sc, j) => (j !== si ? sc : { ...sc, words: [...(sc.words ?? []), { s: 'New word.', on: '' }] })) })
    setClip(null)
  }
  const removeWord = (si: number, wi: number) => {
    setPlan(p => p && { ...p, scenes: p.scenes.map((sc, j) => (j !== si ? sc : { ...sc, words: sc.words?.filter((_, k) => k !== wi) })) })
    setClip(null)
  }


  // ------------------------------------------------------------- preview

  const engineFor = (ctx: CanvasRenderingContext2D) => {
    const f = FILM_FORMATS[format!]
    return createEngine(ctx, f.w, f.h, film, assets!.shapes, { dark: assets!.dark, light: assets!.light, photos: photoImgs.current })
  }

  // Redraw the still whenever the scrubber, the words or the format move.
  useEffect(() => {
    if (!film || !assets || !format || playing) return
    const c = preview.current, ctx = c?.getContext('2d')
    if (!ctx) return
    engineFor(ctx)(Math.min(at, film.dur - 0.01))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [film, assets, format, at, playing, photoTick])

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

  /** The article or the location pages, for the audit's figure and cut-off checks. */
  const sourceText = async (): Promise<string> => {
    if (local) return (loc?.pages ?? []).map(p => p.text).join('\n\n')
    const u = res?.facts.find(f => f.url)?.url || url
    const r = u ? await videoSourceText(u) : null
    return r?.ok ? r.text : (res?.facts ?? []).map(f => f.claim).join('\n')
  }
  const articleUrl = local ? (loc?.url ?? url) : (res?.facts.find(f => f.url)?.url || url)

  // The check comes first: every frame audited, the timing fixed and audited
  // again, the audio set to −14 LUFS; Claude reviews the frames while it
  // encodes. What changes the words is never touched — it is listed for Rif.
  const exportMp4 = async () => {
    if (!film || !assets || !format || !voice || !plan) return
    stop()
    setError(''); setClip(null); setProgress(0); setEncoding(true)
    abort.current = new AbortController()
    const f = FILM_FORMATS[format]
    const engineAt = (ctx: CanvasRenderingContext2D, fl: Film) =>
      createEngine(ctx, f.w, f.h, fl, assets.shapes, { dark: assets.dark, light: assets.light, photos: photoImgs.current })
    try {
      await loadFonts(lang !== 'none')
      setStage('Preparing the video…')
      const source = await sourceText()
      const vo = voice.lines.map((l, i) => ({ t: film.starts[i], words: l.words }))
      const audited = auditAndFix(film, { w: f.w, h: f.h }, engineAt, vo, source)
      const final = audited.film
      const frames = settledFrames(final, engineAt, { w: f.w, h: f.h })
      const reviewing = reviewExport({
        title: plan.title, format: f.label, lines: plan.lines, frames, source,
        scenes: final.scenes.map((sc: any, i: number) => ({ label: sceneLabel(sc, i), words: sceneWords(sc) })),
      }).catch((e: any) => ({ error: String(e?.message ?? e) }))
      const norm = normaliseMix(buildMix(final, voice.pcm))
      const codec = (await audioCodec(SR)) ?? 'none'

      setStage('Encoding…')
      let draw: ((t: number) => void) | null = null
      const blob = await encodeAV(
        { w: f.w, h: f.h }, final.dur,
        (ctx, t) => { draw ??= engineAt(ctx, final); draw(t) },
        { left: norm.left, right: norm.right, sampleRate: SR },
        { onProgress: setProgress, signal: abort.current.signal },
      )
      setClip({ blob, url: URL.createObjectURL(blob) })
      const media: Finding[] = []
      if (codec !== 'aac') media.push({ severity: 'should fix', kind: 'container', source: 'media', fix: 'auto', scene: '', t: null, text: '',
        detail: `audio encoded as ${codec} — this browser has no AAC encoder`, rule: 'AAC-LC audio plays everywhere: export from Chrome or Edge' })
      if (Number.isFinite(norm.after) && norm.after < -15) media.push({ severity: 'nice to have', kind: 'loudness', source: 'media', fix: 'auto', scene: '', t: null, text: '',
        detail: `${norm.after.toFixed(1)} LUFS — held under −14 so its loudest moment does not clip`, rule: '−14 LUFS ±1 for social' })
      const bySeverity = (qs: Finding[]) => qs.sort((p, q) => SEV_ORDER[p.severity] - SEV_ORDER[q.severity] || (p.t ?? 0) - (q.t ?? 0))
      const base: Check = {
        findings: bySeverity([...audited.findings, ...media]), fixed: audited.fixed, changed: audited.changed, rounds: audited.rounds, codec, film: final,
        loud: Number.isFinite(norm.before) ? { before: norm.before, after: norm.after } : null,
      }
      // The video is the user's now; the rest happens out of sight.
      setEncoding(false); setStage(''); abort.current = null
      finish(blob, base, reviewing, f.label)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setEncoding(false); setStage(''); abort.current = null
    }
  }

  /**
   * Out of sight: Claude's review joins the check (or is noted as not run after
   * 90s), and only if something is still wrong is the MP4 uploaded, the check
   * emailed to Rif and any engine bug queued for Claude. A failure here never
   * reaches the user; it is in the browser console for whoever is debugging.
   */
  const finish = async (blob: Blob, base: Check, reviewing: Promise<any>, label: string) => {
    try {
      const review = await Promise.race([
        reviewing,
        new Promise<{ error: string }>(r => setTimeout(() => r({ error: 'no answer within 90s' }), 90_000)),
      ])
      const findings = [...base.findings, ...('findings' in review ? review.findings as Finding[] : [])]
        .sort((p, q) => SEV_ORDER[p.severity] - SEV_ORDER[q.severity] || (p.t ?? 0) - (q.t ?? 0))
      if (!stillWrong(findings).length) return
      const path = await uploadExport(blob, slug, label).catch(() => null)
      const r = await finishVideoCheck({
        title: plan?.title ?? slug, slug, format: label, path, article: articleUrl, findings, fixed: base.fixed, changed: base.changed,
        rounds: base.rounds, loudness: base.loud, audioCodec: base.codec, reviewError: 'error' in review ? String(review.error).slice(0, 200) : undefined,
        plan, film: base.film,
      })
      if (!r.ok) console.warn('[video check] not sent:', r.error)
    } catch (e) {
      console.warn('[video check] failed:', e)
    }
  }

  const slug = (local ? `featured-sites-${loc?.cities.filter(c => c.sites.some(s => picked.includes(s.id))).map(c => c.city).join('-') ?? ''}` : res?.topic ?? 'brand-video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const fmt = format ? FILM_FORMATS[format] : null

  return (
    <div className="mw-studio mw-bf">
      {/* 1 ─────────────────────────────────────────── the local page */}
      {local && (
        <div className="mw-studio-ask">
          <label htmlFor="bfloc">Which local page?</label>
          <input
            id="bfloc" type="url" value={url}
            placeholder="https://www.movingwalls.com/locations/malaysia/kuala-lumpur"
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && url.trim()) { e.preventDefault(); readLocal() } }}
          />
          <button type="button" onClick={readLocal} disabled={busy || !url.trim()}>
            {busy && !loc ? 'Reading…' : 'Read this page'}
          </button>
        </div>
      )}

      {local && error && <p className="mw-studio-error">{error}</p>}

      {local && loc && (
        <section className="mw-bf-sites">
          <h3>Featured sites · choose up to {MAX_SITES}</h3>
          <p className="lede">
            Every site on this page{loc.pages.length > 1 ? ` and the ${loc.pages.length - 1} page${loc.pages.length > 2 ? 's' : ''} it links to` : ''} with
            a photo, reach and impressions. The numbers go on the cards exactly as published, labelled monthly; photos are used as they are on the website.
          </p>
          {loc.cities.map(c => (
            <div key={c.city} className="mw-bf-city">
              <h4>
                {c.label} <small>{c.sites.length} site{c.sites.length > 1 ? 's' : ''}</small>
                <button type="button" onClick={() => { setPicked(c.sites.slice(0, MAX_SITES).map(s => s.id)); setPlan(null); setVoice(null); setClip(null) }}>Feature these</button>
              </h4>
              <div className="mw-bf-sitegrid">
                {c.sites.map(s => {
                  const on = picked.includes(s.id)
                  return (
                    <button key={s.id} type="button" className={`mw-bf-site ${on ? 'is-on' : ''}`} onClick={() => toggleSite(s.id)} aria-pressed={on}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sitePhoto(s, 480)} alt="" loading="lazy" />
                      <b>{on ? `${picked.indexOf(s.id) + 1} · ` : ''}{s.name}</b>
                      <small>{s.area}</small>
                      <small>{s.reach.toLocaleString('en-US')} reach · {s.impressions.toLocaleString('en-US')} impressions</small>
                      <small className="mw-bf-src">{s.source}</small>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {loc.doubtful.length > 0 && (
            <div className="mw-studio-faults">
              <b>Left out — the page contradicts itself:</b>
              <ul>{loc.doubtful.map((d, i) => <li key={i}>{d.name}: {d.why}</li>)}</ul>
            </div>
          )}

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

          <button type="button" className="mw-dl" style={{ marginTop: 18 }} onClick={writeLocal} disabled={busy || !format || !picked.length}>
            {busy && !plan ? 'Writing Ava’s script and reading the photos…' : plan ? 'Rewrite the script' : `Write Ava’s script · ${picked.length} site${picked.length === 1 ? '' : 's'}`}
          </button>
          {!format && <p className="lede">Choose a format first.</p>}
        </section>
      )}

      {/* 1 ─────────────────────────────────────────────── the article */}
      {!local && <div className="mw-studio-ask">
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
      </div>}

      {!local && error && <p className="mw-studio-error">{error}</p>}

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
          <div className="mw-studio-choice mw-bf-4">
            {AUD.map(a => (
              <button key={a.id} type="button" onClick={() => { setAudience(a.id); setPlan(null); setVoice(null) }}
                aria-current={audience === a.id ? 'true' : undefined}>
                <b>{a.label}</b><small>{a.note}</small>
              </button>
            ))}
          </div>

          <h3>Language</h3>
          <div className="mw-studio-choice">
            <button type="button" onClick={() => { setLang('none'); setPlan(null); setVoice(null) }} aria-current={lang === 'none' ? 'true' : undefined}>
              <b>English only</b><small>Ava’s voice, no subtitles.</small>
            </button>
            <button type="button" onClick={() => { setLang('zh'); setPlan(null); setVoice(null) }} aria-current={lang === 'zh' ? 'true' : undefined}>
              <b>English voice + 中文 subtitles</b><small>Simplified Chinese. Have a native speaker check them before posting.</small>
            </button>
            <button type="button" onClick={() => { setLang('zh-voice'); setPlan(null); setVoice(null) }} aria-current={lang === 'zh-voice' ? 'true' : undefined}>
              <b>中文 voice + Chinese on screen</b><small>Ava in Mandarin (the Xiaoxiao voice). Have a native speaker check the script before posting.</small>
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
                      {s.site && (() => {
                        const src = allSites.find(x => x.id === s.site!.id)
                        const [fx, fy, fw, fh] = s.site.focus
                        return (
                          <div className="mw-bf-sitecard">
                            {src && (
                              <span className="mw-bf-focus">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={sitePhoto(src, 480)} alt="" />
                                <i style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, width: `${fw * 100}%`, height: `${fh * 100}%` }} title="Where the card pushes in" />
                              </span>
                            )}
                            <span>
                              <input value={s.site.name} title="Name on the card" className="mw-bf-t mw-bf-h" onChange={e => editSite(si, { name: e.target.value })} />
                              <input value={s.site.format} title="Format (read from the photo — check it)" className="mw-bf-t mw-bf-b" onChange={e => editSite(si, { format: e.target.value })} />
                              <input value={s.site.near} title="Near (check it)" placeholder="Near… (optional)" className="mw-bf-t mw-bf-s" onChange={e => editSite(si, { near: e.target.value })} />
                              <small>{s.site.reach.toLocaleString('en-US')} monthly reach · {s.site.impressions.toLocaleString('en-US')} monthly impressions · from the page</small>
                            </span>
                          </div>
                        )
                      })()}
                      {s.words?.map((w, wi) => (
                        <span key={wi} className="mw-bf-word">
                          <input value={w.s} title={w.on ? `lands on “${w.on}”` : 'follows the word before it'} className="mw-bf-t mw-bf-h"
                            onChange={e => editWord(si, wi, e.target.value)} />
                          <button type="button" title="Remove this word" onClick={() => removeWord(si, wi)}>×</button>
                        </span>
                      ))}
                      {s.kind === 'burst' && (s.words?.length ?? 0) < 8 && (
                        <button type="button" className="mw-bf-addword" onClick={() => addWord(si)}>+ word</button>
                      )}
                    </div>
                  ))}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {/* 3b ─────────────────────────────────────────────── the look */}
      {plan && !local && plan.accent && (
        <section>
          <p className="lede">
            This video’s look: {({ sun: 'Sunburst', crimson: 'Crimson', emerald: 'Emerald' } as const)[plan.accent]} accent,{' '}
            {plan.cover} opener, {plan.burst} word burst — chosen to differ from your last few videos.
          </p>
        </section>
      )}

      {/* 3c ───────────────────────────────────────────── record Ava */}
      {plan && (
        <section>
          <h3>{voice ? 'Ava has read the script' : 'Next: record Ava'}</h3>
          <p className="lede">
            {voice
              ? 'The preview is below. Change any words above and record again.'
              : 'Ava reads the script, then the preview appears below with sound.'}
          </p>
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
              <span>{stage === 'Encoding…' ? `Encoding… ${Math.round(progress * 100)}% — you can use another tab meanwhile.` : stage || 'Working…'}</span>
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

      {lang !== 'none' && (
        // Only fetched when Chinese is actually wanted: the full CJK face is
        // heavy and nothing else on this screen draws it. A Chinese-voiced
        // video draws its headlines in it too, so every weight comes along.
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600;700;800&display=swap" />
      )}
    </div>
  )
}
