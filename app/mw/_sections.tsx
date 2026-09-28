import { money, money0, num } from '@/lib/mw-data'
import { saveTargets } from './actions'

// The narrative sections. Everything here is driven by the snapshot — add a row
// to the JSON and it appears; remove one and the section shrinks. No hand-written
// numbers anywhere below this line.

/* ------------------------------------------------ overview context cards */
export function ContextCards({ cards, read }: { cards: { amt: string; tone: string; title: string; detail: string }[]; read?: string }) {
  const edge: Record<string, string> = { good: 'var(--mw-s3)', bad: 'var(--mw-bad)', warn: 'var(--mw-warn)' }
  const col: Record<string, string> = { good: 'var(--mw-good)', bad: 'var(--mw-bad)', warn: 'var(--mw-warn)' }
  return (
    <>
      <div className="mw-split">
        {cards.map((c, i) => (
          <div className="mw-tile" key={i} style={{ borderLeft: `3px solid ${edge[c.tone] ?? 'var(--mw-line)'}`, padding: '16px 17px' }}>
            <div style={{ fontWeight: 800, fontSize: 25, letterSpacing: '-.9px', color: col[c.tone] ?? 'inherit' }}>{c.amt}</div>
            <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 4 }}>{c.title}</div>
            <div style={{ fontSize: 13, color: 'var(--mw-ink-2)', marginTop: 4 }}>{c.detail}</div>
          </div>
        ))}
      </div>
      {read && <p className="lede" style={{ marginTop: 14 }}><strong>The strategic read:</strong> {read}</p>}
    </>
  )
}

/* ------------------------------------------------ targets & pacing */
type Targets = { cpa: number; budget: number; leads: number }

export function Targets({ t, spend, cpl, leads, daysDone, daysMonth }: {
  t: Targets; spend: number; cpl: number; leads: number; daysDone: number; daysMonth: number
}) {
  const pace = daysMonth ? daysDone / daysMonth : 0
  const clamp = (x: number) => Math.max(0, Math.min(100, x * 100))

  const gauge = (lab: string, big: React.ReactNode, sub: string, fill: number, tone: 'ok' | 'warn' | 'bad', marker?: number) => (
    <div className="mw-tile" style={{ padding: '16px 17px' }}>
      <div className="k">{lab}</div>
      <div style={{ fontWeight: 800, fontSize: 23, letterSpacing: '-.8px', fontVariantNumeric: 'tabular-nums', margin: '2px 0 8px' }}>{big}</div>
      <div style={{ height: 10, borderRadius: 999, background: 'var(--mw-line)', position: 'relative', overflow: 'hidden' }}>
        <i style={{ position: 'absolute', inset: '0 auto 0 0', width: `${fill}%`, borderRadius: 999, display: 'block',
          background: tone === 'ok' ? 'var(--mw-good)' : tone === 'warn' ? 'var(--mw-warn)' : 'var(--mw-bad)' }} />
        {marker != null && <b style={{ position: 'absolute', top: -3, bottom: -3, left: `${clamp(marker)}%`, width: 2, background: 'var(--mw-ink)', opacity: .5 }} />}
      </div>
      <div style={{ fontSize: 13, color: 'var(--mw-ink-2)', marginTop: 7 }}>{sub}</div>
    </div>
  )

  const unset = (lab: string, hint: string) => (
    <div className="mw-tile" style={{ padding: '16px 17px' }}>
      <div className="k">{lab}</div>
      <div style={{ fontWeight: 800, fontSize: 23, color: 'var(--mw-ink-3)', margin: '2px 0 8px' }}>—</div>
      <div style={{ height: 10, borderRadius: 999, background: 'var(--mw-line)' }} />
      <div style={{ fontSize: 13, color: 'var(--mw-ink-2)', marginTop: 7 }}>{hint}</div>
    </div>
  )

  const expected = t.leads > 0 ? t.leads * pace : 0
  return (
    <>
      <form action={saveTargets} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
        {([['cpa', 'Target cost per lead (S$)', t.cpa], ['budget', 'Monthly budget (S$)', t.budget], ['leads', 'Monthly lead goal', t.leads]] as const).map(([n, lab, v]) => (
          <label key={n} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="k">{lab}</span>
            <input name={n} type="number" min="0" step="1" defaultValue={v || ''} placeholder="—"
              style={{ width: 130, font: 'inherit', fontSize: 15, padding: '9px 12px', borderRadius: 'var(--mw-r)', border: '.8px solid var(--mw-line-strong)', background: 'var(--mw-surface)', color: 'var(--mw-ink)' }} />
          </label>
        ))}
        <button type="submit" style={{ font: 'inherit', fontSize: 14, fontWeight: 600, padding: '10px 20px', border: 0, borderRadius: 'var(--mw-r)', background: 'var(--mw-brand)', color: '#fff', cursor: 'pointer' }}>
          Save targets
        </button>
      </form>

      <div className="mw-split">
        {t.budget > 0
          ? gauge('Spend vs budget', <>{money0(spend)} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mw-ink-2)' }}>of {money0(t.budget)}</span></>,
              `${Math.round((spend / t.budget) * 100)}% spent · ${Math.round(pace * 100)}% of the month elapsed (marker)`,
              clamp(spend / t.budget), spend / t.budget > pace + 0.08 ? 'warn' : 'ok', pace)
          : unset('Spend vs budget', 'Enter a monthly budget to see pacing')}
        {t.leads > 0
          ? gauge('Leads vs goal', <>{leads} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mw-ink-2)' }}>of {t.leads}</span></>,
              `${leads >= expected ? 'ahead of' : 'behind'} pace — ${expected.toFixed(1)} expected by now`,
              clamp(leads / t.leads), leads >= expected ? 'ok' : leads >= expected * 0.7 ? 'warn' : 'bad', pace)
          : unset('Leads vs goal', 'Enter a monthly lead goal to see pacing')}
        {t.cpa > 0
          ? gauge('Cost per lead vs target', <>{money(cpl)} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mw-ink-2)' }}>vs {money(t.cpa)}</span></>,
              cpl <= t.cpa ? `${Math.round((1 - cpl / t.cpa) * 100)}% under target · marker = target` : `${Math.round((cpl / t.cpa - 1) * 100)}% over target · marker = target`,
              clamp(Math.min(cpl / t.cpa, 2) / 2), cpl <= t.cpa ? 'ok' : cpl <= t.cpa * 1.25 ? 'warn' : 'bad', 0.5)
          : unset('Cost per lead vs target', 'Enter a target cost per lead')}
      </div>
    </>
  )
}

