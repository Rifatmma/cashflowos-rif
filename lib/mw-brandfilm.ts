// 👉 Moving Walls → Studio → Brand video. The typed half.
//
// A brand video is three things that have to agree with each other to the
// frame: what Ava says, when she says each word, and what is on screen while
// she says it. They are built in that order and only joined at the end:
//
//   Plan   — written by Claude from the article: Ava's lines, plus a scene
//            for each line saying what to SHOW. Scenes point at words
//            ("land this headline on 'revenue'"), never at seconds, because
//            nobody knows the seconds until she has spoken.
//   Voice  — each line spoken separately, with Microsoft's word timings.
//   Film   — the plan resolved against the voice: every cue an absolute
//            time. This is what the engine draws.
//
// Pointing at words rather than indexes is deliberate. The speech service
// tokenises in its own way ("out-of-home" is one word, a comma is none), so
// an index written before synthesis is a guess; a word is not.

export type FilmFormat = '916' | '169' | '11' | '45'

export const FILM_FORMATS: Record<FilmFormat, { w: number; h: number; label: string; use: string }> = {
  '916': { w: 1080, h: 1920, label: '9:16', use: 'Reels, Shorts, TikTok, Stories' },
  '45': { w: 1080, h: 1350, label: '4:5', use: 'Instagram and LinkedIn feed' },
  '11': { w: 1080, h: 1080, label: '1:1', use: 'Square feed post' },
  '169': { w: 1920, h: 1080, label: '16:9', use: 'YouTube, website, presentations' },
}

export type Audience = 'agencies' | 'brands' | 'media-owners'
export type SubLang = 'none' | 'zh'

/** Backgrounds the engine knows. */
export const BACKGROUNDS = ['cover', 'navy', 'sky', 'white'] as const
type Bg = (typeof BACKGROUNDS)[number]

/** Illustrations the engine knows, and the event fields each one reads. */
export const ARTS = [
  'routes', 'network', 'formats', 'number', 'lines', 'reports', 'board', 'rail', 'crossing', 'skyline',
  'compare', 'people', 'pins', 'timeline', 'donut', 'globe', 'screens', 'funnel', 'dayparts', 'phone',
  'checklist', 'split', 'trend', 'billboard', 'heat',
  // batch 1 (blog scan, Oct 2026)
  'dashboard', 'hub', 'exchange', 'auction', 'segments', 'catalog', 'attribution', 'store', 'flows', 'cms', 'trigger',
  'icons',
  // batch 2
  'dwell', 'planner', 'lift', 'yield', 'proof', 'forecast', 'dco', 'festive',
  // batch 3
  'formatscene', 'ai', 'radius', 'carbon', 'shield', 'interactive', 'multiplier', 'stadium', 'loop',
] as const

/** The engine's icon library (formats tiles, the icons grid). Kept in step with ICON in core.js. */
export const ICON_NAMES = [
  'plane', 'train', 'bag', 'screen', 'road', 'lock', 'shield', 'badge', 'eye', 'clipboard', 'bars', 'linechart',
  'pie', 'search', 'target', 'handshake', 'briefcase', 'presentation', 'coins', 'tag', 'card', 'cart', 'receipt', 'calendar',
  'clock', 'stopwatch', 'bed', 'dining', 'hospital', 'school', 'office', 'mall', 'bus', 'car', 'stadium', 'cinema',
  'elevator', 'kiosk', 'fuel', 'billboard', 'phone', 'laptop', 'qr', 'play', 'megaphone', 'camera', 'sensor', 'cloud',
  'database', 'globe', 'pin', 'map', 'user', 'users', 'heart', 'star', 'trophy', 'leaf', 'bolt', 'gear',
  'chip', 'sun', 'rain', 'thermometer', 'moon', 'lantern', 'crescent', 'diya', 'gift', 'sale', 'cube', 'ai',
  'chat', 'email', 'link', 'rocket',
] as const
type Art = (typeof ARTS)[number]

export type PlanText = {
  s: string
  /** lab = chevron label · h = headline · hx = hero word · s = italic sub · b = small print */
  st: 'lab' | 'h' | 'hx' | 's' | 'b'
  /** The word in this scene's line it lands on. Absent = as the scene opens. */
  on?: string
  /** Sunburst — at most one line per scene. */
  accent?: boolean
  /** Draw a strike-through when this word is spoken. */
  strikeOn?: string
  scale?: number
}

