import Anthropic from '@anthropic-ai/sdk'
import { fetchArticle } from './mw-article'
import type { Research } from './mw-studio'
import { sanitizePlan, ICON_NAMES, type Audience, type Plan, type SubLang } from './mw-brandfilm'
import { VIDEO_LESSONS } from './mw-video-lessons'

const ICONS = ICON_NAMES.join(', ')

// 👉 Writing a brand video: Ava's script and what to show under each line.
//
// One call, because the two are one decision. Choosing "Every new market
// means a different report" as a line and choosing the fan of mismatched
// country reports to show under it are the same thought; splitting them
// across two calls gave scenes that illustrated the wrong sentence.
//
// The rules below are the ones the two hand-made films were built on (Tokyo
// DOOH and the Chinese-brands agency piece), written down so the model makes
// the same calls: VO-led, every fact from the article, one accent colour,
// acronyms written the way Ava should say them.

const MODEL = 'claude-sonnet-5-5'

const AUDIENCE: Record<Audience, string> = {
  agencies: 'media and creative agencies — speak to what it means for their clients and their revenue',
  brands: 'brand marketers — speak to reach, trust and results in new markets',
  'media-owners': 'media owners — speak to filling inventory and proving it to buyers',
  mixed: 'a mixed audience — brands, agencies and media owners at once. Speak in general terms about what out-of-home and Moving Walls do for anyone who plans, buys or sells it; follow the article\'s own framing. Do not single out one group: no "your clients", "your inventory" or "your brand" — say "advertisers", "campaigns", "screens", "the industry", or "you" meaning anyone in out-of-home',
}

// What past video audits caught, as rules (generated from the mw-video-audit skill's lessons.md).
const LESSONS = `You write Moving Walls videos voiced by Ava. Past audits of these videos turned up the mistakes below; every rule is binding. Rules about the engine, the voice or the audit tooling are already handled in code — the ones about words, figures, numbering, claims and timing are yours. Apply them silently: do not explain or list them — answer with the JSON only.\n\n${VIDEO_LESSONS}`

const EXAMPLE = `{"title":"Overseas OOH for Chinese brands",
 "lines":["Chinese brands are going global.","And their agencies are the first call.",
  "Every brand that goes overseas is a new line of work for your agency.",
  "But every new market means new media, new buying rules, and a different report.",
  "Moving Walls gives you one platform, and one global network. Airports, transit and retail.",
  "Plan, run and measure on one standard. Singapore, Sydney or Dubai.",
  "Like Calvin Klein in Vietnam. Two hundred and thirty screens, one consistent report.",
  "You keep the client. We bring the network. Overseas out-of-home, no boundaries."],
 "supers":[["中国品牌，正在走向全球。"],["而它们首先找的，就是自己的代理商。"],["每一个出海品牌，都是代理商的一条新业务线。"],
  ["但每进入一个新市场，就意味着新的媒体、新的购买规则，","以及一份不同的报告。"],["Moving Walls 为您提供一个平台、一张全球网络：","机场、交通与零售媒体。"],
  ["用同一标准，完成策划、执行与衡量。","新加坡、悉尼，或迪拜。"],["就像 Calvin Klein 在越南：","230 块数字屏幕，一份统一的报告。"],["客户关系由您掌握，网络由我们提供。","海外户外广告，无界。"]],
 "scenes":[
  {"kind":"cover","line":0,"text":[{"s":"Overseas OOH","st":"lab"},{"s":"Chinese brands","st":"h","on":"Chinese"},{"s":"are going global.","st":"s","on":"going"}]},
  {"kind":"panel","line":1,"bg":"navy","art":"routes","ev":{"origin":[700,230,"CHINA"],"dests":[[600,540,"SINGAPORE"],[840,700,"SYDNEY"],[220,380,"DUBAI"]]},
   "text":[{"s":"Going global","st":"lab"},{"s":"Their agencies","st":"h","on":"their"},{"s":"are the first call.","st":"s","on":"are"}]},
  {"kind":"panel","line":2,"bg":"white","art":"lines","ev":{"items":["Media planning","Digital","Social","Overseas OOH"],"freshOn":"new"},
   "text":[{"s":"For agencies","st":"lab"},{"s":"Every brand overseas","st":"h","on":"Every"},{"s":"is a new line of work.","st":"s","on":"new"}]},
  {"kind":"panel","line":3,"bg":"navy","art":"reports","ev":{"items":["SG","AU","AE","VN","MY"],"at":["media","media","buying","buying","report"]},
   "text":[{"s":"Where agencies get stuck","st":"lab"},{"s":"Every new market,","st":"h","on":"every"},{"s":"new media, new buying rules,","st":"s","on":"new"},{"s":"a different report.","st":"s","on":"report","accent":true}]},
  {"kind":"panel","line":4,"bg":"sky","art":"formats","ev":{"items":[["plane","Airports"],["train","Transit"],["bag","Retail"]],"at":["Airports","transit","retail"]},
   "text":[{"s":"Moving Walls","st":"lab"},{"s":"One platform.","st":"h","on":"one"},{"s":"One global network.","st":"s","on":"global"}]},
  {"kind":"burst","line":5,"words":[{"s":"PLAN.","on":"Plan","bg":"white"},{"s":"RUN.","on":"run","bg":"cover"},{"s":"MEASURE.","on":"measure","bg":"white"},
   {"s":"One standard.","on":"one","bg":"cover"},{"s":"Singapore.","on":"Singapore","bg":"white"},{"s":"Sydney.","on":"Sydney","bg":"sky"},{"s":"Dubai.","on":"Dubai","bg":"cover"}]},
  {"kind":"panel","line":6,"bg":"navy","art":"number","ev":{"value":"230","unit":"digital screens","on":"thirty"},
   "text":[{"s":"Case study · Vietnam","st":"lab"},{"s":"Calvin Klein","st":"h","on":"Calvin"},{"s":"one consistent report.","st":"s","on":"consistent","accent":true},{"s":"39 premium locations · 27 days","st":"b","on":"report"}]},
  {"kind":"logo","line":7,"text":[{"s":"You keep the client.","st":"h","on":"You"},{"s":"We bring the network.","st":"s","on":"We"}]},
  {"kind":"end","line":7,"from":"Overseas","text":[{"s":"Overseas out-of-home.","st":"h","on":"Overseas"},{"s":"No boundaries.","st":"s","on":"no"},{"s":"movingwalls.com","st":"b","on":"boundaries"}]}]}`