/* ------------------------------------------------ cumulative leads vs pace */
export function PaceChart({ labels, cum, goal, daysMonth }: { labels: string[]; cum: number[]; goal: number; daysMonth: number }) {
  const W = 880, L = 48, R = 96, T = 12, H = 150, n = Math.max(cum.length, 2)
  const MX = Math.max(5, Math.ceil(Math.max(goal, ...cum) / 5) * 5)
  const X = (i: number) => L + (i * (W - L - R)) / (n - 1)
  const Y = (v: number) => T + H - (Math.min(v, MX) / MX) * H
  const line = cum.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('')
  const paceLine = goal > 0 ? cum.map((_, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y((goal * (i + 1)) / daysMonth).toFixed(1)}`).join('') : ''
  const step = Math.max(1, Math.ceil(n / 9))
  const ax = { fontSize: 9.5, fill: 'var(--mw-ink-3)' }
  return (
    <svg viewBox={`0 0 ${W} 195`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img" aria-label="Cumulative leads against goal pace">
      {[0, .25, .5, .75, 1].map(f => { const y = Y(MX * f); return (
        <g key={f}><line x1={L} y1={y} x2={W - R} y2={y} stroke="var(--mw-line)" /><text x={L - 7} y={y + 4} textAnchor="end" {...ax}>{Math.round(MX * f)}</text></g>
      )})}
      {paceLine && <path d={paceLine} fill="none" stroke="var(--mw-ink-3)" strokeWidth="2" strokeDasharray="5 4" />}
      <path d={line} fill="none" stroke="var(--mw-s3)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={X(n - 1)} cy={Y(cum[n - 1])} r="4.5" fill="var(--mw-s3)" stroke="var(--mw-surface)" strokeWidth="2" />
      <text x={X(n - 1) + 10} y={Y(cum[n - 1]) + 4} fontSize="11.5" fontWeight="600" fill="var(--mw-s3)">{cum[n - 1]} actual</text>
      {goal > 0 && (
        <text x={X(n - 1) + 10} y={Y((goal * n) / daysMonth) + 4} fontSize="11.5" fontWeight="600" fill="var(--mw-ink-3)">
          {((goal * n) / daysMonth).toFixed(1)} on pace
        </text>
      )}
      {labels.map((l, i) => i % step === 0 ? <text key={i} x={X(i)} y={T + H + 20} textAnchor="middle" {...ax}>{l}</text> : null)}
      <text x={L - 7} y={9} textAnchor="end" {...ax}>leads</text>
    </svg>
  )
}

/* ------------------------------------------------ campaign scoreboard */
export function Scoreboard({ rows }: { rows: { name: string; sub: string; state: string; spend: number; leads: number; cpl: number | null; note: string }[] }) {
  const pill: Record<string, [string, string]> = {
    'live': ['mw-p-done', 'Live'], 'live-bad': ['mw-p-not', 'Live · 0 leads'],
    'paused-good': ['mw-p-part', 'Paused'], 'paused': ['mw-p-not', 'Paused'],
  }
  return (
    <div className="mw-split">
      {rows.map(c => {
        const [cls, label] = pill[c.state] ?? ['mw-p-not', c.state]
        const good = c.cpl != null && c.cpl < 50
        return (
          <div className="mw-tile" key={c.name} style={{ padding: '17px 18px', boxShadow: c.state.startsWith('live') ? 'inset 3px 0 0 var(--mw-brand)' : 'inset 3px 0 0 var(--mw-line-strong)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.3px' }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--mw-ink-3)' }}>{c.sub}</div>
              </div>
              <span className={`mw-pill ${cls}`}>{label}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, margin: '11px 0 9px' }}>
              <div><div className="k">Spend</div><div style={{ fontWeight: 700, fontSize: 17 }}>{money0(c.spend)}</div></div>
              <div><div className="k">Leads</div><div style={{ fontWeight: 700, fontSize: 17, color: c.leads === 0 ? 'var(--mw-bad)' : 'inherit' }}>{c.leads}</div></div>
              <div><div className="k">Cost/lead</div><div style={{ fontWeight: 700, fontSize: 17, color: c.cpl == null ? 'inherit' : good ? 'var(--mw-good)' : 'var(--mw-bad)' }}>{c.cpl == null ? '—' : money(c.cpl)}</div></div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--mw-ink-2)', borderTop: '.8px solid var(--mw-line)', paddingTop: 9 }}>{c.note}</div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------ beaten by past campaigns */
export function Benchmark({ blocks }: {
  blocks: { metric: string; unit: string; better: string; prefix?: string; rows: { n: string; v: number; live: boolean }[]; who: string; chips: string[] }[]
}) {
  return (
    <div>
      {blocks.map(b => {
        const max = Math.max(...b.rows.map(r => r.v), 0.0001)
        return (
          <div className="mw-card" key={b.metric} style={{ padding: '16px 17px', marginBottom: 10 }}>
            <p className="eyebrow" style={{ marginBottom: 10 }}>{b.metric}</p>
            <div className="mw-bars">
              {b.rows.map(r => (
                <div className="mw-bar" key={r.n}>
                  <span className="nm">{r.n}</span>
                  <span className="tr"><i style={{ width: `${(r.v / max) * 100}%`, background: r.live ? 'var(--mw-s1)' : 'var(--mw-s2)' }} /></span>
                  <span className="val">{b.prefix ?? ''}{r.v}{b.unit}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 11, paddingTop: 10, borderTop: '.8px dashed var(--mw-line-strong)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--mw-ink-3)' }}>{b.who}</span>
              {b.chips.map((c, i) => <span className="mw-chip" key={i}>{c}</span>)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------ money leaks / collisions */
export function Cards({ rows }: { rows: { amt?: string; tone?: string; title: string; detail: string; items?: [string, string][] }[] }) {
  const edge: Record<string, string> = { brand: 'var(--mw-s1)', warn: 'var(--mw-warn)', bad: 'var(--mw-bad)', good: 'var(--mw-s3)' }
  return (
    <div className="mw-split">
      {rows.map((r, i) => (
        <div className="mw-tile" key={i} style={{ padding: '16px 17px', borderLeft: r.tone ? `3px solid ${edge[r.tone] ?? 'var(--mw-line)'}` : undefined }}>
          {r.amt && <div style={{ fontWeight: 800, fontSize: 25, letterSpacing: '-.9px', color: 'var(--mw-bad)' }}>{r.amt}</div>}
          <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: r.amt ? 4 : 0 }}>{r.title}</div>
          <div style={{ fontSize: 13, color: 'var(--mw-ink-2)', marginTop: 4 }}>{r.detail}</div>
          {r.items?.length ? (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: 'var(--mw-ink-2)' }}>
              {r.items.map(([a, b], j) => (
                <li key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span>{a}</span><span style={{ fontWeight: 600, color: 'var(--mw-ink)', fontVariantNumeric: 'tabular-nums' }}>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------ brand vs non-brand */
export function BrandSplit({ rows }: { rows: { market: string; brand: number; nonBrand: number; who: string; chips: string[] }[] }) {
  return (
    <div>
      {rows.map(r => (
        <div className="mw-card" key={r.market} style={{ padding: '16px 17px', marginBottom: 10 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>{r.market}</p>
          <div className="mw-bars">
            <div className="mw-bar"><span className="nm">Brand terms</span><span className="tr"><i style={{ width: `${r.brand}%`, background: 'var(--mw-line-strong)' }} /></span><span className="val">{r.brand}%</span></div>
            <div className="mw-bar"><span className="nm">Non-brand</span><span className="tr"><i style={{ width: `${r.nonBrand}%`, background: 'var(--mw-s3)' }} /></span><span className="val">{r.nonBrand}%</span></div>
          </div>
          <div style={{ marginTop: 11, paddingTop: 10, borderTop: '.8px dashed var(--mw-line-strong)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--mw-ink-3)' }}>{r.who}</span>
            {r.chips.map((c, i) => <span className="mw-chip" key={i}>{c}</span>)}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------ plain tables */
const th: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', borderBottom: '1.5px solid var(--mw-line-strong)', fontWeight: 600, fontSize: 12, color: 'var(--mw-ink-2)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', borderBottom: '.8px solid var(--mw-line)', whiteSpace: 'nowrap' }
const left: React.CSSProperties = { textAlign: 'left', whiteSpace: 'normal' }

export function Opportunities({ rows }: { rows: { kw: string; market: string; pos: number; vol: number; cpc: number }[] }) {
  const tone = (p: number) => (p <= 15 ? 'var(--mw-warn)' : 'var(--mw-bad)')
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr><th style={{ ...th, ...left }}>Keyword</th><th style={th}>Market</th><th style={th}>Position</th><th style={th}>Volume</th><th style={th}>Paid CPC</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.kw + r.market}>
              <td style={{ ...td, ...left, fontWeight: 600 }}>{r.kw}</td>
              <td style={td}>{r.market}</td>
              <td style={{ ...td, color: tone(r.pos), fontWeight: 700 }}>{r.pos}</td>
              <td style={{ ...td, fontWeight: r.vol >= 800 ? 700 : 400 }}>{num(r.vol)}</td>
              <td style={td}>${r.cpc.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Markets({ rows }: { rows: { m: string; sessions: number; leads: number; kw: number | null; paid: string }[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr><th style={{ ...th, ...left }}>Market</th><th style={th}>Sessions</th><th style={th}>Leads</th><th style={th}>Semrush keywords</th><th style={th}>Paid running?</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.m} style={r.leads > 5 ? { background: 'var(--mw-surface-2)' } : undefined}>
              <td style={{ ...td, ...left, fontWeight: 600 }}>{r.m}</td>
              <td style={td}>{num(r.sessions)}</td>
              <td style={{ ...td, color: r.leads > 5 ? 'var(--mw-good)' : 'inherit', fontWeight: r.leads > 5 ? 700 : 400 }}>{r.leads}</td>
              <td style={{ ...td, color: r.kw != null && r.kw < 10 ? 'var(--mw-bad)' : 'inherit', fontWeight: r.kw != null && r.kw > 150 ? 700 : 400 }}>{r.kw ?? '—'}</td>
              <td style={{ ...td, color: r.paid === 'No' ? 'var(--mw-ink-3)' : 'inherit' }}>{r.paid}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CompetitorTable({ rows, authority, refDomains }: { rows: { n: string; kw: number; tr: number; me: boolean }[]; authority: number; refDomains: number }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr><th style={{ ...th, ...left }}>Domain</th><th style={th}>Keywords</th><th style={th}>Organic traffic</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.n} style={r.me ? { background: 'var(--mw-surface-2)' } : undefined}>
              <td style={{ ...td, ...left, fontWeight: r.me ? 700 : 400 }}>{r.n}{r.me ? ` · authority ${authority}, ${num(refDomains)} ref. domains` : ''}</td>
              <td style={{ ...td, color: r.me ? 'var(--mw-bad)' : 'inherit', fontWeight: 700 }}>{r.kw}</td>
              <td style={td}>{num(r.tr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
