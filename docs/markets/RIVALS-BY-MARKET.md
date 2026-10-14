# Market research: who we are measured against, and why

One section per market. Generated from the live data, not written by hand —
regenerate it after every pull.

## How a competitor is judged

> "I don't care if they're media owners, or agencies. If they have OOH service
> and they have enough inventory... their OOH presence is strong, they have a
> lot of inventories and many pages mentioned OOH." — Rif, 14 Oct 2026

Both halves of that are countable from the company's own website, so nothing
here rests on a domain name looking plausible. `scripts/vet-rivals.mts` reads
each site and asks:

1. **Is the home page substantially about out of home?** Counted in English and
   in the market's own language — 屋外広告, 戶外廣告, ป้ายโฆษณา, إعلانات,
   publicidad exterior, Außenwerbung and the rest.
2. **How many of their pages are about out of home?** From their sitemap. This
   is "a lot of inventories" measured rather than assumed.

Either signal alone is enough, because neither is reliable on its own: a listed
operator writes its home page for shareholders, and a Japanese site numbers its
pages instead of naming them.

Three things disqualify a domain regardless:

- **A sliver.** Out of home under 3% of a large site. `saranromgroup.com` ranks
  first in Thailand for ป้ายโฆษณา and has 35 OOH pages — out of 7,563. That is
  0.7%, and comparing against them filled Thailand's gap with another trade.
- **Print first.** Sells newspaper classifieds, matrimonial or obituary notices
  with a thin OOH share. `buymediaspace.com` passes on home-page wording and
  put `name change advertisement in newspaper mumbai`, 20,040 a month, into
  India's gap.
- **Not the business at all.** `sph.com.sg` is Singapore's newspaper publisher.
  It ranks because it is enormous, and it brought `straits times` and
  `联合早报` into Singapore's gap.

## The yield check

After a pull, the importer prints how much of it was our industry. **A healthy
market runs 20–60%. Under 8% means the competitors are wrong, not that the
market is small.** That number is in each section below.

## What to re-pull

Seventeen rivals failed the check and eight could not be read. Markets using a
failed rival need a new pull: **Singapore** (2% yield, sph.com.sg),
**Malaysia** (5%), **UAE** (eds.ae, skyart.ae), **Saudi Arabia** (proline-ad,
faco.sa, grandcitymedia, saudisigns — all four), **Vietnam** (ad-martvietnam),
**Taiwan** (enbon, 101marketing), **Indonesia** (fullstopindonesia),
**Brazil** (proutdoor), **Mexico** (publex), **Korea** (w-ad), **India**
(buymediaspace), **Japan** (nichemedia).

Eight domains block automated reading and need a human glance:
`pattisonoutdoor.com`, `adquick.com`, `hivestack.com`, `priorityoutdoor.co.uk`,
`oohmatch.com`, `media-radar.jp`, `expoking.com.hk`, `adintime.hk`. Several are
major operators; absence of evidence is not evidence here.

---

## japan

Pulled 2026-10-13 · 9163 rows · 915 ours (**10% yield**) · 40 topics stored
Search Console: 109 impressions, 3 clicks, 7 searches · GA4: 26 sessions, 0 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `tokai-ad.co.jp` | keep | 14 OOH mentions but only 0 OOH pages of 206 |
| `nichemedia.jp` | **DROP** | out of home is 0.0% of a 413-page site — a sliver of what they sell |
| `oohmatch.com` | unverified | site could not be read |
| `media-radar.jp` | unverified | site could not be read |

Biggest topics:
- **サイネージ と は** — 1 searches, 18,100/mo, difficulty 17
- **広告 代理 店** — 1 searches, 18,100/mo, difficulty 24
- **ooh** — 11 searches, 10,260/mo, difficulty 13
- **広告 代理 店 と は** — 1 searches, 9,900/mo, difficulty 15
- **応援 広告** — 1 searches, 4,400/mo, difficulty 28
- **広告 代理 店 大手** — 1 searches, 3,600/mo, difficulty 23

## india

