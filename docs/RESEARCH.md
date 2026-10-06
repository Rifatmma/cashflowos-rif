# Research — why the receipt system fails its users

*Written 5 Oct 2026, from the live database and a full read of the code. Every
claim here has a file and line number or a SQL result behind it. Where I was
wrong about something, that is recorded too.*

---

## 1. The numbers, before any opinion

```sql
select count(*) filter (where category='cash_out')            -- 213
     , count(*) filter (where v.record_id is not null)        -- 153 have a photo
     , count(*) filter (where v.record_id is null)            --  60 have none
  from records r
  left join lateral (select 1 as record_id from vault_files f
                      where f.record_id = r.id limit 1) v on true
 where r.created_at >= '2026-09-21';
```

| | |
|---|---|
| Receipts filed since 21 Sept | **213** |
| With a photo | 153 |
| **With no proof at all** | **60 — 28%** |
| Lines that do not add up (`meta.items_note`) | 18 |
| Typed, no photo expected | 22 |
| Parked "I'll fix it in the app" | 0 |
| Rows in `records`, all categories | 265 |

Who files:

| Person | Telegram id | Receipts | In group |
|---|---|---|---|
| Tina Kuno | 8880775629 | 144 | yes |
| Yuu | 851007120 | 18 | yes |
| Rifat Wanwang | 5880782382 | 8 | yes |
| Jarvis (auto, fixed costs) | — | 33 | — |

Stock items currently **below zero**, because a stocktake has never been entered:
lala −750 g, beef tongue −600 g, mussel −144 g, chicken leg −31 pcs, chicken feet
−16.75 pcs, crab −13 pcs. All 245 stock moves are `purchase` or `sale`; there is
not one `count` row in the table.

---

## 2. The nine complaints, and what is actually causing them

### 2.1 "Historical receipts are not shown after 2 days"

**Three independent bugs, stacked.** Fixing any one alone would not fix it.

**Cause A — the window is a calendar month.** `app/cash-out/page.tsx:146`

```ts
const W = periodWindows(isPeriodKey(p) ? p : 'month', today)
```

`periodWindows('month')` returns *1st of this month → today* (`lib/period.ts:96-110`).
On 2 October there are literally two days in range. Nothing older is fetched,
filtered or hinted at. The widest option is `'3m'` — **90 days, and there is no
"all time"**.

**Cause B — only eight render.** `app/cash-out/page.tsx:228`

```ts
const SHOW = 8
```

Eight receipts is one to two days of shopping here. The rest go into a
collapse-only `<details>` (`page.tsx:578-585`) — everything is in the DOM, nothing
is lazy, and the summary reads "Show 65 more", which is the owner's second
complaint.

**Cause C — a silent global truncation, not yet biting.** `lib/records.ts:30-41`

```ts
const { data, error } = await supabase
  .from('records')
  .select('*')
  .order('created_at', { ascending: false })
```

No `.limit()`, no `.range()`, no category filter, no column projection. Every page
in the app pulls the **entire** `records` table and filters in JavaScript.
PostgREST applies its own `max-rows` ceiling (1,000 by default), newest-first — so
once the table passes that, the oldest rows vanish from every screen at once, with
no error.

At 265 rows today and roughly 200 a month, **this starts dropping data around
February 2027.** It is not the current cause, and saying otherwise would be wrong,
but it is a landmine with a date on it.

The right pattern already exists in the repo — `getMoves` in
`lib/stock-data.ts:57-70` filters server-side and pages in 1,000-row loops. The
money side simply never adopted it.

> The code already knew. `app/cash-out/find/page.tsx:3-5`:
> *"Cash Out shows the newest eight and folds the rest under 'show more', so an
> older receipt Jarvis names by number could not be found (Sri Ternak #174, 27 Sep
> 2026)."* Search was built as a workaround instead of fixing the list.

### 2.2 "The UI isn't user friendly… too much scrolling"

