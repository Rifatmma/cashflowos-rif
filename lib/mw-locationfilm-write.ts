import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { sanitizePlan, type Plan } from './mw-brandfilm'
import { VIDEO_LESSONS } from './mw-video-lessons'
import type { LocationPage, Site } from './mw-locations'

// 👉 Writing a location video (Ava for local pages): the script, and a site
// card for each featured site.
//
// One call that also LOOKS at the photos, because two things on every card
// can only come from the picture: where the screen is (the card pushes in
// on it and the brackets snap onto it) and what kind of screen it is — the
// pages give no sizes or formats. The numbers on the cards are not the
// model's: sanitizePlan copies them from the page data by site id.
//
// The rules are the ones the Kuala Lumpur video was approved on, written
// down so every city comes out the same way.

const MODEL = 'claude-sonnet-5-5'

// What past video audits caught, as rules (generated from the mw-video-audit skill's lessons.md).
const LESSONS = `You write Moving Walls videos voiced by Ava. Past audits of these videos turned up the mistakes below; every rule is binding. Rules about the engine, the voice or the audit tooling are already handled in code — the ones about words, figures, numbering, claims and timing are yours.\n\n${VIDEO_LESSONS}`

const EXAMPLE = `{"title":"Featured sites · Kuala Lumpur",
 "lines":["Kuala Lumpur. Where Malaysia moves.",
  "Greater KL is home to around nine million people, and they're on the move every day.",
  "Moving Walls has seventy-one programmatic sites across the city, from KLCC to Batu Caves.",
  "On the New Pantai Expressway, nearly six hundred thousand people a month.",
  "Duta Park adds one point three six million impressions a month.",
  "Menara Tan and Tan, right on Jalan Tun Razak.",
  "Plan by audience, buy programmatically, and measure the footfall.",
  "Kuala Lumpur, live on Moving Walls. Out-of-home, no boundaries."],
 "scenes":[
  {"kind":"cover","line":0,"text":[{"s":"Featured sites · Malaysia","st":"lab"},{"s":"Kuala Lumpur","st":"h"},{"s":"Where Malaysia moves.","st":"s","on":"Where"}]},
  {"kind":"panel","line":1,"bg":"navy","art":"number","ev":{"value":"9M","unit":"people in Greater KL","on":"million"},
   "text":[{"s":"The audience","st":"lab"},{"s":"Greater KL","st":"h"},{"s":"on the move every day.","st":"s","on":"on"}]},
  {"kind":"panel","line":2,"bg":"white","art":"pins","ev":{"pins":[[260,640,"KL SENTRAL"],[430,450,"BUKIT BINTANG"],[720,560,"TRX"],[620,300,"KLCC"],[480,130,"BATU CAVES"]],"at":["sites","across","city","KLCC","Batu"]},
   "text":[{"s":"Moving Walls","st":"lab"},{"s":"71 sites","st":"h"},{"s":"programmatic-ready.","st":"s","on":"programmatic","accent":true},{"s":"From KLCC to Batu Caves","st":"b","on":"from"}]},
  {"kind":"site","line":3,"site":"lebuhraya-pantai-baru-npe","name":"New Pantai Expressway","setting":"Highway","format":"Portrait LED screen · NPE","near":"Links Sunway & Mid Valley to the city","stress":"reach","on":"people","focus":[0.03,0.06,0.24,0.56]},
  {"kind":"site","line":4,"site":"duta-park","name":"Duta Park","setting":"City road","format":"Portrait LED screen · Roadside","near":"On the Dutamas – Selayang commute","stress":"impressions","on":"million","focus":[0.35,0.15,0.16,0.44]},
  {"kind":"site","line":5,"site":"menara-tan-tan","name":"Menara Tan & Tan","setting":"City centre","format":"Large format · Building façade","near":"Jalan Tun Razak · by KLCC","stress":"","focus":[0.47,0.05,0.27,0.43]},
  {"kind":"burst","line":6,"words":[{"s":"PLAN.","on":"Plan","bg":"white"},{"s":"BUY.","on":"buy","bg":"cover"},{"s":"MEASURE.","on":"measure","bg":"white"},{"s":"Real footfall.","on":"footfall","bg":"cover"}]},
  {"kind":"end","line":7,"text":[{"s":"Kuala Lumpur.","st":"h","scale":0.8},{"s":"Live on Moving Walls.","st":"s","on":"live"},{"s":"No boundaries.","st":"s","on":"no","accent":true},{"s":"movingwalls.com/locations/malaysia","st":"b","on":"boundaries"}]}]}`

