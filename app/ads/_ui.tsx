// Shared presentation for the four Facebook Ads sub-tabs. Server components —
// no 'use client' anywhere, so these stay free of client round-trips like the
// rest of the app. Charts are hand-rolled divs, matching FunnelBar; we do NOT
// add a charting library for this.
import Link from 'next/link'
import type { Row, Item } from '@/lib/ads-snapshot'

// ---- formatting ------------------------------------------------------------
// rm() in lib/records rounds to whole ringgit, which is right for cash tabs but
// hides the gap between RM 3.47 and RM 22.35 per conversation. Cents matter here.
export const money = (n: number) => 'RM ' + n.toFixed(2)
export const pct = (n: number) => n.toFixed(1) + '%'
export const num = (n: number) => Number(n).toLocaleString('en-MY')

// Cost per conversation. null (shown as —) when a row got no results, because
// "RM 8.46 ÷ 0" is not infinity, it's "we don't know yet".
export const cpa = (r: { spend: number; convos: number }) => (r.convos > 0 ? r.spend / r.convos : null)
export const showCpa = (r: { spend: number; convos: number }) => {
  const v = cpa(r)
  return v === null ? '—' : money(v)
}
export const byEfficiency = (rows: Row[]) =>
  [...rows].sort((a, b) => (cpa(a) ?? Infinity) - (cpa(b) ?? Infinity))

// Traffic-light tone for a cost-per-conversation figure.
export const tone = (v: number | null) =>
  v === null ? 'nurture' : v < 7 ? 'won' : v < 14 ? 'pending' : 'overdue'

// ---- sub-tab strip ---------------------------------------------------------
export const ADS_TABS = [
  { href: '/ads', label: 'Performance' },
  { href: '/ads/competitors', label: 'Competitors' },
  { href: '/ads/funnel', label: 'Leads & Money' },
  { href: '/ads/playbook', label: 'Playbook' },
]

// `here` is passed by each page rather than read from usePathname(), so this
// stays a server component.
export function SubNav({ here }: { here: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 18px' }}>
      {ADS_TABS.map(t => {
        const on = t.href === here
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              fontSize: 13, fontWeight: 600, padding: '6px 13px', borderRadius: 999,
              textDecoration: 'none',
              background: on ? 'var(--clay)' : 'var(--paper-2)',
              color: on ? 'var(--on-accent)' : 'var(--ink-soft)',
              border: '1px solid ' + (on ? 'var(--clay)' : 'var(--line-2)'),
            }}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

// ---- a breakdown table with an inline share bar ----------------------------
export function Breakdown({
  rows, head, unit = 'Convos', showCtr = false, showDepth = false,
}: {
  rows: Row[]
  head: string
  unit?: string
  showCtr?: boolean
  showDepth?: boolean
}) {
  const maxSpend = Math.max(...rows.map(r => r.spend), 1)
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>{head}</th>
          <th>Spend</th>
          {showCtr && <th>CTR</th>}
          <th>{unit}</th>
          {showDepth && <th>Msg 2</th>}
          <th>Cost each</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const v = cpa(r)
          return (
            <tr key={r.label}>
              <td data-label={head}>{r.label}</td>
              <td data-label="Spend">
                {money(r.spend)}
                <div aria-hidden="true" style={{
                  height: 3, marginTop: 4, borderRadius: 2, background: 'var(--clay-tint)',
                  width: Math.max(2, Math.round((r.spend / maxSpend) * 100)) + '%',
                }} />
              </td>
              {showCtr && <td data-label="CTR">{pct(r.ctr ?? 0)}</td>}
              <td data-label={unit}>{r.convos}</td>
              {showDepth && (
                <td data-label="Msg 2">
                  {r.depth2 ?? 0}
                  {r.convos > 0 && (
                    <span style={{ color: 'var(--dim)', fontSize: 12 }}>
                      {' '}({pct(((r.depth2 ?? 0) / r.convos) * 100)})
                    </span>
                  )}
                </td>
              )}
              <td data-label="Cost each"><span className={`pill ${tone(v)}`}>{showCpa(r)}</span></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---- a spend bar chart, coloured by cost per conversation ------------------
export function CostBars({
  data, labelFor, tickLeft, tickMid, tickRight, caption,
}: {
  data: { spend: number; convos: number; key: string; title: string }[]
  labelFor?: (d: { key: string }) => string
  tickLeft: string
  tickMid: string
  tickRight: string
  caption: React.ReactNode
}) {
  const max = Math.max(...data.map(d => d.spend), 1)
  return (
    <div className="kc">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 96 }}>
        {data.map(d => {
          const v = d.convos > 0 ? d.spend / d.convos : null
          const fill = v === null ? 'var(--mid-tint)'
            : v < 7 ? 'var(--green)'
            : v < 14 ? 'var(--info-fill)'
            : 'var(--bad)'
          return (
            <div key={d.key} style={{ flex: 1, textAlign: 'center' }} title={d.title}>
              <div style={{
                height: Math.max(2, Math.round((d.spend / max) * 80)),
                background: fill, borderRadius: 3,
              }} />
              {labelFor && (
                <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 3 }}>{labelFor(d)}</div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--dim)' }}>{tickLeft}</span>
        <span style={{ fontSize: 11, color: 'var(--dim)' }}>{tickMid}</span>
        <span style={{ fontSize: 11, color: 'var(--dim)' }}>{tickRight}</span>
      </div>
      <p className="s" style={{ marginTop: 10 }}>{caption}</p>
    </div>
  )
}

// ---- two stacked card columns ----------------------------------------------
export function CardCols({ left, right, leftItems, rightItems }: {
  left: string; right: string; leftItems: Item[]; rightItems: Item[]
}) {
  return (
    <div className="cols">
      <div className="col">
        <h3>{left}</h3>
        {leftItems.map(i => (
          <div className="kc" key={i.t}>
            <p className="t"><strong>{i.t}</strong></p>
            <p className="s">{i.s}</p>
          </div>
        ))}
      </div>
      <div className="col">
        <h3>{right}</h3>
        {rightItems.map(i => (
          <div className="kc" key={i.t}>
            <p className="t"><strong>{i.t}</strong></p>
            <p className="s">{i.s}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- small print under a table ---------------------------------------------
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12, color: 'var(--dim)', margin: '8px 0 0', lineHeight: 1.6 }}>
      {children}
    </p>
  )
}
