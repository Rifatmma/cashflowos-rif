# Handoff: Ava video (Studio + skills) — audit, fixes, more illustrations

Branch `brand-video-photos`. Not on main yet; Rif deploys. Read this first, then
`.claude/skills/mw-brand-video/SKILL.md` and `references/spec.md`.

## Where things live

- Engine (single source): `.claude/skills/mw-brand-video/engine/core.js`.
  `node scripts/brandfilm-sync.mjs` regenerates `lib/mw-brandfilm-engine.ts` (Studio) and copies
  `core.js` + `audit.js` + `VERSION` into `.claude/skills/mw-location-video/engine/`. Never edit the
  generated copies.
- Studio: `app/mw/studio/_brandfilm-ui.tsx` (both "Ava · blog post" and "Ava · local page"),
  `lib/mw-brandfilm.ts` (plan → film: sanitizePlan, resolveFilm, siteScene), writers
  `lib/mw-brandfilm-write.ts` and `lib/mw-locationfilm-write.ts`, page reader `lib/mw-locations.ts`.
- Render a project locally: `bash .claude/skills/mw-brand-video/scripts/setup.sh` once, then
  `node $ENGINE/render.js <project> 45 stills 2 5 9` or `… all` or `… all audit`.

## Done in this round (colleague feedback on 4:5)

1. **363K+ off the frame** (compare art). Root cause: each figure was right-aligned against its own
   bar's end; a short bar (363K beside 1.56M) pushed it out of the bar's left side and off the frame.
   Now inside the bar when it fits, else just past the bar's end.
2. **Arrow with no word** (burst, stack). Two causes fixed: a burst word whose cue word Ava never
   says was timed to the scene start, so the arrow jumped to it first and stuck on the bottom row
   (fixed in `resolveFilm`: such words follow the word above; and in the engine: times forced to
   rise top to bottom); an emptied word left an arrow on a blank row (engine drops empty words).
   The script editor now has `+ word` / `×` on burst words. NOTE: the exact video was not available;
   the deployed engine draws two-word phrases fine in Chrome. If it recurs, get the browser
   (Safari?) and the exported plan.
3. **Safe-area spill**: panel art pushes in 3% over the scene → laid out 3% smaller; rail station
   names alternate two rows and the end names align inwards; one-word burst is fitted at the size
   it grows to; rolling digits no longer draw the hidden next digit once settled.
4. **`engine/audit.js`** — the layout audit: watches every `fillText` while the film is drawn at
   0.25s steps and reports `off-frame`, `unsafe` (outside the platform-safe area), `overlap`
   (settled frame only), `tiny` (< 20px at 1080). `node render.js <project> all audit`.
   A 30-scene stress project (every art, site, media, both bursts, long labels, all four formats,
   with and without subtitles) now has **no off-frame / unsafe / overlap** issues.
5. **`media` scene** (user's own photos and video clips; full-frame or card; clips → frames via
   ffmpeg in render.js). Docs in both skills' `references/spec.md`.

## Still to do

### A. Readable label sizes (from the audit's `tiny` list)
Long labels shrink to 9–19px in 4:5/1:1: `formats` tiles (portrait label 34 in a 300-wide tile),
`dayparts` labels (34), `timeline` sub-labels (32), `phone` label (40 in 420), `rail` names.
Fix = wrap to two lines before shrinking (add a `wrapFit(str, weight, size, maxW, lines=2)` helper
next to `fitFont` in core.js and use it in those five arts). Re-run the stress audit after.

