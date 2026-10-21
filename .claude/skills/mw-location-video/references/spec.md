# Location video spec (engine 2.3+)

Everything in `mw-brand-video/references/spec.md` applies (timing on the 0.5s beat grid, safe areas, text items, scene kinds, illustrations). This file adds the `site` scene and the location story.

```js
const SPEC = {
  title, dur, bpm: 120, accent: 'crimson', cover: 'mark', burst: 'flip',
  vo: START.map((t, i) => ({ file: `l${i}.wav`, t })),
  photos: { npe: 'sites/lebuhraya-pantai-baru-npe.png', duta: 'sites/duta-park.png' },   // from read_location.py
  scenes: [ …cover, number, pins…, …site scenes…, burst, end ],
};
```

## The `site` scene

```js
{ kind: 'site', a: 16.0, b: 21.0, tr: 'slide', photo: 'npe', focus: [.03, .06, .24, .56],
  text: [{ t: 16.05, s: '01 / 06 · Highway', st: 'lab' }, { t: 16.2, s: 'New Pantai Expressway', st: 'h', scale: .8 }],
  chip: { t: w(3, 4) - .3, s: 'Portrait LED screen · NPE' },
  stats: [
    { t: w(3, 5) - .2, value: 587921, label: 'Monthly reach', accent: true, roll: w(3, 9) - w(3, 5) },
    { t: w(3, 6), value: 1236240, label: 'Monthly impressions' } ],
  near: { t: w(3, 11) - .2, s: 'Links Sunway & Mid Valley to the city' } }
```

| field | meaning |
|---|---|
| `photo` | key into `SPEC.photos` — the site photo, as published |
| `focus` | where the screen is in the photo, `[x, y, w, h]` as fractions. The card crops and pushes in towards it; the accent brackets snap onto it. |
| `text` | `lab` = "NN / total · setting" (Highway, City road, City centre, Shopping street, Mall…), `h` = the site name (`scale: .8`). |
| `chip` | the format pill: what kind of screen and where it stands. |
| `stats` | two counters, values verbatim from `sites.json`. `accent: true` on the one Ava says; `roll` (seconds) makes it land as she finishes saying it. |
| `near` | pin + italic line, last to appear. |

Layout per format (engine-owned): 9:16 / 4:5 / 1:1 — photo card on top, words below; 16:9 — photo card left, words right. The background is the same photo, blurred and darkened.

Timing: the site's line starts the scene; chip ≈ 0.3s before the format/setting word, stats from the first number word, near on the last words. Site scenes are 3.5–5s; use `tr: 'slide'` between consecutive sites and `iris` into the first.

## Story shape that worked (Kuala Lumpur, 52s)

| line | scene |
|---|---|
| Kuala Lumpur. Where Malaysia moves. | cover (`lab` "Featured sites · Malaysia") |
| Greater KL is home to around nine million people… | panel · `number` 9M "people in Greater KL" |
| Moving Walls has seventy-one programmatic sites… from KLCC to Batu Caves. | panel · `pins` (5 districts, last pin = the one said last) |
| On the New Pantai Expressway, nearly six hundred thousand people a month. | site 01 |
| … one line per site … | site 02–06 |
| Plan by audience, buy programmatically, and measure the footfall. | burst PLAN. BUY. MEASURE. Real footfall. |
| Kuala Lumpur, live on Moving Walls. Out-of-home, no boundaries. | end: city · "Live on Moving Walls." · "No boundaries." (accent) · movingwalls.com/locations/<country> |
