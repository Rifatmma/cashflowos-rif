# Jaosamut — the ingredients

What each tracked item is, the unit the kitchen counts it in, and every
conversion applied to it. **This is where silent errors live**: a wrong
conversion here poisons every recipe that uses the item, and nothing on screen
looks broken.

`RECIPES.md` is what each dish uses. `KITCHEN-RULES.md` is why. This is what the
things themselves are.

Source of truth: `lib/stock-catalog.ts`. Regenerate this file when that changes.

---

## The unit a thing is counted in

Three different units, and keeping them apart is the whole trick:

| Role | What it is | Example |
|---|---|---|
| **Storage** | the ledger's unit, **and what recipes are written in** | shrimp in `pc` |
| **Entry** | what the owner says went on the shelf — a decision | "2 bags of 1 kg" |
| **Receipt** | what the supplier printed — evidence, never rewritten | "2 KG UDANG" |

A receipt keeps its own words. The stock side converts, and shows its working.

---

## The items

| Item | Counted in | Per kg | Usable | Bag | Notes |
|---|---|---|---|---|---|
| Chicken breast (boneless) | grams | — | 96% | 80 g | a 2 kg bag loses ~80 g trimming |
| Chicken leg quarter | pieces | 3.3 | — | — | |
| Chicken feet | pieces | 30 | — | — | |
| Beef | grams | — | **80%** | 80 g | buffalo is stocked and used as beef |
| Beef tongue | grams | — | — | 120 g | |
| Shrimp (fresh) | pieces | **35** | — | — | fresh only — see below |
| Shrimp (frozen) | pieces | **33** | — | — | fried rice only |
| Udang galah | pieces | 20 | — | — | `กุ้งแม่น้ำ`, never plain `กุ้ง` |
| Crab | pieces | 6 | — | — | |
| Squid / octopus | grams | — | **75%** | 80 g | fresh |
| Squid (frozen rings) | pieces | 18 | — | — | cleaned and cut, nothing trimmed |
| Mussels | pieces | 20 | — | — | a bag is ~1 kg when no weight prints |
| Lala | grams | — | — | 250 g | |
| Siakap | fish | — | — | — | **550 g a fish** |
| Eggs | pieces | — | — | — | `telur` but never `telur masin` |
| Rice (uncooked) | grams | — | — | — | 10 kg bags; 110 g a portion |

**Per kg** is how many pieces a kilo makes, used when a bill prints a weight for
an item the kitchen counts in pieces.
**Usable** is what survives trimming — 1 kg of beef puts 800 g on the shelf.

---

## Conversions that are easy to get wrong

- **Fresh shrimp is 35 to the kilo. Frozen is 33.** They are meant to differ
  *(owner, 6 Oct 2026: "I meant fresh only, frozen shrimp remain with the same
  logic")*. Do not unify them.
- **Beef loses 20% and squid loses 25%** in trimming. A recipe asking for 80 g of
  beef takes 80 g off the shelf — the trim is already accounted for in what went
  *on*.
- **A siakap is 550 g**, the middle of a 500–600 g range, so 4 kg is 7.3 fish and
  not a flattering 8.
- **Rice is 110 g a portion**, from the owner's "a 10 kg bag lasts about RM 2,500
  of sales".
- **Whole chicken** splits into legs and breast; it is not a stock item of its
  own.

---

## Not counted yet

Ingredients can be written into a recipe before anyone counts them. They carry
`counted = false`, appear in recipes and in food cost, and write **no stock
move** — so they cannot invent a balance.

As of 6 Oct 2026 this is where vegetables belong: kailan, kangkung and sayur
campur sell every day and track nothing. The owner is phasing it:

> "the most important item will get tracked first. However, I still want to
> track the veggies in the future once this app is more stable."

Turning one on is a single flag, with the recipes already written.

---

## Items below zero

Eight items read below zero because **no stocktake has ever been entered**. That
is not missing food — it is a freezer that had stock in it on the day the books
opened and was recorded as empty.

`/stock/count` fixes it. The **first** count of an item writes its opening
balance and is a one-way door, so do it once, after actually looking.
