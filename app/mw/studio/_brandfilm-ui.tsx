'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { researchArticleUrl, writeBrandVideo, speakBrandVideo, findScenePhoto, saveScenePhoto, usedScenePhoto, readLocationPage, writeLocationVideo, videoSourceText, reviewExport } from './actions'
import { videoUploadTarget, sendVideoAudit, sendVideoToClaude } from '../actions'
import type { LocationRead, Site } from '@/lib/mw-locations'
import type { Candidate } from '@/lib/mw-cutouts'
import { cutOut, loadCutout } from '@/lib/mw-cutout-client'
import type { Research } from '@/lib/mw-studio'
import {
  FILM_FORMATS, resolveFilm, estimateSeconds, pickRecipe, photoKey, sceneStillFilm,
  type Audience, type Film, type FilmFormat, type Mode, type Plan, type PlanSite, type Recipe, type SubLang, type VoiceLine,
} from '@/lib/mw-brandfilm'
import { createEngine } from '@/lib/mw-brandfilm-engine'
import { buildMix, SR } from '@/lib/mw-brandfilm-score'
import { encodeAV, canEncode, audioCodec } from '@/lib/mw-studio-encode'
import { auditAndFix, normaliseMix, verdict, type Finding } from '@/lib/mw-video-audit'

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
//   5  preview, then export         checked first (every frame, the timing, the
//                                   audio, a Claude review), fixed where it is
//                                   design or timing, then encoded here; the MP4
//                                   goes to a private bucket and the audit to Rif
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
    zh ? f.load("700 40px 'Noto Sans SC'", '中文字幕') : Promise.resolve(),
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
]

/** One scene's photo, as it is being found, cut and checked. */
/** The check before an export: what it found, what it fixed, where it sent it. */
type Check = {
  findings: Finding[]
  fixed: Finding[]
  changed: string[]
  rounds: number
  loud: { before: number; after: number } | null
  codec: string
  reviewError?: string
  /** Claude's review is still running */
  reviewing?: boolean
  film: Film
  /** set once the upload and the email have run */
  link?: string | null
  sent?: string
  inbox?: string
}

const SEV_ORDER = { blocker: 0, 'should fix': 1, 'nice to have': 2 } as const
const sceneLabel = (sc: any, i: number) => `${i + 1} ${sc.kind}${sc.art ? ` · ${sc.art}` : ''}`
/** The words a scene puts on screen, for Claude's review. */
const sceneWords = (sc: any): string[] => [
  ...(sc.text ?? []).map((t: any) => t.s), ...(sc.words ?? []).map((w: any) => w.s),
  ...(sc.site ? [sc.site.name, sc.site.format, sc.site.near].filter(Boolean) : []),
]