`app/cash-out/page.tsx` is **680 lines** rendering nine distinct things: period
switcher, spend headline, pace chart, to-check list, type split, per-unit price
history, supplier rules, the receipt list, and a saved-toast. Four of those are
reference tables that belong on their own screens; they are folded, which means the
page is long *and* the content is hidden.

### 2.3 "Anything handwritten in the group is a receipt"

**This already works.** 170 of the 213 receipts arrived through the group
letterbox, with `meta.filed_in_group: true`. `app/api/telegram/route.ts:689` opens a
door for any photo in a `TELEGRAM_RECEIPT_CHAT_IDS` chat, bypassing the @mention
requirement.

The real gap is what happens when vision cannot read it. `route.ts:1310`:

```ts
const unreadable = mime !== 'application/pdf' && v.confidence === 'low'
  && !(typeof v.amount === 'number' && v.amount > 0)
```

An unreadable bill is **held**, not filed: the photo is stored, a fill-in template
is sent, and nothing enters the books until a human replies. If nobody replies, the
expense is never recorded.

Vision is better at handwriting than it looks, incidentally — `lib/vision.ts:468-489`
has a whole SHOPPING LIST block that promotes a handwritten list with prices to a
`receipt`, sums the lines when no total is printed, and sets
`merchant: "Unknown"` so the owner is asked.

### 2.4 "Nothing gets filed without a photo as proof"

Today the opposite is true, and nothing notices.

- `need_photo` lives in `bot_memory.counters` for **10 minutes**
  (`route.ts:1801`), then expires silently.
- `lib/bot-memory.ts:38` prunes counters to today's key, so it could not persist
  even if the timeout were longer.
- There is **no query anywhere** for receipts without a photo. I grepped the repo.
- A missing photo is **not** a "to check" trigger — `checkNote()`
  (`app/cash-out/page.tsx:129-141`) flags `fix_later`, `items_note` and a
  lines-vs-total gap, and says nothing about proof.
- The only surface is `app/cash-out/[id]/page.tsx:80`, a dead end:
  *"No photo kept for this one — it was typed in, or filed before photos were saved."*

Two different dials also exist, which is worth knowing:

| | Photo | Typed bill |
|---|---|---|
| Needs a named shop | yes (`gaps`) | **no** |
| Needs a readable date | yes | **no** |
| Needs high confidence | yes | **no** |
| Needs lines to reconcile | no | yes |

So a staff member can auto-file a RM 499 typed bill with no supplier name
(`route.ts:1893`), while a clear photo of a RM 20 bill with a smudged date gets
held.

### 2.5 "Morning brief should be about stock and receipts"

`buildBrief` (`app/api/cron-daily/route.ts:289-362`) runs funnel → money →
approvals → team → sales → ads, then appends a kitchen block. The restaurant
arrives sixth. There is no mention of missing photos, nothing waiting, and no
to-check backlog. The one receipt line is `teamBlock` (`:340-345`), which only
counts rows with `meta.filed_by` — so the owner's own auto-filed receipts never
appear.

### 2.6 "Scrolling up and down to see which line is wrong"

`app/globals.css:722-728`:

```css
@media (min-width: 900px) {
  .cr-layout { grid-template-columns: minmax(0,5fr) minmax(0,7fr); }
  .cr-photo  { position: sticky; top: 12px; }
}
```

Sticky **only above 900px**. Below that it is one column, photo first, then the
form — so on a phone the photo scrolls away completely and you edit line 6 from
memory.

Worse: the only way to read a blurry line is "tap to open full size"
(`app/cash-out/[id]/page.tsx:72-83`), which opens a new tab and **loses unsaved
form state**. That is a data-loss bug, not a convenience problem.

### 2.7 "No way to add or change a photo"

Correct, and total. Every `<input type="file">` in the web app:

