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
