# Jaosamut — kitchen rules

The *why* behind the numbers. `RECIPES.md` holds what each dish uses;
`STOCK-ITEMS.md` holds what each ingredient is. This file holds the decisions,
so that six months from now nobody — me included — re-derives them from scratch
and gets them wrong.

Written by Claude, from the owner's own words. Every rule carries the date he
settled it. **If a rule here and the code disagree, the rule is what he said;
the code is a bug.**

---

## How a sale becomes a stock movement

1. The owner sends the EasyEat **Dish Report Over Time** to Jarvis each morning,
   one day per file.
2. Each line is `ITEM NAME` + `VARIATION OPTIONS` + `QUANTITY`.
3. The variation is stripped down to the parts that change what is used — see
   *Which choices count* below.
4. Dish + remaining choices is looked up in the recipe book. **Exact match, not
   a pattern.**
5. What the recipe says, times the quantity, comes off stock.

A dish with no recipe deducts **nothing**, and says so on the Recipes page. That
is deliberate: a silent wrong deduction is worse than a visible gap.

---

## The rules

### Full independence — no recipe inherits from another
*(owner, 6 Oct 2026)*

Chicken Sweet & Sour **Small** and Chicken Sweet & Sour **Medium** are two
separate, complete recipes. A Medium is not "a Small times 1.5".

The old book did the opposite: one regex-matched recipe with S/M/L sizes. On
5 Oct 2026 that produced, in a single day:

- `siakap` deducting **siakap** for *Ikan Temenung 3 Rasa* — the wrong fish;
- one `chicken` recipe standing in for five different chicken dishes;
- a **Medium** deducting the same as a Small;
- a **beef** green curry deducting chicken;
- an **added egg** deducting nothing;
- **39% of the dishes sold moving no stock at all.**

### Sets are the one exception, and it is not inheritance
*(owner, 6 Oct 2026)*

A set line carries its choices: `Set 2-4 Pax (Kuah Merah)(Siakap 3 Rasa)(Chicken
Cashew Nuts)(Calamari Salted Egg)(Crispy Fried Shrimp)(No add on)(3 plate
rice)(No dessert)`. Each choice contributes its own **set portion**, typed in
once.

Why sets and nothing else: **91% of the sets sold were a combination never seen
before** — 53 distinct combinations out of 58 sets sold, over 9 days. Writing
each combination out in full would mean roughly six new recipes every day,
forever, with every unwritten one deducting nothing. A set genuinely *is*
several dishes on one line, so reading the choices is reading what was sold.

A choice that says *no* to something — `No add on`, `No dessert`, `No egg` —
contributes nothing and is not treated as missing.

### Which choices count
*(owner, 6 Oct 2026)*

Each of the 48 variant groups is marked once as changing what is used or not.
Sugar level, ice and drink temperature do not. Size, protein and noodle type do.

This is what keeps the book finite: without it the POS's 429 sold combinations
are 429 recipes, most of them identical. With it, about 150.

**An undecided group is kept, not dropped.** Dropping it would quietly merge two
recipes that might genuinely differ. Deciding is the point of
`/recipes/variations`.

### Write the ingredient down now, count it later
*(owner, 6 Oct 2026)*

> "While those are not tracked as stock yet because right now we're moving phase
> by phase so the most important item will get tracked first. However, I still
> want to track the veggies in the future."

An ingredient can go into a recipe before anyone counts it. It carries
`counted = false`: it shows in the recipe and in food cost, and it writes **no
stock move**, so it cannot invent a balance. When the team has a way to measure
kailan, one flag turns counting on and the recipes are already written.

The alternative was keying every recipe twice.

### Shrimp: fresh is 35 a kilo, frozen is 33
*(owner, 24 Sep 2026 and 6 Oct 2026)*

> "a kilo of shrimp is about 30-35 pieces"… "each kg have about 33 pieces of
> shrimp. Let's do 35 instead."… "I meant fresh only, frozen shrimp remain with
> the same logic."

The two rates are **meant to differ**. Do not tidy them into one number.

### A weight on a bill is translated into pieces
*(owner, 6 Oct 2026)*

> "the 2 kg udang should mean 66 pieces cause the logic I set up right? The
> recipe use pieces so you must translate the kg to pieces."

Pieces are the kitchen's unit — every recipe is written in them and every piece
item's ledger is kept in them. So a receipt that prints "2 KG UDANG" fills the
stock side in as 70 pieces.

What keeps this honest: the receipt's own line **keeps the weight exactly as
printed**, the conversion shows its working ("2 kg at 35 per kg"), and kg stays
in the picker one tap away. The RM-per-kg price history is built from the
printed line, not from the stock choice, so it is unaffected.

*(I argued for keeping kg and was overruled. He was right: the conversion was
always happening, one step later and out of his sight.)*

### Fried rice uses frozen shrimp; everything else uses fresh
*(owner, 23 Sep 2026)*

Frozen sotong is likewise its own item and goes into the fried squid dish only.

### A siakap is 550 g
*(owner, 24 Sep 2026)*

> "cannot be exactly 5 every time"

The middle of a 500–600 g range. So 4 kg reads as 7.3 fish rather than a
flattering 8, and the weekly count keeps it honest.

### Owner's drawings are not the kitchen's cost base
Personal purchases never enter price history or food cost.

---

## Open, as of 6 Oct 2026

- **Add-ons are invisible.** The 23 EasyEat add-ons — *Extra Shrimp (3 pieces)*,
  *Extra Chicken (100 grams)*, *Isi Ketam (30 Grams)* — appear nowhere in any
  dish report, not as lines and not in the variation text. The owner is
  rebuilding them as **variations** in EasyEat so they arrive on the line. The
  five that state their own quantity are seeded ready to confirm.
- **Vegetables are not counted.** Kailan, kangkung and sayur campur sell daily
  and track nothing. Deliberate, phased, and waiting on a way to measure them.
- **Eight stock items are below zero** because no stocktake has ever been
  entered. `/stock/count` exists for this; the first count of an item writes its
  opening balance and is a one-way door.