/** One frame per scene, once it has settled (80% through), as small JPEGs for the review. */
function settledFrames(film: Film, engine: (ctx: CanvasRenderingContext2D, f: Film) => (t: number) => void, size: { w: number; h: number }): string[] {
  const big = document.createElement('canvas'); big.width = size.w; big.height = size.h
  const draw = engine(big.getContext('2d')!, film)
  const k = (size.w > size.h ? 960 : 540) / size.w                       // 540 wide, 960 for 16:9 — enough to read the text
  const small = document.createElement('canvas'); small.width = Math.round(size.w * k); small.height = Math.round(size.h * k)
  const sctx = small.getContext('2d')!
  return film.scenes.slice(0, 16).map((sc: any) => {
    draw(sc.a + (sc.b - sc.a) * 0.8)
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

type ScenePhoto = {
  query: string; word?: string
  status: 'finding' | 'cutting' | 'ready' | 'failed' | 'off'
  note?: string
  candidates: Candidate[]; tried: number
  thumb?: string; subject?: string; credit?: string; creditUrl?: string; libraryId?: number
}

const asProxied = (u: string) => (u.startsWith('/api/') ? u : `/api/mw-photo?u=${encodeURIComponent(u)}`)
/** A published site photo, small enough for a thumbnail or full size for the video. */
const sitePhoto = (s: Site, w = 1600) => asProxied(`${s.image}?w=${w}&fm=jpg`)
const MAX_SITES = 6

async function blobBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

/** One scene drawn by the real engine, every element in place — what the video will show. */
function SceneStill({ plan, index, withPhoto, format, assets, photo }: {
  plan: Plan; index: number; withPhoto: boolean; format: FilmFormat; assets: Assets | null; photo?: HTMLImageElement
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const f = FILM_FORMATS[format]
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !assets) return
    const film = sceneStillFilm(plan, index, withPhoto && !!photo)
    const key = plan.scenes[index].photo ? photoKey(plan.scenes[index].photo!.query) : ''
    createEngine(ctx, f.w, f.h, film, assets.shapes, { dark: assets.dark, light: assets.light, photos: photo ? { [key]: photo } : {} })(4)
  }, [plan, index, withPhoto, f, assets, photo])
  return <canvas ref={ref} width={f.w} height={f.h} className={`mw-bf-still ${f.w > f.h ? 'is-wide' : ''}`} />
}

export function BrandFilm({ photosReady = false, source = 'article' }: { photosReady?: boolean; source?: 'article' | 'location' }) {
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
  const [mode, setMode] = useState<Mode>('infographic')

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
  /** What the check before the export found, fixed and sent (lib/mw-video-audit.ts). */
  const [check, setCheck] = useState<Check | null>(null)
  const [stage, setStage] = useState('')
  const abort = useRef<AbortController | null>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null)

  useEffect(() => { loadAssets().then(setAssets).catch(() => setError('The brand assets did not load. Refresh and try again.')) }, [])

  /** Photos by library key, drawn by the engine when the mode is 'photos'. */
  const [photos, setPhotos] = useState<Record<string, ScenePhoto>>({})
  const photoImgs = useRef<Record<string, HTMLImageElement>>({})
  /** Bumped when a site photo arrives, so the preview redraws with it. */
  const [photoTick, setPhotoTick] = useState(0)
  const readyPhotos = useMemo(() => Object.fromEntries(Object.entries(photos).filter(([, p]) => p.status === 'ready').map(([k, p]) => [k, p.thumb ?? ''])), [photos])

  const film: Film | null = useMemo(
    () => (plan && voice ? resolveFilm(plan, voice.lines, mode, readyPhotos) : null),
    [plan, voice, mode, readyPhotos],
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
      setPlan(picked.plan); setNotes(r.notes); setPhotos({}); photoImgs.current = {}
      if (mode === 'photos' && photosReady) findPhotos(picked.plan)
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

  /** A new burst word lands after the last one; it is said on no particular word. */
  const addWord = (si: number) => {
    setPlan(p => p && { ...p, scenes: p.scenes.map((sc, j) => (j !== si ? sc : { ...sc, words: [...(sc.words ?? []), { s: 'New word.', on: '' }] })) })
    setClip(null)
  }
  const removeWord = (si: number, wi: number) => {
    setPlan(p => p && { ...p, scenes: p.scenes.map((sc, j) => (j !== si ? sc : { ...sc, words: sc.words?.filter((_, k) => k !== wi) })) })
    setClip(null)
  }

  // -------------------------------------------------------------- photos
  //
  // For every scene the plan suggested a photo for: the library first, else
  // Pexels candidates Claude has looked at, cut out here (colour key, or
  // the model), saved back to the library. A scene whose photo cannot be
  // found or cut keeps its illustration and says why — it never blocks.

  const patch = (key: string, p: Partial<ScenePhoto>) => setPhotos(m => ({ ...m, [key]: { ...m[key], ...p } }))

  const tryCandidate = async (key: string, sp: ScenePhoto, from: number) => {
    for (let i = from; i < sp.candidates.length; i++) {
      const c = sp.candidates[i]
      patch(key, { status: 'cutting', tried: i, note: `Cutting out: ${c.subject}`, subject: c.subject })
      try {
        const cut = await cutOut(c.src, c.background, note => patch(key, { note }))
        if (!cut) continue                                   // nothing sensible left after cutting
        photoImgs.current[key] = cut.img
        const thumb = URL.createObjectURL(cut.blob)
        patch(key, { status: 'ready', tried: i, thumb, subject: c.subject, credit: c.credit, creditUrl: c.creditUrl, note: cut.method === 'key' ? 'Cut out with a colour key' : 'Cut out with the AI model' })
        // Kept for the next video; a failure to save does not stop this one.
        saveScenePhoto({ query: sp.query, subject: c.subject, method: cut.method, sourceId: c.id, credit: c.credit, creditUrl: c.creditUrl, width: cut.width, height: cut.height }, await blobBase64(cut.blob))
          .then(r => { if (r.ok) patch(key, { libraryId: r.cutout.id }) })
        return
      } catch (e: any) {
        patch(key, { note: String(e?.message ?? e).slice(0, 140) })
        if (/model could not run/.test(String(e?.message))) break
      }
    }
    patch(key, { status: 'failed', note: 'No usable cut-out — this scene keeps its illustration.' })
  }

  const findPhotos = async (p: Plan) => {
    const wanted = p.scenes.filter(sc => sc.photo).map(sc => sc.photo!)
    for (const ph of wanted) {
      const key = photoKey(ph.query)
      if (photos[key]?.status === 'ready' || photos[key]?.status === 'off') continue
      patch(key, { query: ph.query, word: ph.word, status: 'finding', candidates: [], tried: 0, note: 'Looking in the library, then Pexels…' })
      const r = await findScenePhoto(ph.query, ph.word)
      if (!r.ok) { patch(key, { status: 'failed', note: r.error }); continue }
      if (r.cutout) {
        try {
          photoImgs.current[key] = await loadCutout(asProxied(r.cutout.url))
          patch(key, { status: 'ready', thumb: asProxied(r.cutout.url), subject: r.cutout.subject, credit: r.cutout.credit, creditUrl: r.cutout.creditUrl, libraryId: r.cutout.id, note: 'From the library' })
          usedScenePhoto(r.cutout.id)
          continue
        } catch { /* fall through to fresh candidates */ }
      }
      const fresh = r.cutout ? (await findScenePhoto(ph.query + ' white background', ph.word)) : r
      const cands = fresh.ok ? fresh.candidates : []
      const sp: ScenePhoto = { query: ph.query, word: ph.word, status: 'cutting', candidates: cands, tried: 0 }
      patch(key, sp)
      await tryCandidate(key, sp, 0)
    }
  }

  const choosePhotos = () => {
    setMode('photos'); setClip(null)
    if (plan) findPhotos(plan)
  }
  const nextPhoto = (key: string) => {
    const sp = photos[key]; if (!sp) return
    delete photoImgs.current[key]
    if (!sp.candidates.length) {
      // From the library: go and fetch fresh candidates instead.
      patch(key, { status: 'finding', note: 'Finding other photos…' })
      findScenePhoto(sp.query + ' isolated', sp.word).then(r => {
        const c = r.ok ? r.candidates : []
        const next = { ...sp, candidates: c, tried: 0 }
        patch(key, next); tryCandidate(key, next, 0)
      })
      return
    }
    tryCandidate(key, sp, sp.tried + 1)
  }
  const illustrationInstead = (key: string) => { delete photoImgs.current[key]; patch(key, { status: 'off', note: '' }) }
  /** Back to a photo after turning it off: the same one if we still have it, else find again. */
  const photoAgain = (key: string) => {
    const sp = photos[key]; if (!sp) return
    if (sp.candidates.length) { tryCandidate(key, sp, Math.max(0, sp.tried)); return }
    patch(key, { status: 'finding', note: 'Finding a photo…' })
    findScenePhoto(sp.query, sp.word).then(async r => {
      if (!r.ok) return patch(key, { status: 'failed', note: r.error })
      if (r.cutout) {
        photoImgs.current[key] = await loadCutout(asProxied(r.cutout.url))
        return patch(key, { status: 'ready', thumb: asProxied(r.cutout.url), subject: r.cutout.subject, credit: r.cutout.credit, note: 'From the library' })
      }
      const next = { ...sp, candidates: r.candidates, tried: 0 }
      patch(key, next); tryCandidate(key, next, 0)
    })
  }
  const photoScenes = plan ? plan.scenes.map((sc, i) => ({ sc, i })).filter(x => x.sc.photo) : []
  const working = Object.values(photos).some(p => p.status === 'finding' || p.status === 'cutting')
  const credits = Object.values(photos).filter(p => p.status === 'ready' && p.credit).map(p => p.credit!)

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
    setError(''); setClip(null); setCheck(null); setProgress(0); setEncoding(true)
    abort.current = new AbortController()
    const f = FILM_FORMATS[format]
    const engineAt = (ctx: CanvasRenderingContext2D, fl: Film) =>
      createEngine(ctx, f.w, f.h, fl, assets.shapes, { dark: assets.dark, light: assets.light, photos: photoImgs.current })
    try {
      await loadFonts(lang === 'zh')
      setStage('Checking every frame…')
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
      // The panel shows as soon as the video does; Claude's review joins it when it is back.
      const base: Check = {
        findings: bySeverity([...audited.findings, ...media]), fixed: audited.fixed, changed: audited.changed, rounds: audited.rounds, codec, film: final,
        loud: Number.isFinite(norm.before) ? { before: norm.before, after: norm.after } : null, reviewing: true,
      }
      setCheck(base)
      setEncoding(false); setStage(''); abort.current = null
      // A review that never answers must not hold back the email (it once did: no panel, no email).
      const review = await Promise.race([
        reviewing,
        new Promise<{ error: string }>(r => setTimeout(() => r({ error: 'no answer within 90s' }), 90_000)),
      ])
      const result: Check = {
        ...base, reviewing: false,
        findings: bySeverity([...base.findings, ...('findings' in review ? review.findings : [])]),
        reviewError: 'error' in review ? String(review.error).slice(0, 200) : undefined,
      }
      setCheck(result)
      await deliver(blob, result, f.label)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setEncoding(false); setStage(''); abort.current = null
    }
  }

  /** The MP4 into the private bucket, then the audit emailed to Rif with its 30-day link. */
  const deliver = async (blob: Blob, c: Check, label: string) => {
    setCheck(x => x && { ...x, sent: 'Uploading and emailing the audit…' })
    const path = await uploadExport(blob, slug, label).catch(() => null)
    const m = await sendVideoAudit({
      title: plan?.title ?? slug, format: label, path, article: articleUrl, findings: c.findings, fixed: c.fixed, changed: c.changed,
      rounds: c.rounds, loudness: c.loud, audioCodec: c.codec, reviewError: c.reviewError,
    }).catch((e: any) => ({ ok: false as const, error: String(e?.message ?? e).slice(0, 200) }))
    setCheck(x => x && {
      ...x, link: m.ok ? m.link : null,
      sent: m.ok ? `Audit emailed to Rif${path ? ' with a private 30-day link' : ' (the upload failed — no link)'}.` : `Audit not emailed: ${m.error}`,
    })
  }

  const toClaude = async () => {
    if (!check || !fmt) return
    setCheck(x => x && { ...x, inbox: 'Sending…' })
    const r = await sendVideoToClaude({
      title: plan?.title ?? slug, slug, format: fmt.label, findings: check.findings.filter(q => q.severity !== 'nice to have'),
      plan, film: check.film, video: check.link ?? null, article: articleUrl,
    })
    setCheck(x => x && { ...x, inbox: r.ok ? `In Claude’s inbox${r.id ? ` (#${r.id})` : ''} — a session picks it up with the mw-video-audit skill.` : r.error })
  }

  /** "Fix in script": to the scene's words in step 3. */
  const jumpTo = (scene: string) => {
    const si = Number(/^(\d+)/.exec(scene)?.[1] ?? 0) - 1
    document.getElementById(`bf-scene-${si}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
                    <div key={si} id={`bf-scene-${si}`} className="mw-bf-scene">
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

      {/* 3b ─────────────────────────────────────── infographic or photos */}
      {plan && !local && (
        <section>
          <h3>Infographic, or with photos?</h3>
          <div className="mw-studio-choice">
            <button type="button" onClick={() => { setMode('infographic'); setClip(null) }} aria-current={mode === 'infographic' ? 'true' : undefined}>
              <b>Infographic</b>
              <small>Brand illustrations and data visuals throughout — the look you have now.</small>
            </button>
            <button type="button" disabled={!photosReady || !plan.scenes.some(s => s.photo)} onClick={choosePhotos}
              aria-current={mode === 'photos' ? 'true' : undefined}>
              <b>Infographic + photos</b>
              <small>
                {plan.scenes.filter(s => s.photo).length || 'No'} scenes swap their illustration for a
                black-and-white cut-out photo, found on Pexels and checked for relevance.
                {!photosReady && ' Needs PEXELS_API_KEY and Supabase on this deployment.'}
              </small>
            </button>
          </div>
          {mode === 'photos' && (
            <div className="mw-bf-photos">
              <p className="lede mw-bf-photos-how">
                <b>Nothing to choose unless you want to.</b> Each card is the scene as it will look in the
                video. A photo is used automatically; <i>Swap photo</i> tries another, <i>No photo for this
                scene</i> puts the illustration back.
              </p>
              {photoScenes.map(({ sc, i }) => {
                const key = photoKey(sc.photo!.query), p = photos[key]
                const on = p?.status === 'ready'
                return (
                  <figure key={key + i} className={`is-${p?.status ?? 'finding'}`}>
                    {format && <SceneStill plan={plan} index={i} withPhoto={on} format={format} assets={assets} photo={on ? photoImgs.current[key] : undefined} />}
                    <figcaption>
                      <b className="mw-bf-state">
                        {!p || p.status === 'finding' ? '⏳ Finding a photo…'
                          : p.status === 'cutting' ? '✂️ Cutting it out…'
                          : on ? '✓ Photo in the video'
                          : p.status === 'off' ? 'Illustration in the video'
                          : 'No photo found — illustration in the video'}
                      </b>
                      {p?.subject && on && <small>{p.subject}</small>}
                      {p?.note && !on && p.status !== 'off' && <small>{p.note}</small>}
                      {p?.credit && on && <small>Photo: {p.credit} / Pexels</small>}
                      <span>
                        {on && <button type="button" onClick={() => nextPhoto(key)}>Swap photo</button>}
                        {on && <button type="button" onClick={() => illustrationInstead(key)}>No photo for this scene</button>}
                        {(p?.status === 'off' || p?.status === 'failed') && <button type="button" onClick={() => (p.status === 'off' ? photoAgain(key) : nextPhoto(key))}>{p.status === 'off' ? 'Use a photo again' : 'Try again'}</button>}
                      </span>
                    </figcaption>
                  </figure>
                )
              })}
              <p className="lede">
                {working ? 'Still working on some photos — you can carry on; they drop in when ready.' : 'Cut-outs are saved to the shared library, so the next video asking for the same subject reuses them.'}
              </p>
            </div>
          )}
          {plan.accent && (
            <p className="lede">
              This video’s look: {({ sun: 'Sunburst', crimson: 'Crimson', emerald: 'Emerald' } as const)[plan.accent]} accent,{' '}
              {plan.cover} opener, {plan.burst} word burst — chosen to differ from your last few videos.
            </p>
          )}
        </section>
      )}

      {/* 3c ───────────────────────────────────────────── record Ava */}
      {plan && (
        <section>
          <h3>{voice ? 'Ava has read the script' : 'Next: record Ava'}</h3>
          <p className="lede">
            {voice
              ? 'The preview is below. Changing photos updates it straight away; change any words above and record again.'
              : 'Ava reads the script, then the preview appears below with sound. Photos can still be changed after.'}
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
          {!encoding && stage && <p className="lede">{stage}</p>}
          {clip && (
            <div className="mw-studio-clips">
              <figure>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={clip.url} controls playsInline />
                <figcaption>
                  <small>MP4 · {film.dur.toFixed(1)}s · {(clip.blob.size / 1e6).toFixed(1)} MB</small>
                  {mode === 'photos' && credits.length > 0 && <small>For the caption: Photos by {credits.join(', ')} on Pexels</small>}
                  {check && check.findings.some(q => q.severity === 'blocker') && (
                    <small className="mw-va-block">⚠ {check.findings.filter(q => q.severity === 'blocker').length} blocker{check.findings.filter(q => q.severity === 'blocker').length > 1 ? 's' : ''} — see the check below before posting</small>
                  )}
                  <button type="button" onClick={() => saveBlob(clip.blob, `${slug}_${fmt.label.replace(':', 'x')}.mp4`)}>Download</button>
                </figcaption>
              </figure>
            </div>
          )}
          {clip && check && (
            <div className={`mw-va is-${verdict(check.findings).toLowerCase().replace(' ', '-')}`}>
              <h4>Checked before export: {verdict(check.findings)}</h4>
              <p className="lede">
                Every frame, the timing against Ava, the audio{check.reviewError || check.reviewing ? '' : ' and a Claude review of the frames against the source'} · {check.rounds} round{check.rounds === 1 ? '' : 's'}
                {check.reviewing ? ' · Claude is reviewing the frames…' : ''}
                {check.loud ? ` · audio ${check.loud.before.toFixed(1)} → ${check.loud.after.toFixed(1)} LUFS` : ''}
                {check.reviewError ? ` · Claude review did not run: ${check.reviewError}` : ''}
              </p>
              {check.findings.length > 0 && (
                <ul>
                  {check.findings.map((q, i) => (
                    <li key={i} className={`is-${q.severity.replace(' ', '-')}`}>
                      <b>{q.severity}</b>{q.fix === 'approve' && <em> · needs your OK</em>}
                      <span>{q.scene && `${q.scene} · `}{q.text && `“${q.text}” `}{q.detail}</span>
                      {/^\d+ /.test(q.scene) && <button type="button" onClick={() => jumpTo(q.scene)}>Fix in script</button>}
                    </li>
                  ))}
                </ul>
              )}
              {(check.fixed.length > 0 || check.changed.length > 0) && (
                <details>
                  <summary>Fixed before you saw it ({Math.max(check.fixed.length, check.changed.length)})</summary>
                  <ul>{check.changed.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </details>
              )}
              <p className="mw-va-foot">
                <span>{check.sent}</span>
                {check.findings.some(q => q.severity !== 'nice to have') && (
                  <button type="button" onClick={toClaude} disabled={!!check.inbox}>{check.inbox ?? 'Send to Claude to fix'}</button>
                )}
              </p>
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
