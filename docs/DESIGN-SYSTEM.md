# Design system — the ledger

*The restaurant side of CashflowOS. Moving Walls (`/mw`) has its own system and is
not governed by this file.*

The brief was: **"I don't want this app to look like an AI created it."** That is a
real and specific critique, and this document is the answer to it.

---

## 1. The diagnosis

The colours were never the problem. The palette already is a warm ledger — Rice
Paper, Kaffir Ink, Pandan green, with a written proportion rule. Five things make
it read as machine-made, and all five are structural:

| Tell | Why it reads as generated | What we do instead |
|---|---|---|
| Everything is a white rounded card | Stacked 13–28px radii over a tinted ground is the default shape of generated UI | **Hairline rules on paper.** Cards only where something is genuinely a separate object |
| Numbers do not line up | Amounts in the body face, left-ish, varying width | **Mono, tabular, right-aligned.** Always |
| Even spacing everywhere | No hierarchy of silence; everything equally important | **Space is the hierarchy.** Big gaps above sections, tight inside rows |
| One family, one weight | No register, no voice | **A serif for headings and figures** |
| Emoji as structure | Template output | **No emoji in web UI.** They stay in Telegram, where they aid scanning |

A ledger is a column of aligned figures with ruled lines and margin notes. That is
the target, and it happens to be the correct form for the content.

---

## 2. Colour

Unchanged from `app/globals.css:1-73`. It was right.

```css
--paper:   #F1F4EC;   /* Rice Paper — the page ground            */
--paper-2: #E5EBDD;   /* Steam — quiet fills, striped rows       */
--card:    #FFFFFF;   /* only for genuinely separate objects     */

--ink:       #0C2B18; /* Kaffir Ink — all text, never pure black */
--ink-soft:  #3C5244; /* secondary                               */
--ink-faint: #56695B; /* captions, metadata                      */

--green:     #33A02C; /* Pandan — bars, big figures, never text  */
--clay:      #23801E; /* button fill, white text at 5.0:1        */
--clay-deep: #1B6A17; /* green text and hover                    */

--line:   rgba(12,43,24,.10);  /* the hairline. Used constantly  */
--line-2: rgba(12,43,24,.18);  /* section rules                  */

--good: #1E7A1A;  --mid: #3C5244;  --bad: #C4340B;
```

**The proportion rule, kept:** 60% paper · 25% ink · 10% Pandan · 5% chili.
Green is the signature, not the wallpaper.

**Three greens on purpose.** `--green` is 3.38:1 on white, so it is for *shapes* —
bars, rules, big figures. `--clay` and `--clay-deep` carry text and buttons at 5:1
or better. Never use `--green` for body text.

**One accent per screen.** Exactly one thing should be Pandan: the thing to do
next. If two things are green, neither is.

### Dark mode

`prefers-color-scheme` only — no toggle, by choice. Dark is **ink-on-dark-paper**,
not inverted cards: ground `#0C2B18`, rules lift to `rgba(241,244,236,.14)`, green
lifts to `#4FBF46`. Panels do not become dark grey boxes.

---

## 3. Type

| Role | Face | Notes |
|---|---|---|
| Headings, big figures | **IBM Plex Serif** 500/600 | `--font-serif`. New. Same vendor, already loaded via `next/font` |
| Body, labels, buttons | IBM Plex Sans 400/500/600 | `--font-sans`. Unchanged |
| **All money and quantities** | IBM Plex Mono 400/500 | `--font-mono`, `tabular-nums`, right-aligned. Non-negotiable |

```css
.num, .mono, td.amount, .co-big {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
```

Scale — five sizes, no more:

| Token | Size | Use |
|---|---|---|
| `--t-figure` | 34 / 44px | the one number a screen is about |
| `--t-head` | 22px serif | page and section headings |
| `--t-body` | 15px | rows, form labels, prose |
| `--t-meta` | 13px | who filed it, when, line counts |
| `--t-micro` | 11.5px mono caps | eyebrows, column headers |

Inputs stay at **16px** regardless. Anything smaller makes iOS zoom on focus, and
that decision is already documented in `globals.css`.

---

## 4. Shape and space

```css
--r-0:    0;      /* ledger rows, tables, list items          */
--r-8:    8px;    /* inputs, small controls                   */
--r-13:   13px;   /* buttons                                  */
--r-pill: 999px;  /* switchers, chips                         */
```

**Radii above 13px are gone from layout.** `--r-20` and `--r-28` stay defined for
the few existing hero panels but must not be used on anything new.

Spacing is a 4px scale: `4 · 8 · 12 · 16 · 24 · 40 · 64`.

The rhythm that makes it a ledger:

- **Between sections:** 40px, and a `--line-2` rule.
- **Between rows:** 0. A single `--line` hairline divides them.
- **Inside a row:** 12px vertical, 16px horizontal.
- **Row minimum height: 52px.** Already the rule; keep it.

**Shadows are not used.** One hairline border instead. The only exception is a
genuinely floating element — a modal or the expanded photo.

---

## 5. Components

### The ledger row

The spine of the whole app.