/**
 * One featured inventory site (Ava for local pages). The numbers are copied
 * from the page by the code, never written by the model.
 */
export type PlanSite = {
  id: string
  /** Position in the video's run of sites, for the "02 / 06" label. */
  n: number
  total: number
  /** Where it stands, in a word or two: Highway, City road, Mall… */
  setting: string
  /** The name to show (the page's own name, or a readable short form of it). */
  name: string
  /** What kind of screen, read from the photo: "Portrait LED screen · NPE". */
  format: string
  near: string
  reach: number
  impressions: number
  /** The figure Ava says, highlighted and timed to land as she finishes it. */
  stress: 'reach' | 'impressions' | ''
  on?: string
  /** Where the screen is in the photo: [x, y, w, h], fractions. */
  focus: [number, number, number, number]
}

export type PlanScene = {
  kind: 'cover' | 'panel' | 'logo' | 'burst' | 'end' | 'site'
  /** Index into plan.lines. */
  line: number
  /** Start mid-line, on this word, instead of when the line starts. */
  from?: string
  bg?: Bg
  art?: Art
  /** Art parameters. Any `at`/`on` entries that are words are resolved to times. */
  ev?: Record<string, any>
  text?: PlanText[]
  /** burst only: one word per beat. */
  words?: { s: string; on: string; bg?: Bg }[]
  /** A cut-out photo that could stand in for the illustration ("Infographic + photos" mode). */
  photo?: { query: string; word?: string }
  /** site only. */
  site?: PlanSite
  /** Chosen by pickRecipe, not the model. */
  layout?: Layout
  variant?: string
}

export type Layout = 'stack' | 'flip' | 'center'
export type Accent = 'sun' | 'crimson' | 'emerald'
export type Mode = 'infographic' | 'photos'

/** The look choices for one video, remembered so the next ones differ. */
export type Recipe = { accent: Accent; cover: string; burst: string; arts: string[]; at: number }

export type Plan = {
  title: string
  accent?: Accent
  cover?: 'zigzag' | 'chevrons' | 'mark'
  burst?: 'flip' | 'stack'
  lines: string[]
  /** Optional subtitles: per line, one or two chunks in the target language. */
  supers?: string[][]
  scenes: PlanScene[]
}

/** One spoken line as the voice step returns it. */
export type VoiceLine = {
  text: string
  /** Seconds of audio. */
  dur: number
  /** [word, start seconds from the line's start] */
  words: [string, number][]
}

/** What the engine draws: every cue resolved to absolute seconds. */
export type Film = {
  title: string
  accent: Accent
  cover: string
  burst: string
  photos?: Record<string, string>
  dur: number
  bpm: number
  /** When each line starts. */
  starts: number[]
  supers?: { a: number; b: number; zh: string }[]
  scenes: any[]
}

const BEAT = 0.5   // 120 BPM: every line starts on the beat, so cuts land on the music

const norm = (w: string) => w.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '')

/**
 * Seconds-into-the-line for a word, searching forward from `after`.
 *
 * Forward so that a scene saying "new" twice ("new media, new buying rules")
 * gets the second one for the second cue. A word that is not there falls
 * back proportionally through the line rather than to 0 — a headline a beat
 * early is a nuisance, one at the very start of the scene is visibly wrong.
 */
function wordTime(v: VoiceLine, word: string | undefined, after = -1): number {
  if (!word) return 0
  const want = norm(word)
  if (!want) return 0
  for (const [w, t] of v.words) if (t > after && (norm(w) === want || norm(w).startsWith(want))) return t
  for (const [w, t] of v.words) if (norm(w).includes(want)) return t
  const pos = v.text.toLowerCase().indexOf(word.toLowerCase())
  return pos > 0 ? (pos / Math.max(1, v.text.length)) * v.dur : 0
}

/** Where each line starts: on the beat, with room to breathe after the last. */
export function lineStarts(voice: VoiceLine[]): number[] {
  const out: number[] = []
  let t = BEAT
  for (let i = 0; i < voice.length; i++) {
    out.push(t)
    t = Math.ceil((t + voice[i].dur + 0.2) / BEAT) * BEAT
  }
  return out
}

