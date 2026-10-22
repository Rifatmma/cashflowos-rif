# The checks, and how each is fixed

Every finding has a `severity` (blocker · should fix · nice to have) and a `fix` class:

- **auto** — design, timing, voice and engine problems. Fix them in the hidden loop without asking.
- **approve** — anything that changes what the video *says*: words, claims, figures that differ from the
  article, numbering. List them for Rif with a proposed wording; do not change them.

## Layout audit — `node $ENGINE/render.js <project> <fmts> audit` (engine/audit.js)

What was actually drawn, frame by frame. Writes `out/audit_<fmt>.json`.

| kind | rule | fix class | how to fix |
|---|---|---|---|
| off-frame | text past the frame edge (blocker) | auto | shorten the text, or fix the art's layout in core.js if it is the art |
| unsafe | 9:16: under the platform UI (blocker) or outside the ad zone x 120–888, y 288–1248; other formats: in the margin | auto | shorter text / different layout; art labels → engine |
| overlap | two texts on top of each other on the settled frame (blocker) | auto | layout change, fewer words |
| contrast | WCAG 4.5:1 (3:1 large) against the worst 5% of the pixels behind it; < 3:1 blocker | auto | engine colour rule (onAcc, accentText, FILL) — never per video |
| graphic | an illustration line < 1.5:1 against what it is drawn over | auto | engine: deep accent on light grounds, on-accent ink on accent tiles |
| tiny | < 20px at 1080 (should fix); 9:16 20–28px (nice to have) | auto | fewer words in the label; wrap before shrinking |
| hold | readable < max(1s, 0.33s/word) | auto | move the text's cue earlier or `out` later; shorten it |
| late / early | lands > 0.25s after / > 0.6s before Ava's word (headlines exempt) | auto | cue it on the right word (`on`) or retime `t` |
| sequence | numbered labels with a gap | approve | propose: renumber what is shown, or name the items |
| figure | a number on screen not in `source.txt` | approve* | *auto when the article has the figure and the screen only lost formatting (a dash, a comma) — restore it |
| cut-off | the text stops part-way through a word (blocker) | auto | restore the whole word from the source; if it was the sanitizer, fix and test it |

`source.txt` in the project (the article or page text, saved when it was read) enables `figure` and
`cut-off`. Without it they are skipped — always save it.

## Media audit — `python3 scripts/audit_media.py out/<slug>_<fmt>.mp4 <fmt>`

The file: H.264 High/Main yuv420p 30fps, the format's size, AAC 48 kHz, fast start, A/V end together,
−14 LUFS ±1, true peak ≤ −1 dBTP, no silence > 1s at the ends, no black ≥ 0.5s, ≤ 3 large flashes
in any second (WCAG 2.3.1 screen, not certification). All **auto** — render.js settings.

## Voice audit — `python3 scripts/audit_voice.py <project>`

| kind | rule | fix class | how to fix |
|---|---|---|---|
| voice | spoken by anything but an English-only en-US voice (blocker) | auto | `"voice": "en-US-AvaNeural"` in lines.json; re-run vo.py |
| accent | Whisper's language guess < 90% English for a line (blocker) | auto | regenerate the line; if it persists, respell the name in lines.json |
| pronunciation | a script word heard as another word | auto | respell for Ava in lines.json only (the on-screen text stays) and regenerate that line; near-misses (a swallowed "in") are nice to have |

## Claude review — you, after the automatic audits

Look at a contact sheet of every scene's settled frame (`scripts/sheets.py`) and read the script
against `source.txt`. Write findings to `out/review.json` (same shape: severity, kind, scene, t, text,
detail, rule, fix). Look for what the checks cannot see:

- claims stronger than the source, comparisons without their comparison, a forecast shown as a fact
- the art saying the wrong thing (a funnel for four separate metrics)
- anything that looks broken: a missing icon part, a stray mark, a clipped photo, a busy background
- spelling on screen, the right word on screen at the right time

Copy findings are **approve**; design findings are **auto**.
