import Link from 'next/link'
import type { Alert } from '@/lib/mw-data'

// Shared furniture for the three Moving Walls tabs. Server components only.
// Styling lives in mw.css, scoped under .mw — see app/mw/layout.tsx.

export function MwHero({
  tab, pulled, stale, headline, children,
}: {
  tab: 'overview' | 'paid' | 'seo'
  pulled: string
  stale: boolean
  headline: string
  children?: React.ReactNode
}) {
  const tabs = [
    { key: 'overview', href: '/mw', label: 'Overview' },
    { key: 'paid', href: '/mw/paid', label: 'Paid search' },
    { key: 'seo', href: '/mw/seo', label: 'SEO & organic' },
  ] as const
  return (
    <>
      <div className="mw-hero">
        <span className="mw-dot" style={{ width: 6, height: 6, top: '20%', right: '8%' }} />
        <span className="mw-dot" style={{ width: 4, height: 4, top: '56%', right: '16%', opacity: .6 }} />
        <span className="mw-dot" style={{ width: 3, height: 3, top: '32%', right: '25%', opacity: .5 }} />
        <span className="mw-dot" style={{ width: 5, height: 5, bottom: '16%', right: '5%', opacity: .7 }} />
        <p className="eyebrow"><i />Moving Walls · Google Ads · GA4 · Semrush · pulled {pulled}</p>
        <h1>{headline}</h1>
        {children}
        {stale && (
          <p style={{ color: '#FDE68A' }}>
            ⚠ More than two days old — the daily refresh hasn&rsquo;t landed.
          </p>
        )}
      </div>
      <nav className="mw-tabs">
        {tabs.map(t => (
          <Link key={t.key} href={t.href} aria-current={t.key === tab ? 'page' : undefined}>{t.label}</Link>
        ))}
      </nav>
    </>
  )
}

export function Tiles({ items }: { items: { k: string; v: string; d?: string; tone?: 'up' | 'dn' }[] }) {
  return (
    <div className="mw-tiles">
      {items.map(i => (
        <div className="mw-tile" key={i.k}>
          <div className="k">{i.k}</div>
          <div className="v">{i.v}</div>
          {i.d && <div className={`d ${i.tone === 'up' ? 'mw-up' : i.tone === 'dn' ? 'mw-dn' : 'mw-nu'}`}>{i.d}</div>}
        </div>
      ))}
    </div>
  )
}

export function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mw-card">
      <h2 style={{ marginBottom: sub ? 5 : 14 }}>{title}</h2>
      {sub && <p className="lede" style={{ marginBottom: 14 }}>{sub}</p>}
      {children}
    </section>
  )
}

export function Alerts({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) {
    return <p className="lede">Nothing crossed a threshold this month. Every channel is inside its normal band.</p>
  }
  return (
    <div>
      {alerts.map((a, i) => (
        <div className={`mw-alert mw-${a.sev}`} key={i}>
          <div>
            <div className="t">{a.title}</div>
            <div className="d">{a.detail}</div>
          </div>
          <div className="mv">{a.move}</div>
        </div>
      ))}
      <p className="lede" style={{ marginTop: 12, fontSize: 12.5, color: 'var(--mw-ink-3)' }}>
        Thresholds: a channel moving 50%+ per day on 300+ sessions, any channel over 1,000 sessions
        with zero leads, and leads per day halving on a channel that previously converted.
      </p>
    </div>
  )
}

export function Bars({ rows, max, unit = '' }: {
  rows: { label: string; value: number; display: string; tone?: 'good' | 'bad' | 'dim' | 'brand' }[]
  max: number; unit?: string
}) {
  const colour = { good: 'var(--mw-s3)', bad: 'var(--mw-s2)', brand: 'var(--mw-s1)', dim: 'var(--mw-line-strong)' }
  return (
    <div className="mw-bars">
      {rows.map((r, i) => (
        <div className="mw-bar" key={i}>
          <span className="nm">{r.label}</span>
          <span className="tr">
            <i style={{ width: `${max > 0 ? Math.min(100, (r.value / max) * 100) : 0}%`, background: colour[r.tone ?? 'brand'] }} />
          </span>
          <span className="val">{r.display}{unit}</span>
        </div>
      ))}
    </div>
  )
}

const nice = (v: number) => {
  if (v <= 0) return 1
  const e = 10 ** Math.floor(Math.log10(v))
  const f = v / e
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e
}