/** Plan + voice → film. Pure; runs in the browser after Ava has spoken. */
export function resolveFilm(
  plan: Plan, voice: VoiceLine[], mode: Mode = 'infographic', photos?: Record<string, string>,
): Film {
  const starts = lineStarts(voice)
  const last = voice.length - 1
  const dur = Math.ceil((starts[last] + voice[last].dur + 1.2) / BEAT) * BEAT
  const at = (line: number, word?: string, after = -1) =>
    +(starts[line] + wordTime(voice[line], word, after)).toFixed(3)

  const scenes = plan.scenes.map((sc, i) => {
    const v = voice[sc.line]
    const a = i === 0 ? 0 : sc.from ? Math.max(starts[sc.line], at(sc.line, sc.from) - 0.1) : starts[sc.line]
    if (sc.kind === 'site' && sc.site) return siteScene(sc.site, sc.line, a, starts[sc.line] + v.dur, w => at(sc.line, w))
    let cursor = sc.from ? wordTime(v, sc.from) - 0.01 : -1
    // The headline is on screen as the scene cuts in, so it is readable
    // while Ava says it — landing it on its word put it a second late
    // whenever the word sat mid-sentence. Everything after it arrives a
    // little AHEAD of the word it echoes (the eye reads before the ear
    // hears), never before the item above it.
    let firstHead = true, prev = a
    const text = (sc.text ?? []).map(t => {
      let time: number
      if (t.st === 'lab') time = a + 0.08
      else if ((t.st === 'h' || t.st === 'hx') && firstHead) { firstHead = false; time = a + (i === 0 ? 0.35 : 0.12) }
      else if (t.on) time = at(sc.line, t.on, cursor) - 0.3
      else time = prev + 0.25
      if (t.on) cursor = Math.max(cursor, at(sc.line, t.on, cursor) - starts[sc.line])
      time = +Math.max(time, prev + (t.st === 'lab' ? 0 : 0.12), a + 0.05).toFixed(3)
      prev = time
      return {
        t: time, s: t.s, st: t.st,
        ...(t.accent ? { color: 'accent' } : {}),
        ...(t.strikeOn ? { strike: at(sc.line, t.strikeOn, cursor) } : {}),
        ...(t.st === 'b' ? { scale: 0.75 } : t.scale ? { scale: t.scale } : {}),
      }
    })
    const ev: Record<string, any> = { ...(sc.ev ?? {}) }
    let artAt = a
    // Word cues inside art become seconds after the art starts.
    const rel = (w: any, k: number) => (typeof w === 'string' ? Math.max(0, at(sc.line, w) - a) : typeof w === 'number' ? w : 0.3 + k * 0.25)
    if (Array.isArray(ev.at)) ev.at = ev.at.map(rel)
    if (sc.art === 'lines') ev.freshAt = rel(ev.freshOn ?? ev.freshAt, 0)
    if (sc.art === 'crossing' && ev.screensOn) ev.screens = rel(ev.screensOn, 0)
    if (sc.art === 'network') ev.centre = typeof ev.centre === 'number' ? ev.centre : 0
    // A number settles about 1.1s after it starts rolling, so start it so the
    // last digit lands as she says it.
    if (sc.art === 'number' && ev.on) artAt = Math.max(a, at(sc.line, ev.on) + 0.2 - 1.1)
    // A burst word lands a hair before it is said, like the text.
    // Burst words are read top to bottom, so they land in that order: a word
    // whose cue Ava never says (or says earlier) follows the one above it
    // instead of jumping to the start of the scene.
    let last = a - 0.4
    const words = sc.words?.filter(w => w.s.trim()).map((w, k) => {
      const said = w.on && v.words.some(([x]) => norm(x).startsWith(norm(w.on!)) && norm(w.on!))
      const t = +Math.max(a, last + 0.35, said ? at(sc.line, w.on) - 0.12 : 0).toFixed(3)
      last = t
      return { t, s: w.s.trim(), bg: w.bg ?? (k % 2 ? 'cover' : 'white'), ...(w.s.trim().includes(' ') ? { st: 'h' } : {}) }
    })
    const photo = mode === 'photos' && sc.photo && photos?.[photoKey(sc.photo.query)]
      ? { key: photoKey(sc.photo.query), word: sc.photo.word, shape: (['circle', 'bar', 'zig', 'blue'] as const)[i % 4] }
      : undefined
    return { ...sc, a, artAt, ev, text, ...(words ? { words } : {}), ...(photo ? { photo } : { photo: undefined }) }
  })

  // Scenes tile the timeline. Transitions come from a pool and never repeat
  // back to back; the choice is seeded by the title so a re-render of the
  // same video is identical and a different video differs.
  const r = seeded(plan.title)
  const pool = ['zig', 'chev', 'iris', 'slide', 'bars']
  let lastTr = ''
  scenes.forEach((sc: any, i) => {
    sc.b = i + 1 < scenes.length ? scenes[i + 1].a : dur
    // One site to the next swipes, like flicking through the inventory.
    if (sc.kind === 'site' && scenes[i - 1]?.kind === 'site') { sc.tr = 'slide'; lastTr = 'slide'; return }
    if (i > 0 && sc.kind !== 'burst') {
      const options = pool.filter(t => t !== lastTr)
      sc.tr = options[Math.floor(r() * options.length)]
      lastTr = sc.tr
    }
    if (sc.kind === 'burst') { sc.bg = sc.bg ?? 'white'; sc.variant = plan.burst }
    if (sc.kind === 'cover') sc.variant = plan.cover
  })

  let supers: Film['supers']
  if (plan.supers?.some(s => s?.length)) {
    supers = []
    plan.supers.forEach((chunks, i) => {
      if (!chunks?.length || i > last) return
      const a = starts[i], end = starts[i] + voice[i].dur + 0.2
      if (chunks.length === 1) supers!.push({ a, b: end, zh: chunks[0] })
      else {
        // Split where the first chunk's share of characters says the pause is.
        const share = chunks[0].length / (chunks[0].length + chunks[1].length)
        const mid = a + voice[i].dur * share
        supers!.push({ a, b: mid, zh: chunks[0] }, { a: mid, b: end, zh: chunks[1] })
      }
    })
  }

  return {
    title: plan.title, dur, bpm: 120, starts, scenes,
    accent: plan.accent ?? 'sun', cover: plan.cover ?? 'zigzag', burst: plan.burst ?? 'flip',
    ...(supers ? { supers } : {}),
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * A site card on the timeline. The name is on screen as it cuts in, the
 * format just after, the figure Ava says rolls so its last digit lands as
 * she finishes saying it, and the "near" line arrives as she ends the line.
 */
function siteScene(s: PlanSite, line: number, a: number, end: number, at: (w: string) => number) {
  const landing = s.on ? at(s.on) + 0.25 : a + 1.8
  // Both counters appear together, reach first; the one Ava says counts
  // for as long as it takes her to get to it.
  const stat = (k: 'reach' | 'impressions') => {
    const t = a + (k === 'reach' ? 0.6 : 0.85)
    return {
      t: +t.toFixed(3), value: s[k], label: k === 'reach' ? 'Monthly reach' : 'Monthly impressions',
      ...(s.stress === k ? { accent: true, roll: +Math.min(3.5, Math.max(0.8, landing - t)).toFixed(3) } : {}),
    }
  }
  return {
    kind: 'site', line, a, photo: s.id, focus: s.focus,
    text: [
      { t: +(a + 0.08).toFixed(3), s: `${pad2(s.n)} / ${pad2(s.total)}${s.setting ? ` · ${s.setting}` : ''}`, st: 'lab' },
      { t: +(a + 0.2).toFixed(3), s: s.name, st: 'h', scale: 0.8 },
    ],
    chip: s.format ? { t: +(a + 0.45).toFixed(3), s: s.format } : undefined,
    stats: [stat('reach'), stat('impressions')],
    near: s.near ? { t: +Math.max(a + 1.4, end - 1.3).toFixed(3), s: s.near } : undefined,
  }
}

/** A cut-out's library key: the search words, normalised. */
export const photoKey = (query: string) => query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

function seeded(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  let s = h >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/**
 * Choose this video's look, avoiding what the last few videos used.
 *
 * Ten videos a week from one engine will look like one video ten times
 * unless something varies on purpose. The model chooses WHAT to show; this
 * chooses HOW: accent colour, opener, word-burst style and the layout of
 * every panel — each different from the recent videos where there is a
 * choice, and seeded by the title so the same video always renders alike.
 */
export function pickRecipe(plan: Plan, recent: Recipe[]): { plan: Plan; recipe: Recipe } {
  const r = seeded(plan.title + plan.lines.join('|'))
  const freshest = <T extends string>(all: T[], used: (rc: Recipe) => string): T => {
    // Prefer whatever was used least recently; ties broken by the seed.
    const age = (v: string) => { const k = recent.findIndex(rc => used(rc) === v); return k < 0 ? 99 : k }
    const best = Math.max(...all.map(age))
    const pick = all.filter(v => age(v) === best)
    return pick[Math.floor(r() * pick.length)]
  }
  const accent = freshest<Accent>(['sun', 'crimson', 'emerald'], rc => rc.accent)
  const cover = freshest(['zigzag', 'chevrons', 'mark'], rc => rc.cover) as Plan['cover']
  const burst = freshest(['flip', 'stack'], rc => rc.burst) as Plan['burst']
  const layouts: Layout[] = ['stack', 'flip', 'center']
  let last: Layout | '' = ''
  const scenes = plan.scenes.map(sc => {
    if (sc.kind !== 'panel') return sc
    const options = layouts.filter(l => l !== last)
    const layout = options[Math.floor(r() * options.length)]
    last = layout
    return { ...sc, layout }
  })
  const arts = scenes.map(s => s.art).filter((a): a is Art => !!a)
  return { plan: { ...plan, accent, cover, burst, scenes }, recipe: { accent, cover: cover!, burst: burst!, arts, at: Date.now() } }
}

/**
 * Make a plan from the model safe to draw.
 *
 * The engine trusts its input completely — an unknown art name or a scene
 * pointing at line 9 of 7 would throw mid-render, 20 seconds into an encode.
 * So everything is checked here once, and anything unknown is dropped or
 * replaced with something that cannot fail, and said so.
 */
export function sanitizePlan(raw: any, sites?: Record<string, { name: string; reach: number; impressions: number }>): { plan: Plan; notes: string[] } {
  const notes: string[] = []
  const lines: string[] = (Array.isArray(raw?.lines) ? raw.lines : []).map((l: any) => String(l ?? '').trim()).filter(Boolean).slice(0, sites ? 14 : 10)
  const KINDS = ['cover', 'panel', 'logo', 'burst', 'end', ...(sites ? ['site'] : [])]
  const str = (v: any, n = 60) => String(v ?? '').trim().slice(0, n)
  const bg = (v: any): Bg | undefined => (BACKGROUNDS as readonly string[]).includes(v) ? v : undefined

  const scenes: PlanScene[] = []
  for (const s of Array.isArray(raw?.scenes) ? raw.scenes : []) {
    const line = Number(s?.line)
    if (!Number.isInteger(line) || line < 0 || line >= lines.length) { notes.push('A scene pointed at a line that does not exist and was dropped.'); continue }
    let kind = KINDS.includes(s?.kind) ? s.kind : 'panel'
    if (kind === 'site') {
      const d = sites?.[String(s?.site ?? '')]
      if (!d) { notes.push(`A site card pointed at "${String(s?.site ?? '').slice(0, 40)}", which is not one of the chosen sites, and was dropped.`); continue }
      const f = Array.isArray(s?.focus) ? s.focus.map(Number) : []
      const ok = f.length === 4 && f.every((v: number) => Number.isFinite(v)) && f[2] > 0.03 && f[3] > 0.03
      const [fx, fy] = ok ? [Math.min(0.97, Math.max(0, f[0])), Math.min(0.97, Math.max(0, f[1]))] : [0.3, 0.2]
      const focus: PlanSite['focus'] = ok ? [fx, fy, Math.min(1 - fx, f[2]), Math.min(1 - fy, f[3])] : [0.3, 0.2, 0.4, 0.5]
      if (!ok) notes.push(`Where the screen is in the ${d.name} photo was not given; the card centres on the photo instead.`)
      scenes.push({
        kind: 'site', line, text: [],
        site: {
          id: String(s.site), n: 0, total: 0, setting: str(s?.setting, 18), name: str(s?.name, 34) || d.name,
          format: str(s?.format, 40), near: str(s?.near, 44), reach: d.reach, impressions: d.impressions,
          stress: s?.stress === 'reach' || s?.stress === 'impressions' ? s.stress : '', ...(s?.on ? { on: str(s.on, 30) } : {}), focus,
        },
      })
      continue
    }
    let art: Art | undefined = (ARTS as readonly string[]).includes(s?.art) ? s.art : undefined
    if (s?.art && !art) notes.push(`Unknown illustration "${s.art}" was left out.`)
    const ev = s?.ev && typeof s.ev === 'object' ? s.ev : {}
    // Each illustration needs its own fields; without them it would draw nothing or throw.
    const need: Partial<Record<Art, () => boolean>> = {
      routes: () => Array.isArray(ev.origin) && Array.isArray(ev.dests) && ev.dests.length > 0,
      network: () => Array.isArray(ev.labels) && ev.labels.length >= 2,
      formats: () => Array.isArray(ev.items) && ev.items.length > 0,
      number: () => ev.value != null && /\d/.test(String(ev.value)),
      lines: () => Array.isArray(ev.items) && ev.items.length >= 2,
      reports: () => Array.isArray(ev.items) && ev.items.length > 0,
      board: () => Array.isArray(ev.rows) && ev.rows.length > 0,
      rail: () => Array.isArray(ev.stations) && ev.stations.length >= 2,
      compare: () => Array.isArray(ev.items) && ev.items.length >= 2 && ev.items.every((d: any) => d && d.label && Number.isFinite(+d.value)),
      people: () => Number.isFinite(+ev.total) && +ev.total > 0,
      pins: () => Array.isArray(ev.pins) && ev.pins.length > 0,
      timeline: () => Array.isArray(ev.items) && ev.items.length >= 2,
      donut: () => Number.isFinite(+ev.value) && +ev.value >= 0 && +ev.value <= 100,
      globe: () => Array.isArray(ev.labels) && ev.labels.length > 0,
      funnel: () => Array.isArray(ev.items) && ev.items.length >= 2,
      dayparts: () => Array.isArray(ev.items) && ev.items.length > 0,
      checklist: () => Array.isArray(ev.items) && ev.items.length > 0,
      split: () => Array.isArray(ev.left) && Array.isArray(ev.right),
      trend: () => Array.isArray(ev.values) && ev.values.length >= 3 && ev.values.every((v: any) => Number.isFinite(+v)),
      billboard: () => Array.isArray(ev.lines) && ev.lines.length > 0,
      icons: () => Array.isArray(ev.items) && ev.items.length >= 2,
      dashboard: () => Array.isArray(ev.tiles) && ev.tiles.length > 0 && ev.tiles.every((q: any) => Array.isArray(q) && q.length >= 2),
      lift: () => +ev.exposed > 0 && +ev.control > 0,
      trigger: () => !ev.signal || ['rain', 'temp', 'score'].includes(ev.signal),
    }
    if (art && need[art] && !need[art]!()) { notes.push(`The ${art} illustration was missing its details and was left out.`); art = undefined }
    if (art === 'formats') ev.items = ev.items.slice(0, 4).map((it: any) => [(ICON_NAMES as readonly string[]).includes(it?.[0]) ? it[0] : 'screen', str(it?.[1], 16)])
    if (art === 'icons') ev.items = ev.items.slice(0, 6).map((it: any) => [(ICON_NAMES as readonly string[]).includes(it?.[0]) ? it[0] : 'screen', str(it?.[1], 14)])
    if (art === 'board') ev.rows = ev.rows.slice(0, 5).map((r: any) => str(r, 14).toUpperCase())
    if (art === 'number') ev.value = String(ev.value).replace(/[^\d.,%+MKBmkb$–-]/g, '').slice(0, 8)
    if (art === 'compare') ev.items = ev.items.slice(0, 3).map((d: any) => ({ label: str(d.label, 30), value: +d.value, display: str(d.display ?? d.value, 10) }))
    if (art === 'people') { ev.total = Math.min(60, Math.max(4, Math.round(+ev.total))); ev.filled = Math.min(ev.total, Math.max(0, Math.round(+(ev.filled ?? ev.total * .6)))) }
    if (art === 'pins') ev.pins = ev.pins.slice(0, 5).map((q: any) => [Math.min(940, Math.max(60, +q?.[0] || 500)), Math.min(740, Math.max(120, +q?.[1] || 400)), str(q?.[2], 16).toUpperCase()])
    if (art === 'timeline') ev.items = ev.items.slice(0, 5).map((q: any) => [str(q?.[0], 10), str(q?.[1], 18)])
    if (art === 'funnel' || art === 'checklist') ev.items = ev.items.slice(0, 5).map((q: any) => str(q, 24))
    if (art === 'dayparts') ev.items = ev.items.slice(0, 4).map((q: any) => [((+q?.[0] || 0) % 24 + 24) % 24, ((+q?.[1] || 1) % 24 + 24) % 24, str(q?.[2], 12).toUpperCase()])
    if (art === 'trend') ev.values = ev.values.slice(0, 8).map((v: any) => +v)
    if (art === 'billboard') ev.lines = ev.lines.slice(0, 4).map((q: any) => str(q, 16).toUpperCase())
    if (art === 'globe') ev.labels = ev.labels.slice(0, 4).map((q: any) => str(q, 14).toUpperCase())
    if (art === 'dashboard' && ev.tiles) ev.tiles = ev.tiles.slice(0, 4).map((q: any) => [str(q[0], 18), str(q[1], 10)])
    if (art === 'hub' && Array.isArray(ev.items)) ev.items = ev.items.slice(0, 6).map((q: any) => str(q, 16))
    if (art === 'exchange') { if (ev.left) ev.left = str(ev.left, 18); if (ev.mid) ev.mid = str(ev.mid, 18); if (Array.isArray(ev.right)) ev.right = ev.right.slice(0, 3).map((q: any) => str(q, 14)) }
    if (art === 'auction' && Array.isArray(ev.bids)) ev.bids = ev.bids.slice(0, 4).map((q: any) => str(q, 8))
    if (art === 'segments' && Array.isArray(ev.groups)) ev.groups = ev.groups.slice(0, 4).map((q: any) => str(q, 14))
    if (art === 'catalog' && Array.isArray(ev.items)) ev.items = ev.items.slice(0, 6).map((q: any) => str(q, 16))
    if (art === 'attribution' && Array.isArray(ev.steps)) ev.steps = ev.steps.slice(0, 2).map((q: any) => str(q, 22))
    if (art === 'cms' && Array.isArray(ev.venues)) ev.venues = ev.venues.slice(0, 4).map((q: any) => str(q, 12))
    if (art === 'trigger') for (const k of ['from', 'to', 'signalLabel']) if (ev[k]) ev[k] = str(ev[k], 22)
    if (art === 'planner' && Array.isArray(ev.chips)) ev.chips = ev.chips.slice(0, 3).map((q: any) => str(q, 14))
    if (art === 'lift') for (const k of ['exposed', 'control']) ev[k] = Number.isFinite(+ev[k]) && +ev[k] > 0 ? Math.min(100, +ev[k]) : undefined
    if (art === 'proof' && Array.isArray(ev.rows)) ev.rows = ev.rows.slice(0, 5).map((q: any) => str(q, 14))
    if (art === 'forecast') for (const k of ['forecast', 'actual']) if (ev[k]) ev[k] = Array.isArray(ev[k]) && ev[k].length >= 3 && ev[k].every((v: any) => Number.isFinite(+v)) ? ev[k].slice(0, 10).map(Number) : undefined
    if (art === 'dco' && Array.isArray(ev.versions)) ev.versions = ev.versions.slice(0, 3).map((q: any) => str(q, 24))
    if (art === 'festive' && !['diwali', 'ramadan', 'raya', 'lunar', 'cny', 'christmas', 'sale'].includes(ev.festival)) ev.festival = 'sale'
    if (art === 'formatscene' && !['shelter', 'truck', 'bridge', 'facade', 'unipole', 'bunting'].includes(ev.format)) ev.format = 'unipole'
    if (art === 'ai' && Array.isArray(ev.inputs)) ev.inputs = ev.inputs.slice(0, 4).map((q: any) => str(q, 14))
    if (art === 'loop' && Array.isArray(ev.steps)) ev.steps = ev.steps.slice(0, 5).map((q: any) => str(q, 12))
    // Arts fit these to their width, so only stop runaway text — and never mid-word
    // (a 30-char cut left "pay more attention to their su" on screen).
    for (const k of ['label', 'from', 'to', 'plays', 'people', 'total', 'moment']) if (typeof ev[k] === 'string') {
      const s = String(ev[k]).trim(); ev[k] = s.length <= 48 ? s : s.slice(0, 48).replace(/\s+\S*$/, '')
    }
    if (art === 'flows' && ev.counter) ev.counter = String(ev.counter).replace(/[^\d.,%+MKBmkb$–-]/g, '').slice(0, 8)

    const text = (Array.isArray(s?.text) ? s.text : []).slice(0, 5).map((t: any) => ({
      ...(Number.isFinite(+t?.scale) && +t.scale >= 0.5 && +t.scale <= 1 ? { scale: +t.scale } : {}),
      s: str(t?.s, 48), st: ['lab', 'h', 'hx', 's', 'b'].includes(t?.st) ? t.st : 'h',
      ...(t?.on ? { on: str(t.on, 30) } : {}), ...(t?.accent ? { accent: true } : {}),
      ...(t?.strikeOn ? { strikeOn: str(t.strikeOn, 30) } : {}),
    })).filter((t: PlanText) => t.s)
    const words = kind === 'burst'
      ? (Array.isArray(s?.words) ? s.words : []).slice(0, 8).map((w: any) => ({ s: str(w?.s, 18), on: str(w?.on, 30), ...(bg(w?.bg) ? { bg: bg(w.bg) } : {}) })).filter((w: any) => w.s && w.on)
      : undefined
    if (kind === 'burst' && !words?.length) kind = 'panel'

    scenes.push({
      kind, line, ...(s?.from ? { from: str(s.from, 30) } : {}),
      bg: bg(s?.bg) ?? (kind === 'panel' ? (scenes.length % 2 ? 'white' : 'navy') : undefined),
      ...(art ? { art, ev } : {}), text, ...(words ? { words } : {}),
      ...(kind === 'panel' && s?.photo?.query ? { photo: { query: str(s.photo.query, 60), ...(s.photo.word ? { word: str(s.photo.word, 14) } : {}) } } : {}),
    } as PlanScene)
  }

  // Scenes must be in spoken order or the timeline folds back on itself.
  scenes.sort((p, q) => p.line - q.line)
  const siteScenes = scenes.filter(s => s.site)
  siteScenes.forEach((s, k) => { s.site!.n = k + 1; s.site!.total = siteScenes.length })
  // The film needs an opening and a close; make sure it has both.
  if (scenes.length && scenes[0].kind !== 'cover') scenes[0].kind = 'cover'
  if (scenes.length && scenes[scenes.length - 1].kind !== 'end') {
    const lastLine = lines.length - 1
    if (scenes[scenes.length - 1].line === lastLine) scenes[scenes.length - 1].kind = 'end'
    else scenes.push({ kind: 'end', line: lastLine, text: [{ s: 'No boundaries.', st: 's' }] })
  }
  // Textures on dark panels, as the finished films have.
  for (const s of scenes) if (s.kind === 'panel' && (s.bg === 'navy' || s.bg === 'white')) (s as any).tex = true

  const supers = Array.isArray(raw?.supers)
    ? raw.supers.slice(0, lines.length).map((c: any) => (Array.isArray(c) ? c : [c]).map((x: any) => str(x, 40)).filter(Boolean).slice(0, 2))
    : undefined
  return { plan: { title: str(raw?.title, 80) || 'Brand video', lines, scenes, ...(supers?.some((c: string[]) => c.length) ? { supers } : {}) }, notes }
}

/** Approximate length before Ava has spoken (2.6 words a second at +6%). */
export function estimateSeconds(lines: string[]): number {
  const words = lines.join(' ').split(/\s+/).filter(Boolean).length
  return Math.round(words / 2.6 + lines.length * 0.6 + 1.5)
}

/**
 * One scene of a plan, as a still: every element on screen, nothing timed.
 *
 * Used for the photo cards, so a person sees the scene they are deciding
 * about BEFORE Ava has been recorded — without it, swapping a photo
 * changed nothing visible until the preview existed, which read as broken.
 */
export function sceneStillFilm(plan: Plan, sceneIndex: number, withPhoto: boolean): Film {
  const sc = plan.scenes[sceneIndex]
  const ev: Record<string, any> = { ...(sc.ev ?? {}) }
  delete ev.at                                        // word cues: everything has already landed
  if (sc.art === 'lines') ev.freshAt = 0.2
  if (sc.art === 'crossing') ev.screens = 0.2
  if (sc.art === 'network') ev.centre = 0
  const scene = {
    ...sc, a: 0, b: 30, artAt: 0, ev, tr: undefined,
    text: (sc.text ?? []).map((t, i) => ({
      t: i * 0.05, s: t.s, st: t.st,
      ...(t.accent ? { color: 'accent' } : {}), ...(t.st === 'b' ? { scale: 0.75 } : {}),
    })),
    words: sc.words?.map((w, i) => ({ t: i * 0.05, s: w.s, bg: w.bg })),
    photo: withPhoto && sc.photo
      ? { key: photoKey(sc.photo.query), word: sc.photo.word, shape: (['circle', 'bar', 'zig', 'blue'] as const)[sceneIndex % 4] }
      : undefined,
  }
  return { title: plan.title, dur: 30, bpm: 120, starts: [0], scenes: [scene], accent: plan.accent ?? 'sun', cover: plan.cover ?? 'zigzag', burst: plan.burst ?? 'flip' }
}
