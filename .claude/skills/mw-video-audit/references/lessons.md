# Lessons from video audits

Read this before writing a script or a spec for an Ava video (`mw-brand-video`, `mw-location-video`,
and the /mw/studio writer). Every entry is a mistake an audit caught once; the rule keeps it from
coming back. The audit appends to this file — newest at the bottom of its section, one entry per
*kind* of problem, never one per video.

Format: **rule** — what happened (video, date) · how the audit catches it now.

## Voice

- **Ava is `en-US-AvaNeural`, the English-only voice. Never the Multilingual one.** — The Multilingual
  voice guessed the language phrase by phrase and slipped into other accents: Rif heard Japanese and
  other non-American accents; Whisper heard "Brands want proof" as "schwamproof", "block" as "walk",
  "AirAsia's" as "Eurasia's" (5-article test, 22 Oct 2026) · `audit_voice.py`: voice = blocker.
- **Acronyms are spoken letter by letter.** — "LMX" was read "lemex" (retail, 22 Oct 2026). `vo.py`
  sends "L M X" and folds the timings back · `audit_voice.py` pronunciation.
- **Say numbers so they can't be heard as other words.** "Seven in ten" was heard as "7 and 10";
  prefer "seven out of ten" in a script (diwali, 22 Oct 2026) · `audit_voice.py` (nice to have).

## Words and figures on screen

- **A figure on screen is exactly the article's figure — a range keeps its dash.** — "30–50%" showed
  as "3050%": the plan sanitizer dropped the dash (ssp, 22 Oct 2026) · layout audit `figure`
  (needs `source.txt`).
- **Never cut a label mid-word.** — Labels were cut at 30 characters: "their su", "in adva", "before
  buyi" (measurement, diwali, 22 Oct 2026). Arts fit their labels; keep labels under ~40 characters
  and whole · layout audit `cut-off` (blocker).
- **Numbered labels run without gaps.** — "Feature 1, Feature 2, Feature 4" when the script covered
  three of the article's five features (ssp, 22 Oct 2026). Number what you show (1–3), or label them
  by name · layout audit `sequence`.
- **A comparison names what it is compared with.** — "30–50% higher CPMs from international brands"
  dropped "than local advertisers" (ssp, 22 Oct 2026) · Claude review (copy vs article).
- **Claims as strong as the source and no stronger.** A forecast is labelled a forecast ("2024
  forecast", retail, 22 Oct 2026) · Claude review.
- **No invented numbers in illustrations.** Demo figures baked into new arts were removed; an art shows
  the real figure or none (22 Oct 2026).

## Timing

- **A source credit lands with its figure, not at the end of the line.** — "Source: eMarketer" came
  3.6s after Ava named it (retail, 22 Oct 2026) · layout audit `late`.
- **A sub-line that echoes the end of Ava's sentence is cued on those words.** — "who saw it, who did
  not." appeared 0.8–1s early, cued on "versus" (measurement, 22 Oct 2026) · layout audit `early`.
- **Re-check holds after any voice change.** New voice timings left "MW Science." at 0.5s of a
  needed 0.6s (measurement, 22 Oct 2026) · layout audit `hold`.

## Design

- **Lines in the accent colour take the deep accent on light grounds.** Sunburst yellow lines on white
  are 1.3:1 and Emerald green ~1.6:1; `accentText(dark)` gives the deep accent (≥ 4.4:1) on light and the
  bright one on dark (ssp checklist ticks and hub connector, 22 Oct 2026) · layout audit `graphic`.
- **An icon on an accent tile is drawn in the on-accent ink, accent parts included.** — The highlighted
  "Performance" tile showed a bare "L": the chart line was the tile's own colour (measurement,
  22 Oct 2026) · layout audit `graphic`.
- **Text on an accent fill is navy on Sunburst/Emerald and white on Crimson; crimson fills are the deep
  crimson.** Navy on crimson was 3.8:1; figures on light-blue bars were 1.9:1 (22 Oct 2026) · `contrast`.
- **In 9:16, centre on the safe area, not the frame.** The safe area is lopsided (35% kept clear at the
  bottom for the ad UI); the flip burst sat off-centre (22 Oct 2026) · `unsafe`.
- **Small counts lay out as their number.** 7 in 10 drew as rows of 8 + 2; ≤ 12 people now lay out in
  two even rows (diwali, 22 Oct 2026).
- **Art captions in 9:16 are ≥ 28px at 1080 wide.** Captions at 23–27px pass the 20px floor but are
  small in a phone feed (22 Oct 2026) · `tiny` (nice to have).

## Process

- **An audit that could not run is not a clean audit.** The engine once failed to load (a syntax error
  from an inline comment cutting a line short) and the audit reported "no issues". `render.js … audit`
  now exits non-zero on any page error (22 Oct 2026).
- **Look at every scene's settled frame yourself.** The automatic checks measure; they do not read.
  Three of the first test's real defects were found by eye (22 Oct 2026).
