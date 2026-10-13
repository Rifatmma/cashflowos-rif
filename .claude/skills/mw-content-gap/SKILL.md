---
name: mw-content-gap
description: The monthly Moving Walls content-gap pull — find each market's real competitors from the Google results, export their keywords from Semrush in the browser, and import them into the plan. Use when asked to refresh the content gap, do the monthly SEO pull, or add a market to /mw/gaps.
---

# The monthly content gap

Run once a month. Takes about five minutes per market.

## What a gap is

> "Gap is only for what competitors have and we don't have, or we have but
> we're not even nearly there yet." — Rif, 13 Oct 2026

Both halves matter. Where we already rank **page one**, it is not a gap — that
is a strike task on the page that already ranks, and the current positions are
on the market plan and the SEO tab. `cleanGap()` subtracts page one and keeps
everything else, so a search we sit at #45 for is still a gap.

## The three sources, and what each is for

| Source | Answers | Never used for |
|---|---|---|
| Search Console | where we rank **now** | which searches to look at |
| Google results | **who** competes with us | — |
| Semrush | what they rank for and we don't | who competes with us |

The reason Search Console must not choose the searches: it only holds queries
we **already appear for**. Seed from it and a term we are invisible for can
never enter the list meant to find it. That is the same circularity as ranking
competitors by keywords shared with us.

## Step 1 — rivals, from the actual search results

Google, with the country's `gl` code. Free, no Semrush cost, and it finds the
real players:

```
https://www.google.com/search?q=billboard+advertising+<country>&gl=<cc>&num=20
```

Read the organic domains. Run a second query (`outdoor advertising agency
<country>`) and prefer domains that appear in both. Pick **four** — Semrush
compares five domains including ours.

**Do not use Semrush's own competitor report.** It ranks domains by keywords
shared with us, so it finds rivals only in proportion to how much we already
rank. In Malaysia it named `outofhome.com.my`, which the real results put
fifth, and never once returned `advertising.com.my` — the leader, 1,279
keywords to our 32.

**Semrush's SERP Analysis needs a paid metrics refresh. Google does not.**

### Pick rivals that sell what we sell

- Check what the domain actually is before using it. India's first pull used
  `acmeadvertiser.com` and `khushiadvertising.com`, which place **newspaper
  classifieds**, so the gap proposed `name change advertisement in newspaper
  mumbai` (20,040/mo).
- The right set differs by market. In Asia it is billboard owners. In the
  **Americas it is adtech** — `broadsign.com`, `vistarmedia.com`,
  `adquick.com`, `hivestack.com` — because nobody there searches
  "billboard advertising new york"; they search `dooh ssp` and
  `ooh audience measurement`.
- Avoid general platforms. `stackadapt.com` is a programmatic DSP for every
  channel; including it doubled the US set to 14.1K with CTV and native-ad
  terms we do not sell.

## Step 2 — the Keyword Gap, in the browser

The web UI spends the plan's **daily report allowance, not API units**. A
monthly pull needs no Business upgrade. (The Semrush MCP connector is a
different account and its unit balance is zero.)

```
https://www.semrush.com/analytics/keywordgap/?q=movingwalls.com&searchType=domain
  &db=<DB>
  &compareWith=<r1>%3Adomain%3Aorganic%7C<r2>%3Adomain%3Aorganic%7C<r3>%3Adomain%3Aorganic%7C<r4>%3Adomain%3Aorganic
```

`%3A` is `:` and `%7C` is `|`. Database codes: `my in ph sg au uk us ae id hk
jp za ca br mx th vn sa qa`.

Wait ~15s. The page drops `db` from the URL and re-adds it; confirm the
"Database:" label before exporting.

## Step 3 — export the right tab

**Take `Untapped`, or `All`. Never `Missing`.**

Malaysia against four rivals:

| Tab | Means | Count |
|---|---|---:|
| Missing | **all four** rivals rank, we don't | 2 |
| Untapped | **any one** rival ranks, we don't | 977 |
| Weak | we rank, worse than all of them | 4 |
| All | | 999 |

`Missing` tightens as you add competitors — the opposite of what more rivals
is for. `Untapped` + `Weak` is exactly the definition above, and `All` is both.

Then: **Export** (the button above the keyword table, not "Export to PDF" top
right) → leave `All (n)` selected, not "First 100" → **CSV**.

Mechanics that matter when driving this:
- Click the Export button **by ref**, not by coordinate. Coordinate clicks on
  it silently do nothing.
- Positions shift after every tab click — re-probe before each click.
- Find the CSV button with
  `[...document.querySelectorAll('button')].filter(b => b.offsetParent && /^CSV$/.test(b.textContent.trim()))[0].getBoundingClientRect()`
- A big set (7K+ rows) freezes the renderer for 10–20s. Screenshots time out;
  wait rather than retrying.

## Step 4 — import

```bash
npx -y tsx --conditions=react-server --env-file=.env \
  scripts/gap-import.mts <file.csv> <country-key> --save
```

Drop `--save` to see what it would store first. It reads both the web export
(comma) and an API pull (semicolon), cleans, clusters, and keeps the top 40.

The export carries **our own position column**, which beats the stored keyword
list — same pull, same day, every row. The script prefers it.

Then refresh the plan:

```bash
npx -y tsx --conditions=react-server --env-file=.env scripts/plan-dry.mts --save
```

## Step 5 — read what came out

Scan the top topics before telling anyone it is done. Junk that has shown up:

- a competitor's registered name (`mo advertising sdn bhd`) — filtered on
  legal suffixes
- newspaper and classified work (`name change advertisement`) — filtered
- the film and the music chart (`billboards ebbing missouri`, `billboard 200`)
  — filtered
- other channels (`youtube advertising`, `social media advertising agency`)
  — filtered; **cinema is deliberately kept**, same budget, same plan

If new junk appears, add it to `NOT_OURS` in `lib/mw-markets.ts` **as a regex
literal** — `/\bads?\b/`, never `'\bads?\b'`. In a quoted string `\b` is a
backspace character, which silently matched nothing for months.

## State lives in the database, not in a file

`mw_market_gaps` holds, per quarter and country: the rivals used, raw and kept
counts, the clusters, and `pulled_at`. To see what was done last month, read
that table rather than a changelog.

## Market notes

| Market | Rival type | Notes |
|---|---|---|
| Malaysia | billboard owners | `advertising.com.my` leads; rivals also run per-site location pages, which is inventory, not content |
| India | billboard owners | avoid classified-ad agencies |
| Philippines | billboard owners | `dooh.ph`, `ooh.ph` |
| Australia | billboard owners | `oohmedia.com.au`, `billboardsaustralia.com.au` |
| **Americas** | **adtech** | demand is product, not place — see below |
| UAE, UK, Indonesia, HK, Japan, South Africa | — | Semrush barely tracks us; rivals must come from Google, and Search Console is the better opportunity source |

### The Americas is not a location market

96% of the region's demand is the US, and it lands on blog posts, not location
pages: `/blog/programmatic-dooh-explained` takes 13,153 impressions while
`/locations/americas` takes 101. The top searches are `dooh ssp`,
`best ooh audience measurement tool`, `content management systems for dooh`.
Mexico, Brazil, Argentina and Canada have the same shape.

There is **no `/locations/united-states` page**, and zero Spanish or Portuguese
searches recorded anywhere in the region despite `/locations/americas-es`
existing (41 impressions).