Pulled 2026-10-13 · 1627 rows · 319 ours (**20% yield**) · 40 topics stored
Search Console: 9,263 impressions, 411 clicks, 497 searches · GA4: 1009 sessions, 14 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `gohoardings.com` | keep | 17 OOH mentions, 111 OOH pages and 89 inventory pages of 1184 |
| `buymediaspace.com` | **DROP** | sells newspaper and classified and matrimonial and obituary; out of home is 0.4% of the site |
| `billboardadvertising.in` | keep | 59 OOH mentions, 89 OOH pages and 196 inventory pages of 196 |
| `merahoardings.com` | keep | 128 OOH mentions, 16 OOH pages and 20 inventory pages of 100 |

Biggest topics:
- **advertisement near me** — 83 searches, 36,800/mo, difficulty 17
- **advertisement in marathi** — 7 searches, 16,030/mo, difficulty 26
- **cinema advertising** — 3 searches, 10,180/mo, difficulty 15
- **hoardings** — 12 searches, 9,960/mo, difficulty 13
- **ads near me** — 25 searches, 6,080/mo, difficulty 17
- **outdoor advertising agency** — 12 searches, 4,240/mo, difficulty 18

## united-states

Pulled 2026-10-13 · 7170 rows · 4592 ours (**64% yield**) · 40 topics stored
Search Console: 19,071 impressions, 17 clicks, 513 searches · GA4: 198 sessions, 2 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `broadsign.com` | keep | 34 OOH mentions, 262 OOH pages and 48 inventory pages of 920 |
| `vistarmedia.com` | keep | 30 OOH mentions, 254 OOH pages and 110 inventory pages of 783 |
| `adquick.com` | unverified | site could not be read |
| `hivestack.com` | unverified | site could not be read |

Biggest topics:
- **billboard advertising** — 469 searches, 68,970/mo, difficulty 12
- **advertising outdoor advertising** — 248 searches, 67,140/mo, difficulty 10
- **dooh** — 616 searches, 64,850/mo, difficulty 7
- **ooh** — 167 searches, 50,330/mo, difficulty 18
- **out of home advertising** — 153 searches, 37,800/mo, difficulty 20
- **o advertising** — 287 searches, 19,480/mo, difficulty 10

## united-kingdom

Pulled 2026-10-13 · 1589 rows · 614 ours (**39% yield**) · 40 topics stored
Search Console: 4,278 impressions, 11 clicks, 138 searches · GA4: 54 sessions, 0 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `jcdecaux.co.uk` | keep | 22 OOH mentions; no sitemap, judged on the page alone |
| `bauermediaoutdoor.co.uk` | keep | 24 OOH mentions, 122 OOH pages and 116 inventory pages of 599 |
| `outdooradvertisingltd.co.uk` | keep | 35 OOH mentions but only 8 OOH pages of 32 |
| `priorityoutdoor.co.uk` | unverified | site could not be read |

Biggest topics:
- **billboard advertising** — 80 searches, 17,540/mo, difficulty 14
- **out of home advertising** — 50 searches, 10,480/mo, difficulty 23
- **billboards** — 47 searches, 9,380/mo, difficulty 17
- **outdoor advertising** — 35 searches, 8,650/mo, difficulty 12
- **dooh** — 23 searches, 6,020/mo, difficulty 19
- **bus advertising** — 31 searches, 5,710/mo, difficulty 9

## saudi-arabia

Pulled 2026-10-14 · 957 rows · 136 ours (**14% yield**) · 40 topics stored
Search Console: 234 impressions, 1 clicks, 24 searches · GA4: 18 sessions, 1 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `proline-ad.com` | **DROP** | out of home is 1.6% of a 311-page site — a sliver of what they sell |
| `faco.sa` | **DROP** | 1 OOH mentions and 2 OOH pages — this is not an out-of-home business |
| `grandcitymedia-sa.com` | **DROP** | out of home is 0.0% of a 702-page site — a sliver of what they sell |
| `saudisigns.com` | **DROP** | 0 OOH mentions and 0 OOH pages — this is not an out-of-home business |

Biggest topics:
- **اعلان** — 1 searches, 14,800/mo, difficulty 44
- **للدعاية والاعلان** — 1 searches, 12,100/mo, difficulty 15
- **دعايه واعلان** — 1 searches, 8,100/mo, difficulty 17
- **الاعلان** — 1 searches, 2,400/mo, difficulty 26
- **signage** — 4 searches, 2,300/mo, difficulty 20
- **دعاية** — 1 searches, 1,900/mo, difficulty 18

## vietnam

