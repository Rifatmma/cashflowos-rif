// 👉 A ready-to-paste page section, written to answer the searches we are
// already paying for and failing to serve.
//
// Pure module: no network, so the copy can be reviewed and tested.
//
// WHY GENERATE HTML AND NOT ADVICE. "Add city-specific content" is a note
// somebody has to turn into work. A section that can be downloaded, read, and
// handed to whoever owns the site is the work. It is deliberately plain
// HTML with the site's own tokens — Poppins, #2563eb, Tailwind-style rounded
// cards — so it can be dropped in or pasted into the CMS without a rebuild
// (owner, 5 Oct 2026).
//
// EVERY CLAIM IN THE COPY IS A PLACEHOLDER UNTIL SOMEONE CHECKS IT. Inventory
// counts and city lists come from the keywords, not from any system of record,
// so the generated text marks the figures it cannot know and says so in the
// file. Writing confident numbers into a public page from an ad report is how
// a website ends up lying.

export type ContentBrief = {
  url: string
  /** The searches this page is paid for and does not answer well. */
  keywords: string[]
  /** Spend behind those searches, for the brief's own header. */
  cost: number
  clicks: number
  /** What the page audit found, if it ran. */
  faults?: { says: string; fix: string }[]
  title?: string | null
  words?: number
}

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const titleCase = (s: string) =>
  s.replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\booh\b/i, 'OOH').replace(/\bdooh\b/i, 'DOOH')
   .replace(/\bled\b/i, 'LED').replace(/\bmrt\b/i, 'MRT')

/** Cities named in the keywords, in the order their spend ranks them. */
const CITY = /\b(mumbai|delhi|bangalore|bengaluru|chennai|hyderabad|kolkata|pune|ahmedabad|jaipur|jakarta|manila|singapore|kuala lumpur|selangor|bangkok|hanoi|ho chi minh)\b/i
export function citiesIn(keywords: string[]): string[] {
  const out: string[] = []
  for (const k of keywords) {
    const m = k.match(CITY)
    if (m) {
      const c = titleCase(m[1].toLowerCase())
      if (!out.includes(c)) out.push(c)
    }
  }
  return out
}

/** Formats named in the keywords — billboards, metro, LED, and so on. */
const FORMATS: [RegExp, string, string][] = [
  [/\b(metro|mrt|namma metro|subway)\b/i, 'Transit &amp; Metro',
   'Station domination, concourse panels and in-train screens across the network.'],
  [/\b(led|digital|dooh|screen)\b/i, 'Digital &amp; LED',
   'Full-motion digital screens with day-part scheduling and proof of play.'],
  [/\b(billboard|hoarding|unipole)\b/i, 'Billboards &amp; Hoardings',
   'Large-format roadside sites on arterial routes and commercial corridors.'],
  [/\b(airport|terminal)\b/i, 'Airport',
   'Arrivals, departures and baggage-hall placements reaching business travellers.'],
  [/\b(mall|retail|supermarket)\b/i, 'Retail &amp; Mall',
   'Screens and panels at the point of decision inside malls and grocery.'],
  [/\b(price|cost|harga|sewa|rate)\b/i, 'Pricing &amp; Availability',
   'Live rates and availability by site, so a plan can be costed in one session.'],
]
export function formatsIn(keywords: string[]): { name: string; blurb: string }[] {
  const out: { name: string; blurb: string }[] = []
  for (const [re, name, blurb] of FORMATS) {
    if (keywords.some(k => re.test(k)) && !out.some(o => o.name === name)) out.push({ name, blurb })
  }
  return out
}

/**
 * The questions the page must answer, taken from the paid searches verbatim.
 *
 * Verbatim on purpose: an FAQ that uses the searcher's own words is what lifts
 * a below-average landing page experience, and it is also what Google reads.
 */
export function questionsFrom(keywords: string[]): { q: string; a: string }[] {
  return keywords.slice(0, 6).map(k => {
    const t = titleCase(k)
    if (/\b(price|cost|harga|sewa|rate)\b/i.test(k)) {
      return { q: `How much does ${k} cost?`, a:
        `Rates depend on site, format and duration. [CONFIRM: insert the real starting rate and what it includes.] ` +
        `Send us the city and the weeks you want and we will come back with costed options and availability.` }
    }
    if (/\b(agency|company|companies|media owner)\b/i.test(k)) {
      return { q: `What does ${t} mean for your campaign?`, a:
        `Moving Walls plans, books and measures outdoor campaigns across this market from one platform, ` +
        `so you are not reconciling a different spreadsheet from every media owner. ` +
        `[CONFIRM: number of sites and media-owner partners in this market.]` }
    }
    return { q: `Do you cover ${t.replace(/^(Ooh|Dooh) /, '')}?`, a:
      `Yes. [CONFIRM: inventory count and typical formats for this search.] ` +
      `Availability, audience estimates and proof of play are all visible before you commit.` }
  })
}

export type GeneratedSection = { filename: string; html: string; summary: string[] }

/**
 * The section itself.
 *
 * Self-contained so it renders correctly when opened straight from the
 * download, but class-named so a developer can strip the <style> block and
 * let the site's Tailwind take over.
 */
