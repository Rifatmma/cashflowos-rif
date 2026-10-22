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
| `formats` | `items: [[icon, 'Label'], ...≤4]` (any icon below) | media types |
| `icons` | `items: [[icon, 'Label'], ...2–6]` | a set of things — venues, benefits, categories, festivals; the last tile is highlighted |
| `lines` | `items: [..., 'New thing']`, `freshAt` | a new service or revenue line landing |
| `reports` | `items: ['SG', ...]`, `at` | fragmentation, inconsistent reports |
| `board` | `rows: ['UP TO 14 CHARS', ...]` | departures, schedules |
| `rail` | `stations: [5]`, `train` | transit journeys |
| `crossing` | `screens` | a street crossing **only** |
| `skyline` | — | a city |
| `dashboard` | `tiles: [[label, value] ×≤4], chart?` | measurement / reporting panel; figures count up, a line draws |
| `hub` | `items: [≤6], label?` | scattered tools plugging into one platform |
| `exchange` | `left, mid, right: [≤3]` | programmatic marketplace: supply → platform → demand |
| `auction` | `bids: [≤4]` | real-time bidding on one play; highest wins the screen |
| `segments` | `groups: [≤4], pick?` | a crowd sorting into audience groups; target locks |
| `catalog` | `items: [≤6], filter?, keep?, book?` | inventory storefront: filter, book |
| `attribution` | `steps: [exposure, visit]` | person passes a screen, later visits the store; link drawn back |
| `store` | `entrance?, checkout?` | retail media: screens at entrance and checkout |
| `flows` | `counter, label?` | mobility data: trails through streets past screens |
| `cms` | `venues: [≤4], label?` | content playlist pushed to venue screens |
| `trigger` | `signal: rain/temp/score, signalLabel?, from?, to?, at?` | live signal swaps the creative |
| `dwell` | `value, label?` | attention / dwell time: a passer-by stops, a timer ring fills |
| `planner` | `chips: [≤3], budget?, reach?` | plan by audience and budget; screens select on a map |
| `lift` | `exposed, control (%), display?` | brand lift: exposed vs control bars, uplift arrow |
| `yield` | `value?, label?` | a week of slots; gaps fill, revenue grows |
| `proof` | `rows: [≤5], label?` | proof of play: log entries tick, Verified seal |
| `forecast` | `forecast: [...], actual: [...], label?` | forecast line, delivered line meets it |
| `dco` | `versions: [≤3], slot?` | one template, localised versions to three screens |
| `festive` | `festival, month, day, values?, label?` | calendar flips to the festival, motif blooms, demand climbs |

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

## Your own photos and video clips (`media` scene)

Any image or clip the user supplies — event footage, a site walkthrough, a product shot, a team photo — goes into the motion design as a scene of its own. Copy the files into the project (e.g. `media/`) and list them in the spec:

```js
SPEC.media = { launch: 'media/launch-night.mp4', team: 'media/team.jpg' };
// a full-frame clip, words over a dark fade at the bottom
{ kind: 'media', a: 4, b: 9.5, tr: 'zig', media: 'launch', from: 2.0,
  text: [{ t: 4.1, s: 'Launch night', st: 'lab' }, { t: 4.2, s: 'Times Square, live', st: 'h' }, { t: 5.5, s: 'one network, one night.', st: 's' }] },
// a photo (or clip) as a card over a blurred copy of itself, words below / beside
{ kind: 'media', a: 9.5, b: 13, tr: 'slide', media: 'team', fit: 'card', focus: [.3, .2, .4, .5], grade: 'bw', text: [...] },
```

| field | meaning |
|---|---|
| `media` | key into `SPEC.media`. Images: jpg/png/webp. Clips: mp4/mov/m4v/webm (any codec ffmpeg reads). |
| `fit` | `full` (default): fills the frame. `card`: framed card, blurred backdrop — use for photos that are not 9:16-friendly. |
| `from` | clips only: seconds into the clip where this scene starts (the clip then plays in real time). |
| `focus` | `[x, y, w, h]` fractions: what must stay in frame when the format crops it (a face, the screen, the product). |
| `grade` | `bw` for black-and-white (matches the cut-out photo look); default is the original colour. |

`render.js` turns each clip into frames with ffmpeg once (`out/.frames/`), so every frame is exact. The clip's own sound is not used — the music and Ava carry the audio. Keep text off the busy part of the frame: on `full`, the words sit in the lower third over the fade, so choose `focus` (or `from`) so the subject is in the upper half. Check stills in every format: a 16:9 clip in 9:16 shows only its middle third.

## Icons

`plane`, `train`, `bag`, `screen`, `road`, `lock`, `shield`, `badge`, `eye`, `clipboard`, `bars`, `linechart`, `pie`, `search`, `target`, `handshake`, `briefcase`, `presentation`, `coins`, `tag`, `card`, `cart`, `receipt`, `calendar`, `clock`, `stopwatch`, `bed`, `dining`, `hospital`, `school`, `office`, `mall`, `bus`, `car`, `stadium`, `cinema`, `elevator`, `kiosk`, `fuel`, `billboard`, `phone`, `laptop`, `qr`, `play`, `megaphone`, `camera`, `sensor`, `cloud`, `database`, `globe`, `pin`, `map`, `user`, `users`, `heart`, `star`, `trophy`, `leaf`, `bolt`, `gear`, `chip`, `sun`, `rain`, `thermometer`, `moon`, `lantern`, `crescent`, `diya`, `gift`, `sale`, `cube`, `ai`, `chat`, `email`, `link`, `rocket`

Line icons in the brand blue with one accent part, usable in `formats` and `icons`. Add one in `core.js` (`const D = {…}`, ±70 box, `hot()` for the accent part) and to `ICON_NAMES` in the app's lib/mw-brandfilm.ts.
