// Shared pieces for the four Facebook Ads tabs.
//
// PHONE FIRST. The owner checks these standing up, a few seconds at a time. So:
// no tables (they collapse into walls of cards on a phone), every number in
// IBM Plex Mono, bars instead of grids, and the tab strip scrolls sideways
// rather than wrapping onto a second line.
//
// Server components only. Styling lives in app/globals.css under "FACEBOOK ADS";
// the card/row/track classes are shared with Cash Out (co-*) so the two sections
// read as one product.
import Link from 'next/link'
import type { ReactNode } from 'react'

// ---- formatting -------------------------------------------------------------
export const money = (x: number) => 'RM ' + Number(x || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const plain = (x: number) => Number(x || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const num = (x: number) => Math.round(x || 0).toLocaleString('en-MY')
export const pct = (x: number, dp = 1) => `${(Number.isFinite(x) ? x : 0).toFixed(dp)}%`
export const per = (spend: number, count: number) => (count > 0 ? spend / count : null)

// ---- the header every tab shares ------------------------------------------------
const TABS = [
  { href: '/ads', label: 'Performance' },
  { href: '/ads/competitors', label: 'Competitors' },
  { href: '/ads/funnel', label: 'Leads and money' },
  { href: '/ads/playbook', label: 'Playbook' },
]

/**
 * How old the numbers are, said plainly. Green while current, red past the
 * `staleAfter` days -- so three-week-old figures can never pass for today's.
 */
export function Fresh({ at, staleAfter = 7, verb = 'updated', error }: { at: string; staleAfter?: number; verb?: string; error?: string | null }) {
  const t = Date.parse(at)
  const ageDays = Math.floor((Date.now() - t) / 86_400_000)
  const myt = new Date(t + 8 * 3600_000)
  const hhmm = `${String(myt.getUTCHours()).padStart(2, '0')}:${String(myt.getUTCMinutes()).padStart(2, '0')}`
  const day = `${myt.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][myt.getUTCMonth()]}`
  const stale = ageDays > staleAfter
  const text =
    ageDays <= 0 ? `${verb} today ${hhmm}`
    : ageDays === 1 ? `${verb} yesterday`
    : stale ? `${verb} ${day} · ${ageDays} days old`
    : `${verb} ${ageDays} days ago`
  return (
    <span className={`ad-fresh mono ${stale ? 'stale' : ''}`} title={error ? `Last refresh failed: ${error}` : undefined}>
      <span aria-hidden="true">●</span> {text}
    </span>
  )
}

export function AdsHeader({ title, here, right }: { title: string; here: string; right?: ReactNode }) {
  return (
    <header className="ad-head">
      <div className="eyebrow">Facebook ads</div>
      <div className="ad-titlerow">
        <h1 className="ph">{title}</h1>
        {right}
      </div>
      <nav className="ad-tabs" aria-label="Facebook ads sections">
        {TABS.map(t => (
          <Link key={t.href} href={t.href} className={t.href === here ? 'on' : undefined}
            aria-current={t.href === here ? 'page' : undefined}>{t.label}</Link>
        ))}
      </nav>
    </header>
  )
}

// ---- building blocks -----------------------------------------------------------
export function Card({ children, eyebrow, right, tone, className }: {
  children: ReactNode; eyebrow?: string; right?: ReactNode; tone?: 'bad' | 'warn'; className?: string
}) {
  return (
    <section className={`co-card ${tone ? 'ad-tone-' + tone : ''} ${className ?? ''}`}>
      {(eyebrow || right) && (
        <div className="co-row" style={{ marginBottom: 8 }}>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function Mini({ label, value, sub, subTone }: { label: string; value: ReactNode; sub?: ReactNode; subTone?: 'good' | 'bad' }) {
  return (
    <div className="ad-mini">
      <div className="eyebrow">{label}</div>
      <div className="ad-mini-v num">{value}</div>
      {sub && <div className={`ad-mini-s ${subTone ? 'ad-' + subTone : ''}`}>{sub}</div>}
    </div>
  )
}

export type Bar = { label: string; value: number; display: string; sub?: string; tone?: 'good' | 'bad' | 'neutral' }

/** A labelled list of bars -- the phone-friendly replacement for a breakdown table. */
export function BarList({ rows, max }: { rows: Bar[]; max?: number }) {
  const top = max ?? Math.max(...rows.map(r => r.value), 1)
  return (
    <div className="ad-bars">
      {rows.map(r => (
        <div key={r.label} className="co-bar">
          <div className="co-row">
            <span>{r.label}{r.sub && <span className="co-dim"> · {r.sub}</span>}</span>
            <span className="num">{r.display}</span>
          </div>
          <div className="co-track" aria-hidden="true">
            <div className="co-fill" style={{
              width: `${Math.max(2, (r.value / top) * 100)}%`,
              background: r.tone === 'bad' ? 'var(--bad)' : r.tone === 'good' ? 'var(--green)' : 'var(--info-fill)',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// `up` is which way the NUMBER moved; `good` is whether that's good news. They
// are separate on purpose: cost per chat going UP is bad, reach going UP is good.
// One arrow trying to mean both ("green ▲ = better") read as "cost rose" when it
// had fallen -- caught on the first screenshot.
export type Cmp = { k: string; now: string; was: string; good?: boolean | null; up?: boolean | null }

/** "metric · now · before" rows that stay rows on a phone. */
export function CompareRows({ rows, nowLabel = 'Now', wasLabel = 'Before' }: { rows: Cmp[]; nowLabel?: string; wasLabel?: string }) {
  return (
    <div className="ad-cmp">
      <div className="ad-cmp-row ad-cmp-head eyebrow">
        <span /> <span>{nowLabel}</span> <span>{wasLabel}</span>
      </div>
      {rows.map(r => (
        <div key={r.k} className="ad-cmp-row">
          <span className="ad-cmp-k">{r.k}</span>
          <span className="num ad-cmp-now">
            {r.now}
            {r.up !== undefined && r.up !== null && (
              <span className={r.good === true ? 'ad-good' : r.good === false ? 'ad-bad' : 'co-dim'}
                aria-label={`${r.up ? 'up' : 'down'}${r.good === true ? ', better' : r.good === false ? ', worse' : ''}`}>
                {r.up ? ' ▲' : ' ▼'}
              </span>
            )}
          </span>
          <span className="num co-dim">{r.was}</span>
        </div>
      ))}
    </div>
  )
}

/** A folded section with a clear title -- where the slower reading lives. */
export function Fold({ title, meta, children, open }: { title: string; meta?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="co-card co-fold" open={open}>
      <summary>
        <span>{title}</span>
        {meta && <span className="co-dim num">{meta}</span>}
      </summary>
      <div className="ad-fold-body">{children}</div>
    </details>
  )
}

/** A stamp for writing that does NOT update with the numbers. */
export function Written({ on }: { on: string }) {
  const d = new Date(on + 'T12:00:00Z')
  const label = `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`
  return <p className="ad-written mono">Written {label} · ask Claude to rewrite it on fresh numbers</p>
}

/** A tiny trend line: lines only, stretched to the card (text never goes in here). */
export function Spark({ values, tone = 'good' }: { values: number[]; tone?: 'good' | 'bad' }) {
  if (values.length < 2) return null
  const w = 300, h = 44, pad = 4
  const lo = Math.min(...values), hi = Math.max(...values)
  const y = (v: number) => pad + (1 - (hi === lo ? 0.5 : (v - lo) / (hi - lo))) * (h - pad * 2)
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="ad-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={tone === 'bad' ? 'var(--bad)' : 'var(--green)'}
        strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Vertical bars, e.g. one per day or per hour, coloured by cost per result. */
export function Columns({ cols, ticks }: {
  cols: { key: string; value: number; tone: 'good' | 'mid' | 'bad' | 'none'; title: string }[]
  ticks: [string, string, string]
}) {
  const top = Math.max(...cols.map(c => c.value), 1)
  return (
    <div className="ad-cols-wrap">
      <div className="ad-cols">
        {cols.map(c => (
          <span key={c.key} title={c.title} className={`ad-col ad-col-${c.tone}`}
            style={{ height: `${Math.max(3, (c.value / top) * 100)}%` }} />
        ))}
      </div>
      <div className="ad-cols-ticks mono"><span>{ticks[0]}</span><span>{ticks[1]}</span><span>{ticks[2]}</span></div>
    </div>
  )
}