export function buildSection(b: ContentBrief): GeneratedSection {
  const slug = b.url.replace(/^https?:\/\/[^/]+/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'page'
  const cities = citiesIn(b.keywords)
  const formats = formatsIn(b.keywords)
  const faqs = questionsFrom(b.keywords)
  const place = cities[0] ?? ''
  const heading = place
    ? `Outdoor and digital advertising in ${place}`
    : 'What you can book, and what it costs'

  const summary = [
    cities.length
      ? `Adds a city block for ${cities.join(', ')} — searches the page is paid for and does not name.`
      : 'Adds a coverage block naming the formats the ads promise.',
    formats.length ? `Adds format cards: ${formats.map(f => f.name.replace('&amp;', '&')).join(', ')}.` : '',
    `Adds an FAQ in the searcher’s own words, which is what lifts a below-average page experience.`,
    'Adds one clear enquiry call to action above the fold of the section.',
  ].filter(Boolean)

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(heading)} — section for ${esc(b.url)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  /* Moving Walls tokens, taken from the live site: Poppins, mw-blue-600
     #2563eb, mw-blue-500 #3b82f6, rounded-lg cards. Delete this block when
     pasting into the Next.js site — Tailwind already provides all of it. */
  :root { --mw-blue-600:#2563eb; --mw-blue-500:#3b82f6; --mw-ink:#111827; --mw-ink-2:#1f2937; --mw-gray:#6b7280; --mw-line:#e5e7eb; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"Poppins",system-ui,sans-serif; color:var(--mw-ink); line-height:1.65; }
  .mw-wrap { max-width:1120px; margin:0 auto; padding:64px 20px; }
  .mw-eyebrow { color:var(--mw-blue-600); font-weight:600; letter-spacing:.04em; text-transform:uppercase; font-size:13px; margin:0 0 10px; }
  h2 { font-size:clamp(28px,4vw,44px); font-weight:700; line-height:1.15; margin:0 0 16px; }
  h3 { font-size:19px; font-weight:600; margin:0 0 8px; }
  .lede { font-size:18px; color:var(--mw-ink-2); max-width:70ch; margin:0 0 32px; }
  .mw-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:20px; margin:0 0 40px; }
  .mw-card { border:1px solid var(--mw-line); border-radius:12px; padding:24px; background:#fff; }
  .mw-card p { margin:0; color:var(--mw-gray); font-size:15px; }
  .mw-cities { display:flex; flex-wrap:wrap; gap:10px; margin:0 0 40px; padding:0; list-style:none; }
  .mw-cities li { border:1px solid var(--mw-line); border-radius:999px; padding:8px 16px; font-weight:500; font-size:15px; }
  .mw-faq { border-top:1px solid var(--mw-line); padding:22px 0; }
  .mw-faq h3 { margin-bottom:6px; }
  .mw-faq p { margin:0; color:var(--mw-ink-2); }
  .mw-cta { background:var(--mw-blue-600); color:#fff; border-radius:16px; padding:40px; margin-top:48px; }
  .mw-cta h3 { font-size:26px; margin-bottom:8px; }
  .mw-cta p { margin:0 0 20px; opacity:.92; }
  .mw-btn { display:inline-block; background:#fff; color:var(--mw-blue-600); padding:12px 24px; border-radius:8px; font-weight:600; text-decoration:none; }
  .mw-todo { background:#fff7ed; border-left:4px solid #f59e0b; padding:14px 18px; border-radius:0 8px 8px 0; margin:0 0 32px; font-size:14px; color:#92400e; }
  @media (max-width:640px){ .mw-wrap{ padding:40px 16px; } .mw-cta{ padding:28px; } }
</style>
</head>
<body>
<section class="mw-wrap">
  <p class="mw-eyebrow">Coverage</p>
  <h2>${esc(heading)}</h2>
  <p class="lede">
    ${place
      ? `Plan, book and measure outdoor and digital out-of-home campaigns across ${esc(place)} and the rest of the market from one platform — with availability, audience estimates and proof of play visible before you commit.`
      : `Plan, book and measure outdoor and digital out-of-home campaigns from one platform — with availability, audience estimates and proof of play visible before you commit.`}
  </p>

  <p class="mw-todo">
    <strong>Before publishing:</strong> every bracketed <code>[CONFIRM: …]</code> below is a number this
    section cannot know. Replace each one with the real figure, or delete the sentence. A page that
    guesses its own inventory counts is worse than a page that stays quiet.
  </p>

${cities.length ? `  <h3>Cities we cover</h3>
  <ul class="mw-cities">
${cities.map(c => `    <li>${esc(c)}</li>`).join('\n')}
  </ul>
` : ''}
${formats.length ? `  <div class="mw-grid">
${formats.map(f => `    <div class="mw-card">
      <h3>${f.name}</h3>
      <p>${f.blurb}</p>
    </div>`).join('\n')}
  </div>
` : ''}
  <h3 style="font-size:24px;margin:0 0 4px;">Questions we get asked</h3>
  <p class="lede" style="margin-bottom:8px;">Answered in the words people actually search with.</p>
${faqs.map(f => `  <div class="mw-faq">
    <h3>${esc(f.q)}</h3>
    <p>${esc(f.a)}</p>
  </div>`).join('\n')}

  <div class="mw-cta">
    <h3>Tell us the city and the weeks</h3>
    <p>We will come back with costed options, availability and audience estimates — usually the same day.</p>
    <a class="mw-btn" href="/contact">Get availability and pricing</a>
  </div>
</section>

<!--
  WHY THIS SECTION EXISTS
  Page: ${esc(b.url)}
  Paid traffic: ${b.clicks} clicks, S$${b.cost.toFixed(2)}, and Google rates the landing page
  experience BELOW AVERAGE for every keyword sending them here.

  Searches being paid for that this page does not currently answer:
${b.keywords.map(k => `    - ${esc(k)}`).join('\n')}
${b.faults?.length ? `
  What the page audit found:
${b.faults.map(f => `    - ${esc(f.says)} → ${esc(f.fix)}`).join('\n')}` : ''}

  Generated by CashflowOS from Google Ads data. Review every [CONFIRM] before publishing.
-->
</body>
</html>`

  return { filename: `mw-section${slug ? '-' + slug : ''}.html`, html, summary }
}
