import { setDecision, clearDecision } from './actions'
import { STATUS_LABEL, CHOICE_LABEL, type ActionRow, type Tally } from '@/lib/mw-actions'

// Action list + decision controls. Plain <form> posts to server actions, so this
// works with no client JavaScript at all — which matters on a phone and on the
// guest tier, where we ship as little as possible.

const IMPACT_LABEL: Record<string, string> = { highest: 'Highest', high: 'High', medium: 'Medium' }

function when(iso?: string | null) {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : new Date(iso).toISOString().slice(0, 10)
}

export function ActionList({ rows }: { rows: ActionRow[] }) {
  return (
    <div>
      {rows.map(r => {
        const d = r.decision
        return (
          <div className="mw-act" key={r.id}>
            <div className="mw-act-head">
              <span className={`mw-pill mw-p-${r.status}`}>{STATUS_LABEL[r.status]}</span>
              {r.cross_channel && <span className="mw-chip">cross-channel</span>}
              <b>{r.title}</b>
              <span className="mw-chip" style={{ marginLeft: 'auto' }}>{IMPACT_LABEL[r.impact] ?? r.impact}</span>
            </div>
            {r.sub && <div className="sub">{r.sub}</div>}
            {r.evidence && (
              <details>
                <summary>Evidence</summary>
                <p>{r.evidence}</p>
              </details>
            )}

            <div className="mw-dec">
              <form action={setDecision} className="mw-dec-btns">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="reason" value={d?.reason ?? ''} />
                {(['accept', 'reject', 'done'] as const).map(c => (
                  <button key={c} name="choice" value={c} data-on={d?.choice === c ? '1' : '0'} type="submit">
                    {CHOICE_LABEL[c]}
                  </button>
                ))}
              </form>

              <span className="state">
                {d ? (
                  <>
                    <strong>{CHOICE_LABEL[d.choice]}</strong>
                    {d.decided_by ? ` · ${d.decided_by}` : ''}{d.updated_at ? ` · ${when(d.updated_at)}` : ''}
                    {d.reason ? <> · <span className="why">&ldquo;{d.reason}&rdquo;</span></> : ''}
                  </>
                ) : 'No decision recorded'}
              </span>

              {d && (
                <form action={clearDecision}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" style={{ font: 'inherit', fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase', background: 'none', border: 0, color: 'var(--mw-ink-3)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                    clear
                  </button>
                </form>
              )}

              {/* Reason box. Always available on a "Won't do" — that reason is the
                  thing worth keeping, so it isn't suggested again next month. */}
              {d?.choice === 'reject' && (
                <form action={setDecision} className="mw-reason">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="choice" value="reject" />
                  <input name="reason" defaultValue={d.reason ?? ''} maxLength={300}
                    placeholder="Why not? Saved so it isn't suggested again." />
                  <button type="submit">Save reason</button>
                </form>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Tracker({ paid, seo, declined }: { paid: Tally; seo: Tally; declined: ActionRow[] }) {
  const t = {
    total: paid.total + seo.total,
    done: paid.done + seo.done, part: paid.part + seo.part, not: paid.not + seo.not,
    accept: paid.accept + seo.accept, reject: paid.reject + seo.reject,
    alreadyDone: paid.alreadyDone + seo.alreadyDone, undecided: paid.undecided + seo.undecided,
  }
  const pc = (x: number, tot: number) => (tot ? (x / tot) * 100 : 0)

  const card = (name: string, x: Tally, href: string) => (
    <div className="mw-tile" style={{ padding: '16px 17px' }}>
      <h3 style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.9px' }}>{x.total}</span>
        <span className="eyebrow">{name} actions</span>
      </h3>
      <div className="mw-seg">
        <i className="d" style={{ width: `${pc(x.done, x.total)}%` }} />
        <i className="p" style={{ width: `${pc(x.part, x.total)}%` }} />
        <i className="n" style={{ width: `${pc(x.not, x.total)}%` }} />
      </div>
      <div className="mw-legend">
        <span><i style={{ background: 'var(--mw-good)' }} />{x.done} done</span>
        <span><i style={{ background: 'var(--mw-warn)' }} />{x.part} part-way</span>
        <span><i style={{ background: 'var(--mw-bad)' }} />{x.not} not started</span>
      </div>
      <a href={href} style={{ fontSize: 13, color: 'var(--mw-brand)', fontWeight: 600, display: 'inline-block', marginTop: 10 }}>
        Open the {name} tab →
      </a>
    </div>
  )

  return (
    <>
      <div className="mw-tiles">
        <div className="mw-tile"><div className="k">Suggested</div><div className="v">{t.total}</div><div className="d mw-nu">{paid.total} paid · {seo.total} SEO</div></div>
        <div className="mw-tile"><div className="k">Done</div><div className="v mw-up">{t.done}</div><div className="d mw-nu">{pc(t.done, t.total).toFixed(0)}% of all</div></div>
        <div className="mw-tile"><div className="k">Part-way</div><div className="v" style={{ color: 'var(--mw-warn)' }}>{t.part}</div></div>
        <div className="mw-tile"><div className="k">Not started</div><div className="v mw-dn">{t.not}</div></div>
        <div className="mw-tile"><div className="k">You decided</div><div className="v">{t.total - t.undecided}<span style={{ fontSize: 15, fontWeight: 600, color: 'var(--mw-ink-2)' }}> of {t.total}</span></div></div>
      </div>

      <div className="mw-split" style={{ marginBottom: 18 }}>
        {card('Paid search', paid, '/mw/paid')}
        {card('SEO & organic', seo, '/mw/seo')}
      </div>

      <p className="eyebrow" style={{ margin: '0 0 9px' }}>Your team&rsquo;s decisions</p>
      <div className="mw-tiles">
        <div className="mw-tile"><div className="k">Will do</div><div className="v mw-up">{t.accept}</div></div>
        <div className="mw-tile"><div className="k">Won&rsquo;t do</div><div className="v mw-dn">{t.reject}</div></div>
        <div className="mw-tile"><div className="k">Already done</div><div className="v">{t.alreadyDone}</div></div>
        <div className="mw-tile"><div className="k">Undecided</div><div className="v mw-nu">{t.undecided}</div></div>
      </div>

      <p className="eyebrow" style={{ margin: '18px 0 9px' }}>Turned down — and why</p>
      {declined.length ? declined.map(r => (
        <div className="mw-declined" key={r.id}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
          <div style={{ fontSize: 13, color: 'var(--mw-ink-2)', fontStyle: r.decision?.reason ? 'italic' : 'normal', marginTop: 2 }}>
            {r.decision?.reason ? `“${r.decision.reason}”` : 'No reason recorded yet — worth adding one.'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--mw-ink-3)', marginTop: 3 }}>
            {r.channel === 'paid' ? 'Paid search' : 'SEO & organic'}
            {r.decision?.decided_by ? ` · ${r.decision.decided_by}` : ''}
            {r.decision?.updated_at ? ` · ${when(r.decision.updated_at)}` : ''}
          </div>
        </div>
      )) : (
        <p className="lede">Nothing turned down yet. Mark an action &ldquo;Won&rsquo;t do&rdquo; and it appears here with your reason, so it isn&rsquo;t suggested again.</p>
      )}
    </>
  )
}
