// 👉 The six numbers on Today and in Rif's Monday email — computed once, so
// the page and the email can never disagree.
//
// Pure. Thresholds are written here and nowhere else.

import type { MarketSeo } from './mw-market-data'
import type { Person } from './mw-people'
import type { Seen } from './mw-presence'
import { glanceOf } from './mw-seo-glance'

export type SignalTone = 'good' | 'warn' | 'bad' | 'plain'
export type StackSignal = { key: string; label: string; value: string; note: string; tone: SignalTone; href?: string }

export type SignalInput = {
  channels: { n: string; s: number; sl: number }[]
  utmFill: number | null
  paid: { cpl: number; leads: number; monthLabel: string } | null
  cpaTarget: number
  leads14: number
  unanswered14: number
  markets: MarketSeo[]
  /** People whose activity counts toward "team active" (not Rif, not the bosses). */
  team: Person[]
  seen: Map<string, Seen>
}

export function stackSignals(i: SignalInput): StackSignal[] {
  const enquiries = i.channels.reduce((t, c) => t + c.sl, 0)
  const organic = i.channels.find(c => c.n === 'Organic Search')?.sl ?? 0
  const paidGa4 = i.channels.find(c => c.n === 'Paid Search')?.sl ?? 0
  const nb = glanceOf(i.markets).find(s => s.key === 'nonbrand')
  const active = i.team.filter(p => (i.seen.get(p.name)?.visitsThisWeek ?? 0) > 0).length
  const answered = i.leads14 - i.unanswered14
  const share = (a: number, b: number) => (b ? a / b : 0)
  return [
    { key: 'enq', label: 'Enquiries', value: String(enquiries), note: `this month · GA4 · organic ${organic} · paid ${paidGa4}`, tone: 'plain', href: '/mw/sales' },
    {
      key: 'src', label: 'Source known', value: i.utmFill === null ? '—' : `${Math.round(i.utmFill * 100)}%`,
      note: 'CRM leads, last 14 days', tone: i.utmFill === null ? 'warn' : i.utmFill >= 0.8 ? 'good' : i.utmFill >= 0.5 ? 'warn' : 'bad',
    },
    {
      // Rif's channel: judged only against his own target, never against organic.
      key: 'cpl', label: 'Paid cost / lead', value: i.paid ? `S$${Math.round(i.paid.cpl)}` : '—',
      note: i.paid ? `Google Ads · ${i.paid.monthLabel} · ${i.paid.leads} leads` : 'no snapshot',
      tone: !i.paid || !i.cpaTarget ? 'plain' : i.paid.cpl <= i.cpaTarget ? 'good' : 'warn', href: '/mw/paid',
    },
    { key: 'nb', label: 'Non-brand', value: nb?.value ?? '—', note: nb?.note ?? '', tone: (nb?.tone ?? 'plain') as SignalTone, href: '/mw/seo' },
    {
      key: 'ans', label: 'Answered', value: `${answered} of ${i.leads14}`, note: 'CRM · last 14 days',
      tone: !i.leads14 ? 'plain' : share(answered, i.leads14) >= 0.8 ? 'good' : share(answered, i.leads14) >= 0.5 ? 'warn' : 'bad', href: '/mw/sales',
    },
    {
      key: 'team', label: 'Team active', value: `${active} of ${i.team.length}`, note: 'opened the app this week',
      tone: active >= i.team.length * 0.7 ? 'good' : active >= i.team.length * 0.3 ? 'warn' : 'bad', href: '/mw/people',
    },
  ]
}