function prompt(place: string, pages: LocationPage[], sites: Site[]) {
  const data = sites.map(s => ({ id: s.id, name: s.name, area: s.area, monthly_reach: s.reach, monthly_impressions: s.impressions }))
  return `You are writing a short video for Moving Walls (out-of-home advertising technology, tagline
"No boundaries") that promotes FEATURED INVENTORY in ${place}. A narrator called Ava reads it.
Each site gets a card: its real photo, name, format, monthly reach and monthly impressions, and
what it is near. The numbers on the cards come from the data below — you never write them.

THE PAGES (their own words — the only source for any other fact):
${pages.map(p => `--- ${p.url}\n${p.text.slice(0, 6000)}`).join('\n\n')}

THE SITES, in the order to feature them (photos follow this message, in the same order):
${JSON.stringify(data, null, 1)}

THE SCRIPT ("lines"), in this order:
1 cover: "<Place>. <a four-word hook>."
2 the audience: ONE figure about the place from the pages (population, residents) — skip this line
  if the pages have none.
3 the network: how many sites/screens Moving Walls has there, from the pages, and 2–3 named
  districts or corridors from the pages — skip if the pages give no count.
4… ONE LINE PER SITE (≤ 12 words): the place name and ONE thing — its reach OR its impressions
  said in words ("nearly six hundred thousand people a month", "one point three six million
  impressions a month", "over a million impressions a month"), OR where it is. Vary them.
  Numbers must be true to the data (round DOWN in speech: "nearly", "over").
then a rhythm line for the burst: "Plan by audience, buy programmatically, and measure the
  footfall." (use the pages' own claim if they make a different one)
last: EXACTLY "<Place>, live on Moving Walls. Out-of-home, no boundaries."
- Every fact from the pages or the data. Nothing from memory.
- Write names as the pages do, so Ava can read them; acronyms as spoken ("out-of-home").

THE SCENES (one per line, same order): "cover" for line 1; "panel" with art "number"
{"value":"9M","unit":"…","on":"<word>"} for the audience; "panel" with art "pins"
{"pins":[[x,y,"PLACE"],…3–5],"at":["<word>",…]} for the network (rough geography in a 1000×800 box,
x east, y south, keep pins ≥ 150 apart; the LAST pin is highlighted); "site" for each site; "burst"
for the rhythm line; "end" for the last line. Alternate panel "bg" navy / white.

A "site" scene: {"kind":"site","line":N,"site":"<id>","name":"…","setting":"…","format":"…",
"near":"…","stress":"reach"|"impressions"|"","on":"<word>","focus":[x,y,w,h]}
- "name": the page's name, or a readable short form ("KL - TRX (A) - From KLCC" → "TRX"); ≤ 26 chars.
- "setting": one or two words for where it stands — Highway, City road, City centre, Shopping
  street, Mall, Expressway, Junction.
- "format": LOOK AT ITS PHOTO. "<what the screen is> · <where it stands or the road>", e.g.
  "Portrait LED screen · NPE", "LED cube · Street level", "Large format · Building façade",
  "Indoor LED · Mall atrium". Say "LED" only if it is clearly a digital screen. ≤ 34 chars.
- "near": from the site's name/area or the pages only ("On the drive in from KLCC", "Above Sports
  Direct, Bukit Bintang"). Leave "" rather than guess.
- "stress": which figure the line says; "on": the word where Ava finishes saying it.
- "focus": LOOK AT ITS PHOTO. The advertising screen's bounding box as fractions of the photo
  width/height [left, top, width, height] — the screen face only, not the pole.

Example for a different set of sites (do not copy its words):
${EXAMPLE}

Reply with JSON only: {"title","lines","scenes"}.`
}

function parseKeyed(text: string, want: string): any | null {
  const bodies = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1]).concat(text)
  for (const body of bodies) {
    const i = body.indexOf('{'), j = body.lastIndexOf('}')
    if (i < 0 || j <= i) continue
    try { const v = JSON.parse(body.slice(i, j + 1)); if (v && want in v) return v } catch { /* next */ }
  }
  return null
}

export async function writeLocationFilm(
  place: string, pages: LocationPage[], sites: Site[],
): Promise<{ plan: Plan; notes: string[] } | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY is not set.' }
  if (!sites.length) return { error: 'Choose at least one site.' }

  const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text: prompt(place, pages, sites) }]
  for (const s of sites) {
    content.push({ type: 'text', text: `Photo of ${s.id} (${s.name}):` })
    content.push({ type: 'image', source: { type: 'url', url: `${s.image}?w=1000&fm=jpg` } })
  }
  const a = new Anthropic({ apiKey })
  let res: Anthropic.Message
  try {
    res = await a.messages.create({ model: MODEL, max_tokens: 6000, system: LESSONS, messages: [{ role: 'user', content }] })
  } catch (e: any) {
    return { error: `Writing the video failed: ${String(e?.message ?? e).slice(0, 180)}` }
  }
  const raw = res.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n')
  const out = parseKeyed(raw, 'scenes')
  if (!out) return { error: res.stop_reason === 'max_tokens' ? 'The plan ran past the length limit. Choose fewer sites.' : 'The plan came back unreadable. Try again.' }

  const byId = Object.fromEntries(sites.map(s => [s.id, { name: s.name, reach: s.reach, impressions: s.impressions }]))
  const { plan, notes } = sanitizePlan(out, byId)
  const used = new Set(plan.scenes.filter(s => s.site).map(s => s.site!.id))
  for (const s of sites) if (!used.has(s.id)) notes.push(`${s.name} did not get a card — rewrite, or leave it out.`)
  if (plan.lines.length < 3 || !used.size) return { error: 'The plan came back too thin to make a video from. Try again.' }
  return { plan, notes }
}