Pulled 2026-10-14 · 3544 rows · 457 ours (**13% yield**) · 40 topics stored
Search Console: 50 impressions, 7 clicks, 6 searches · GA4: 29 sessions, 0 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `quangcaongoaitroi.com` | keep | 65 OOH mentions, 409 OOH pages and 42 inventory pages of 1980 |
| `g2b.com.vn` | keep | 46 OOH mentions, 35 OOH pages and 14 inventory pages of 423 |
| `thanhnamad.com` | keep | 9 OOH mentions but only 1 OOH pages of 238 |
| `ad-martvietnam.com` | **DROP** | out of home is 0.0% of a 152-page site — a sliver of what they sell |

Biggest topics:
- **biển quảng cáo** — 1 searches, 9,900/mo, difficulty 17
- **kích thước banner** — 41 searches, 5,830/mo, difficulty 8
- **ooh** — 15 searches, 3,300/mo, difficulty 14
- **hoarding** — 5 searches, 3,180/mo, difficulty 3
- **biển quảng cáo ngoài trời** — 21 searches, 2,980/mo, difficulty 3
- **quảng cáo led** — 14 searches, 2,640/mo, difficulty 3

## indonesia

Pulled 2026-10-13 · 1730 rows · 167 ours (**10% yield**) · 34 topics stored
Search Console: 624 impressions, 13 clicks, 56 searches · GA4: 60 sessions, 1 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `eyeindonesia.com` | keep | 13 OOH mentions, 17 OOH pages and 5 inventory pages of 89 |
| `otegomedia.com` | keep | 11 OOH mentions, 25 OOH pages and 9 inventory pages of 71 |
| `fullstopindonesia.com` | **DROP** | out of home is 0.4% of a 702-page site — a sliver of what they sell |
| `reboundads.co.id` | keep | 21 OOH mentions, 302 OOH pages and 53 inventory pages of 1214 |

Biggest topics:
- **baliho** — 23 searches, 31,930/mo, difficulty 13
- **iklan non komersial** — 16 searches, 29,050/mo, difficulty 20
- **reklame komersial adalah** — 3 searches, 5,830/mo, difficulty 20
- **ooh** — 7 searches, 3,710/mo, difficulty 15
- **iklan komersial dan nonkomersial** — 6 searches, 3,660/mo, difficulty 18
- **black campaign** — 1 searches, 2,400/mo, difficulty 21

## hong-kong

Pulled 2026-10-13 · 1041 rows · 220 ours (**21% yield**) · 24 topics stored
Search Console: 251 impressions, 4 clicks, 19 searches · GA4: 36 sessions, 1 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `expoking.com.hk` | unverified | site could not be read |
| `billboardhk.com` | keep | 93 OOH mentions, 0 OOH pages and 122 inventory pages of 122 |
| `cody.com.hk` | keep | 31 OOH mentions, 0 OOH pages and 45 inventory pages of 152 |
| `adintime.hk` | unverified | site could not be read |

Biggest topics:
- **advertising 中文** — 42 searches, 3,790/mo, difficulty 24
- **ooh** — 5 searches, 690/mo, difficulty 9
- **ads hong kong** — 5 searches, 560/mo, difficulty 12
- **广告 公司** — 1 searches, 480/mo, difficulty 22
- **廣告 公司** — 1 searches, 480/mo, difficulty 17
- **香港 廣告** — 1 searches, 480/mo, difficulty 24

## south-africa

Pulled 2026-10-13 · 539 rows · 56 ours (**10% yield**) · 21 topics stored
Search Console: 213 impressions, 12 clicks, 11 searches · GA4: 58 sessions, 0 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `primediaoutdoor.co.za` | keep | 20 OOH mentions, 23 OOH pages and 3 inventory pages of 177 |
| `outdoor-ads.co.za` | keep | 27 OOH mentions; no sitemap, judged on the page alone |
| `outdoornetwork.co.za` | keep | 45 OOH mentions, 40 OOH pages and 5 inventory pages of 100 |
| `ledbillboards.co.za` | keep | 19 OOH mentions but only 4 OOH pages of 16 |

