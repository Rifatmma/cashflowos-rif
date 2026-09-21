// "Is my ad working right now?" -- the one question the Facebook Ads section
// answers first, worked out from the numbers every time the page loads.
//
// The written analysis in lib/ads-snapshot.ts is dated and stays put; THIS is
// computed, so it can never drift from the figures beside it. Every sentence
// here quotes a number it just calculated -- nothing is typed in by hand.
//
// Pure: no server imports, testable directly.
import type { AdsNumbers, Run } from './ads-model'
import { rangeLabel } from './ads-model'

export type VerdictStatus = 'working' | 'watch' | 'not-working' | 'paused'

export type Verdict = {
  status: VerdictStatus
  label: string            // WORKING / WATCH / NOT WORKING / PAUSED
  headline: number | null  // cost per engaged chat, the number the verdict is judged on
  sentence: string
  basis: 'target' | 'trend'
  trend: number[]          // cost per engaged chat, run by run (oldest first)
}

// An engaged chat = someone who sent a second message. Raw cost per chat rewards
// buying chats nobody continues; this is the quality-adjusted number.
export const costPerEngaged = (r: Pick<Run, 'spend' | 'depth2'>) =>
  r.depth2 > 0 ? r.spend / r.depth2 : null

// A run is "live" if it delivered in the last two days. Beyond that the ad has
// stopped, and judging a stopped ad as "working" would be misleading.
const LIVE_WITHIN_DAYS = 2
// Trend thresholds: 10% better counts as working; 15% worse as not.
const BETTER = -0.10
const WORSE = 0.15

const days = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86_400_000)
const rm = (x: number) => 'RM ' + x.toFixed(2)

// Judge the ad as of the day its numbers were PULLED, never today. If the Meta
// connection breaks, the numbers stop -- and measured from today, a perfectly
// healthy ad would read as "paused" purely because the data went stale. The
// freshness tag on the page is what says how old the numbers are; the verdict
// only ever describes what the numbers show.
export function asOf(d: Pick<AdsNumbers, 'pulledAt'>): string {
  return new Date(Date.parse(d.pulledAt) + 8 * 3600_000).toISOString().slice(0, 10)
}

export function verdict(d: AdsNumbers, targetCostPerEngaged?: number | null): Verdict {
  const today = asOf(d)
  const cur = d.runs.at(-1)!
  const prev = d.runs.at(-2)
  const now = costPerEngaged(cur)
  const before = prev ? costPerEngaged(prev) : null
  const trend = d.runs.map(r => costPerEngaged(r)).filter((x): x is number => x !== null)

  if (days(cur.until, today) > LIVE_WITHIN_DAYS) {
    return {
      status: 'paused', label: 'PAUSED', headline: now, basis: 'trend', trend,
      sentence: `No delivery since ${rangeLabel(cur.until, cur.until)} — ${days(cur.until, today)} days. ` +
        `The last run cost ${now !== null ? rm(now) : 'an unknown amount'} per engaged chat.`,
    }
  }
  if (now === null) {
    return {
      status: 'not-working', label: 'NOT WORKING', headline: null, basis: 'trend', trend,
      sentence: `${cur.convos} chats this run and none sent a second message.`,
    }
  }

  if (targetCostPerEngaged && targetCostPerEngaged > 0) {
    const ratio = now / targetCostPerEngaged
    const status: VerdictStatus = ratio <= 1 ? 'working' : ratio <= 1.25 ? 'watch' : 'not-working'
    return {
      status, label: LABEL[status], headline: now, basis: 'target', trend,
      sentence: `${rm(now)} per engaged chat against your ${rm(targetCostPerEngaged)} break-even.`,
    }
  }

  if (before === null) {
    return {
      status: 'watch', label: 'WATCH', headline: now, basis: 'trend', trend,
      sentence: `${rm(now)} per engaged chat. No earlier run to compare with yet.`,
    }
  }
  const delta = (now - before) / before
  const status: VerdictStatus = delta <= BETTER ? 'working' : delta >= WORSE ? 'not-working' : 'watch'
  const dir = delta < 0 ? 'down' : 'up'
  return {
    status, label: LABEL[status], headline: now, basis: 'trend', trend,
    sentence: `${rm(now)} per engaged chat, ${dir} ${Math.abs(delta * 100).toFixed(0)}% on the last run (${rm(before)}).`,
  }
}

