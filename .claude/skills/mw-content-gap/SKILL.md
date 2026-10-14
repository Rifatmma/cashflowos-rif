---
name: mw-content-gap
description: The monthly Moving Walls content-gap pull — find each market's real competitors from its own Google results in its own language, export their keywords from Semrush in the browser, and import them. Use when asked to refresh the content gap, do the monthly SEO pull, add a market to /mw/gaps, or re-pull a market.
---

# The monthly content gap

**Run this without asking the owner anything.** Every decision below has already
been made and is written down. Ask only if a market returns something that
contradicts this file.

Roughly four minutes per market. Thirteen markets are already live; the rest
need a first pull.

---

## 0. Before you start

- Chrome must be **open and visible**. If `innerWidth` reads 0, the window is
  minimised and every click silently fails — stop and say so.
- Check which Chrome profile is connected. Semrush is signed in as
  **dinesh@movingwalls.com**, which is neither of Rif's own accounts.
- **Never use the Semrush API.** Its unit balance is zero and the browser costs
  nothing — the web UI spends the plan's daily report allowance, not units.
  There is no reason to buy a Business plan for this.
- Downloads: Rif has asked you to do them yourself. Do not make him click.

---

## 1. What a gap is

> "Gap is only for what competitors have and we don't have, or we have but
> we're not even nearly there yet." — Rif, 13 Oct 2026

Page one is subtracted. **Off page one is still a gap** — ranking #45 for
something a rival holds at #2 is the clearest gap there is.

| Source | Answers | Never used for |
|---|---|---|
| Search Console | where we rank **now** | which searches to look at |
| Google results | **who** competes with us | — |
| Semrush | what they hold and we do not | who competes with us |

Search Console must never choose the searches: it only holds queries we
**already appear for**, so a term we are invisible for can never enter the list
meant to find it.

---

## 2. Rivals — from Google, in the market's own language

**Run two searches per market: one English, one in the local language.** They
return different companies. In Japan there was **no overlap at all**:

| | English SERP | Local-language SERP |
|---|---|---|
| Japan | ooh-ms, japansignage, jsp-inc | tokai-ad, nichemedia, oohmatch |
| Hong Kong | poad, hypertree, convey | expoking, billboardhk, cody |

```
https://www.google.com/search?q=<TERMS>&gl=<cc>&hl=<lang>&num=20
```

Read the organic domains with:

```js
[...document.querySelectorAll('a[href^="http"] h3')]
  .map(h => new URL(h.closest('a').href).hostname.replace(/^www\./,''))
```

Pick **four** — Semrush compares five domains including ours. Prefer domains
appearing in both searches; otherwise take the local-language ones, which are
the ones usually missing from our picture.

### Local-language query by market

| Market | gl | hl | Query |
|---|---|---|---|
| Japan | jp | ja | 屋外広告 看板広告 |
| Hong Kong | hk | zh-TW | 戶外廣告 廣告牌 |
| Taiwan | tw | zh-TW | 戶外廣告 廣告看板 |
| China | cn | zh-CN | 户外广告 广告牌 |
| South Korea | kr | ko | 옥외광고 전광판 광고 |
| Thailand | th | th | ป้ายโฆษณา สื่อโฆษณานอกบ้าน |
| Vietnam | vn | vi | quảng cáo ngoài trời biển quảng cáo |
| Indonesia | id | id | billboard iklan luar ruang |
| Malaysia | my | ms | papan iklan luar rumah sewa billboard |
| UAE / Saudi / Qatar / Kuwait / Oman | ae/sa/qa/kw/om | ar | لوحات إعلانية الإعلان الخارجي |
| Germany / Switzerland | de/ch | de | Außenwerbung Plakatwerbung |
| France | fr | fr | publicité extérieure affichage |
| Netherlands | nl | nl | buitenreclame billboard |
| Brazil | br | pt | mídia exterior outdoor publicidade |
| Mexico | mx | es | publicidad exterior espectaculares |

### Vet every candidate before using it

```bash
npx -y tsx scripts/vet-rivals.mts domain.com other.com ...
```

Reads each site and counts how much of it is out of home, in English and in the
market's own language. **Use only the domains it marks USE.** It separates
three verdicts — use, do not use, and *could not check* (several major
operators block automated reads; judge those by hand rather than dropping
them).