Biggest topics:
- **mosselbay advertiser** — 1 searches, 1,600/mo, difficulty 36
- **billboard advertising johannesburg** — 1 searches, 1,300/mo, difficulty 20
- **billboards johannesburg** — 1 searches, 1,300/mo, difficulty 15
- **billboard advertising** — 6 searches, 1,150/mo, difficulty 17
- **ads kimberley** — 2 searches, 870/mo, difficulty 14
- **outdoor advertising** — 5 searches, 770/mo, difficulty 30

## canada

Pulled 2026-10-13 · 384 rows · 183 ours (**48% yield**) · 21 topics stored
Search Console: 480 impressions, 6 clicks, 41 searches · GA4: 11 sessions, 1 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `pattisonoutdoor.com` | unverified | site could not be read |
| `broadsign.com` | keep | 34 OOH mentions, 262 OOH pages and 48 inventory pages of 920 |
| `allvision.com` | keep | 8 OOH mentions, 28 OOH pages and 3 inventory pages of 100 |
| `vistarmedia.com` | keep | 30 OOH mentions, 254 OOH pages and 110 inventory pages of 783 |

Biggest topics:
- **/ooh** — 22 searches, 4,010/mo, difficulty 32
- **advertising near me** — 29 searches, 3,350/mo, difficulty 21
- **out of home advertising** — 22 searches, 3,230/mo, difficulty 28
- **pattison outdoor advertising** — 5 searches, 2,050/mo, difficulty 29
- **billboard advertising** — 13 searches, 1,680/mo, difficulty 28
- **dooh** — 8 searches, 1,340/mo, difficulty 25

## australia

Pulled 2026-10-13 · 834 rows · 261 ours (**31% yield**) · 19 topics stored
Search Console: 2,712 impressions, 8 clicks, 190 searches · GA4: 32 sessions, 0 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `billboardsaustralia.com.au` | keep | 44 OOH mentions, 5 OOH pages and 18 inventory pages of 52 |
| `oohmedia.com.au` | keep | 36 OOH mentions, 53 OOH pages and 246 inventory pages of 246 |
| `movingmedia.com.au` | keep | 30 OOH mentions, 39 OOH pages and 6 inventory pages of 115 |
| `poa.com.au` | keep | 34 OOH mentions, 20 OOH pages and 8 inventory pages of 111 |

Biggest topics:
- **o&m advertising** — 109 searches, 14,580/mo, difficulty 19
- **billboards** — 20 searches, 10,220/mo, difficulty 23
- **ooh** — 23 searches, 4,580/mo, difficulty 25
- **billboard ad** — 47 searches, 4,440/mo, difficulty 15
- **ooh media** — 6 searches, 4,100/mo, difficulty 25
- **billboard missouri** — 1 searches, 2,900/mo, difficulty 61

## south-korea

Pulled 2026-10-14 · 109 rows · 40 ours (**37% yield**) · 16 topics stored
Search Console: 11 impressions, 0 clicks, 3 searches · GA4: 9 sessions, 0 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `goodadlab.co.kr` | keep | 8 OOH mentions but only 0 OOH pages of 64 |
| `tkad.co.kr` | keep | 24 OOH mentions, 19 OOH pages and 1268 inventory pages of 1369 |
| `helloooh.co.kr` | keep | 13 OOH mentions, 3226 OOH pages and 6049 inventory pages of 6407 |
| `w-ad.co.kr` | **DROP** | out of home is 0.0% of a 0-page site — a sliver of what they sell |

Biggest topics:
- **옥외 광고** — 1 searches, 1,900/mo, difficulty 19
- **ooh** — 3 searches, 1,470/mo, difficulty 14
- **버스 광고** — 1 searches, 1,000/mo, difficulty 12
- **지하철 광고** — 1 searches, 1,000/mo, difficulty 6
- **옥외** — 1 searches, 390/mo, difficulty 22
- **지하철 전광판** — 1 searches, 390/mo, difficulty 11

## mexico

Pulled 2026-10-14 · 712 rows · 190 ours (**27% yield**) · 16 topics stored
Search Console: 98 impressions, 5 clicks, 7 searches · GA4: 14 sessions, 0 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `publisitios.com` | keep | 66 OOH mentions, 246 OOH pages and 8 inventory pages of 1197 |
| `publicidadespectacular.mx` | keep | 16 OOH mentions but only 5 OOH pages of 9 |
| `opent.com.mx` | keep | 19 OOH mentions; no sitemap, judged on the page alone |
| `publex.com.mx` | **DROP** | out of home is 0.0% of a 3-page site — a sliver of what they sell |