function prompt(articleTitle: string, articleText: string, facts: string, audience: Audience, lang: SubLang, seconds: number, recent: string[]) {
  return `You are writing a short motion-graphics video for Moving Walls (an out-of-home advertising
technology company, tagline "No boundaries"). A narrator called Ava reads the script; the visuals
are flat, geometric brand illustrations that land on her words.

ARTICLE: ${articleTitle}
${articleText}

FACTS ALREADY CHECKED FROM IT:
${facts}

AUDIENCE: ${AUDIENCE[audience]}
LENGTH: about ${seconds} seconds — ${Math.round(seconds * 2.3)} words, 7 or 8 lines.

THE SCRIPT ("lines"):
1 hook: the market shift in six words or fewer · 2 who it matters to · 3-4 the concrete tension,
in the article's own vocabulary · 5 the turn: what Moving Walls gives them · 6 a rhythm line Ava
can say on the beat — a short list of verbs or places · 7 proof: one number or case study from
the article, if it has one · 8 close: the benefit, ending on "No boundaries."
- EVERY fact comes from the article. If it has no numbers, the video has no numbers.
- Write acronyms as they should be spoken: "out-of-home" not "OOH", "digital out-of-home" not
  "DOOH". Numbers she reads as words ("Two hundred and thirty"); the screen shows "230".
- Short sentences, at most 16 words a line. Plain English, no "unlock", "leverage", "game-changer".

THE SCENES (one per line, in order; the last line may be split into a "logo" scene then an "end"
scene using "from"):
- kind: "cover" (first scene only) · "panel" (headline + illustration) · "burst" (the rhythm line:
  one big word per beat) · "logo" (white MW logo with a line under it) · "end" (last scene).
- "on" is a WORD FROM THAT SCENE'S LINE, exactly as written in the line, where the item appears.
- text "st": "lab" = small section label (first item, no "on") · "h" = headline (≤ 26 chars) ·
  "s" = italic sub-line (≤ 32 chars) · "b" = small print for sources/details. "accent": true on at
  most ONE item per scene (Sunburst yellow).
- On-screen words echo Ava; they do not repeat the whole line.
- panel "bg": alternate dark ("navy") and light ("white" or "sky") so consecutive scenes contrast.
- "art" — pick what SHOWS the line, with its "ev":
  routes   {"origin":[x,y,"LABEL"],"dests":[[x,y,"LABEL"],…]}  rough geography in a 1000×800 box,
           x east, y south. For expansion, market entry, cross-border.
  network  {"labels":["…","…","…"]}  connecting places or partners into one network.
  formats  {"items":[["<icon>","Label"],…≤4],"at":["word",…]}  media types (icons plane, train, bus, screen, road…).
  icons    {"items":[["<icon>","Label"],…2–6],"at":["word",…]}  a set of things: venues, benefits, categories,
           festivals — each a tile with an icon. Icons: ${ICONS}.
  number   {"value":"230","unit":"digital screens","on":"thirty"}  ONE sourced hero number;
           "on" = the word where she finishes saying it.
  lines    {"items":["existing","existing","…","The new thing"],"freshOn":"word"}  a new line of
           revenue or service landing on top of existing ones.
  reports  {"items":["SG","AU",…],"at":["word",…]}  fragmentation, inconsistent measurement.
  board    {"rows":["UP TO 14 CHARS",…]}  stations, airports, departures, schedules.
  rail     {"stations":["…",…5]}  transit journeys.   crossing {"screensOn":"word"}  a street crossing ONLY.
  skyline  {}  a city.
  compare  {"items":[{"label":"Residents","value":4.58,"display":"4.58M"},{"label":"By day","value":6.39,"display":"6.39M"}]}
           two or three figures side by side — the last one is highlighted.
  people   {"total":40,"filled":28,"label":"7 in 10 …"}  a share of people, audiences, reach.
  pins     {"pins":[[x,y,"PLACE"],…]}  places in ONE city, 1000×800 box.
  timeline {"items":[["2019","pilot"],["2025","programmatic"]]}  dates and milestones.
  donut    {"value":72,"label":"bought programmatically"}  one percentage, 0–100.
  globe    {"labels":["DUBAI","SINGAPORE"]}  worldwide reach, several countries.
  screens  {"label":"…"}  a network of screens switching on.
  funnel   {"items":["Reach","Attention","Visits"]}  stages narrowing to an outcome.
  dayparts {"items":[[7,10,"COMMUTE"],[18,22,"EVENING"]]}  times of day (24h).
  phone    {"label":"…"}  mobile and out-of-home working together.
  checklist {"items":["…","…","…"]}  benefits, what you get, steps done.
  split    {"left":["Time slots","1 week"],"right":["Impressions","1.56M"]}  before/after, old vs new.
  trend    {"values":[2,3,5,9],"labels":["22","23","24","25"]}  growth over time (sourced numbers only).
  billboard {"lines":["PLAN","BUY"]}  a roadside digital screen showing words.
  heat     {"label":"…"}  where audiences gather, attention, targeting.
  dashboard {"tiles":[["Impressions","1.56M"],["Reach","363K"]]}  measurement, reporting, campaign results. 1–4 tiles,
           EVERY value from the article (never invent; no tiles without a figure → use another art).
  hub      {"items":["Spreadsheets","Email","Ad server","CMS"],"label":"One operating system"}  scattered
           tools consolidating into one platform.
  exchange {"left":"Media owners","mid":"Platform","right":["DSPs","Agencies","Brands"]}  programmatic
           marketplace: supply, platform, demand; bookings in, revenue back.
  auction  {"bids":["$3.80","$4.40","$5.10"]}  real-time bidding on one play; the highest bid wins the screen.
  segments {"groups":["Commuters","Shoppers","Travellers"]}  audience targeting: a crowd sorting into groups.
  catalog  {"items":["Highway LED","Mall atrium",…6],"filter":"Audience: commuters"}  inventory storefront,
           self-serve buying, filtering screens.
  attribution {"steps":["Saw the ad","Visited the store"]}  exposure to store visit, footfall attribution.
  store    {"entrance":"Entrance","checkout":"Checkout"}  retail media, in-store / in-mall screens.
  flows    {"counter":"1.2M","label":"devices on the move"}  mobility / location data, audiences on the move.
  cms      {"venues":["Hotel","Restaurant","Clinic","School"]}  content scheduling, playlists, signage CMS.
  trigger  {"signal":"rain"|"temp"|"score","signalLabel":"Rain starts","to":"UMBRELLAS 20% OFF"}  real-time,
           data-triggered creative (weather, temperature, live sport).
  dwell    {"value":"45 min","label":"average dwell at the gate"}  attention / dwell time (value from the article).
  planner  {"chips":["Commuters","25–44","Weekdays"],"budget":"$20,000","reach":"1.2M"}  planning by audience
           and budget; screens auto-select (figures only if the article has them; else omit budget/reach).
  lift     {"exposed":42,"control":30,"display":"+40%"}  brand lift / incrementality, exposed vs control (sourced %).
  yield    {"value":"+38%","label":"Revenue"}  filling unsold slots, yield and rate cards (media owners).
  proof    {"rows":["08:00:15","08:05:15","08:10:15"],"label":"VERIFIED"}  proof of play, delivery verification.
  forecast {"forecast":[…],"actual":[…],"label":"98% delivered"}  forecast vs delivered audiences.
  dco      {"versions":["Good morning, KL","Lunch in Bangsar?","Rain? Grab a coffee"]}  dynamic creative:
           one template, versions per place / time / weather.
  festive  {"festival":"diwali"|"ramadan"|"raya"|"lunar"|"cny"|"christmas"|"sale","month":"NOV","day":"8",
           "label":"Searches peak"}  a festival or season driving demand.
  formatscene {"format":"shelter"|"truck"|"bridge"|"facade"|"unipole"|"bunting","label":"LED truck"}  one named
           outdoor format in its street (bus shelter, mobile LED truck, overhead bridge, wall facade, unipole, e-bunting).
  ai       {"inputs":["Location","Weather","Audience"]}  AI / automation: signals into a core, decisions to screens.
  radius   {"label":"2 km"}  hyperlocal targeting around a store or venue.
  carbon   {"from":"12 t","to":"7 t","label":"42% less CO₂"}  sustainability, emissions measured and reduced.
  shield   {"label":"SOC 2 compliant"}  privacy, anonymised data, compliance.
  interactive {"label":"Your post, on the big screen"}  UGC, social to screen, touch / interactive screens.
  multiplier {"plays":"1 play","people":"× 240 people","total":"= 240 impressions"}  spots vs impressions.
  stadium  {"moment":"GOAL!"}  live sport moments triggering screens across the city.
  loop     {"steps":["Plan","Run","Measure","Optimise"]}  a feedback loop that improves each cycle.
VARIETY: pick the illustration that shows THIS line's idea most specifically — a number about
people is "people" or "compare", not a street. Use each illustration at most once per video.
${recent.length ? `These were used in the last few videos — avoid them unless nothing else fits: ${recent.join(', ')}.` : ''}

${lang === 'zh' ? `
"supers": Simplified Chinese subtitles, one entry per line; split a long line into two chunks at a
natural pause (≤ 22 characters each). Translate meaning, not words; use the terms Moving Walls uses
in Chinese (出海, 一张网络, 户外广告); keep brand names in Latin script.` : '\nNo "supers".'}

Here is a finished example of the exact JSON shape (a different article — do not copy its words):
${EXAMPLE}

Reply with JSON only, same shape: {"title","lines","${lang === 'zh' ? 'supers","' : ''}scenes"}.`
}

