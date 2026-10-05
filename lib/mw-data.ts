import 'server-only'
import { supabase, supabaseConfigured } from './supabase'

// 👉 Moving Walls dashboard data.
//
// ONE jsonb snapshot per pull in `mw_snapshots`; /mw always reads the newest.
// The daily refresh inserts a row — it never edits markup, never touches charts.
// Everything on the three tabs is derived from this shape.

export type Kpi = Record<string, number | string>

export type MwData = {
  meta: {
    pulled: string; semrush: string; monthLabel: string
    daysDone: number; daysMonth: number      // paid DELIVERY days (weekdays)
    days: number; prevDays: number           // CALENDAR days, for per-day comparisons
    prevLabel: string
  }
  sem: {
    kpi: { spend: number; leads: number; cpl: number; clicks: number; cpc: number; cvr: number; live: number } & Kpi
    daily: { labels: string[]; cost: number[]; leads: number[]; cum: number[] }
    concentration: { c: string; bpk: number; cvr: number; broad: boolean; live: boolean }[]
    campaigns?: { name: string; sub: string; state: string; spend: number; leads: number; cpl: number | null; note: string }[]
    benchmark?: { metric: string; unit: string; better: string; prefix?: string; rows: { n: string; v: number; live: boolean }[]; who: string; chips: string[] }[]
    leaks?: { amt: string; title: string; detail: string; items?: [string, string][] }[]
  }
  seo: {
    market: string
    kpi: { sessions: number; users: number; leads: number; shareOfLeads: string; cvr: number; authority: number; refDomains: number } & Kpi
    daily: { start: string; sessions: number[]; leads: number[] }
    competitors: { n: string; kw: number; tr: number; me: boolean }[]
    brand?: { market: string; brand: number; nonBrand: number; who: string; chips: string[] }[]
    opportunities?: { kw: string; market: string; pos: number; vol: number; cpc: number }[]
    winning?: string
    collide?: { tone: string; title: string; detail: string }[]
    markets?: { m: string; sessions: number; leads: number; kw: number | null; paid: string }[]
    marketNote?: string
  }
  channels: { n: string; a: number; al: number; s: number; sl: number }[]
  overview?: { context: { amt: string; tone: string; title: string; detail: string }[]; read?: string }
}

export type Snapshot = { data: MwData; pulledAt: string | null; note: string | null; stale: boolean }

/** Newest snapshot, or null when the table is empty / Supabase isn't configured. */
/** The year-month a snapshot describes, taken from the day it was pulled. */
const monthKeyOf = (pulledAt: string) => String(pulledAt).slice(0, 7)

export type MonthOption = { key: string; label: string; pulledAt: string; current: boolean }

/**
 * Which months can be looked at.
 *
 * Each daily pull stores a whole snapshot of the month so far, so the LAST
 * snapshot of a month is that month's closing picture and every earlier one is
 * a partial. Listing the months lets the owner compare September with October
 * without another call to Google: the history was already here, it was simply
 * never reachable (owner, 5 Oct 2026).
 */
export async function getMwMonths(): Promise<MonthOption[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase
    .from('mw_snapshots').select('pulled_at, data')
    .order('pulled_at', { ascending: false }).limit(400)
  const now = monthKeyOf(new Date().toISOString())
  const seen = new Map<string, MonthOption>()
  for (const r of data ?? []) {
    const key = monthKeyOf(String(r.pulled_at))
    if (seen.has(key)) continue            // newest wins; rows arrive newest first
    seen.set(key, {
      key,
      label: String((r.data as any)?.meta?.monthLabel ?? key),
      pulledAt: String(r.pulled_at),
      current: key === now,
    })
  }
  return [...seen.values()].sort((a, b) => b.key.localeCompare(a.key))
}

/**
 * A month's snapshot, or the newest one when no month is named.
 *
 * `month` is a key like "2026-09". Asking for a month with no snapshot returns
 * null rather than quietly showing a different one: a page that answers a
 * question you did not ask is worse than a page that says it cannot.
 */
