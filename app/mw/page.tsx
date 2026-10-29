import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { getMwData, getMwMonths, num, type MwData } from '@/lib/mw-data'
import { getMarketSeo, withData, type MarketSeo } from '@/lib/mw-market-data'
import { getPeople } from '@/lib/mw-people-store'
import { personByActor, doers } from '@/lib/mw-people'
import { crmMonths, monthBefore, aiVisibility, enquiriesByPage } from '@/lib/mw-home'
import { pageLabel } from '@/lib/mw-cliq'
import { INTENTS } from '@/lib/mw-lead-intent'
import { isoWeek, isReady } from '@/lib/mw-week'
import { weekTasks } from '@/lib/mw-week-store'
import { buyerSummary, decayWatch } from '@/lib/mw-results'
import { MARKET } from '@/lib/mw-markets'
import { MwHero } from './_ui'

// 👉 Moving Walls → Home. The overall picture, not a list of work (owner,
// 28 Oct 2026): "The home should show the numbers current standings and page
// health … As an overall picture, for example Google Analytics will show total
// traffic, pie chart by channels." Work lives on To do.
//
// Qualified CRM leads come first: it is the number Mehul and Safwaan judge
// marketing by. GA4 enquiries are shown but marked unreliable until the Zoho
// pop-up fix gives landing pages their credit. One brand number is allowed here
// and nowhere else (owner's exception to the non-brand rule).
//
// The filter at the top (owner, 28 Oct 2026): month over month by default, or
// any month against any other. A month in progress is compared a day at a time.
//
// A market lead or Dinesh who opens /mw goes straight to To do.

export const dynamic = 'force-dynamic'

type Q = { m?: string; vs?: string }

const COLORS: Record<string, string> = {
  'Organic Search': 'var(--mw-s3)', 'Paid Search': 'var(--mw-s1)', Direct: 'var(--mw-ink-3)', Referral: 'var(--mw-s2)',
  Email: '#8B5CF6', Display: '#DB2777', Other: 'var(--mw-line-strong)',
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const delta = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : '—')
const pos = (p: number) => (p ? Math.round(p) : '—')
const KEY = /^[0-9]{4}-[0-9]{2}$/
const label = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

type Ch = { n: string; s: number; sl: number; b: { s: number; sl: number } }

