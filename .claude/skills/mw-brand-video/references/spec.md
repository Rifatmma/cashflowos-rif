# Project spec reference (engine 2.x)

A project is a folder: `lines.json` (the VO script) → `vo.json`/`vo.js` + `l<i>.wav` (made by `scripts/vo.py`) → `spec.js` (you write this) → `out/` (renders). Start from `examples/*/spec.js` and edit it rather than writing one from scratch.

```js
(function () {
  const VO = (typeof require !== 'undefined') ? require('./vo.json') : window.__VO;
  const START = [0.5, 3.0, 5.5, /* … one per VO line, each on the 0.5s beat grid */];
  const w = (l, i) => +(START[l] + VO[l].words[i][1]).toFixed(3);   // absolute time of word i in line l
  const end = l => +(START[l] + VO[l].dur).toFixed(3);
  const SPEC = {
    title, dur, bpm: 120,
    accent: 'crimson', cover: 'chevrons', burst: 'stack',      // this video's look (see Variety)
    vo: START.map((t, i) => ({ file: `l${i}.wav`, t })),
    supers: [...], photos: { megaphone: 'cutouts/megaphone.png' },   // both optional
    scenes: [...],
  };
  if (typeof module !== 'undefined') module.exports = SPEC; else window.SPEC = SPEC;
})();
```

## Timing (why the edit feels on the beat, and why text is never late)

- Music is 120 BPM, so one beat is 0.5s. Every `START[i]` is a multiple of 0.5, with `START[i] ≥ end(i-1) + 0.2` rounded **up** to the next 0.5.
- Scene boundaries (`a`/`b`) sit on a line start or on a word (`w(l,i)`), so cuts land on what Ava says.
- **The headline appears as the scene cuts in**: label at `a + .08`, first `h`/`hx` at `a + .2` (cover: `a + .35`). If you land a headline on its word and that word is mid-sentence, it arrives a second late. That was the problem users saw.
- Sub-lines (`s`) and small print (`b`) appear **0.3s before** the word they echo: `t: w(l,i) - .3`. They never come before the item above them.
- Burst words: `t: w(l,i) - .12`.
- `dur` = last line's `end()` + about 1.2s, rounded up to 0.5.
- `vo.py` prints the word indexes. Check them before writing `w()` calls; an off-by-one index is the most common bug.

## Safe areas (the engine enforces them)

Everything that has to be read is laid out inside a per-format safe area, and only decoration bleeds past it:
- **9:16:** top 13% and bottom 20% are clear (the Reels/TikTok/Shorts account name, captions and button rail).
- **4:5 / 1:1:** about 7–8% margins.
- **16:9:** 9–10% top and bottom, 6% at the sides.

Every text line is measured and shrunk to fit its column, and each text block to fit its height. Numbers are scaled to their box. You don't need to shorten "5,000+" for the engine, but short is still better.

## Variety: no two videos alike

Before choosing the look, **read `~/.mw-brand-video/history.json`** (render.js appends every finished video). Then choose, avoiding the most recent:
- `accent`: `sun` (Sunburst), `crimson` or `emerald`. These are the guidebook's three accents; use one per video.
- `cover`: `zigzag` (guidebook cover pattern), `chevrons` (huge outline arrows sweeping in) or `mark` (huge MW mark outline).
- `burst`: `flip` (one big word per beat, ground flips) or `stack` (words build into a list).
- Per panel `layout`: `stack` (text above art), `flip` (art above text) or `center` (centred text, art below). In 16:9, `flip` puts the art on the left. Don't use the same layout twice in a row.
- Per scene `tr` (transition in): `zig`, `chev`, `iris`, `slide` or `bars`. No repeats back to back.
- `art`: don't reuse anything the last few videos used unless the line truly needs it. Each illustration appears at most once per video.

## Scene object

| field | meaning |
|---|---|
| `kind` | `cover` · `panel` · `logo` · `burst` · `end` |
| `a`, `b` | start and end time, absolute. Scenes tile the timeline with no gaps. |
| `tr` | transition into this scene (see Variety) |
| `bg` | `cover` (blue→navy), `navy`, `sky`, `white`. Alternate dark and light. |
| `tex` | `true` adds the drifting connection-dot texture |
| `layout` | panel layout (see Variety) |
| `variant` | overrides `SPEC.cover` / `SPEC.burst` for this scene |
| `art`, `ev`, `artAt` | illustration plus its parameters; times in `ev` are seconds after `artAt` (default `a`) |
| `photo` | `{ key, shape?, deco? }`: use cut-out `SPEC.photos[key]` instead of the art. `shape` is `circle` (default), `bar`, `zig` or `blue`. `deco` (the geometry behind it) is `rings`, `chevrons`, `dots` or `zigline`. Never text behind a photo: it pulls the eye away from the headline. |
| `text` | text items (below) |
| `words` | burst only: `[{ t, s, bg?, st?, color? }]` |