export async function getMwData(month?: string): Promise<Snapshot | null> {
  if (!supabaseConfigured) return null
  let q = supabase.from('mw_snapshots').select('data, pulled_at, note')
  if (month && /^[0-9]{4}-[0-9]{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    q = q.gte('pulled_at', new Date(Date.UTC(y, m - 1, 1)).toISOString())
         .lt('pulled_at', new Date(Date.UTC(y, m, 1)).toISOString())
  }
  const { data, error } = await q.order('pulled_at', { ascending: false }).limit(1).maybeSingle()
  if (error || !data?.data) return null
  const pulledAt: string | null = data.pulled_at ?? null
  // Staleness only means something for the month in progress. A closed month's
  // snapshot is weeks old by design, and flagging that as stale would be
  // telling the owner off for looking at history.
  const isCurrent = !month || month === monthKeyOf(new Date().toISOString())
  const stale = isCurrent
    ? (pulledAt ? Date.now() - new Date(pulledAt).getTime() > 48 * 3600 * 1000 : true)
    : false
  return { data: data.data as MwData, pulledAt, note: data.note ?? null, stale }
}


// ---------------------------------------------------------------- alerts
export type Alert = { sev: 'hi' | 'md' | 'lo'; move: string; title: string; detail: string; sort: number }

/**
 * Alerts are COMPUTED, never written by hand — that's the whole point. If a
 * channel moves, it shows up here whether or not anyone thought to look.
 * Everything is compared PER DAY so a part-month isn't read as a decline.
 */
export function buildAlerts(d: MwData): Alert[] {
  const out: Alert[] = []
  const dN = d.meta.days || 1
  const dP = d.meta.prevDays || 1
  const prev = d.meta.prevLabel || 'last month'
  const totS = d.channels.reduce((a, c) => a + c.s, 0)
  const n = (v: number) => v.toLocaleString('en-US')

  // GA4 credits the LAST click, Google Ads credits its own click for up to 60
  // days wherever the visit finally returns through. So a GA4 line about paid
  // search is only half the story, and the owner runs those ads and reads this
  // page with his team (29 Sep 2026). Every paid alert carries the other half.
  const adsLeads = d.sem?.kpi?.leads ?? 0
  const paidNote = (channel: string) =>
    /paid search|cross-network|paid shopping/i.test(channel) && adsLeads > 0
      ? ` GA4 counts the last click only — Google Ads records ${adsLeads} conversions over the same period, some of which GA4 credits to other channels.`
      : ''

  for (const c of d.channels) {
    const perNow = c.s / dN
    const perPrev = c.a / dP
    const pct = perPrev > 0 ? ((perNow - perPrev) / perPrev) * 100 : perNow > 0 ? Infinity : 0
    const share = totS ? (c.s / totS) * 100 : 0

    if (c.s >= 300 && (pct === Infinity || Math.abs(pct) >= 50)) {
      const up = pct > 0
      out.push({
        sev: pct === Infinity || Math.abs(pct) >= 300 ? 'hi' : 'md',
        sort: pct === Infinity ? 9999 : Math.abs(pct),
        move: pct === Infinity ? 'new' : `${up ? '+' : ''}${Math.round(pct)}%`,
        title: `${c.n} traffic ${up ? 'jumped' : 'fell'} ${pct === Infinity ? 'from nothing' : Math.abs(Math.round(pct)) + '%'} per day`,
        detail: `${perPrev.toFixed(0)} sessions a day in ${prev} → ${perNow.toFixed(0)} now (${n(c.a)} → ${n(c.s)} total). ` +
          (c.sl === 0
            ? `No leads at all this month, and it now carries ${share.toFixed(0)}% of site traffic.`
            : `It has produced ${c.sl} lead${c.sl === 1 ? '' : 's'} this month.`) + paidNote(c.n),
      })
    } else if (c.s >= 1000 && c.sl === 0) {
      out.push({
        sev: 'md', sort: c.s / 100, move: '0 leads',
        title: `${c.n} brought ${n(c.s)} sessions and no leads`,
        detail: `${share.toFixed(0)}% of all site traffic this month, with no key events recorded against it.` + paidNote(c.n),
      })
    }

    if (c.al >= 5) {
      const cPrev = c.al / dP
      const cNow = c.sl / dN
      if (cPrev > 0 && cNow < cPrev * 0.5) {
        out.push({
          sev: 'hi', sort: 400, move: `−${Math.round((1 - cNow / cPrev) * 100)}%`,
          title: `${c.n} leads per day halved or worse`,
          detail: `${cPrev.toFixed(2)} a day in ${prev} → ${cNow.toFixed(2)} now (${c.al} → ${c.sl} total).` + paidNote(c.n),
        })
      }
    }
  }

  const order = { hi: 0, md: 1, lo: 2 }
  return out.sort((a, b) => order[a.sev] - order[b.sev] || b.sort - a.sort)
}

// ---------------------------------------------------------------- helpers
export const money = (v: number, dp = 2) => 'S$' + v.toFixed(dp)
export const money0 = (v: number) => 'S$' + Math.round(v).toLocaleString('en-US')
export const num = (v: number) => Math.round(v).toLocaleString('en-US')

export type Targets = { cpa: number; budget: number; leads: number }

/** Targets the team set by hand. The daily refresh never writes these. */
export async function getTargets(): Promise<Targets> {
  const blank = { cpa: 0, budget: 0, leads: 0 }
  if (!supabaseConfigured) return blank
  const { data } = await supabase.from('mw_settings').select('value').eq('key', 'targets').maybeSingle()
  const v = (data?.value ?? {}) as Partial<Targets>
  return { cpa: Number(v.cpa) || 0, budget: Number(v.budget) || 0, leads: Number(v.leads) || 0 }
}