export default async function MwHome({ searchParams }: { searchParams: Promise<Q> }) {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')
  const isOwner = guest === null
  const q = await searchParams

  const myt = new Date(Date.now() + 8 * 3600_000).toISOString()
  const week = isoWeek(myt.slice(0, 10))
  const thisMonth = myt.slice(0, 7)
  const mA = q.m && KEY.test(q.m) && q.m <= thisMonth ? q.m : thisMonth
  const compare = !!(q.vs && KEY.test(q.vs) && q.vs !== mA)
  const mB = compare ? q.vs! : monthBefore(mA)
  const isCur = (k: string) => k === thisMonth

  const [people, months, snapA, snapB, marketsA, marketsB, crm, cards, buyers, decay, aiVis, enq] = await Promise.all([
    getPeople(), getMwMonths(), getMwData(isCur(mA) ? undefined : mA), getMwData(mB),
    getMarketSeo(mA), getMarketSeo(mB), crmMonths([mA, mB]), weekTasks(week), buyerSummary(), decayWatch(), aiVisibility(), enquiriesByPage(mA, mB),
  ])
  const [ai, aiPrev] = aiVis
  const me = personByActor(people, isOwner ? 'owner' : guest)
  if (!isOwner && me?.role !== 'boss') redirect('/mw/todo')

  const d = snapA?.data
  const live = withData(marketsA)

  // ── GA4 channels. Compared a day at a time: a month in progress against a
  // whole month would read as a collapse and mean nothing.
  const daysA = d?.meta.days || 1
  const bData: MwData | undefined = snapB?.data
  const prevIsB = mB === monthBefore(mA)
  const daysB = bData?.meta.days || (prevIsB ? d?.meta.prevDays : 0) || 30
  const hasB = !!bData || prevIsB
  const bOf = (n: string) => {
    if (bData) { const c = bData.channels.find(x => x.n === n); return { s: c?.s ?? 0, sl: c?.sl ?? 0 } }
    // No snapshot of B, but A carries last month's numbers when B is the month before.
    if (prevIsB) { const c = d?.channels.find(x => x.n === n); return { s: c?.a ?? 0, sl: c?.al ?? 0 } }
    return { s: 0, sl: 0 }
  }
  const all: Ch[] = (d?.channels ?? []).filter(c => c.s > 0).map(c => ({ n: c.n, s: c.s, sl: c.sl, b: bOf(c.n) })).sort((a, b) => b.s - a.s)
  const sessions = all.reduce((t, c) => t + c.s, 0)
  // Channels under 2% of sessions fold into one "Other" row.
  const big = all.filter(c => c.s / (sessions || 1) >= 0.02)
  const small = all.filter(c => c.s / (sessions || 1) < 0.02)
  const ch: Ch[] = small.length
    ? [...big, small.reduce<Ch>((o, c) => ({ n: 'Other', s: o.s + c.s, sl: o.sl + c.sl, b: { s: o.b.s + c.b.s, sl: o.b.sl + c.b.sl } }), { n: 'Other', s: 0, sl: 0, b: { s: 0, sl: 0 } })]
    : big
  const enquiries = ch.reduce((t, c) => t + c.sl, 0)
  const enqB = ch.reduce((t, c) => t + c.b.sl, 0)

  // ── Search: non-brand vs brand, every market
  const share = (ms: MarketSeo[]) => {
    const nb = ms.reduce((t, m) => t + m.nonBrandTraffic, 0), br = ms.reduce((t, m) => t + m.brandTraffic, 0)
    return { br, pct: nb + br ? pct(nb, nb + br) : null }
  }
  const sA = share(live), sB = share(withData(marketsB))

  // ── Page health across every graded location page
  const pages = live.flatMap(m => m.health)
  const band = (b: string) => pages.filter(p => p.band === b).length

  // ── To do progress
  const ready = cards.filter(isReady).filter(t => t.state !== 'cant')
  const team = doers(people).map(p => ({ p, ts: ready.filter(t => t.owner === p.name) })).filter(r => r.ts.length)
  const doneOf = (ts: typeof ready) => ts.filter(t => t.state === 'done' || t.state === 'submitted').length

  const cA = crm.get(mA)!, cB = crm.get(mB)!
  const LA = label(mA) + (isCur(mA) ? ' so far' : ''), LB = label(mB)
  const vsTxt = (b: string) => `${LB}: ${b}`
  const cplA = d?.sem.kpi.cpl ?? 0, cplB = bData?.sem.kpi.cpl ?? 0
  const tiles: { k: string; v: string; d: string; tone?: 'up' | 'dn' | 'bad' }[] = [
    { k: 'Qualified leads', v: String(cA.qualified), d: `${cA.leads} leads in all · ${vsTxt(`${cB.qualified} of ${cB.leads}`)}`, tone: cA.qualified / cA.days >= cB.qualified / (cB.days || 1) ? 'up' : 'dn' },
    ...(enq.stored && enq.a.all + enq.b.all > 0 ? [{
      k: 'High-intent leads', v: String(enq.a.intent.high),
      d: `${enq.a.all} website enquiries · named a site, dates or a budget · ${vsTxt(`${enq.b.intent.high} of ${enq.b.all}`)}`,
      tone: enq.a.intent.high / cA.days >= enq.b.intent.high / (cB.days || 1) ? 'up' as const : 'dn' as const,
    }] : []),
    { k: 'Lead source known', v: `${pct(cA.sourced, cA.leads)}%`, d: `${cA.leads - cA.sourced} of ${cA.leads} have no source · ${vsTxt(`${pct(cB.sourced, cB.leads)}%`)}`, tone: cA.leads && cA.sourced / cA.leads < 0.5 ? 'bad' : undefined },
    { k: 'Answered within a day', v: `${pct(cA.answered24, cA.leads)}%`, d: vsTxt(`${pct(cB.answered24, cB.leads)}%`), tone: pct(cA.answered24, cA.leads) >= pct(cB.answered24, cB.leads) ? 'up' : 'dn' },
    { k: 'Enquiries', v: d ? String(enquiries) : '—', d: `GA4 · ${hasB ? vsTxt(String(enqB)) + ' · ' : ''}not reliable until the form fix` },
    { k: 'Non-brand share', v: sA.pct === null ? '—' : `${sA.pct}%`, d: sB.pct === null ? 'of organic search visits' : vsTxt(`${sB.pct}%`) },
    { k: 'Brand searches', v: live.length ? num(sA.br) : '—', d: `est. visits searching "Moving Walls"${sB.br ? ' · ' + vsTxt(num(sB.br)) : ''}` },
    ...(ai ? [{
      k: 'Seen in AI answers', v: `${ai.score}/100`,
      d: `${ai.mentions} mentions · ${ai.citations} citations · ${label(ai.month)}${aiPrev ? ` · ${label(aiPrev.month)}: ${aiPrev.score}` : ''} · Semrush`,
      tone: aiPrev ? (ai.score >= aiPrev.score ? 'up' as const : 'dn' as const) : undefined,
    }] : []),
    { k: 'Paid cost per lead', v: cplA ? `S$${Math.round(cplA)}` : '—', d: d ? `${d.sem.kpi.leads} leads · S$${Math.round(d.sem.kpi.spend)}${cplB ? ' · ' + vsTxt(`S$${Math.round(cplB)}`) : ''}` : '', tone: cplA && cplB ? (cplA <= cplB ? 'up' : 'dn') : undefined },
  ]

  // Donut: each channel's share of sessions as an arc of one circle.
  const R = 54, C = 2 * Math.PI * R
  let at = 0
  const arcs = ch.map(c => { const len = (c.s / (sessions || 1)) * C; const a = { c, len, off: at }; at += len; return a })

  // Months to pick from: every month with a snapshot, plus the past year for the CRM.
  const keys = [...new Set([thisMonth, ...months.map(m => m.key), ...Array.from({ length: 12 }, (_, i) => {
    let k = thisMonth; for (let j = 0; j < i; j++) k = monthBefore(k); return k
  })])].sort().reverse()

  return (
    <div className="mw-wrap">
      <MwHero tab="overview" pulled={d?.meta.pulled ?? '—'} stale={!!snapA?.stale}
        sources="Moving Walls · Zoho CRM · GA4 · Search Console · Google Ads ·"
        headline={`${cA.qualified} qualified lead${cA.qualified === 1 ? '' : 's'} in ${LA}, out of ${cA.leads} leads`}>
        <p>The overall picture. This week&apos;s work is on <Link href="/mw/todo" style={{ color: 'inherit' }}>To do</Link>: {doneOf(ready)} of {ready.length} done.</p>
      </MwHero>

      <form className="mw-period" method="get" action="/mw">
        <nav className="mw-planner-cut" aria-label="Compare">
          <Link href={mA === thisMonth ? '/mw' : `/mw?m=${mA}`} aria-current={!compare ? 'true' : undefined}>Month over month</Link>
          <Link href={`/mw?m=${mA}&vs=${mB}`} aria-current={compare ? 'true' : undefined}>Compare two months</Link>
        </nav>
        <span className="mw-period-pick">
          <select name="m" defaultValue={mA} aria-label="Month to show">
            {keys.map(k => <option key={k} value={k}>{label(k)}{isCur(k) ? ' (so far)' : ''}</option>)}
          </select>
          {compare && <>
            <span className="mw-planner-lab">vs</span>
            <select name="vs" defaultValue={mB} aria-label="Month to compare with">
              {keys.map(k => <option key={k} value={k}>{label(k)}</option>)}
            </select>
          </>}
          <button className="mw-planner-btn is-small">Show</button>
        </span>
        <span className="mw-planner-lab">{LA} vs {LB}{isCur(mA) ? ' · traffic compared a day at a time' : ''}</span>
      </form>

      {!d && <section className="mw-card"><p className="mw-planner-lab" style={{ margin: 0 }}>No GA4 or Google Ads snapshot for {label(mA)}, so only the CRM numbers are shown.</p></section>}

      <div className="mw-tiles">
        {tiles.map(t => (
          <div className="mw-tile" key={t.k}>
            <div className="k">{t.k}</div>
            <div className="v">{t.v}</div>
            <div className={`d ${t.tone === 'up' ? 'mw-up' : t.tone === 'dn' || t.tone === 'bad' ? 'mw-dn' : 'mw-nu'}`}>{t.d}</div>
          </div>
        ))}
      </div>

      {d && (
        <div className="mw-home-two">
          <section className="mw-card">
            <h2 style={{ marginBottom: 2 }}>Where visits come from</h2>
            <p className="mw-planner-lab">GA4 · {LA} vs {LB} · {num(sessions)} sessions</p>
            <table className="mw-kw wide" style={{ marginTop: 8 }}>
              <thead><tr><th>Channel</th><th className="num">Sessions</th><th className="num">a day, vs {LB}</th><th className="num">Enquiries</th><th className="num">Rate</th></tr></thead>
              <tbody>
                {ch.map(c => (
                  <tr key={c.n}>
                    <td><span className="mw-swatch" style={{ background: COLORS[c.n] ?? 'var(--mw-line-strong)' }} />{c.n}</td>
                    <td className="num">{num(c.s)}</td>
                    <td className="num">{hasB ? delta(c.s / daysA, c.b.s / daysB) : '—'}</td>
                    <td className="num">{c.sl || <span className="mw-zero">0</span>}</td>
                    <td className="num">{c.s >= 25 ? `${((c.sl / c.s) * 100).toFixed(2)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mw-planner-lab" style={{ marginTop: 6 }}>
              Enquiries: {enquiries} in {LA}{hasB ? <>, {enqB} in {LB}</> : null}. Every enquiry is credited to the Zoho form until Dinesh&apos;s pop-up fix lands.
            </p>
          </section>
          <section className="mw-card mw-donut">
            <h2 style={{ marginBottom: 6 }}>Share of visits</h2>
            <svg viewBox="0 0 140 140" role="img" aria-label="Share of sessions by channel">
              {arcs.map(a => (
                <circle key={a.c.n} cx="70" cy="70" r={R} fill="none" stroke={COLORS[a.c.n] ?? 'var(--mw-line-strong)'} strokeWidth="18"
                  strokeDasharray={`${a.len} ${C - a.len}`} strokeDashoffset={-a.off} transform="rotate(-90 70 70)"><title>{`${a.c.n} · ${pct(a.c.s, sessions)}%`}</title></circle>
              ))}
              <text x="70" y="67" textAnchor="middle" className="mw-donut-v">{num(sessions)}</text>
              <text x="70" y="84" textAnchor="middle" className="mw-donut-k">sessions</text>
            </svg>
            <ul className="mw-legend">
              {ch.slice(0, 5).map(c => <li key={c.n}><span className="mw-swatch" style={{ background: COLORS[c.n] ?? 'var(--mw-line-strong)' }} />{c.n} {pct(c.s, sessions)}%</li>)}
            </ul>
          </section>
        </div>
      )}

      {enq.stored && enq.a.all + enq.b.all > 0 && (
        <div className="mw-home-two">
          <section className="mw-card">
            <h2 style={{ marginBottom: 2 }}>Enquiries by page</h2>
            <p className="mw-planner-lab">
              {LA}: {enq.a.all} enquiries, {enq.a.buyers} from buyers · {LB}: {enq.b.all}, {enq.b.buyers} · the page each form was sent from, from the #Website Leads posts in Zoho Cliq.
              Buyers leave out job seekers, students, fan and birthday screens, and media owners selling their own.
            </p>
            <table className="mw-kw wide" style={{ marginTop: 8 }}>
              <thead><tr><th>Page</th><th className="num">All</th><th className="num">Buyers</th><th className="num">{LB}</th></tr></thead>
              <tbody>
                {enq.byPage.slice(0, 15).map(r => (
                  <tr key={r.key}>
                    <td>{pageLabel(r.key || null)}</td>
                    <td className="num">{r.a || <span className="mw-zero">0</span>}</td>
                    <td className={`num ${r.aBuy > r.bBuy ? 'mw-up' : r.aBuy < r.bBuy ? 'mw-dn' : ''}`}>{r.aBuy || <span className="mw-zero">0</span>}</td>
                    <td className="num">{r.b} <span className="mw-planner-lab">({r.bBuy})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="mw-card">
            <h2 style={{ marginBottom: 2 }}>Enquiries by source / medium</h2>
            <p className="mw-planner-lab">{LA} vs {LB} · as the form recorded it · buyers in brackets for {LB}</p>
            <table className="mw-kw wide" style={{ marginTop: 8 }}>
              <thead><tr><th>Source / medium</th><th className="num">All</th><th className="num">Buyers</th><th className="num">{LB}</th></tr></thead>
              <tbody>
                {enq.bySource.slice(0, 12).map(r => (
                  <tr key={r.key}>
                    <td>{r.key}</td>
                    <td className="num">{r.a || <span className="mw-zero">0</span>}</td>
                    <td className={`num ${r.aBuy > r.bBuy ? 'mw-up' : r.aBuy < r.bBuy ? 'mw-dn' : ''}`}>{r.aBuy || <span className="mw-zero">0</span>}</td>
                    <td className="num">{r.b} <span className="mw-planner-lab">({r.bBuy})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {enq.stored && enq.a.all + enq.b.all > 0 && (
        <section className="mw-card">
          <h2 style={{ marginBottom: 2 }}>Lead intent</h2>
          <p className="mw-planner-lab">
            Read from each enquiry: high names at least two of a site, dates, a quote or budget, a campaign goal; medium one;
            low no detail or a personal request; not a buyer is jobs, students, media owners and vendors · {LA} vs {LB}
          </p>
          <table className="mw-kw" style={{ marginTop: 8 }}>
            <thead><tr><th>Intent</th><th className="num">{LA}</th><th className="num">{LB}</th></tr></thead>
            <tbody>
              {INTENTS.map(i => (
                <tr key={i}>
                  <td>{i[0].toUpperCase() + i.slice(1)}</td>
                  <td className={`num ${i === 'high' ? (enq.a.intent.high > enq.b.intent.high ? 'mw-up' : enq.a.intent.high < enq.b.intent.high ? 'mw-dn' : '') : ''}`}>{enq.a.intent[i]}</td>
                  <td className="num">{enq.b.intent[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mw-home-two" style={{ marginTop: 10 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>High-intent leads by page</h3>
              <table className="mw-kw">
                <thead><tr><th>Page</th><th className="num">{LA}</th><th className="num">{LB}</th></tr></thead>
                <tbody>
                  {enq.highByPage.slice(0, 10).map(r => <tr key={r.key}><td>{pageLabel(r.key || null)}</td><td className="num">{r.a || <span className="mw-zero">0</span>}</td><td className="num">{r.b}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>High-intent leads by source / medium</h3>
              <table className="mw-kw">
                <thead><tr><th>Source / medium</th><th className="num">{LA}</th><th className="num">{LB}</th></tr></thead>
                <tbody>
                  {enq.highBySource.slice(0, 10).map(r => <tr key={r.key}><td>{r.key}</td><td className="num">{r.a || <span className="mw-zero">0</span>}</td><td className="num">{r.b}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {live.length > 0 && (
        <div className="mw-home-two">
          <section className="mw-card">
            <h2 style={{ marginBottom: 2 }}>Organic by market</h2>
            <p className="mw-planner-lab">{LA} · GA4 sessions and enquiries · Search Console movers · non-brand only</p>
            <table className="mw-kw wide" style={{ marginTop: 8 }}>
              <thead><tr><th>Market</th><th className="num">Sessions</th><th className="num">Enquiries</th><th className="num">Non-brand</th><th>Biggest move</th></tr></thead>
              <tbody>
                {[...live].sort((a, b) => b.sessions - a.sessions).map(m => {
                  const up = m.movers.up[0], down = m.movers.down[0]
                  const mv = up && (!down || (up.prev - up.pos) >= (down.pos - down.prev)) ? { k: up, good: true } : down ? { k: down, good: false } : null
                  return (
                    <tr key={m.market.key}>
                      <td><b>{m.market.label}</b></td>
                      <td className="num">{num(m.sessions)}</td>
                      <td className="num">{m.leads || <span className="mw-zero">0</span>}</td>
                      <td className="num">{m.keywords.length ? `${m.nonBrandPct}%` : '—'}</td>
                      <td className={mv ? (mv.good ? 'mw-up' : 'mw-dn') : ''}>{mv ? `"${mv.k.q}" #${pos(mv.k.prev)} → #${pos(mv.k.pos)}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
          <section className="mw-card">
            <h2 style={{ marginBottom: 2 }}>Page health</h2>
            <p className="mw-planner-lab">Every live location page, graded on title, description, H1, structured data, links and length</p>
            <table className="mw-kw" style={{ marginTop: 8 }}>
              <tbody>
                <tr><td>Good</td><td className="num mw-up">{band('good')}</td></tr>
                <tr><td>Needs work</td><td className="num">{band('warn')}</td></tr>
                <tr><td>Bad</td><td className="num mw-dn">{band('bad')}</td></tr>
              </tbody>
            </table>
            <p className="mw-planner-lab" style={{ marginTop: 6 }}><Link href="/mw/seo#health">Every page, graded</Link></p>
            <h3 style={{ margin: '14px 0 2px', fontSize: 14 }}>Losing clicks</h3>
            <p className="mw-planner-lab">Clicks down three months running · Search Console, 16 weeks</p>
            {decay.pages.length ? (
              <ul className="mw-last">
                {decay.pages.slice(0, 6).map(p => <li key={p.page}>{p.page} <span className="mw-dn">{p.blocks.join(' → ')} clicks</span></li>)}
              </ul>
            ) : <p className="mw-planner-lab" style={{ marginTop: 6 }}>No page is losing clicks three months running.</p>}
          </section>
        </div>
      )}

      {buyers.byMarket.length > 0 && (
        <section className="mw-card">
          <h2 style={{ marginBottom: 2 }}>Buyer searches in the top 10</h2>
          <p className="mw-planner-lab">
            The money searches each market is judged on (&ldquo;billboard advertising singapore&rdquo;, not questions or our brand) ·
            Search Console, last 4 weeks to {buyers.latest} vs the 4 weeks before
          </p>
          <table className="mw-kw wide" style={{ marginTop: 8 }}>
            <thead><tr><th>Market</th><th className="num">In the top 10</th><th className="num">4 weeks before</th><th className="num">Ranking at all</th><th>Best one outside the top 10</th></tr></thead>
            <tbody>
              {[...buyers.byMarket].sort((a, b) => b.top10 / b.total - a.top10 / a.total).map(m => {
                const next = buyers.list.filter(p => p.market === m.market && p.pos !== null && p.pos > 10).sort((a, b) => b.impr - a.impr)[0]
                return (
                  <tr key={m.market}>
                    <td><b>{MARKET[m.market]?.label ?? m.market}</b></td>
                    <td className="num">{m.top10} of {m.total}</td>
                    <td className={`num ${m.top10 > m.top10Before ? 'mw-up' : m.top10 < m.top10Before ? 'mw-dn' : ''}`}>{m.top10Before}</td>
                    <td className="num">{m.ranked}</td>
                    <td>{next ? `"${next.query}" #${Math.round(next.pos!)}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="mw-card">
        <h2 style={{ marginBottom: 2 }}>To do, week {week.slice(-2)}</h2>
        <p className="mw-planner-lab">Done or submitted, of each person&apos;s cards. <Link href="/mw/todo">Open To do</Link></p>
        <table className="mw-kw" style={{ marginTop: 8 }}>
          <tbody>
            {team.map(({ p, ts }) => (
              <tr key={p.name}>
                <td><b>{p.name}</b> <span className="mw-planner-lab">{p.title}</span></td>
                <td className={`num ${doneOf(ts) === 0 ? 'mw-dn' : doneOf(ts) === ts.length ? 'mw-up' : ''}`}>{doneOf(ts)} of {ts.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="lede" style={{ marginTop: 8 }}>
        Detail: <Link href="/mw/seo">organic</Link> · <Link href="/mw/gaps">content gap</Link> · <Link href="/mw/people">people</Link>
      </p>
    </div>
  )
}
