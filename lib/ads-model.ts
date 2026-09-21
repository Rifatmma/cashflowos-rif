// The Facebook Ads NUMBERS -- one shape, two sources.
//
// The pages used to import lib/ads-snapshot.ts directly: numbers pulled by hand
// on 20 Sep, frozen in a file. Now a 9 am job re-pulls them from Meta every day
// (lib/ads-refresh.ts). Both sources produce this SAME AdsNumbers shape, so the
// pages never know or care which one they got -- and if a pull fails, the file
// (or yesterday's pull) stands in without anything breaking.
//
// What refreshes: the runs, the current run's totals, and every breakdown.
// What does NOT: the offer, targeting, the live ad's copy, competitors and the
// written analysis. Those stay in lib/ads-snapshot.ts and are shown with the
// date they were written, so a stale paragraph can never pose as current.
//
// Pure: no server imports, so the Meta-parsing below is testable offline.
import { RUNS, SNAPSHOT, type Row, type Run } from './ads-snapshot'

export type { Row, Run }

export type Totals = {
  spend: number; impressions: number; reach: number; clicks: number
  ctr: number; cpc: number; cpm: number; frequency: number
  convos: number; newConnections: number; totalConnections: number
  depth2: number; depth3: number; depth5: number
  linkClicks: number; videoViews: number; postSaves: number; comments: number; reactions: number
  deliveryDays: number; calendarDays: number
}

export type Day = { date: string; spend: number; convos: number; ctr: number }
export type Hour = { h: number; spend: number; convos: number }

export type AdsNumbers = {
  pulledAt: string              // ISO timestamp of the pull
  source: 'live' | 'snapshot'   // live = a daily pull; snapshot = the hand-pulled file
  accountId: string
  runs: Run[]                   // oldest first; the last one is the current run
  totals: Totals                // for the current run
  placements: Row[]; platforms: Row[]; ages: Row[]; genders: Row[]; regions: Row[]; devices: Row[]
  hours: Hour[]
  days: Day[]                   // the current run, day by day
}

// ---------------------------------------------------------------------------
// The hand-pulled file, as AdsNumbers. Used until the first good daily pull,
// and whenever every pull since has failed.
// ---------------------------------------------------------------------------
const MON: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

export function fromFile(): AdsNumbers {
  const year = SNAPSHOT.period.since.slice(0, 4)
  return {
    pulledAt: SNAPSHOT.pulledAt + 'T09:00:00+08:00',
    source: 'snapshot',
    accountId: SNAPSHOT.account.id,
    runs: RUNS,
    totals: SNAPSHOT.totals,
    placements: SNAPSHOT.placements, platforms: SNAPSHOT.platforms, ages: SNAPSHOT.ages,
    genders: SNAPSHOT.genders, regions: SNAPSHOT.regions, devices: SNAPSHOT.devices,
    hours: SNAPSHOT.hours,
    days: SNAPSHOT.days.map(d => {
      const [dd, mon] = d.d.split(' ')
      return { date: `${year}-${MON[mon]}-${dd}`, spend: d.spend, convos: d.convos, ctr: d.ctr }
    }),
  }
}

// ---------------------------------------------------------------------------
// Parsing Meta's insight rows. Meta returns every number as a STRING, and every
// conversion inside an `actions` array of { action_type, value }.
// ---------------------------------------------------------------------------
export type InsightRow = Record<string, any>

export const n = (x: unknown): number => {
  const v = typeof x === 'number' ? x : parseFloat(String(x ?? ''))
  return Number.isFinite(v) ? v : 0
}

// Match an action by the END of its type: Meta prefixes some with
// "onsite_conversion." and not others, and has changed prefixes before. The
// suffix is the stable part.
export function action(row: InsightRow, suffix: string): number {
  const list = Array.isArray(row?.actions) ? row.actions : []
  const hit = list.find((a: any) => typeof a?.action_type === 'string' && a.action_type.endsWith(suffix))
  return hit ? n(hit.value) : 0
}

export const A = {
  convos: 'messaging_conversation_started_7d',
  depth2: 'messaging_user_depth_2_message_send',
  depth3: 'messaging_user_depth_3_message_send',
  depth5: 'messaging_user_depth_5_message_send',
  newConnections: 'messaging_first_reply',
  totalConnections: 'total_messaging_connection',
  linkClicks: 'link_click',
  videoViews: 'video_view',
  postSaves: 'post_save',
  comments: 'comment',
  reactions: 'post_reaction',
} as const

/** One breakdown row -> the pages' Row shape. `convoKey` lets regions use total connections. */
export function toRow(label: string, r: InsightRow, convoKey: string = A.convos): Row {
  return {
    label,
    spend: n(r.spend),
    convos: action(r, convoKey),
    impressions: n(r.impressions),
    clicks: n(r.clicks),
    ctr: n(r.ctr),
    depth2: action(r, A.depth2),
    depth3: action(r, A.depth3),
    depth5: action(r, A.depth5),
  }
}