const LABEL: Record<VerdictStatus, string> = {
  working: 'WORKING', watch: 'WATCH', 'not-working': 'NOT WORKING', paused: 'PAUSED',
}

// ---------------------------------------------------------------------------
// WATCH-OUTS. Each one fires only when its condition is actually true, and says
// what it saw in numbers. An empty list is a good day, not a missing section.
// ---------------------------------------------------------------------------
export type Alert = { key: string; level: 'bad' | 'warn'; text: string }

type Offer = { price: number; normalPrice: number; priceInAd: number }
type Creative = { claims: string[] }

export function alerts(d: AdsNumbers, extras?: { offer?: Offer; creative?: Creative }): Alert[] {
  const today = asOf(d)
  const out: Alert[] = []
  const cur = d.runs.at(-1)!
  const prev = d.runs.at(-2)

  // Legal first. The Jaosamut brand guideline (section 15): not JAKIM certified,
  // so "Halal" in customer-facing copy is an offence under Malaysian law.
  if (extras?.creative?.claims.some(c => /\bhalal\b/i.test(c))) {
    out.push({
      key: 'halal', level: 'bad',
      text: 'The live ad says "Halal". Without JAKIM certification that’s an offence under Malaysian law — ' +
        'your brand guideline says to use "No pork · No alcohol served" instead.',
    })
  }

  if (prev && prev.reach > 0 && prev.cpm > 0) {
    const reachDrop = (prev.reach - cur.reach) / prev.reach
    const cpmRise = cur.cpm / prev.cpm
    if (reachDrop >= 0.15 && cpmRise >= 1.15) {
      out.push({
        key: 'reach-cpm', level: 'warn',
        text: `Reach down ${(reachDrop * 100).toFixed(0)}% on the last run while every 1,000 views costs ` +
          `${cpmRise.toFixed(1)}× as much. The audience pool is shrinking.`,
      })
    } else {
      // The long view: against the best-reaching run, not just the last one.
      const peak = [...d.runs].sort((a, b) => b.reach - a.reach)[0]
      if (peak && peak !== cur && cur.reach < peak.reach * 0.5 && cur.cpm > peak.cpm * 2) {
        out.push({
          key: 'reach-long', level: 'warn',
          text: `Reach is ${((1 - cur.reach / peak.reach) * 100).toFixed(0)}% below run ${peak.id} (${peak.label}), and ` +
            `views cost ${(cur.cpm / peak.cpm).toFixed(1)}× as much. The audience pool is exhausted.`,
        })
      }
    }
  }

  if (cur.convos > 0) {
    const die = 1 - cur.depth2 / cur.convos
    if (die >= 0.5) {
      out.push({
        key: 'depth', level: 'warn',
        text: `${(die * 100).toFixed(0)}% of chats never send a second message. The biggest loss in the account, ` +
          `and it happens after the ad has done its job.`,
      })
    }
  }

  // Outages inside a live run, in the last week: real downtime, not a pause.
  const recentZero = d.days.filter(x => x.spend === 0 && days(x.date, today) <= 7 && x.date <= cur.until)
  if (recentZero.length) {
    const first = recentZero[0].date, last = recentZero.at(-1)!.date
    out.push({
      key: 'outage', level: 'warn',
      text: `Nothing delivered on ${first === last ? rangeLabel(first, first) : rangeLabel(first, last)}. ` +
        `Check the ad account for a billing or review hold.`,
    })
  }

  if (extras?.offer && Math.abs(extras.offer.priceInAd - extras.offer.normalPrice) > 0.005) {
    out.push({
      key: 'price', level: 'warn',
      text: `The ad quotes the normal price as RM ${extras.offer.priceInAd.toFixed(2)}; your normal price is ` +
        `RM ${extras.offer.normalPrice.toFixed(2)}.`,
    })
  }

  return out
}
