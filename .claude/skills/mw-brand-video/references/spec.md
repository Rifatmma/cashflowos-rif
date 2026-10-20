# Project spec reference

A project is a folder: `lines.json` (the VO script) → `vo.json`/`vo.js` + `l<i>.wav` (made by `scripts/vo.py`) → `spec.js` (you write this) → `out/` (renders).

`spec.js` is a small JS file that works both in Node (score/render) and in the browser (engine). Start from `examples/*/spec.js` — copy one and edit; don't write from scratch.

```js
(function () {
  const VO = (typeof require !== 'undefined') ? require('./vo.json') : window.__VO;
  const START = [0.5, 3.0, 5.5, /* … one per VO line, each on the 0.5s beat grid */];
  const w = (l, i) => +(START[l] + VO[l].words[i][1]).toFixed(3);   // absolute time of word i in line l
  const end = l => +(START[l] + VO[l].dur).toFixed(3);              // when line l finishes
  const SPEC = { title, dur, bpm: 120, vo: START.map((t, i) => ({ file: `l${i}.wav`, t })), supers: [...], scenes: [...] };
  if (typeof module !== 'undefined') module.exports = SPEC; else window.SPEC = SPEC;
})();
```

## Timing rules (why the edit feels "on the beat")

- Music is 120 BPM → one beat = 0.5s. Put every `START[i]` on a multiple of 0.5 and leave ≥0.2s after the previous line ends: `START[i] ≥ end(i-1) + 0.2`, rounded **up** to the next 0.5.
- Scene boundaries (`a`/`b`) sit on a line start or on a word (`w(l,i)`) — cuts land on what Ava is saying, never mid-word.
- Text items appear on the word they echo: `{ t: w(2, 7), … }` so the headline lands as she says it.
- `dur` = last line's `end()` + ~1s for the end card to breathe, rounded to 0.5.
- Words in `vo.json` are indexed in spoken order (punctuation stripped; "out-of-home" is one word). Check the indexes printed by `vo.py` before writing `w()` calls — an off-by-one index is the most common bug.

## Scene object

| field | meaning |
|---|---|
| `kind` | `cover` · `panel` · `logo` · `burst` · `end` (below) |
| `a`, `b` | start / end (seconds, absolute). Scenes must tile the timeline with no gaps. |
| `tr` | transition **into** this scene: `'zig'` (giant zigzag sweep) or `'chev'` (chevron push). Alternate them; omit for a hard cut. |
| `bg` | `panel`/`burst` background: `cover` (blue→navy gradient), `navy`, `sky` (light blue gradient), `white` |
| `tex` | `true` → drifting connection-dot texture over the background |
| `art`, `ev`, `artAt` | illustration for `panel` (see art library). `ev` = params; times inside `ev` are relative to `artAt` (default = `a`). |
| `text` | array of text items (below) |

### Kinds
- **cover** — opener. Guidebook cover: rows of solid/outline zigzags slide in over the blue→navy gradient; text sits bottom-left. Use for scene 1.
- **panel** — workhorse. Text block + art block; layout adapts per format (portrait: text top, art below · landscape: text left, art right).
- **logo** — white MW logo slams onto the cover gradient; optional `text` centred under it. Good for the "With Moving Walls…" turn or the "you keep / we bring" line.
- **burst** — one big word per beat with brand chevrons, background flips per word. `words: [{ t, s, bg, st?, color? }]` (`st` defaults to `hx`; use `'h'` for 2+ word phrases). Use for verb lists ("PLAN. BUY. MEASURE.") and city/market lists.
- **end** — logo lockup on white + text + zigzag footer, fades out at `b`.

### Text items `{ t, s, st, color?, scale?, strike?, out?, gap? }`
| `st` | style |
|---|---|
| `lab` | Sunburst chevrons + small Poppins SemiBold label — the guidebook's heading style. One per panel, first item. |
| `h` | headline, Poppins ExtraBold — the line Ava is saying |
| `hx` | hero word (cover only) |
| `s` | italic sub-line (sky on dark, navy on light). `color: '#FEDA24'` = Sunburst emphasis, max one per scene |
| `b` | small body/footnote (sources, stat details); `scale: .62–.8` |

`scale` shrinks one item; long lines auto-fit the block width anyway. `strike: <abs time>` draws a Sunburst strike-through ("not by time slot."). `out` fades an item early.

## Art library (`art` + `ev`)

All artwork is drawn in a design box and scaled into the format's art area. Times are seconds after `artAt`.

| art | ev | use for |
|---|---|---|
| `routes` | `origin: [x, y, 'LABEL']`, `dests: [[x, y, 'LABEL', align?], …]`, `at: [t…]` (box 1000×800; x→east, y→south) | expansion, market entry, cross-border |
| `network` | `labels: [..3–4]`, `at: [t…]`, `centre: t` | "one network", connecting places/partners |
| `formats` | `items: [[icon, 'Label'], …]`, `at: [t…]` — icons `plane` `train` `bag` `screen` `road` | media types: airport / transit / retail / roadside / street |
| `number` | `value: '230'`, `unit: 'digital screens'`; set `artAt` so digits settle ≈ when Ava says the number (`artAt = w(l,i) + .2 − 1.1`) | a hero stat (must be sourced) |
| `lines` | `items: ['…','…','New thing']` (last one lands highlighted), `freshAt: t` | "a new revenue / service line" |
| `reports` | `items: ['SG','AU',…]`, `at: [t…]` | fragmentation, inconsistent measurement |
| `board` | `rows: ['LINE NAME', …]` (≤5, ≤14 chars) | stations, airports departures, schedules |
| `rail` | `stations: [..5]`, `train: t` | transit networks, journeys |
| `crossing` | `screens: t` | busy streets, pedestrian footfall |
| `skyline` | — | city intros |

Need something new? Add a function to `ART` in `engine/engine.html` (draw in a fixed design box via `fit(r, w, h)`, use `C.*` colours, `shape()` for brand marks, animate with `u`). Keep it flat, geometric and on-palette like the others. Copy it back into the skill's `engine/` too so it persists.

## Chinese (or any second-language) supers

`supers: [{ a, b, zh }]` — a subtitle bar near the bottom. Split a long line into two supers at a natural pause (`b` of the first = a word time). ≤ ~22 CJK characters each; the engine shrinks to fit. Mark them for native-speaker review when you report back.

## Formats

`916` 1080×1920 · `169` 1920×1080 · `11` 1080×1080 · `45` 1080×1350. Layout, type size and subtitle position adapt automatically; the same spec renders all four.