function parseKeyed(text: string, want: string): any | null {
  const bodies = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1]).concat(text)
  let best: { v: any; n: number } | null = null
  for (const body of bodies) {
    for (let i = body.indexOf('{'); i >= 0; i = body.indexOf('{', i + 1)) {
      let depth = 0, inStr = false, esc = false, end = -1
      for (let k = i; k < body.length; k++) {
        const c = body[k]
        if (esc) { esc = false; continue }
        if (inStr && c === '\\') { esc = true; continue }
        if (c === '"') { inStr = !inStr; continue }
        if (inStr) continue
        if (c === '{') depth++
        else if (c === '}' && --depth === 0) { end = k; break }
      }
      if (end < 0) continue
      try {
        const v = JSON.parse(body.slice(i, end + 1))
        if (v && typeof v === 'object' && want in v && (!best || end - i > best.n)) best = { v, n: end - i }
      } catch { /* next */ }
    }
  }
  return best?.v ?? null
}

export async function writeBrandFilm(
  r: Research, audience: Audience, lang: SubLang, seconds = 32, recentArts: string[] = [],
): Promise<{ plan: Plan; notes: string[] } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY is not set.' }

  // The facts are a summary; the script is better written from the article
  // itself, so it can use the article's own phrases. Fall back to the facts
  // alone if the page has gone away since it was read.
  const url = r.facts.find(f => f.url)?.url
  const got = url ? await fetchArticle(url) : { error: 'no url' }
  const text = 'error' in got ? '(article text unavailable — use the facts)' : got.text.slice(0, 14_000)
  const facts = r.facts.map((f, i) => `${i + 1}. ${f.claim}  [${f.source}]`).join('\n')

  const a = new Anthropic({ apiKey })
  let res: Anthropic.Message
  try {
    res = await a.messages.create({
      model: MODEL, max_tokens: 16000, system: LESSONS,
      messages: [{ role: 'user', content: prompt(r.topic, text, facts, audience, lang, seconds, [...new Set(recentArts)].slice(0, 12)) }],
    })
  } catch (e: any) {
    return { error: `Writing the video failed: ${String(e?.message ?? e).slice(0, 180)}` }
  }
  const raw = res.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n')
  const out = parseKeyed(raw, 'scenes')
  if (!out) {
    return {
      error: res.stop_reason === 'max_tokens'
        ? 'The plan ran past the length limit. Try a shorter length.'
        : 'The plan came back unreadable. Try again.',
    }
  }
  const { plan, notes } = sanitizePlan(out)
  if (plan.lines.length < 3 || plan.scenes.length < 3) return { error: 'The plan came back too thin to make a video from. Try again.' }
  return { plan, notes }
}
