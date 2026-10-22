---
name: mw-brand-video
description: Turn a Moving Walls blog article, a URL, a storyboard or any brief (plus the user's own photos and video clips) into an on-brand motion-graphics video with Ava's voiceover — beat-synced edit, guidebook zigzags/logo/chevrons, ducked music + sound design, optional Chinese or other-language subtitles — rendered as MP4 in 9:16, 16:9, 1:1 and/or 4:5. Use this whenever the user wants a video, reel, short, animated post, motion graphic, explainer or social video for Moving Walls / movingwalls.com content, mentions "Ava" or "the voiceover", pastes a movingwalls.com/blog link and asks to "make one like the Tokyo/Chinese brands one", or wants a static frame or carousel pulled from such a video — even if they don't say "skill" or name a format. For videos about inventory on a /locations/ page (featured sites in a country or city) use mw-location-video instead.
---

# Moving Walls brand video (Ava for blog posts)

A spec-driven renderer: the **engine** owns the look (brand assets, colour, type, motion, sound) so every video is consistent; each **project** only supplies Ava's script and a scene list. Two finished examples live in `examples/` (Tokyo DOOH, Overseas OOH for Chinese brands) — read one `spec.js` before writing a new one; matching their structure is the fastest route to a good result.

Read as needed: `references/script.md` (writing the VO) · `references/spec.md` (spec format, scene kinds, art library, timing) · `references/brand.md` (guidebook rules, what makes it ours).

## Workflow

### 0. Setup (once per machine / container)
```bash
bash <skill-dir>/scripts/setup.sh        # prints ENGINE=<path> on the last line
```
Copies the engine to a writable home (`~/.mw-brand-video/engine`, override with `MW_VIDEO_HOME`), installs Poppins/Noto Sans SC/Playwright via npm and numpy/scipy/edge-tts via pip. Needs node, python3, ffmpeg. On Windows run it from Git Bash.
Network needs: `speech.platform.bing.com` (Ava), the article's site, npm/pip registries for setup, and — only for the shared cut-out library — the Moving Walls app (`cashflowos-rif.vercel.app`, override with `MW_STUDIO_URL`) plus `images.pexels.com`. In a Claude Code cloud environment these must be in the environment's allowed domains — if TTS or the fetch fails with a proxy/403/DNS error, tell the user which host to allow rather than working around it.

### 1. Read the article
Fetch the page and extract the real text (headings, claims, every number, named places, case studies, CTA). If the site can't be fetched, say so and ask the user to paste it or allow the domain — don't write from search snippets when the article itself is reachable later.

### 2. Ask before spending credit
Settle these with the user in one round of questions (skip any they already answered):
- **Format(s)** — 9:16, 16:9, 1:1, 4:5. Render only what they pick; each format is a full render.
- **Audience** — who the video speaks to (agencies / brands / media owners).
- **Language** — English only, or English VO + subtitles in another language.
- **Look** — *Infographic* (brand illustrations and data visuals only) or *Infographic + photos* (2–4 scenes swap their illustration for a black-and-white cut-out photo; see `references/spec.md` → Cut-out photos). Default to Infographic.
- Anything the article leaves open (which stat to feature, length cap).

### 3. Script → approval
Write 7–8 lines following `references/script.md` and show them. Get a yes (or edits) before generating audio.

### 4. Ava
Create the project folder (in the user's working directory, e.g. `./videos/<slug>/`), write `lines.json` (`{"voice":"en-US-AvaMultilingualNeural","rate":"+6%","lines":[…]}`), then:
```bash
python3 <skill-dir>/scripts/vo.py ./videos/<slug>
```
It prints every line's duration and word timings — you need those indexes for the spec.

### 5. Spec
Copy the closer example's `spec.js` into the project and rewrite it for this script (see `references/spec.md`).
- **Make it look different from the last videos.** Read `~/.mw-brand-video/history.json` and choose `accent`, `cover`, `burst`, panel `layout`s, transitions and illustrations that the recent entries did not use. At ~10 videos a week, sameness is the main risk.
- Choose art that *shows* each line rather than repeating it in text. A number about people is `people` or `compare`, a share is `donut`, growth is `trend`, places in a city are `pins`, and so on. The full library and what each piece is for is in `references/spec.md`.
- **Timing:** headline at the cut (`a + .2`), sub-lines 0.3s before their word. Never land a headline on a mid-sentence word.
- Alternate dark and light backgrounds so consecutive scenes contrast.

### 5b. Photos (only if the user chose *Infographic + photos*)
For 2–4 panel scenes where one physical object or person makes the point, get a cut-out:
```bash
python3 <skill-dir>/scripts/photos.py ./videos/<slug> "megaphone isolated on white background"
```
It prints `{"key","path","credit"}`. Add `photos: { <key>: '<path>' }` to the SPEC and `photo: { key }` to the scene, and keep its `art` as the fallback. It reuses the team's shared cut-out library first. Otherwise it gets Pexels photos that Claude has checked show the subject, and keys out white or green backdrops for free.
- On `{"error"}`, keep the illustration for that scene, and say which ones need the Studio's AI cut-out (busy backgrounds).
- Needs `MW_STUDIO_TOKEN` in the environment (ask the Moving Walls marketing team for it). If it's missing, say so and continue infographic-only — or use the user's own photos as `media` scenes instead.
- List photo credits for the caption when you hand over ("Photos by … on Pexels").

### 5c. The user's own photos and clips
If the user gives you images or video (event footage, a product, a site), use them as `media` scenes — full-frame with the words over a fade, or as a card (`references/spec.md` → Your own photos and video clips). Ask what each one shows if it isn't obvious, and keep Ava's line about what is on screen.

### 6. Check stills, then render
```bash
node $ENGINE/render.js ./videos/<slug> 916 stills 2.5 6 10 15 20 25   # PNGs in out/
```
Look at the stills (tile them with ffmpeg if many). Check: text not clipped, sub-lines not colliding, art not under the subtitle bar, the right word on screen at each time, and in 9:16 nothing readable in the top 13% or bottom 20% (platform buttons). Fix the spec, re-check. Only then render the chosen formats:
```bash
node $ENGINE/render.js ./videos/<slug> 916,45      # or: all
```
Output: `out/<slug>_<fmt>.mp4` (+ `out/mix.wav`). ~1–2 min per format per 30s on a normal machine; formats render in parallel. Run long renders in the background and wait for completion rather than polling.

### 7. QC and hand over
Make a contact sheet (`ffmpeg -i out/<slug>_916.mp4 -vf "fps=1.5,scale=120:-1,tile=12x5" -frames:v 1 qc.png`) and look at it — catch anything that flashes before its cue. Then send the MP4s and report: what each scene shows, the script, the facts used and where they came from, length, and anything needing human review (translations, claims).

## Static frames / carousel
Same spec, `stills` mode at the moments where each scene has fully landed (≈ 0.3s before its `b`). Each PNG is a carousel slide in the chosen format.

## Keeping it consistent
The look lives in `engine/engine.html` — don't restyle per video. If a video genuinely needs a new illustration or scene kind, add it to the engine generically (parameterised by `ev`) and copy the updated engine back into this skill's `engine/` (bump `engine/VERSION`) so future sessions get it.
