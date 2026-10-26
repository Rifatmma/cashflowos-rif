# Refresh: /blog/programmatic-dooh-explained

**Status:** draft for Rif to review. Nothing is published. The applier prompt for Dinesh is at the end.
**Prepared:** 26 Oct 2026 (SEO inbox #11, planner step `strike-pdooh`)

## Why this page

This one blog post is where we come closest to page one for the programmatic DOOH searches. It gets about 9,000 impressions a month in the US and UK and almost no clicks (Search Console, last 28 days):

| Search | Country | Impressions | Position |
|---|---|---|---|
| programmatic advertising dooh | US | 2,604 | 7.8 |
| programmatic dooh advertising | US | 2,015 | 9.8 |
| what is programmatic dooh | US | 1,461 | 9.5 |
| programmatic dooh | US | 1,140 | 11.9 |
| programmatic dooh advertising | UK | 314 | 7.2 |
| programmatic advertising dooh | UK | 274 | 7.7 |
| what is programmatic dooh | UK | 240 | 8.3 |
| programmatic dooh | UK | 208 | 12.3 |
| what is programmatic ooh | US | 173 | 10.5 |
| dooh programmatic advertising trends | US | 72 | 7.5 |

At positions 7–12, a page earns a small share of clicks. Positions 1–3 earn most of them.

## What the pages above us answer that we don't

The pages ranking above us (Vistar Media, Clear Channel UK, AdQuick, Lemma, the IAB Australia buyers' guide) all cover these. Our post doesn't:

1. **How a programmatic DOOH buy actually works**, step by step: DSP → SSP → the screen, and who does what. We name the DSP and the DMP but never the SSP, so we never explain the chain.
2. **The three ways to buy:** open exchange (real-time bidding), private marketplace (PMP) and programmatic guaranteed. Every guide above us has this. We have none of it.
3. **How it's priced:** CPM, and why a DOOH impression counts more than one viewer (audience multipliers).
4. **Programmatic vs direct buying:** when to use each. We have our own article on this, but this post doesn't say it or link to it.
5. **Programmatic DOOH vs DOOH:** a one-line answer to "is programmatic a format?" (No, it's a way of buying.) Clear Channel leads with this.
6. **A short FAQ** that answers the question searches directly ("what is programmatic dooh", cost, minimum budget, targeting, measurement).

Kept from the current post: the Lancôme result (our own proof, which no competitor has), the creative tips, and the measurement section.

## Ranking terms the page must keep

Checked with the same whole-page test `checkChange()` uses. Every one of these the page ranks for is in the draft. Four are not in the current copy at all, so the refresh adds them:
- programmatic dooh *(kept)*
- programmatic ooh *(kept)*
- what is programmatic ooh *(kept: now an FAQ question, since the H2 changes)*
- programmatic digital out of home *(kept)*
- programmatic dooh advertising *(added: an H2)*
- what is programmatic dooh *(added: the H2 and the FAQ)*
- dooh programmatic advertising trends *(added: an H2)*

"programmatic advertising dooh" (US, 2,604 impressions) isn't on the page now and isn't forced in, because the word order reads badly. The page ranks #7.8 for it from the related phrases.

The title and H1 stay as they are, so nothing in the snippet Google already ranks changes.

---

## The draft (replaces the body; title, H1, URL, author and date stay)

**Title (unchanged):** Programmatic DOOH Explained: How Digital Outdoor Advertising Works
**Meta description (new, 150 characters):** What is programmatic DOOH? How programmatic digital out-of-home advertising is bought, priced and measured, the three deal types, and when to buy direct.
**H1 (unchanged):** Programmatic DOOH Explained: How Smart Outdoor Ads Drive Better Results

**Key takeaways**
- Programmatic DOOH is a way of *buying* digital out-of-home screens automatically, not a separate ad format.
- You buy it through a demand-side platform (DSP) that connects to screens through supply-side platforms (SSPs), on the open exchange, a private marketplace or a programmatic guaranteed deal.
- It's priced per thousand impressions (CPM), where one screen play counts every person likely to see it.
- It pays off when you need flexibility, targeting by time, place or audience, and measurement alongside your digital media. Direct buys still suit fixed, high-profile placements.

### What is programmatic DOOH?

Programmatic DOOH (programmatic digital out-of-home, also called programmatic OOH or pDOOH) is the automated buying and selling of advertising on digital screens in public places: billboards, transit screens, malls, airports and office lobbies.

Instead of booking screens weeks ahead through a sales team, you set your audience, places, times and budget in software. The screens that match are bought automatically, often in real time.

It is a way of buying, not a type of screen. The same digital billboard can be sold directly or programmatically.

### How programmatic DOOH advertising works

1. **You plan in a DSP.** You choose the audience, the areas, the times of day and the budget. Triggers like weather or live events are optional.
2. **Media owners make their screens available through an SSP.** The SSP shares each screen's location, audience estimate and price floor.
3. **The two connect through an exchange.** When a screen has a slot that matches your plan, your bid competes for it. If it wins, your ad plays.
4. **You see delivery as it happens.** Impressions, spend and plays are reported in the platform, so you can move budget between screens, times or creatives mid-campaign.

The data behind the targeting (audience segments, footfall, location data) usually comes from a data management platform (DMP) or a data partner, matched to each screen's location.

### Three ways to buy programmatic DOOH

| Deal type | How it works | Best for |
|---|---|---|
| **Open exchange (real-time bidding)** | Any buyer bids on available screens in an auction. | Flexible, broad campaigns that can switch on and off fast. |
| **Private marketplace (PMP)** | A media owner invites selected buyers to bid on chosen screens, often at an agreed floor price. | Premium networks with more control over where you appear. |
| **Programmatic guaranteed** | A fixed price and fixed volume are agreed up front, then delivered and reported programmatically. | Marquee screens and launches where you must appear. |

### How programmatic DOOH is priced

Programmatic DOOH is usually bought on a **CPM**, the cost per thousand impressions. One play on a busy screen can be seen by many people, so each play is counted as several impressions. Measurement providers call this the **audience multiplier**.

Prices depend on the market, the screen, the time of day and the deal type. A guaranteed deal on a landmark screen costs more per impression than open-exchange inventory in a suburban mall. Because there's no minimum booking period, you can start with a small test and scale what works.

### Programmatic vs direct buying

Buy **programmatically** when you want flexibility, audience or time-based targeting, the ability to pause or shift budget, and reporting alongside your digital campaigns.

Buy **direct** when you need a specific landmark screen for a fixed period, custom creative builds or packages a media owner only sells directly.

Most plans use both. For the detail, read [Programmatic DOOH vs direct buying](/blog/programmatic-dooh-vs-direct-buying-in-europe-which-fits).

### Why more brands are going programmatic

*(Keep the current section and the IAB UK image as they are.)* The IAB forecasts DOOH at 75% of all OOH spend, with programmatic set to capture 16% of OOH spend by 2027. The benefits list is unchanged: flexibility, targeting, smarter spend, speed, data-driven insights and omnichannel integration.

### Creative tips for programmatic DOOH

*(Keep the current section as it is.)*

### Measuring what matters

*(Keep the current section, then add one line:)* Common measures are impressions delivered against the plan, footfall lift (visits to a store after exposure), brand-lift surveys, and online actions such as searches, site visits or QR scans in the areas where the ads ran.

### Real results: a Lancôme success story

*(Keep the current section as it is.)*

### DOOH programmatic advertising trends to watch

- **Audience-based buying replaces site lists.** Buyers plan by who is near a screen, not just where the screen is.
- **Outcome measurement.** Footfall and sales attribution are becoming standard requirements, not extras.
- **Retail media screens.** In-store and mall screens are joining programmatic exchanges, closing the gap between seeing an ad and buying.
- **Programmatic guaranteed for premium screens.** Landmark inventory is moving to guaranteed deals rather than open auctions.

### Programmatic DOOH FAQ

**What is programmatic DOOH in simple terms?**
It's buying digital outdoor screens automatically through software, instead of booking them manually with each media owner.

**What is programmatic OOH?**
Another name for programmatic DOOH: the automated buying of digital out-of-home screens. "pDOOH" means the same thing.

**Is programmatic DOOH the same as DOOH?**
No. DOOH is the screens. Programmatic is one way to buy them. The same screen can be bought directly or programmatically.

**How much does programmatic DOOH cost?**
It's priced per thousand impressions (CPM), and the rate depends on the market, the screen, the time and the deal type. There's no minimum booking period, so you can test with a small budget.

**Can I target a specific audience with programmatic OOH?**
Yes: by location, time of day, venue type, audience segments built from location and footfall data, and triggers like weather.

**How do you measure programmatic DOOH?**
With delivered impressions, footfall lift, brand-lift studies and online actions (search, site visits, QR scans) in the areas where the ads ran.

**What's the difference between an SSP and a DSP?**
The SSP is the media owner's side: it makes screens available to buy. The DSP is the buyer's side: it chooses and bids on them.

### Ready to try programmatic DOOH?

*(Keep the current closing section and the contact call to action as they are.)*

---

## Internal links (three location pages → this post)

Add one sentence with a link on each page. The anchor text is the search we want to rank for:

| Page | Where | Sentence to add |
|---|---|---|
| /locations/united-kingdom | In the intro or the section about buying, after the first paragraph | "New to buying screens this way? Read our guide to [programmatic DOOH advertising](/blog/programmatic-dooh-explained)." |
| /locations/india | Same place | "You can buy these screens programmatically too. Here's [how programmatic DOOH works](/blog/programmatic-dooh-explained)." |
| /locations/singapore | Same place | "Planning by audience rather than by site? See [what programmatic DOOH is](/blog/programmatic-dooh-explained)." |

Why these three: the UK is where this post already ranks #7–8, and India and Singapore are our biggest organic markets. Each sentence is new copy, so no existing phrase on those pages is removed.

---

## Applier prompt (for Dinesh)

You're updating one blog post and adding three links on movingwalls.com. Don't change the URL, the title tag, the H1, the author or the publish date.

1. Open the post /blog/programmatic-dooh-explained in the CMS.
2. Set the meta description to: "What is programmatic DOOH? How programmatic digital out-of-home advertising is bought, priced and measured, the three deal types, and when to buy direct."
3. Replace the "Key takeaways" list with the four takeaways in the draft.
4. Rename the H2 "What is Programmatic OOH?" to **"What is programmatic DOOH?"** and replace its paragraphs with the draft's three paragraphs. They still contain "programmatic OOH".
5. After that section, add these new H2 sections in this order: "How programmatic DOOH advertising works", "Three ways to buy programmatic DOOH" (with the table), "How programmatic DOOH is priced" and "Programmatic vs direct buying".
6. Leave "Why more brands are going programmatic", the creative tips and the Lancôme section as they are. Rename "Creative Tips for pDOOH" to "Creative tips for programmatic DOOH". Add the one new line at the end of "Measuring what matters".
7. After the Lancôme section, add the H2 "DOOH programmatic advertising trends to watch", then the H2 "Programmatic DOOH FAQ" with the seven questions. Use the CMS's FAQ block if it has one, so FAQ schema is added.
8. Keep "Ready to try programmatic DOOH?" and the contact call to action as they are. Rename the H2 from "Ready to Try Programmatic OOH?" to "Ready to try programmatic DOOH?".
9. Add the three sentences with links to /locations/united-kingdom, /locations/india and /locations/singapore as in the table.
10. Before publishing, check the link /blog/programmatic-dooh-vs-direct-buying-in-europe-which-fits opens.
11. Publish, open the page, and check the table, the FAQ and all four links work. Tell Rif the date it went live, so the 28-day re-measure can start.