Biggest topics:
- **23 publicidad** — 80 searches, 6,780/mo, difficulty 12
- **ooh** — 3 searches, 1,920/mo, difficulty 12
- **publicidad exterior** — 5 searches, 1,300/mo, difficulty 7
- **anuncios espectaculares** — 6 searches, 1,030/mo, difficulty 8
- **pantallas led publicidad** — 6 searches, 930/mo, difficulty 17
- **publicidad de méxico** — 1 searches, 880/mo, difficulty 19

## philippines

Pulled 2026-10-13 · 296 rows · 58 ours (**20% yield**) · 14 topics stored
Search Console: 1,917 impressions, 25 clicks, 95 searches · GA4: 82 sessions, 1 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `dooh.ph` | keep | 30 OOH mentions; no sitemap, judged on the page alone |
| `ooh.ph` | keep | 37 OOH mentions, 332 OOH pages and 36 inventory pages of 573 |
| `billboard-advertising.ph` | keep | 21 OOH mentions but only 6 OOH pages of 11 |
| `outcomm.ph` | keep | 20 OOH mentions, 25 OOH pages and 10 inventory pages of 110 |

Biggest topics:
- **advertising near me** — 15 searches, 1,550/mo, difficulty 23
- **ooh** — 3 searches, 1,390/mo, difficulty 30
- **advertising boards** — 1 searches, 1,000/mo, difficulty 32
- **3d billboard bgc** — 4 searches, 960/mo, difficulty 27
- **lamp post banner** — 1 searches, 880/mo, difficulty 11
- **edsa guadalupe billboard** — 2 searches, 560/mo, difficulty 20

## malaysia

Pulled 2026-10-13 · 997 rows · 53 ours (**5% yield**) · 14 topics stored
Search Console: 2,286 impressions, 82 clicks, 84 searches · GA4: 336 sessions, 2 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `advertising.com.my` | keep | 69 OOH mentions; no sitemap, judged on the page alone |
| `firstboard.com` | keep | 48 OOH mentions, 3071 OOH pages and 5636 inventory pages of 5944 |
| `outofhome.com.my` | keep | 50 OOH mentions, 227 OOH pages and 317 inventory pages of 347 |
| `skybluemedia.my` | keep | 24 OOH mentions but only 8 OOH pages of 23 |

Biggest topics:
- **advertising near me** — 19 searches, 2,970/mo, difficulty 26
- **digital advertising agency malaysia** — 4 searches, 1,790/mo, difficulty 32
- **billboard malaysia** — 6 searches, 1,430/mo, difficulty 21
- **advertising company in malaysia** — 2 searches, 1,040/mo, difficulty 29
- **malaysia ads** — 1 searches, 1,000/mo, difficulty 28
- **malaysia advertisement** — 1 searches, 1,000/mo, difficulty 24

## brazil

Pulled 2026-10-14 · 869 rows · 91 ours (**10% yield**) · 13 topics stored
Search Console: 172 impressions, 1 clicks, 28 searches · GA4: 17 sessions, 0 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `centraldeoutdoor.com.br` | keep | 15 OOH mentions, 66 OOH pages and 15 inventory pages of 271 |
| `proutdoor.com.br` | **DROP** | out of home is 0.0% of a 10-page site — a sliver of what they sell |
| `outdoormidia.com.br` | keep | 19 OOH mentions but only 3 OOH pages of 137 |
| `admooh.com` | keep | 14 OOH mentions; no sitemap, judged on the page alone |

Biggest topics:
- **outdoor** — 43 searches, 41,700/mo, difficulty 7
- **publicidade** — 7 searches, 19,000/mo, difficulty 25
- **e-signage** — 10 searches, 4,810/mo, difficulty 18
- **dooh** — 5 searches, 1,630/mo, difficulty 11
- **out of home** — 6 searches, 1,390/mo, difficulty 12
- **midia indoor** — 2 searches, 1,090/mo, difficulty 23

## uae