Full findings and the per-market record: `docs/markets/RIVALS-BY-MARKET.md`.

### Check the yield before trusting anything

The import prints how much of the pull was our industry. **A healthy market
runs 20–60%. Under 8% means the rivals are wrong, not that the market is
empty** — the script now says so itself.

This was missed on three markets: Singapore came back at **2%** carrying
`straits times` and `联合早报` (sph.com.sg is a newspaper publisher), Thailand
at **4%** on saranromgroup.com, Malaysia at **5%**. Each was reported as a
small market when the comparison was simply wrong.

### Rivals must sell what we sell

**A domain ranking for an OOH phrase is not an OOH business.** Check what the
company actually does before using it. saranromgroup.com ranks top in Thailand
for `ป้ายโฆษณา` and out of home is a sliver of what they sell.

Thailand's real operators are **planbmedia.co.th** and **vgi.co.th**; against
those two the yield went from 4% to 12%.


Check what a domain actually is before using it. Mistakes already made:

- **India** — `acmeadvertiser.com`, `khushiadvertising.com` place **newspaper
  classifieds**. The gap offered `name change advertisement in newspaper
  mumbai`, 20,040/mo.
- **Japan** — `signweb.co.jp` is the **sign-making** trade. 看板 means both
  "billboard" and "shop sign", so it dragged in A-frames and cafe signage.
- **Singapore** — `sph.com.sg` looks like a newspaper but SPH Media **does** run
  outdoor; dropping it lost half the relevant rows. Kept.
- **United States** — `stackadapt.com` is a DSP for every channel; it doubled
  the set to 14.1K with CTV and native-ads terms.

### Some markets want adtech, not media owners

The insight panel on `/mw/gaps` says which. If it reads **"a product and
measurement market"**, compare against `broadsign.com`, `vistarmedia.com`,
`adquick.com`, `hivestack.com` — that is who ranks for `dooh ssp` and
`ooh audience measurement`. Applies to the **United States, Canada** and
partly **Hong Kong**.

---

## 3. The Keyword Gap

```
https://www.semrush.com/analytics/keywordgap/?q=movingwalls.com&searchType=domain
  &db=<DB>
  &compareWith=<r1>%3Adomain%3Aorganic%7C<r2>%3Adomain%3Aorganic%7C<r3>%3Adomain%3Aorganic%7C<r4>%3Adomain%3Aorganic
```

`%3A` is `:`, `%7C` is `|`. Databases: `my in ph sg au uk us ae id hk jp za ca
br mx th vn sa qa kw om de fr nl ch kr tw cn nz lk ng ke`.

**Wait 15–20 seconds, then read the "Database:" label before trusting
anything.** The page drops `db` from the URL and re-adds it; reading too early
shows the previous market's database and the previous market's counts.

### Take `Untapped`. Never `Missing`.

Malaysia against four rivals:

| Tab | Means | Count |
|---|---|---:|
| Missing | **all four** rivals rank, we don't | 2 |
| Untapped | **any one** ranks, we don't | 977 |
| Weak | we rank, worse than all | 4 |
| All | | 999 |

`Missing` *tightens* as you add rivals — the opposite of the point. `All` is
fine too and adds `Weak`.

### Mechanics that actually matter

```js
// switch to Untapped
[...document.querySelectorAll('[role="tab"]')]
  .filter(t => t.offsetParent && /Untapped/.test(t.innerText))[0].click()

// find the export button (scroll it into view first)
[...document.querySelectorAll('button')]
  .filter(b => b.offsetParent && /Export keyword details/i.test(b.getAttribute('aria-label')||''))[0]

// find CSV — match the aria-label, NOT the text
[...document.querySelectorAll('button')]
  .filter(x => x.offsetParent && /^Export to CSV$/.test(x.getAttribute('aria-label')||''))[0]
```

- Click the export button **by ref** when a coordinate click does nothing.
  Positions shift after every tab click, so re-probe before each click.
- The radio must read **All(n)**, not "First 100". If it reads a small number,
  you are on the wrong tab.
- A 7K+ row table freezes the renderer for 10–20 seconds. Screenshots time out.
  Wait; do not retry.
- Then: **Export → CSV** (middle button; Excel is on the left).

### Two rules that cost a whole market when broken

