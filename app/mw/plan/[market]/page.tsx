import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { currentGuest } from '@/lib/guest'
import { MwHero, Section } from '../../_ui'
import { PlanRow } from '../_plan-ui'
import { CityCard, type CityView } from '../_city-ui'
import { ProposalPage, type ProposalView } from '../_proposal-ui'
import { marketViews, spendOf, clicksOf, bestPos } from '@/lib/mw-market-view'
import { STAGE_LABEL, isOpen } from '@/lib/mw-status'
import type { ActionRow } from '@/lib/mw-actions'

// 👉 One market, one owner, everything they are responsible for.
//
// The whole point of the restructure: a lead opens their own page and sees
// their tasks, their city pages and their page changes — and nobody else's.
// Before this, filtering the single plan page to the India lead still showed
// her Dubai, Osaka and Johannesburg, because two of the three sections
// ignored the filter (owner, 12 Oct 2026).
//
// Ordered the way the work is decided, not the way the data was gathered:
// what is costing money, then what is nearly won, then everything else.

export const dynamic = 'force-dynamic'

const money = (n: number) => `S$${n.toFixed(2)}`
const KIND_LABEL = { ads: 'Ads', seo: 'SEO', content: 'Content', page: 'Page build' } as const

export default async function MwMarket({ params }: { params: Promise<{ market: string }> }) {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  const { market } = await params
  const views = await marketViews()
  const v = views.find(x => x.market.key === market)
  if (!v) notFound()

  const open = v.tasks.filter(t => isOpen(t.stage))
  const closed = v.tasks.filter(t => !isOpen(t.stage))

  // Cities the lead can actually act on first; the rest behind a heading, not
  // hidden — there is no evidence they are broken and no honest task in them.
  const cityLive = v.cities.filter(c => c.kind !== 'quiet' || c.status !== 'not_started')
  const cityQuiet = v.cities.filter(c => !cityLive.includes(c))

  const toCityView = (c: typeof v.cities[number]): CityView => ({
    url: c.url, city: c.city, market: c.market, kind: c.kind, says: c.says,
    cost: Number(c.cost), clicks: c.clicks, pos: c.pos === null ? null : Number(c.pos),
    terms: Array.isArray(c.terms) ? c.terms : [], words: c.words,
    landsOn: Array.isArray(c.lands_on) ? c.lands_on : [],
    status: c.status, statusBy: c.status_by, statusAt: c.status_at, owner: c.owner ?? null,
  })

  return (
    <div className="mw-wrap">
      <MwHero tab="plan" pulled={''} stale={false}
        headline={`${v.market.label} — ${v.market.owner ?? 'Unassigned'}`}>
        <p>
          <Link href="/mw/plan">← All markets</Link>
          {' · '}
          {v.roll.open} open, {v.roll.inProgress} started, {v.roll.done} done
          {v.atRisk > 0 && <> · <b>{money(v.atRisk)} a month</b> riding on what is still open</>}
        </p>
      </MwHero>

      {v.atRisk > 0 && v.cities.some(c => c.kind === 'misrouted' && c.status !== 'done') && (
        <Section title="Costing money today">
          {v.cities.filter(c => c.kind === 'misrouted' && c.status !== 'done').map(c => (
            <CityCard key={c.url} c={toCityView(c)} />
          ))}
        </Section>
      )}

      {open.length > 0 && (
        <Section title="Tasks" sub="What this market owes. Size is effort: S about an hour, M half a day, L a day or two.">
          {open.map(t => (
            <div key={t.id} className="mw-task-wrap">
              <span className={`mw-kind is-${t.kind}`}>{KIND_LABEL[t.kind]}</span>
              <PlanRow r={t.row as ActionRow} render={t.render ?? null} />
            </div>
          ))}
        </Section>
      )}

      {v.proposals.length > 0 && (
        <Section title="Page changes waiting on a yes or no"
          sub="Each is drawn on the real page in the download. Approve or reject here; a reason is kept and used to judge the next one.">
          {v.proposals.map(p => (
            <ProposalPage key={p.slug} slug={p.slug} url={p.url} href={p.href}
              items={p.items.map((r): ProposalView => ({
                id: r.id, kind: r.kind, where: r.where_, was: r.was, now: r.now_, why: r.why,
                status: r.status, reason: r.reason, decidedBy: r.decided_by, decidedAt: r.decided_at,
                reopenWhy: r.reopen_why, blocked: r.blocked,
                spend: spendOf(r.evidence), clicks: clicksOf(r.evidence),
                conv: (r.evidence?.paid ?? []).reduce((s: number, x: any) => s + (Number(x?.conv) || 0), 0),
                bestPos: bestPos(r.evidence),
              }))} />
          ))}
        </Section>
      )}

      {cityLive.filter(c => c.kind !== 'misrouted').length > 0 && (
        <Section title="City pages" sub="The hyperlocal pages in this market, and what Google reports for each.">
          {cityLive.filter(c => c.kind !== 'misrouted').map(c => <CityCard key={c.url} c={toCityView(c)} />)}
        </Section>
      )}

      {cityQuiet.length > 0 && (
        <Section title={`${cityQuiet.length} more city ${cityQuiet.length === 1 ? 'page is' : 'pages are'} barely shown`}
          sub="Under 100 impressions in 28 days. Built, long enough and linked — no evidence anything is wrong with them, so nothing is being asked of you here.">
          <details className="mw-lead is-ok">
            <summary>
              <span className="mw-rt ok">{cityQuiet.length}</span>
              <span className="mw-task-main"><b>Show them anyway</b><small>Claim one if you want to work on it</small></span>
            </summary>
            <div className="mw-task-body">
              {cityQuiet.map(c => <CityCard key={c.url} c={toCityView(c)} />)}
            </div>
          </details>
        </Section>
      )}

      {closed.length > 0 && (
        <Section title="Closed" sub="Done, declined, or no longer applicable. Kept so the decision is visible.">
          <details className="mw-lead is-ok">
            <summary>
              <span className="mw-rt ok">{closed.length}</span>
              <span className="mw-task-main">
                <b>{closed.length} closed</b>
                <small>{[...new Set(closed.map(t => STAGE_LABEL[t.stage]))].join(' · ')}</small>
              </span>
            </summary>
            <div className="mw-task-body">
              {closed.map(t => <PlanRow key={t.id} r={t.row as ActionRow} render={t.render ?? null} />)}
            </div>
          </details>
        </Section>
      )}

      {v.roll.total === 0 && (
        <Section title="Nothing open">
          <p className="lede">No tasks, city pages or page changes in {v.market.label} right now.</p>
        </Section>
      )}
    </div>
  )
}