/** Paired bars: spend per day on top, leads underneath, one shared x axis. */
export function SpendLeadChart({ labels, cost, leads }: { labels: string[]; cost: number[]; leads: number[] }) {
  const W = 880, L = 48, R = 14, n = Math.max(labels.length, 1)
  const band = (W - L - R) / n, bw = Math.max(band - 6, 2)
  const T1 = 14, H1 = 120, T2 = 168, H2 = 56
  const MX1 = nice(Math.max(...cost, 1))
  const MX2 = Math.max(4, 2 * Math.ceil(Math.max(...leads, 1) / 2))
  const step = Math.max(1, Math.ceil(n / 10))
  const ax = { fontSize: 9.5, fill: 'var(--mw-ink-3)' }
  return (
    <svg viewBox={`0 0 ${W} 250`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img" aria-label="Daily paid spend and leads">
      {[0, .25, .5, .75, 1].map(f => { const y = T1 + H1 - f * H1; return (
        <g key={'a' + f}><line x1={L} y1={y} x2={W - R} y2={y} stroke="var(--mw-line)" /><text x={L - 7} y={y + 4} textAnchor="end" {...ax}>{Math.round(MX1 * f)}</text></g>
      )})}
      {cost.map((v, i) => { const h = (v / MX1) * H1; return (
        <rect key={'c' + i} x={L + i * band + 3} y={T1 + H1 - h} width={bw} height={h} rx="3" fill="var(--mw-s1)"><title>{`${labels[i]} · S$${v.toFixed(2)} · ${leads[i]} lead(s)`}</title></rect>
      )})}
      {[0, .5, 1].map(f => { const y = T2 + H2 - f * H2; return (
        <g key={'b' + f}><line x1={L} y1={y} x2={W - R} y2={y} stroke="var(--mw-line)" /><text x={L - 7} y={y + 4} textAnchor="end" {...ax}>{Math.round(MX2 * f)}</text></g>
      )})}
      {leads.map((v, i) => { const h = Math.max((v / MX2) * H2, 2); return (
        <rect key={'l' + i} x={L + i * band + 3} y={T2 + H2 - h} width={bw} height={h} rx="3" fill={v ? 'var(--mw-s3)' : 'var(--mw-line-strong)'}><title>{`${labels[i]} · ${v} lead(s)`}</title></rect>
      )})}
      {labels.map((l, i) => i % step === 0 ? <text key={'x' + i} x={L + i * band + band / 2} y={T2 + H2 + 17} textAnchor="middle" {...ax}>{l}</text> : null)}
      <text x={L - 7} y={10} textAnchor="end" {...ax}>S$</text>
      <text x={L - 7} y={T2 - 5} textAnchor="end" {...ax}>leads</text>
    </svg>
  )
}

/** Organic sessions area, with a dot on every day that produced a lead. */
export function OrganicTrend({ start, sessions, leads }: { start: string; sessions: number[]; leads: number[] }) {
  const W = 880, L = 44, R = 14, T = 12, H = 150, n = Math.max(sessions.length, 2)
  const MX = nice(Math.max(...sessions, 1))
  const X = (i: number) => L + (i * (W - L - R)) / (n - 1)
  const Y = (v: number) => T + H - (v / MX) * H
  const line = sessions.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const d0 = new Date(start + 'T00:00:00')
  const label = (i: number) => { const d = new Date(d0.getTime() + i * 864e5); return `${d.getDate()} ${MON[d.getMonth()]}` }
  const step = Math.max(1, Math.ceil(n / 8))
  const ax = { fontSize: 9.5, fill: 'var(--mw-ink-3)' }
  return (
    <svg viewBox={`0 0 ${W} 190`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img" aria-label="Organic sessions per day, lead days marked">
      {[0, .25, .5, .75, 1].map(f => { const y = Y(MX * f); return (
        <g key={f}><line x1={L} y1={y} x2={W - R} y2={y} stroke="var(--mw-line)" /><text x={L - 7} y={y + 4} textAnchor="end" {...ax}>{Math.round(MX * f)}</text></g>
      )})}
      <path d={`${line}L${X(n - 1).toFixed(1)},${Y(0).toFixed(1)}L${X(0).toFixed(1)},${Y(0).toFixed(1)}Z`} fill="var(--mw-s1)" opacity=".10" />
      <path d={line} fill="none" stroke="var(--mw-s1)" strokeWidth="2" strokeLinejoin="round" />
      {leads.map((v, i) => v ? (
        <circle key={i} cx={X(i)} cy={Y(sessions[i])} r={3.5 + v} fill="var(--mw-s3)" stroke="var(--mw-surface)" strokeWidth="1.5"><title>{`${label(i)} · ${sessions[i]} sessions · ${v} lead(s)`}</title></circle>
      ) : null)}
      {sessions.map((_, i) => i % step === 0 ? <text key={'x' + i} x={X(i)} y={T + H + 18} textAnchor="middle" {...ax}>{label(i)}</text> : null)}
    </svg>
  )
}