| File | What it uploads |
|---|---|
| `app/cash-in/UploadReport.tsx:27` | EasyEat sales report |
| `app/me/AddMeal.tsx:75` | the owner's meal photo |
| `app/mw/import/_import-ui.tsx:18` | Moving Walls CSV |

Only the Telegram bot writes to the `vault` bucket. The web app reads and never
writes.

**The good news:** `vault_files` already allows several rows per `record_id`, and
every reader takes `.order('created_at', desc).limit(1)`. So "replace the photo" is
an insert, needs **no migration**, and the old photo survives as audit trail.
`app/me/actions.ts:41-69` is a clean 28-line reference for hash → upload → upsert.

### 2.8 "Unit should be a dropdown"

`app/cash-out/[id]/CorrectForm.tsx:178-181`:

```tsx
<input value={d.unit} onChange={e => set(i, { unit: e.target.value })}
       placeholder="pkt, kg, pcs" />
```

Free text, no datalist, no validation. Normalised on save only by
`toLowerCase().slice(0, 12) || 'unit'` (`actions.ts:96`).

Note the inconsistency the user felt without naming: the **stock** unit beside it
*is* a constrained `<select>`. Two fields, side by side, behaving differently.

### 2.9 "Pieces are missing from the unit list"

**My first reading of this was wrong, and the correction matters.** The list is not
hardcoded to `g/kg/pkt`; it already comes from `unitsFor(item)`. The bug is the
*order*. `lib/stock-items.ts:143-151`:

```ts
export function packUnitsFor(item: string): StockUnit[] {
  if (item === WHOLE_BIRD_ITEM) return ['kg', 'g']
  if (item === 'egg') return ['tray', 'pcs', 'dozen']
  const def = ITEM[item]
  if (!def) return []
  if (def.unit === 'g')    return ['kg', 'g']
  if (def.unit === 'fish') return ['kg', 'fish']
  return def.perKg ? ['kg', 'pcs', 'g'] : ['pcs']
}
```

`unitsFor(item)[0]` is the default selection (`CorrectForm.tsx:118`). Every piece
item has `perKg`, so **`kg` is always first and `pcs` is never the default** — for
shrimp, chicken leg, chicken feet, udang galah, crab, mussel and frozen squid.

`choiceFromLine` (`:204-208`) compounds it by preferring kg whenever a weight can
be derived, including from `defaultPackKg`. (Both are now fixed -- see *Where I
argued for the opposite, and was overruled*, below.)

And the reason this is a real problem rather than a preference: **recipes are
written in pieces.** `lib/recipes.ts:82`:

```ts
S('tomyum-seafood', 'Tomyum seafood', ..., [L('shrimp', 3), L('squid', 40), L('mussel', 3)])
```

Three shrimp, three mussels. `lib/recipes.ts:50` uses `L('leg', 1/3)` — one third
of a leg quarter. The recipe UI already derives its unit from the item definition
(`app/stock/recipes/RecipeRows.tsx:8-17`). **Only the receipt side disagrees with
the rest of the system.**

---

## 3. The unit model — three roles, not three mistakes

This was the most important thing the research changed about the plan. My instinct
was "collapse three lists into one". That would have been wrong.

There are **three kinds of unit**, serving different purposes:

| Role | Values | What it means | Who uses it |
|---|---|---|---|
| **Storage** | `g` · `pc` · `fish` | the ledger's currency | `stock_moves`, **recipes**, `fmtQty`, forecasting |
| **Entry** | `kg g pcs fish tray dozen bag pkt` | what the owner says went on the shelf — a **decision** | the receipt stock picker, the count form |
| **Receipt** | `kg g l ml pcs pkt box carton bottle can bag unit` | what the supplier **printed** — evidence | the receipt line |

A supplier printing "btl" is evidence. Rewriting it to `bottle`, or refusing to
store it, destroys the record of what the bill said. So: one list per role, three
lists total, all declared in one file. What was wrong before was three lists for
*one* role — plus a fourth, private vocabulary inside `addMove`
(`app/stock/actions.ts:72-83`) using `pc` where everything else uses `pcs`.