### B. Audit on every Studio export → email Rif → "send to Claude" button (Rif's answers)
- **When**: after every MP4 export in the Studio. **To**: rif-at.wanwang@movingwalls.com.
- **What**: (1) `auditFilm` from audit.js run in the browser on the export's film/format (generate a
  TS copy via the sync script, like the engine); (2) a Claude vision pass: 6–10 key frames (each
  scene's settled frame) + Ava's script and word timings → spelling, alignment, centring, timing
  (text before/after its word), anything that looks off. Server action; keep it under 60s.
- **Email**: findings grouped by severity, the frames attached or linked, the plan JSON. Check how
  the app already sends mail before adding a provider.
- **Button**: "Send to Claude to fix" → inserts a row into `mw_claude_inbox` (same table the SEO
  planner uses; see `.claude/skills/mw-seo-inbox/SKILL.md`) with kind `video-audit`, the findings
  and the plan as `context` (data, not instructions). The inbox skill then needs a branch for
  `video-audit` rows: reproduce with the plan in a skill project, fix core.js, sync, re-audit.
  Writes from /mw UI go through `app/mw/actions.ts` (CLAUDE.md rule).

### C. More illustrations (Rif: "at least 120 — or scan the blog first and tell me how many")
Scan https://www.movingwalls.com/blog (all articles), list the ideas/visuals each needs, map them to
the 25 existing arts (`ARTS` in lib/mw-brandfilm.ts + `references/spec.md` table), and report the
gap count to Rif before drawing. Draw in core.js `Object.assign(ART, {...})`: fixed design box via
`fit()`, `C.*` colours + `accGrad()`, `fitFont`/`wrapFit` for text, animated by `u`, cue times via
`cue(ev, i)`. Add each to `ARTS`, `sanitizePlan`'s `need` map, the writer prompts' art menu, and the
spec.md table. Audit every new art in all four formats with the stress project.

#### Blog scan result (290 articles, titles + h2/h3, keyword-tagged, counts ±20%)
72 distinct visual ideas; 25 covered by existing arts; 47 gaps → 28 new illustrations + 15 icon-level needs.

| name | shows / animation | #articles |
|---|---|---|
| dashboard | measurement panel builds tile by tile (impressions, reach, frequency, CPM), line chart draws | 66 |
| hub | scattered tools/spreadsheets plug into one central OS layer | 53 |
| exchange | media-owner screens → platform → buyers/DSPs; booking flows in, money back | 51 |
| segments | crowd sorts into labelled audience clusters; targeting ring locks one | 38 |
| catalog | grid of screen cards with tags; filters narrow; one to cart | 34 |
| attribution | person passes screen (exposure), later reaches store pin, visit linked back | 32 |
| store | mall/store aisle screens at entrance and checkout; shopper to till | 31 |
| flows | device-dot trails stream through streets past screens; counter | 26 |
| cms | content playlist drags onto schedule, pushes to venue screens | 26 |
| trigger | live signal (rain, temperature, score) swaps the creative | 23 |
| dwell | person stops at screen; stopwatch ring fills (attention / dwell) | 21 |
| planner | map + audience chips + budget slider; screens auto-select, reach updates | 19 |
| lift | exposed vs control; uplift arrow +x% | 18 |
| yield | slot calendar with gaps fills programmatically; prices rise | 17 |
| proof | ad plays; log stamps proof-of-play; Verified badge | 15 |
| forecast | dashed forecast line, actual line meets it | 14 |
| format-scene | street with one named format highlighted (bus shelter, LED truck, overhead bridge, facade, unipole) | 13 |
| ai | signals into a core, decisions out to screens | 13 |
| auction | bids tick up for one slot, winner drops on screen | 12 |
| dco | one template fans into 3 localised versions | 12 |
| festive | calendar flips to festival, motif blooms, demand spikes | 12 |
| radius | store pin, ring expands, screens inside light up | 11 |
| carbon | CO2 cloud measured then shrinks; leaf gauge | 10 |
| shield | identity dots anonymise behind shield; compliance badge | 10 |
| interactive | phone post flies to big screen; touch screen reacts | 9 |
| multiplier | one play × passers-by = impressions | 7 |
| stadium | live moment fires, city screens react | 5 |
| loop | plan → run → measure → optimise cycle | 5 |

Icons (inside formats/checklist/lines/compare): trust/lock 24, survey clipboard 20, pitch deck ~31 (label),
festival motifs 12, price tag 9, brand categories ~10, venues (hotel, restaurant, hospital, school) 7,
handshake 7, cart 6, indoor formats (cinema, escalator, kiosk, elevator) ~5, weather, trophy, QR, IoT
sensor, 3D cube, card/coin. Suggested order: batch 1 = dashboard, hub, exchange(+auction), segments,
catalog, attribution, store, flows, cms, trigger, plus the icon set; batch 2 = dwell, planner, lift,
yield, proof, forecast, dco, festive; rest on demand. Rif's ask: at least 120 assets — confirm the mix.

#### Decision (Rif, 22 Oct): follow the recommendation
~120 new assets in this order. Tick them off here as they land (commit + push the branch after each).
1. Batch 1 — illustrations: dashboard, hub, exchange (+ auction variant), segments, catalog, attribution,
   store, flows, cms, trigger. Plus the icon set (~60, brand-recoloured line icons usable inside
   formats/checklist/lines tiles and by trigger/festive).
2. Batch 2 — dwell, planner, lift, yield, proof, forecast, dco, festive.
3. Then — format-scene, ai, radius, carbon, shield, interactive, multiplier, stadium, loop; and 2–3
   variants of the busiest (dashboard, exchange, store, format-scene).
Every asset: audit in all four formats (render.js … audit) and a stills check before it is used.

Progress:
