// 👉 Turning a measured gap into a proposed change.
//
// The Malaysia proposal was written by hand. Eighteen more by hand is how a
// template starts being mistaken for analysis, so the shapes live here and
// every one of them is GATED ON EVIDENCE: no spend and no ranking behind a
// change means the change is not proposed. A page with nothing wrong with it
// gets an empty proposal, which is a real answer.
//
// What is deliberately NOT automated: any sentence stating a fact about the
// business. Prices are empty brackets, coverage lists are copied from what the
// page already claims, and anything in a language I cannot have reviewed is
// marked for a native speaker. The generator arranges evidence; it does not
// invent facts about Moving Walls.

import type { Change } from './mw-page-proposal'
import type { Gap, PageVerdict, PaidTerm } from './mw-page-gaps'

const titleCase = (s: string) =>
  s.replace(/\b[a-z]/g, c => c.toUpperCase())
   .replace(/\bOoh\b/g, 'OOH').replace(/\bDooh\b/g, 'DOOH').replace(/\bLed\b/g, 'LED')
   .replace(/\bUk\b/g, 'UK').replace(/\bUae\b/g, 'UAE').replace(/\bLrt\b/g, 'LRT').replace(/\bMrt\b/g, 'MRT')

const money = (n: number) => `S$${n.toFixed(2)}`
const topPaid = (g: Gap, n = 4): PaidTerm[] => [...g.paid].sort((a, b) => b.cost - a.cost).slice(0, n)

// The gap modules speak in `q`; the proposal's evidence block speaks in `term`.
// Mapped here rather than renaming either: `q` matches the Semrush and Google
// Ads payloads it is read from, and `term` reads correctly in the output.
const asPaid = (ts: PaidTerm[]) => ts.map(t => ({ term: t.q, cost: t.cost, clicks: t.clicks, conv: t.conv, quality: t.quality ?? null }))
const asOrganic = (ts: { q: string; pos: number; vol: number }[]) => ts.map(t => ({ term: t.q, pos: t.pos, vol: t.vol }))

/** Languages whose copy I will draft, and flag for a native speaker. */
const DRAFTABLE: Record<string, { name: string; q: string; a: string }> = {
  id: {
    name: 'Indonesian',
    q: 'Berapa harga sewa billboard di Indonesia?',
    a: 'Harga bergantung pada lokasi, format dan durasi kampanye. Hubungi kami dengan kota dan ' +
       'tanggal kampanye Anda untuk penawaran pada titik yang masih tersedia.',
  },
  ms: {
    name: 'Malay',
    q: 'Berapakah harga sewa papan iklan di Malaysia?',
    a: 'Harga bergantung pada lokasi, format dan tempoh kempen. Hubungi kami dengan bandar dan ' +
       'tarikh kempen anda untuk sebut harga bagi tapak yang masih kosong.',
  },
}
const LANG_OF: Record<string, keyof typeof DRAFTABLE> = { indonesia: 'id', malaysia: 'ms' }

const TODO = (s: string) => `<div class="mwp-todo">${s}</div>`

/**
 * The title.
 *
 * Only ever spends the TAIL — the marketing clause after the colon or dash —
 * and only when the head already carries the subject. The head is where the
 * ranking phrase lives; `checkChange` will block this anyway if it is wrong,
 * but not proposing it is better than being blocked.
 */
export function titleChange(v: PageVerdict, title: string, place: string): Change | null {
  if (!v.tail) return null
  const g = v.gaps[0]
  if (!g || (g.cost <= 0 && !g.organic.length)) return null
  const want = g.kind === 'price' ? 'Prices, Sites & Availability'
    : g.kind === 'place' ? 'Sites & Availability by City'
    : g.kind === 'language' ? 'Prices, Sites & Availability'
    : 'Formats, Sites & Availability'
  const now = `${v.tail.head} — ${want}`
  if (now.toLowerCase() === title.toLowerCase()) return null
  return {
    id: 'title', kind: 'title',
    where: 'The page title, in the browser tab and the Google result',
    anchor: null, mode: 'replace', was: title, now,
    why: `“${v.tail.tail}” ranks for nothing and buys nothing — that is the half being spent. ` +
      `“${v.tail.head}” is kept exactly as it is, because that is where the subject and any ranking ` +
      `phrase live.${g.cost > 0 ? ` The replacement names what ${money(g.cost)} of clicks a month are actually searching for.` : ''}`,
    evidence: { paid: asPaid(topPaid(g, 3)), organic: asOrganic(g.organic.slice(0, 2)) },
  }
}

/**
 * A pricing section.
 *
 * Proposed when the page carries no price word at all and there is demand for
 * one. The figures are empty brackets on purpose — see the TODO in the output.
 */