### The ordering rule

**The item's own storage unit first, then how it is bought, then conversions, then
`pkt` last.**

| Item | Today | After |
|---|---|---|
| shrimp, leg, crab, mussel, feet, galah, squid_frozen | `kg, pcs, g, pkt` | **`pcs, kg, g, pkt`** |
| breast, beef, tongue, lala, squid | `kg, g, pkt` | **`kg, g, bag, pkt`** |
| siakap | `kg, fish, pkt` | **`fish, kg, pkt`** |
| whole bird | `kg, g` | **`pcs, kg, g`** |

The whole-bird row is the same bug in miniature: he buys *birds*, and "2 birds" is
currently untypeable.

### Where I argued for the opposite, and was overruled

I proposed that `choiceFromLine` should **keep** preferring kg when the bill
prints a weight: if a receipt says "2 KG UDANG" and the app renders a piece
count, a reading has been turned into a conversion and shown with equal
authority, and `lib/stock-items.ts` is full of comments about exactly that
failure.

The owner disagreed, and on his own system he is right (6 Oct 2026):

> for me the 2 kg udang should mean 66 pieces cause the logic I set up right?
> The recipe use pieces so you must translate the kg to pieces. each kg have
> about 33 pieces of shrimp. Let's do 35 pieces instead.

Pieces are the kitchen's unit. Every recipe is written in them and every `pc`
item's ledger is kept in them, so a weight was always going to be converted --
`stockFromChoice` simply did it one step later, out of sight. Defaulting the
picker to kg meant he read a figure the books did not use.

So a weight on a piece item now converts, and two things keep it honest: the
stock note still shows the working ("2 kg at 35 per kg"), and the receipt's own
line keeps the weight exactly as printed, which is also what the RM-per-kg price
history is built from. kg stays in the picker, one tap away.

**The rate is per item, not a constant** -- fresh shrimp 35 a kilo, frozen
shrimp 33, crab 6, mussels 20, chicken leg quarters 3.3. Fresh was 33, the middle
of the "30-35 pieces" he gave on 24 Sep 2026; he settled it at the top of that
range on 6 Oct, **for fresh only** -- "I meant fresh only, frozen shrimp remain
with the same logic". The two rates are meant to differ. Stock moves already
written keep the counts they were saved with, so the change does not rewrite
history.

---

## 4. Things found while looking that were not asked about

1. **Six stock items are negative** and nothing flags them. `lib/stock-data.ts:130`
   requires `onHand > -1` to mark an item low — so an item at −500 g is silently
   *not* low. A stocktake has never been run.
2. **The stocktake exists and is hidden.** `app/stock/page.tsx:256-289`, a collapsed
   `<details>` titled *"Correct a number by counting"*, whose summary says
   **"not needed yet"** and whose body says *"the receipts do the counting the rest
   of the time"*. That framing is almost certainly why it has never been used.
3. **The count form has no unit control at all.** `app/stock/actions.ts:41`
   assumes kg for `g` items and raw pieces otherwise. Since the **first** count per
   item writes `meta.opening`, a wrong unit there poisons an opening balance
   permanently.
4. **Three divergent expense-type lists:** `TYPES` (10 entries,
   `CorrectForm.tsx:33-37`), `TYPE_LABEL` (13, `cash-out/page.tsx:43-57`),
   `EXPENSE_TYPES` (`lib/vision.ts`, the one actually enforced). You cannot file
   something as `labour` or `rent` from the correction page even though the list
   page knows how to label them.
5. **The signed-URL block is copy-pasted four times** —
   `app/cash-out/[id]/page.tsx:26-35`, `app/vault/[record]/page.tsx:26-33`,
   `app/vault/page.tsx:39-74`, `app/me/page.tsx:48`.
