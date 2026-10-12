'use client'

import { useState } from 'react'
import { setCityStatusAction } from '../actions'

// The hyperlocal pages, with the lead's own progress on each.
//
// Status is per task and set by the owner — his choice over ticking individual
// changes: "Per task, by the owner" (12 Oct 2026). Three states, no workflow,
// nothing to learn.

export type CityView = {
  url: string; city: string; market: string
  kind: 'misrouted' | 'near' | 'lowctr' | 'deep' | 'quiet'
  says: string; cost: number; clicks: number; pos: number | null
  terms: string[]; words: number | null; landsOn: string[]
  status: 'not_started' | 'in_progress' | 'done'
  statusBy: string | null; statusAt: string | null
}

const NEXT: Record<CityView['status'], CityView['status']> = {
  not_started: 'in_progress', in_progress: 'done', done: 'not_started',
}
const LABEL = { not_started: 'Not started', in_progress: 'In progress', done: 'Done' } as const
const KIND = {
  misrouted: { tag: 'Ads sent elsewhere', cls: 'bad' },
  lowctr: { tag: 'Ranks well, nobody clicks', cls: 'warn' },
  near: { tag: 'One push from page one', cls: 'warn' },
  deep: { tag: 'Seen a lot, buried', cls: 'warn' },
  quiet: { tag: 'Barely shown', cls: 'calm' },
} as const
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

export function CityCard({ c }: { c: CityView }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(c.status)

  const cycle = async () => {
    const next = NEXT[status]
    setBusy(true); setStatus(next)
    const fd = new FormData(); fd.set('url', c.url); fd.set('status', next)
    await setCityStatusAction(fd)
    setBusy(false)
  }

  return (
    <div className={`mw-city is-${status} is-${KIND[c.kind].cls}`}>
      <div className="mw-city-head">
        <b>{c.city}</b>
        <code>{c.url}</code>
        <span className={`mw-city-tag ${KIND[c.kind].cls}`}>{KIND[c.kind].tag}</span>
        {c.cost > 0 && <span className="mw-city-cost">S${c.cost.toFixed(2)}/mo · {c.clicks} clicks</span>}
      </div>

      <p className="mw-city-says">{c.says}</p>

      {c.terms.length > 0 && (
        <p className="mw-city-terms">
          {c.kind === 'misrouted' ? 'Bought for: ' : 'Ranks for: '}
          {c.terms.slice(0, 5).map(t => <code key={t}>{t}</code>)}
        </p>
      )}

      {c.kind === 'misrouted' && c.landsOn.length > 0 && (
        <p className="mw-city-fix">
          <b>The fix:</b> point those ad groups at <code>{c.url}</code> instead of{' '}
          <code>{c.landsOn.join(', ')}</code>. No copy changes — the page is already written for these searches.
        </p>
      )}

      <div className="mw-city-foot">
        <button type="button" disabled={busy} onClick={cycle} className={`mw-city-status is-${status}`}>
          {LABEL[status]}
        </button>
        {status !== 'not_started' && c.statusBy && (
          <span className="mw-city-by">{c.statusBy}{c.statusAt ? ` · ${day(c.statusAt)}` : ''}</span>
        )}
        <a href={`https://www.movingwalls.com${c.url}`} target="_blank" rel="noreferrer">Open the page ↗</a>
      </div>
    </div>
  )
}

export function CityBoard({ cities }: { cities: CityView[] }) {
  const [show, setShow] = useState<'live' | 'all'>('live')
  const live = cities.filter(c => c.kind !== 'quiet' || c.status !== 'not_started')
  const list = show === 'live' ? live : cities
  const quiet = cities.length - live.length

  return (
    <>
      {quiet > 0 && (
        <div className="mw-filters" style={{ marginBottom: 14 }}>
          <button type="button" onClick={() => setShow('live')} aria-current={show === 'live' ? 'page' : undefined}>
            Needs a decision ({live.length})
          </button>
          <button type="button" onClick={() => setShow('all')} aria-current={show === 'all' ? 'page' : undefined}>
            Every city page ({cities.length})
          </button>
        </div>
      )}
      {list.map(c => <CityCard key={c.url} c={c} />)}
      {show === 'live' && quiet > 0 && (
        <p className="lede" style={{ marginTop: 12 }}>
          {quiet} more city pages have no position Semrush can see and nothing being spent on them. They are
          built, long enough and linked — there is no evidence they are broken, so they are not presented as work.
        </p>
      )}
    </>
  )
}