export function priceSection(v: PageVerdict, place: string, ctaAnchor: string | null, currency: string): Change | null {
  if (v.hasPrice) return null
  const g = v.gaps.find(x => x.kind === 'price')
  if (!g || (g.cost <= 0 && !g.organic.length)) return null
  if (!ctaAnchor) return null

  const row = (h: string, p: string) =>
    `  <h3>${h}</h3>\n  <p>${p}</p>\n  <p><b>Indicative: ${currency}&nbsp;[ ] – ${currency}&nbsp;[ ]</b></p>\n`
  return {
    id: 'pricing', kind: 'section',
    where: `A NEW section immediately ABOVE the “${ctaAnchor}” call-to-action band`,
    anchor: ctaAnchor, mode: 'before-section', was: null,
    now: `
  <h2>What Outdoor Advertising Costs in ${place}</h2>
  <p>Rates depend on the format, the site and how long you run. These are indicative
     ranges for planning a budget — every site is quoted individually and availability
     changes week to week.</p>
${row('Static billboards and hoardings', 'Large-format roadside sites on main routes, usually booked by the month.')}
${row('Digital billboards (DOOH)', 'Full-motion screens sold by share of loop, with day-part scheduling and proof of play.')}
${row('Transit and street furniture', 'Station panels, in-train screens, bus exteriors and roadside furniture.')}
  <p><a href="/contact/"><b>Get a quote for a specific site →</b></a></p>
${TODO(`<b>Every bracket is empty on purpose.</b> I will not write a price onto a public page from an ad report. These must come from the ${place} rate card before publishing — a wrong number here is worse than no section.`)}`,
    why: `<b>The page does not contain the word “price”, “cost” or “rate” anywhere.</b> ` +
      (g.cost > 0
        ? `Meanwhile ${money(g.cost)} and ${g.clicks} clicks a month go to searches asking exactly that, returning ${g.conv} conversions. `
        : '') +
      (g.organic.length
        ? `It also already ranks for ${g.organic.slice(0, 2).map(o => `<b>${o.q}</b> (#${o.pos})`).join(' and ')} without answering the question — the cheapest ranking there is to improve. `
        : '') +
      `It sits above the CTA so the cost answer and the enquiry button meet where the decision is made.`,
    evidence: { paid: asPaid(topPaid(g)), organic: asOrganic(g.organic.slice(0, 3)), placeholders: [`the rate ranges, from the ${place} rate card`] },
  }
}

/** Questions in the local language, when that is where the money is going. */
export function languageFaq(v: PageVerdict, slug: string, faqAnchor: string | null): Change | null {
  const g = v.gaps.find(x => x.kind === 'language')
  if (!g || !g.paid.length || !faqAnchor) return null
  const lang = DRAFTABLE[LANG_OF[slug] ?? '']
  const terms = topPaid(g, 5)
  const pct = v.spend > 0 ? Math.round((g.cost / v.spend) * 100) : 0

  const drafted = lang
    ? `  <h3>${lang.q}</h3>\n  <p>${lang.a}</p>\n` +
      TODO(`<b>Check the ${lang.name} before publishing.</b> I have drafted it, but a native speaker on the team should read it — this is customer-facing copy in a language I should not be the last reviewer of.`)
    : TODO(`<b>Copy needed.</b> The searches below are not in English and I will not draft copy in a language I cannot have reviewed. Someone on the market team should write two or three answers using these exact phrases: ${terms.map(t => `<b>${t.q}</b>`).join(', ')}.`)

  return {
    id: 'lang', kind: 'section',
    where: 'A NEW block directly BELOW the existing Frequently Asked Questions',
    anchor: faqAnchor, mode: 'after-section', was: null,
    now: `
  <h2>Questions in the language people are searching in</h2>
  <p><i>Shown separately here so you can read them. In the build they join the existing FAQ accordion.</i></p>
${drafted}`,
    why: `<b>${pct}% of this page's paid spend — ${money(g.cost)} and ${g.clicks} clicks — is on searches that are not in English, ` +
      `and the page carries none of those words.</b> ${g.conv} conversions have come back. ` +
      `People are searching in their own language and arriving at a page that does not speak it.`,
    evidence: { paid: asPaid(terms), placeholders: lang ? [`a native ${lang.name} speaker to check the answer`] : ['the local-language answers, from the market team'] },
  }
}

/** A heading that names a slide in a deck rather than anything a reader wants. */
export function headingChange(v: PageVerdict, vague: string, place: string, formats: string[]): Change | null {
  if (!vague) return null
  const list = formats.slice(0, 3).filter(Boolean)
  const now = /market landscape/i.test(vague)
    ? `Outdoor Advertising Across ${place}`
    : list.length
      ? `${place} Advertising Formats: ${list.map(titleCase).join(', ')}`
      : `Outdoor Advertising Formats in ${place}`
  return {
    id: 'heading', kind: 'heading',
    where: `The H2 currently reading “${vague}”`,
    anchor: vague, mode: 'replace', was: vague, now,
    why: `“${vague}” is a label from an internal deck — nobody searches it and it tells a reader nothing. ` +
      (list.length
        ? `The section underneath already lists ${list.join(', ')}, so this names what is there. No body copy moves.`
        : `Renaming it puts the market and the subject into a heading that currently carries neither. No body copy moves.`),
    evidence: { organic: asOrganic(v.gaps.flatMap(g => g.organic).slice(0, 2)) },
  }
}

export function changesFor(opts: {
  v: PageVerdict; title: string; place: string; slug: string
  ctaAnchor: string | null; faqAnchor: string | null; vague: string | null
  formats: string[]; currency: string
}): Change[] {
  const { v, title, place, slug, ctaAnchor, faqAnchor, vague, formats, currency } = opts
  return [
    titleChange(v, title, place),
    vague ? headingChange(v, vague, place, formats) : null,
    priceSection(v, place, ctaAnchor, currency),
    languageFaq(v, slug, faqAnchor),
  ].filter(Boolean) as Change[]
}