// Meta's placement codes -> the names the owner sees in Ads Manager.
const POSITION: Record<string, string> = {
  feed: 'Feed', facebook_stories: 'Stories', instagram_stories: 'Stories', story: 'Stories',
  facebook_reels: 'Reels', instagram_reels: 'Reels', reels: 'Reels',
  search: 'Search', instream_video: 'In-stream', facebook_profile_feed: 'Profile feed',
  profile_feed: 'Profile feed', instagram_explore: 'Explore', instagram_explore_grid_home: 'Explore home',
  marketplace: 'Marketplace', right_hand_column: 'Right column', video_feeds: 'Video feeds',
  facebook_reels_overlay: 'Reels overlay', an_classic: 'Audience Network', messenger_inbox: 'Messenger',
  instagram_profile_feed: 'Profile feed', threads_feed: 'Threads',
}
export function placementLabel(platform: string, position: string): string {
  const p = platform === 'instagram' ? 'IG' : platform === 'facebook' ? 'FB'
    : platform === 'messenger' ? 'Messenger' : platform === 'audience_network' ? 'AN' : platform
  const pos = POSITION[position] ?? position.replace(/_/g, ' ')
  return `${p} ${pos}`.trim()
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const deviceLabel = (d: string) =>
  ({ android_smartphone: 'Android phone', iphone: 'iPhone', ipad: 'iPad', android_tablet: 'Android tablet', desktop: 'Desktop', ipod: 'iPod', other: 'Other' } as Record<string, string>)[d]
  ?? titleCase(d.replace(/_/g, ' '))
export const genderLabel = (g: string) => ({ female: 'Women', male: 'Men', unknown: 'Unknown' } as Record<string, string>)[g] ?? titleCase(g)
export const ageLabel = (a: string) => a.replace('-', '–')

// ---------------------------------------------------------------------------
// Finding the RUNS. Delivery has been stop-start all year, so the comparison
// period is a run of delivery, never a calendar window. A run ends where spend
// stops for GAP_DAYS or more -- short outages (like 17-18 Sep) stay inside it.
// This is the same rule the original snapshot was split on.
// ---------------------------------------------------------------------------
export const GAP_DAYS = 4

export type DailyPoint = { date: string; spend: number }

const DAY = 86_400_000
// Midnight UTC, so the division is exact. (Noon gives N.5, which rounds UP to
// the next day and shifts every run by one -- caught in testing.)
const dnum = (iso: string) => Date.parse(iso + 'T00:00:00Z') / DAY
const isoOf = (d: number) => new Date(d * DAY).toISOString().slice(0, 10)

export function detectRuns(daily: DailyPoint[]): { since: string; until: string; deliveryDays: number; gapAfter?: number }[] {
  const live = daily.filter(d => d.spend > 0).map(d => dnum(d.date)).sort((a, b) => a - b)
  const runs: { start: number; end: number; count: number }[] = []
  for (const d of live) {
    const last = runs.at(-1)
    if (last && d - last.end - 1 < GAP_DAYS) { last.end = d; last.count++ }
    else runs.push({ start: d, end: d, count: 1 })
  }
  return runs.map((r, i) => ({
    since: isoOf(r.start),
    until: isoOf(r.end),
    deliveryDays: r.count,
    gapAfter: i < runs.length - 1 ? runs[i + 1].start - r.end - 1 : undefined,
  }))
}

// Keep the owner's names for runs he already knows ("Set RM79.90 promo"); a run
// that has started since gets the next letter and its dates as a label.
export function nameRuns<T extends { since: string; until: string }>(found: T[], known: Run[] = RUNS): (T & { id: string; label: string })[] {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let next = known.length
  return found.map(r => {
    const k = known.find(x => Math.abs(dnum(x.since) - dnum(r.since)) <= 2)
    if (k) return { ...r, id: k.id, label: k.label }
    const id = letters[next++ % 26]
    return { ...r, id, label: rangeLabel(r.since, r.until) }
  })
}

const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "3–19 Sep", or "29 Aug – 2 Sep" across a month boundary. */
export function rangeLabel(since: string, until: string): string {
  const [, sm, sd] = since.split('-').map(Number)
  const [, um, ud] = until.split('-').map(Number)
  if (since === until) return `${ud} ${MON3[um - 1]}`   // one day: "19 Sep", not "19–19 Sep"
  return sm === um ? `${sd}–${ud} ${MON3[um - 1]}` : `${sd} ${MON3[sm - 1]} – ${ud} ${MON3[um - 1]}`
}