### Text items `{ t, s, st, color?, scale?, strike? }`
`st`: `lab` (accent arrows + label, first item), `h` (headline), `hx` (cover hero word), `s` (italic sub-line), `b` (small print or source, `scale: .75`).
`color: 'accent'` uses this video's accent, automatically darkened on light backgrounds so it stays readable. Use it on at most one item per scene. `strike: <time>` draws an accent strike-through.

## Illustration library (`art` + `ev`)

Pick the one that shows **this line's** idea most specifically. A number about people is `people` or `compare`, not a street.

| art | ev | shows |
|---|---|---|
| `compare` | `items: [{label, value, display}]` (2–3) | figures side by side; the last is highlighted |
| `people` | `total, filled, label?` | a share of people, audience or reach |
| `number` | `value: '5,000+'`, `unit`, with `artAt` set so digits settle on the spoken number (`w + .2 − 1.1`) | one hero stat (sourced) |
| `donut` | `value` (0–100), `label` | one percentage |
| `trend` | `values: [...]`, `labels?` | growth over time (sourced numbers only) |
| `split` | `left: [label, value]`, `right: [...]` | before/after, old vs new |
| `timeline` | `items: [[year, label], ...]` | milestones |
| `funnel` | `items: [...]` | stages to an outcome |
| `checklist` | `items: [...]` | benefits, steps, what you get |
| `dayparts` | `items: [[fromHour, toHour, 'LABEL'], ...]` | times of day |
| `heat` | `label?` | where audiences gather, targeting |
| `globe` | `labels: [...]` | worldwide, several countries |
| `routes` | `origin: [x, y, 'LABEL'], dests: [[x, y, 'LABEL'], ...]` (1000×800) | expansion, cross-border |
| `pins` | `pins: [[x, y, 'PLACE'], ...]` (1000×800) | places in one city |
| `network` | `labels: [3–4]` | connecting partners into one network |
| `screens` | `label?` | a screen network switching on |
| `billboard` | `lines: ['PLAN', 'BUY']` | a roadside digital screen |
| `phone` | `label?` | mobile and out-of-home together |
| `formats` | `items: [[icon, 'Label'], ...]`, icons `plane` `train` `bag` `screen` `road` | media types |
| `lines` | `items: [..., 'New thing']`, `freshAt` | a new service or revenue line landing |
| `reports` | `items: ['SG', ...]`, `at` | fragmentation, inconsistent reports |
| `board` | `rows: ['UP TO 14 CHARS', ...]` | departures, schedules |
| `rail` | `stations: [5]`, `train` | transit journeys |
| `crossing` | `screens` | a street crossing **only** |
| `skyline` | — | a city |

Most items take `at: [t, ...]` cue times; without them they stagger automatically.

**Need something new?** Add it to `Object.assign(ART, {...})` in `engine/core.js`:
- Draw in a fixed design box via `fit(r, w, h)`.
- Use `C.*` colours and `accGrad()` for the accent.
- Use `fitFont()` for any text so it can't overflow.
- Animate with `u`.

Then run `node scripts/brandfilm-sync.mjs` in the app repo so /mw/studio gets it too, and bump `engine/VERSION`.

## Cut-out photos

`SPEC.photos = { key: 'path/in/project.png' }`, each a transparent PNG with the background removed. Get them with `scripts/photos.py` (shared library, then Pexels plus a relevance check, keyed locally). In the Studio the same library is used, with an in-browser AI cut-out for busy backgrounds. A panel with `photo: { key }` draws it black-and-white over a flat accent shape, with quiet brand geometry behind it. Keep `art` on those scenes too, so the infographic-only version still works.

## Subtitles

`supers: [{ a, b, zh }]` puts a bar inside the safe area, above the platform buttons. Split long lines at a natural pause, at most about 22 CJK characters each. Have a native speaker check them.

## Formats

`916` 1080×1920 · `169` 1920×1080 · `11` 1080×1080 · `45` 1080×1350. One spec renders all four.
