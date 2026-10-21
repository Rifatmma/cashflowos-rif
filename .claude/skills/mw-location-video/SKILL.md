---
name: mw-location-video
description: Turn a Moving Walls local landing page (movingwalls.com/locations/{country} or /locations/{country}/{city}) into an Ava-voiced video that promotes the featured inventory there — each site's real photo, name, format, monthly reach and impressions, and what it is near — in the brand's motion style, rendered as MP4 in 9:16, 16:9, 1:1 and/or 4:5. Use this whenever the user wants a video, reel or short about Moving Walls inventory, billboards, screens or sites in a country or city, pastes a /locations/ link, or asks for "Ava for local pages", "a featured sites video", "the KL/Selangor/Johor one" — even if they don't say "skill". For videos from blog articles use mw-brand-video instead.
---

# Moving Walls location video (Ava for local pages)

Same engine and look as `mw-brand-video` (Ava, beat-synced cuts, guidebook zigzags, chevrons, music), with one extra scene kind, `site`: a featured site's **real photo** pushed in on its screen, corner brackets snapping onto the screen, then the site name, its format, **monthly reach** and **monthly impressions** counting up, and a "near" line. A finished example is in `examples/kuala-lumpur/` — read its `spec.js` before writing a new one.

Read as needed: `references/spec.md` (the `site` scene, story shape, timing) · the brand rules and script rules in the sibling skill `mw-brand-video/references/` if it is installed (they apply unchanged).

## Workflow

### 0. Setup (once per machine / container)
```bash
bash <skill-dir>/scripts/setup.sh        # prints ENGINE=<path> on the last line
```
Needs node, python3, ffmpeg; network to `www.movingwalls.com`, `cdn.sanity.io` and `speech.platform.bing.com` (Ava). In a cloud environment, if a fetch fails with a proxy/403/DNS error, tell the user which host to allow.

### 1. Read the pages
```bash
python3 <skill-dir>/scripts/read_location.py ./videos/<slug> <locations-url>
```
A country URL reads the country page and every city page it links to; a city URL reads that city and its country page (whose inventory carousel often holds more sites in the city). It writes `sites.json` (sites grouped by city), `context.md` (each page's words, including collapsed FAQ answers such as "71 active sites across 78 screens"), and `sites/<id>.png` (photos exactly as published).

Only sites with a **photo, reach and impressions** are kept. Sites whose numbers contradict themselves on the page (a card saying "1.35 M" while its description says 132,145) are printed as *left out* — mention them to the user, never use them.

### 2. Ask before spending credit
One round of questions (skip what the user already said):
- **Which city / sites.** Up to 6 sites per video (≈ 50s). One video per city reads better than one country video; East Malaysia-style leftovers (one site per city) can share a video.
- **Format(s)** — 9:16, 16:9, 1:1, 4:5. Render only what they pick.
- **Labels.** Pages label reach inconsistently ("Daily Reach" on one city, "Monthly Reach" on another, nothing on the carousel). The team's decision so far: show both as **monthly**. Confirm if a new country looks different.

### 3. Facts and photos — the rules
- **Every number on screen comes from `sites.json`**, verbatim. Ava says numbers as words ("nearly six hundred thousand"); never round them on screen.
- **Photos are used exactly as published** — never blurred, covered or retouched, even when the screen shows another media owner's ad or contact details. The team has the owners' approval for what is on the website.
- **Format** (there are no sizes on the pages): read it from the photo — "Portrait LED screen · Highway", "LED cube · Street level", "Large format · Building façade", "Indoor LED · Mall". Don't claim "digital" when the photo doesn't show it.
- **Near**: only what the page or the site's name says ("Above Sports Direct, Bukit Bintang", "On the drive in from KLCC", "Links Sunway & Mid Valley to the city"). Anything from your own knowledge must be flagged to the user for review.
- For each photo, find the screen: look at it and write `focus: [x, y, w, h]` (fractions of the photo). Check it on a still — the brackets and the push-in centre on it.

### 4. Script → approval
Shape (≈ 9–11 lines): **cover** (city + a hook) · **audience** (one sourced city figure, `number` art) · **network** (sites count, `pins` art on 3–5 named districts) · **one line per site** (≤ 12 words: the name and ONE thing — its reach, its impressions, or where it is) · **rhythm line** (`burst`: Plan. Buy. Measure.) · **close**.
- The close is **"<City>, live on Moving Walls. Out-of-home, no boundaries."** with "No boundaries." on screen in the accent colour. Keep "no boundaries" inside that English sentence: on its own, or straight after a Malay/foreign place name, the multilingual voice switches accent.
- Write place names so Ava can read them (as on the page), acronyms as spoken ("out-of-home").
Show the lines to the user; get a yes before recording.

### 5. Ava → spec → stills → render
```bash
python3 <skill-dir>/scripts/vo.py ./videos/<slug>            # lines.json → l<i>.wav + word timings
node $ENGINE/render.js ./videos/<slug> 916 stills 5 12 20 28   # check every site scene once it has landed
node $ENGINE/render.js ./videos/<slug> 916,45                  # or: all
```
Copy `examples/kuala-lumpur/spec.js`, keep its structure, replace lines/sites. Site-to-site transitions are `slide` (a swipe through the inventory). Check stills in every chosen format: name and numbers inside the safe area, brackets on the screen, near line not clipped.

### 6. Hand over
Send the MP4s and report: the sites used (with their numbers and source page), anything left out and why, every "format" and "near" that came from the photo or your own knowledge (for review), and the label decision (monthly).

## Keeping it consistent
The engine is shared with `mw-brand-video` and the /mw/studio tab ("Ava · local page"). If you change `engine/core.js`, copy it to the other skill too and run `node scripts/brandfilm-sync.mjs` in the app repo, then bump `engine/VERSION` in both.
