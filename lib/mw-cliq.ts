// 👉 Which page an enquiry came from (Rif, 29 Oct 2026). GA4 cannot tell — the
// forms live on forms.zohopublic.com — and the CRM lead source is blank for most
// leads. But a bot posts every lead into the Zoho Cliq channel #Website Leads
// with "Submitted on this page" and "Source/Medium". This reads those posts.
//
// Pure: no server imports, so tests/mw-cliq.test.mts runs without a network.
// Privacy: names, phone numbers and the inquiry text are never kept. The email
// is kept only as a hash, to match the CRM lead; the inquiry text decides
// `isBuyer` and is then dropped.

import { createHash } from 'crypto'

export type CliqLead = {
  msgId: string
  at: string
  form: string | null
  emailHash: string | null
  role: string | null
  country: string | null
  interest: string | null
  source: string | null
  medium: string | null
  page: string | null
  isBuyer: boolean
}

// The labels the bot writes, in any order. The value of one runs to the next.
const LABELS: [keyof Fields, RegExp][] = [
  ['name', /\b(?:full\s+)?name\s*:/i],
  ['company', /\bcompany(?:\s+name)?\s*:/i],
  ['email', /\b(?:business\s+)?e-?mail(?:\s+address)?\s*:/i],
  ['phone', /\b(?:phone|mobile|contact\s+number)(?:\s+number)?\s*:/i],
  ['role', /\bI\s+am\s+an?\s*:/i],
  ['country', /\bcountry\s*:/i],
  ['interest', /\bI\s+am\s+interested\s+in\s*:/i],
  ['inquiry', /\b(?:inquiry|enquiry|message)\s*:/i],
  ['srcmed', /\bThis\s+Lead['’`]?s\s+Source\s*\/\s*Medium\s*:/i],
  ['page', /\bSubmitted\s+on\s+this\s+page\s*:/i],
]
type Fields = { name: string; company: string; email: string; phone: string; role: string; country: string; interest: string; inquiry: string; srcmed: string; page: string }

/** Cliq markdown and HTML out, one space between words. */
export const plain = (s: string) => s
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$2')   // [text](url) → url
  .replace(/[*_~]{1,3}/g, '')
  .replace(/[ \t\r]+/g, ' ')
  .trim()

/** Each label's value: the text between it and the next label found. */
export function fields(text: string): Partial<Fields> {
  const t = plain(text)
  const hits: { k: keyof Fields; start: number; end: number }[] = []
  for (const [k, re] of LABELS) {
    const g = new RegExp(re.source, 'gi')
    let m: RegExpExecArray | null
    while ((m = g.exec(t))) {
      // "Company Name:" also matches "Name:" inside it — the longer label wins.
      if (!hits.some(h => m!.index >= h.start && m!.index < h.end)) hits.push({ k, start: m.index, end: m.index + m[0].length })
    }
  }
  hits.sort((a, b) => a.start - b.start)
  const clean = hits.filter((h, i) => !hits.some((o, j) => j !== i && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start))
  const out: Partial<Fields> = {}
  clean.forEach((h, i) => {
    if (out[h.k] !== undefined) return
    const v = t.slice(h.end, clean[i + 1]?.start ?? t.length).replace(/\s+/g, ' ').trim()
    out[h.k] = v
  })
  return out
}

const blank = (s: string | undefined) => (s && !/^(?:-|—|n\/?a|none|null|undefined|\(not set\)|\(none\))$/i.test(s.trim()) ? s.trim() : null)

/**
 * "https://www.movingwalls.com/locations/india/bengaluru/?x=1" → "bengaluru";
 * "/" or the home URL → "homepage". A bare slug stays as it is, lower case.
 */
export function pageSlug(raw: string | null | undefined): string | null {
  const s = blank(raw ?? undefined)
  if (!s) return null
  const url = s.match(/https?:\/\/\S+/)?.[0]
  if (!url && !s.includes('/')) return s.toLowerCase().replace(/\s+/g, '-')
  const path = (url ? url.replace(/^https?:\/\/[^/]+/, '') : s).split(/[?#]/)[0]
  const parts = path.split('/').filter(Boolean)
  return parts.length ? decodeURIComponent(parts[parts.length - 1]).toLowerCase() : 'homepage'
}

/** The slug of a site path the To do cards use ("/locations/india/bengaluru"). */
export const slugOfPath = (path: string) => pageSlug(path.startsWith('/') ? path : `/${path}`)

export const hashEmail = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex')

/**
 * A brand or agency asking to advertise. Not a buyer: job seekers, students,
 * fan and birthday LED requests, and media owners selling their own screens.
 */
export function isBuyer(f: { role?: string | null; interest?: string | null; inquiry?: string | null; company?: string | null }): boolean {
  const role = (f.role ?? '').toLowerCase(), interest = (f.interest ?? '').toLowerCase()
  const text = `${f.inquiry ?? ''} ${f.company ?? ''}`.toLowerCase()
  if (/media\s*owner|publisher|vendor/.test(role)) return false
  if (/selling|connecting\s+media|media\s+network/.test(interest)) return false
  if (/student|job\s*seeker|candidate/.test(role)) return false
  if (/\b(?:job|career|vacanc|intern(?:ship)?|resume|\bcv\b|hiring|apply(?:ing)?\s+for|position|employment|fresher)/.test(`${interest} ${text}`)) return false
  if (/\b(?:student|thesis|dissertation|assignment|university\s+project|college\s+project|research\s+project|survey\s+for\s+my)/.test(text)) return false
  if (/\b(?:birthday|anniversary|propos(?:e|al)\s+to|wish(?:ing)?\s+(?:my|her|him)|fan\s*(?:club|base|project)|idol|k-?pop|bias|surprise\s+(?:my|for))/.test(text)) return false
  return true
}

/** One #Website Leads post, or null when it is not a lead (a human reply, a system note). */
export function parseLead(msg: { id: string; time: string | number; text: string }): CliqLead | null {
  const t = plain(msg.text)
  if (!/received\s+a\s+new\s+lead|Submitted\s+on\s+this\s+page/i.test(t)) return null
  const f = fields(t)
  const form = t.match(/new\s+lead\s+on\s+(?:the\s+)?(.+?)\s*:/i)?.[1]?.trim() ?? null
  const email = blank(f.email)?.match(/[^\s<>()]+@[^\s<>()]+\.[a-z]{2,}/i)?.[0] ?? null
  const [source, medium] = (blank(f.srcmed) ?? '').split(/\s*\/\s*/)
  const at = typeof msg.time === 'number' ? new Date(msg.time).toISOString() : new Date(msg.time).toISOString()
  return {
    msgId: String(msg.id), at,
    form: form ? form.replace(/\s+/g, ' ') : null,
    emailHash: email ? hashEmail(email) : null,
    role: blank(f.role), country: blank(f.country), interest: blank(f.interest),
    source: blank(source)?.toLowerCase() ?? null, medium: blank(medium)?.toLowerCase() ?? null,
    page: pageSlug(f.page),
    isBuyer: isBuyer({ role: f.role, interest: f.interest, inquiry: f.inquiry, company: f.company }),
  }
}

// ── Reading them back

const PAGE_LABEL: Record<string, string> = {
  homepage: 'Homepage', contact: 'Contact page', 'contact-us': 'Contact page', locations: 'Locations index',
  uae: 'UAE', usa: 'USA', uk: 'UK', ksa: 'Saudi Arabia', anz: 'Australia & NZ', 'kuala-lumpur': 'Kuala Lumpur',
}

/** "bengaluru" → "Bengaluru", "kuala-lumpur" → "Kuala Lumpur", "homepage" → "Homepage". */
export function pageLabel(slug: string | null): string {
  if (!slug) return 'Not given'
  return PAGE_LABEL[slug] ?? slug.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ')
}

/** "google / cpc" with blanks named, so the table never shows " / ". */
export const sourceMedium = (r: { source: string | null; medium: string | null }) => `${r.source ?? '(none)'} / ${r.medium ?? '(none)'}`

export type Tally = { key: string; a: number; aBuy: number; b: number; bBuy: number }

/** Count rows per key in month A and month B, biggest in A first. */
export function tally<T extends { at: string; isBuyer: boolean }>(rows: T[], keyOf: (r: T) => string, inA: (at: string) => boolean, inB: (at: string) => boolean): Tally[] {
  const m = new Map<string, Tally>()
  for (const r of rows) {
    const a = inA(r.at), b = inB(r.at)
    if (!a && !b) continue
    const k = keyOf(r)
    const t = m.get(k) ?? { key: k, a: 0, aBuy: 0, b: 0, bBuy: 0 }
    if (a) { t.a++; if (r.isBuyer) t.aBuy++ }
    if (b) { t.b++; if (r.isBuyer) t.bBuy++ }
    m.set(k, t)
  }
  return [...m.values()].sort((x, y) => y.a - x.a || y.aBuy - x.aBuy || y.b - x.b || x.key.localeCompare(y.key))
}