Pulled 2026-10-13 · 1118 rows · 151 ours (**14% yield**) · 12 topics stored
Search Console: 1,193 impressions, 14 clicks, 71 searches · GA4: 70 sessions, 2 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `mediaworld.ae` | keep | 12 OOH mentions, 46 OOH pages and 156 inventory pages of 156 |
| `eds.ae` | **DROP** | sells newspaper and classified; out of home is 2.9% of the site |
| `skyart.ae` | **DROP** | out of home is 0.0% of a 0-page site — a sliver of what they sell |
| `hillsadvertising.com` | keep | 44 OOH mentions; no sitemap, judged on the page alone |

Biggest topics:
- **advertising near me** — 68 searches, 10,650/mo, difficulty 21
- **led screen** — 20 searches, 5,200/mo, difficulty 12
- **advertising agencies in dubai** — 6 searches, 2,780/mo, difficulty 26
- **outdoor advertising dubai** — 5 searches, 1,420/mo, difficulty 27
- **billboard advertising dubai** — 3 searches, 1,330/mo, difficulty 15
- **ads advertising dubai** — 3 searches, 1,140/mo, difficulty 22

## taiwan

Pulled 2026-10-14 · 251 rows · 47 ours (**19% yield**) · 10 topics stored
Search Console: 104 impressions, 1 clicks, 4 searches · GA4: 6 sessions, 0 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `lianyi-media.com.tw` | keep | 30 OOH mentions but only 0 OOH pages of 29 |
| `enbon.tw` | **DROP** | out of home is 0.4% of a 2786-page site — a sliver of what they sell |
| `101marketing.com.tw` | **DROP** | out of home is 0.0% of a 0-page site — a sliver of what they sell |
| `alaso-marketing.com.tw` | keep | 29 OOH mentions but only 1 OOH pages of 27 |

Biggest topics:
- **戶外 廣告** — 1 searches, 5,400/mo, difficulty 19
- **公車 廣告** — 1 searches, 1,000/mo, difficulty 9
- **公車 廣告 代理** — 1 searches, 590/mo, difficulty 4
- **廣告 車** — 1 searches, 590/mo, difficulty 16
- **台南 廣告** — 1 searches, 320/mo, difficulty 22
- **車 體 廣告** — 1 searches, 320/mo, difficulty 17

## singapore

Pulled 2026-10-13 · 1993 rows · 35 ours (**2% yield**) · 9 topics stored
Search Console: 2,767 impressions, 33 clicks, 182 searches · GA4: 179 sessions, 1 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `sph.com.sg` | **DROP** | 0 OOH mentions and 3 OOH pages — this is not an out-of-home business |
| `adson.com.sg` | keep | 30 OOH mentions but only 6 OOH pages of 68 |
| `jcdecaux.com.sg` | keep | 16 OOH mentions; no sitemap, judged on the page alone |
| `ledscreenads.com` | keep | 162 OOH mentions; no sitemap, judged on the page alone |

Biggest topics:
- **banner** — 1 searches, 2,900/mo, difficulty 42
- **sg advertising** — 15 searches, 890/mo, difficulty 20
- **ooh** — 2 searches, 490/mo, difficulty 28
- **singapore ads** — 2 searches, 320/mo, difficulty 14
- **billboard advertising** — 2 searches, 250/mo, difficulty 46
- **digital screen** — 1 searches, 210/mo, difficulty 13

## thailand

Pulled 2026-10-14 · 517 rows · 61 ours (**12% yield**) · 6 topics stored
Search Console: 212 impressions, 4 clicks, 17 searches · GA4: 37 sessions, 0 enquiries

| Competitor | Verdict | Evidence from their own site |
|---|---|---|
| `planbmedia.co.th` | keep | 28 OOH mentions; no sitemap, judged on the page alone |
| `vgi.co.th` | **DROP** | out of home is 0.8% of a 514-page site — a sliver of what they sell |
| `signaturemedia.co.th` | keep | 83 OOH mentions, 50 OOH pages and 11 inventory pages of 241 |

Biggest topics:
- **โฆษณา อาหาร** — 1 searches, 880/mo, difficulty 17
- **จอ led โฆษณา** — 7 searches, 710/mo, difficulty 9
- **out of home advertising** — 3 searches, 360/mo, difficulty 13
- **billboard bangkok** — 1 searches, 260/mo, difficulty 29
- **billboard digital** — 3 searches, 240/mo, difficulty 32
- **โฆษณา ไม โล** — 1 searches, 210/mo, difficulty 27

