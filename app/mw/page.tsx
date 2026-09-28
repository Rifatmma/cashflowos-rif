import { currentGuest } from '@/lib/guest'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getMwData, buildAlerts, money0, num } from '@/lib/mw-data'
import { getActions, tally } from '@/lib/mw-actions'
import { MwHero, Tiles, Section, Alerts, Bars } from './_ui'
import { Tracker } from './_actions-ui'
import { ContextCards } from './_sections'

// 👉 Moving Walls → Overview. The default tab: the whole picture in one screen.

export const dynamic = 'force-dynamic'

export default async function MwOverview() {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  const [snap, rows] = await Promise.all([getMwData(), getActions()])

  if (!snap) {
    return (
      <div className="mw-wrap">
        <MwHero tab="overview" pulled="—" stale={false} headline="Marketing Command Centre" />
        <Section title="No snapshot yet">
          <p className="lede">
            The <code>mw_snapshots</code> table is empty, so there is nothing to show. The daily
            refresh writes a row each morning; until one lands this page stays blank rather than
            inventing numbers.
          </p>
        </Section>
      </div>
    )
  }

  const d = snap.data
  const alerts = buildAlerts(d)
  const totS = d.channels.reduce((a, c) => a + c.s, 0)
  const totL = d.channels.reduce((a, c) => a + c.sl, 0)
  const ch = [...d.channels].filter(c => c.s > 0).sort((a, b) => b.sl - a.sl || b.s - a.s)
  const organic = d.channels.find(c => c.n === 'Organic Search')
  const paid = d.channels.find(c => c.n === 'Paid Search')
  const paidRows = rows.filter(r => r.channel === 'paid')
  const seoRows = rows.filter(r => r.channel === 'seo')
  const declined = rows.filter(r => r.decision?.choice === 'reject')

  return (
    <div className="mw-wrap">
      <MwHero tab="overview" pulled={d.meta.pulled} stale={snap.stale}
        headline="Organic search delivers the leads. Paid search delivers the bill.">
        <p>
          In {d.meta.monthLabel}, organic brought <b>{organic?.sl ?? 0} leads from {num(organic?.s ?? 0)} sessions</b> at
          no media cost. Paid search brought <b>{paid?.sl ?? 0} from {num(paid?.s ?? 0)} sessions and {money0(d.sem.kpi.spend)}</b>.
          {guest ? ` Signed in as ${guest}.` : ''}
        </p>
      </MwHero>

      <Tiles items={[
        { k: 'Site sessions', v: num(totS), d: `${d.meta.monthLabel}, ${d.meta.days} days` },
        { k: 'Leads, all channels', v: String(totL) },
        { k: 'Organic leads', v: String(organic?.sl ?? 0), d: 'free', tone: 'up' },
        { k: 'Paid leads', v: String(paid?.sl ?? 0), d: money0(d.sem.kpi.spend), tone: 'dn' },
        { k: 'Paid cost per lead', v: money0(d.sem.kpi.cpl), d: String(d.sem.kpi.dCpl ?? ''), tone: 'dn' },
        { k: 'Live campaigns', v: String(d.sem.kpi.live) },
      ]} />

      <Section title="Alerts — what moved"
        sub="Computed from this month against last, per day, so a part-month isn't read as a decline. Nothing here was chosen by hand.">
        <Alerts alerts={alerts} />
      </Section>

      <Section title={`Where the ${totL} leads came from`}
        sub="Sessions and key events from GA4. Orange marks a channel over 1,000 sessions that converted nobody.">
        <Bars max={Math.max(...ch.map(c => c.sl), 1)}
          rows={ch.map(c => ({
            label: c.n, value: c.sl, display: `${c.sl} · ${num(c.s)} sess`,
            tone: c.sl > 0 ? 'good' : c.s >= 1000 ? 'bad' : 'dim',
          }))} />
      </Section>

      {d.overview?.context?.length ? (
        <Section title="The three the team should discuss first" sub="Context behind the alerts above.">
          <ContextCards cards={d.overview.context} read={d.overview.read} />
        </Section>
      ) : null}

      <Section title="Action tracker"
        sub="Status is read from the accounts and refreshes every morning. Decisions are your team's, and stay until you change them.">
        <Tracker paid={tally(paidRows)} seo={tally(seoRows)} declined={declined} />
      </Section>
    </div>
  )
}