**A JavaScript `.click()` opens the menu but does NOT download.** Semrush's
handler needs a trusted event. Open the menu however you like, then click CSV
with a **real mouse click** at the probed coordinates. If a file does not
appear within ~10 seconds, it did not download — do not assume it did.

**Probe the export button's Y every time; never reuse a coordinate.** It sits
at y=387 for a long table and y=167 for a short one, because `scrollIntoView`
centres a different amount of page. The CSV button is a fixed **+184px** below
it, and the menu **auto-closes between tool calls** — so open the menu and
click CSV in the *same* batch:

```
probe y -> click (1427, y) -> wait 3 -> click (1257, y + 184)
```

**Chrome blocks repeated automatic downloads.** After roughly fifteen files it
stops saving silently: the click lands, the menu is right, no file appears. Fix
is one-time — Settings -> Privacy and security -> Site settings -> Automatic
downloads -> Add `[*.]semrush.com`.

**Always pass `--expect`.** Every export lands as
`gap.keywords_<timestamp>.csv`, so taking "the newest file" silently gets the
*previous* market whenever a download has not finished. Germany was once saved
with Malaysia's keywords and nothing complained, because the file parsed fine.

```bash
npx -y tsx --conditions=react-server --env-file=.env   scripts/gap-import.mts <file.csv> germany --expect plakat --save
```

`--expect` takes any fragment of a rival domain and refuses the import unless a
column matches.

---

## 4. Import

```bash
npx -y tsx --conditions=react-server --env-file=.env \
  scripts/gap-import.mts <file.csv> <country-key> --save
```

Drop `--save` to preview. The script reads both the web export (comma) and an
API pull (semicolon), prefers **our own position column** from the export over
the stored keyword list, cleans, clusters, and stores the top 40.

Then refresh the plan:

```bash
npx -y tsx --conditions=react-server --env-file=.env scripts/plan-dry.mts --save
```

---

## 5. Read what came out

Scan the top topics before calling it done. **If a market returns far fewer
topics than its row count suggests, the cleaner is rejecting the language** —
that is a bug to fix in `lib/mw-markets.ts`, not a quiet market.

Junk already filtered, in `NOT_OURS`:

- competitors' registered names — matched on `sdn bhd`, `pte ltd`, `berhad`
- press and classifieds — `newspaper`, `classified`, `matrimonial`, `name change`
- the film and the chart — `three billboards`, `ebbing`, `billboard 200`
- other channels — YouTube, radio, TV, social; **cinema is deliberately kept**
- the same in local scripts — テレビ広告, 求人広告, 電視廣告, プライム ビデオ 広告

**New junk goes in as a regex literal**, never a quoted string: `/\bads?\b/`,
not `'\bads?\b'`. In a quoted string `\b` is a backspace character, which
matched nothing for months.

**CJK takes no `\b`** — it writes without spaces, so a word boundary never
fires. Match those as plain substrings.

---

## 6. The traps, in one list

1. `isRelevant` was English-only. Japan returned 2,853 rows and **eleven**
   survived. Local-language industry terms are in now; if a new market comes
   back nearly empty, check this first.
2. Local-language SERPs have **different competitors**. Always run both searches.
3. `Missing` collapses as rivals are added. Use `Untapped`.
4. The `db` param is read before the page settles and silently shows the last
   market. Verify the label.
5. `display_limit` on the API truncated pulls to 3–7% of the set. Not relevant
   now the browser is used, but do not go back to the API for this.
6. The insight panel's language and "asks for" figures come from **our own**
   Search Console rows — they say what we are *found for*, never what the market
   searches. A 0% local share means we are invisible, not that demand is absent.

---

## 7. State

`mw_market_gaps` holds, per quarter and country: the rivals used, raw and kept
counts, the clusters, `pulled_at`. **Nobody types rivals in any more** — the
old editor drifted (Japan's list held two Australian domains while its topics
came from Japanese ones) and has been removed.

To see what was done last month, read that table.

## 8. Markets still on English-only rivals

Re-pull these with a local-language search: **Malaysia** (Chinese and Malay both
widely searched), Thailand, Vietnam, South Korea, Taiwan, China, Brazil,
Mexico, Germany, France, Netherlands, Switzerland, Saudi Arabia, Qatar, Kuwait,
Oman.

Already done with local-language rivals: Japan, Hong Kong, UAE, Indonesia.