```
─────────────────────────────────────────
  Sri Ternak                      265.10
  food · 11 lines · Tina
─────────────────────────────────────────
▌ Kakak                           147.70
  food · 4 lines · Yuu
  proof not valid · 3 days
─────────────────────────────────────────
```

- Name left in body face; amount right in mono.
- Metadata on a second line in `--t-meta`, `--ink-faint`, separated by `·`.
- **A problem is a 3px `--bad` bar in the left margin plus one phrase** — never a
  badge, never a count. One phrase, highest priority only. The reader's question is
  "do I tap this?", and a phrase answers it where a number does not.

### The day header

```
Saturday 4 October
RM 412.80 · 3 bills
```

Serif, 22px, hanging in the left margin on desktop (`margin-left: -24px`) so the
column of figures stays unbroken. Deliberate asymmetry; nothing generated is ever
asymmetric.

### The date stepper

```
‹   Saturday 4 October   ›        [ 📅 ]
```

Arrows are plain links carrying `?d=`. The date is a real `<input type="date">`
styled to look like text — native pickers beat anything hand-built, work with
assistive tech, and cost no JavaScript.

### Figures

One per screen, `--t-figure`, serif or mono, with a `--t-micro` label above. If a
screen has two big numbers it has two jobs and should be two screens.

### Buttons

- **Primary:** `--clay` fill, white text, `--r-13`, 44px tall. One per screen.
- **Secondary:** transparent, `--line-2` border, `--ink` text.
- **Destructive:** `--bad` text on transparent; fill only on confirm.

### Chips

`--r-pill`, 11.5px, used for expense types only. Tinted ground, `--ink-soft` text —
not coloured per type. Twelve colours is a dashboard; one is a ledger.

---

## 6. Layout

| Breakpoint | Behaviour |
|---|---|
| **< 600px** | One column. Content padding 16px. Bottom nav. |
| **600–899px** | One column, 24px padding, wider rows. |
| **≥ 900px** | Two columns where a reference pane earns it (the correction screen). Day headers hang into the left margin. |
| **≥ 1100px** | Max width 880px, centred. Never full-bleed text. |

**Phone first, and literally.** Every screen is checked at **375px** before
anything else. The primary user is standing in a kitchen holding a phone in one
hand.

---

## 7. The photo band (mobile)

The one genuinely new component, and the answer to the worst complaint.

```
┌──────────────────────────────────┐
│ [photo, 96px, cropped to top]  ⤢ │  ← sticky, top: 0
└──────────────────────────────────┘
   Line 1
   Item [ Chicken breast 2kg     ]
```

- Collapsed: **96px**, `object-fit: cover; object-position: top` — the top of a
  bill is where the shop name and date print, which is what you re-check most.
- Tap, or `⤢`: expands to **60vh**, pinch-zoom and pan inside.
- The form scrolls underneath either way.
- Desktop (≥900px) keeps the existing two-column sticky layout instead.

**Why not a split view:** it halves an already tight 375px form, and fights the
collapsing URL bar. **Why not per-line thumbnails:** the need is to *glance while
typing*, not to alternate between two states.

The save footer stays **non-sticky**. That was decided before, for a good reason —
pinning it put Save under the phone's tab bar.

---

## 8. Voice

The interface talks the way the comments in this codebase already do.

| Not this | This |
|---|---|
| "Validation error" | "Lines add to RM 412.80 but the receipt says RM 383.17" |
| "No data available" | "Nothing filed on this day" |
| "Missing attachment" | "No photo yet — Yuu filed this on Tuesday" |
| "Item successfully updated" | "Saved. 4 kg chicken breast went into stock" |

Rules:

1. **Say the number.** Never "some items" when you can say "three".
2. **Name the person** when a person is involved.
3. **Never blame.** "No photo yet", not "Yuu failed to attach a photo".
4. **An empty state says what would be here**, not "no results".
5. **Never apologise for the data.** If a figure is uncertain, say why in the same
   breath: "RM 9,112 · RM 240 unverified".

---

## 9. Accessibility — already decided, do not regress

From `app/globals.css`, with the reasons:

- **52px minimum tap target** on every row and control.
- **16px inputs** — anything smaller triggers iOS zoom-on-focus.
- **Focus rings visible:** `outline: 2px solid var(--green)`.
- **`prefers-reduced-motion`** kills the disclosure caret transition.
- **The save footer is not sticky** — pinning put it under the phone tab bar.
- Contrast: body text ≥ 7:1, secondary ≥ 4.5:1, never `--green` on white for text.

---

## 10. Checklist before shipping a screen

1. Does it answer **one** question?
2. Is there exactly **one** Pandan element?
3. Do all amounts line up — mono, tabular, right-aligned?
4. Rules rather than cards, unless it is genuinely a separate object?
5. Does it work at **375px** without horizontal scroll?
6. Does the empty state say what would be here?
7. Can every row be tapped with a thumb — 52px?
8. Any emoji? Remove them.
9. Any number without a unit or a currency? Fix it.
10. Would a bookkeeper in 1970 recognise the shape of it?