6. **`meta.storage_path` is written and never read.** Every reader goes through
   `vault_files`. Harmless today, a consistency hazard the moment photos can be
   replaced.
7. **`.env.example` documents 12 of ~29 variables** actually referenced in code.
8. **Dead CSS**: the `.rf-*` block (`globals.css:650-661`) is labelled for
   `app/cash-out/ReceiptFix.tsx`, a file that no longer exists.
9. **Four pending states share one key** per user in `bot_memory`
   (`pending:<userId>`), so a second parked receipt from the same person
   **overwrites** the first.

---

## 5. What is genuinely good and must not be broken

Worth stating, because a rewrite tends to throw these away:

- **`unitsFor` / `packUnitsFor` is a good model**, wrongly ordered. Per-item unit
  options driven by the data, not a global list. Keep the shape, fix the sort.
- **The three-tier stock picker** — auto-detect / explicitly not stock / an item —
  with the live "Worked out: …" label showing what it guessed.
- **`meta.prev_items`** on every correction. There is no `/undo` for a line fix
  *on purpose* (`lib/bot-actions.ts:569-572`); the previous lines are kept instead.
- **Documented accessibility decisions** in `globals.css`: 52px tap targets, 16px
  inputs to stop iOS zoom-on-focus, focus rings, reduced-motion — and the
  deliberately **non-sticky** save footer, because pinning it put Save under the
  phone's tab bar.
- **Content-addressed storage.** `receipts/<sha256>.jpg` with `upsert: false` and a
  UNIQUE constraint on `vault_files.sha256` — the same bill photographed twice
  costs nothing and files nothing twice.
- **`sanitiseItems`** (`lib/vision.ts:180-289`) distrusts the model properly:
  bounds every number, drops a line failing any bound rather than clamping it,
  recomputes a total that disagrees by >2%, and refuses to split by type when the
  lines do not reconcile.
- **The palette is already right.** `--paper #F1F4EC`, `--ink #0C2B18`,
  `--green #33A02C`, with a written 60/25/10/5 proportion rule and an explanation
  of why there are three greens (contrast ratios). The "AI look" is not the colour.

---

## 6. What makes it look machine-made

Worth naming precisely, because "make it look less AI" is otherwise unactionable.

1. **Everything is a white rounded card.** `--r-13 / --r-20 / --r-28` on stacked
   panels over a tinted ground is the single strongest tell. A ledger has rules,
   not boxes.
2. **Numbers do not line up.** IBM Plex Mono is loaded and `tabular-nums` is
   defined (`globals.css:129-132`) but amounts are not consistently right-aligned
   or mono. A column of aligned figures is what makes a page read as accounts.
3. **Even spacing everywhere.** No hierarchy of silence — a heading, a row and a
   footnote all get similar margins, so nothing feels more important than anything
   else.
4. **One weight, one family.** No serif anywhere. Adding IBM Plex Serif (same
   vendor, already loaded via `next/font`) for headings and figures costs nothing
   and changes the register completely.
5. **Emoji as structure.** Fine in Telegram, where they genuinely aid scanning.
   On a web page they read as template output.

---

## 7. Sources

Read in full: `app/cash-out/page.tsx`, `app/cash-out/[id]/{page,actions,CorrectForm}.tsx`,
`app/cash-out/check-actions.ts`, `app/cash-in/*`, `app/stock/{page,actions}.tsx`,
`app/stock/recipes/*`, `lib/{records,stock-items,stock-data,stock-view,recipes,vision,
meal-vision,bot-actions,bot-tools,receipt-lines,period,guest,fixed-costs}.ts`,
`app/api/telegram/route.ts`, `app/api/cron-daily/route.ts`,
`app/api/cron-sales-reminder/route.ts`, `proxy.ts`, `app/globals.css`,
`supabase/schema.sql`.

Live queries against Supabase project `mjirydlshijmqdtvukws` on 5 Oct 2026.
