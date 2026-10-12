'use client'

import { useState } from 'react'
import { decideProposal } from '../actions'

// Approve / reject beside the download, on the plan page.
//
// Not a page of its own: "I just feel adding another page inside /mw is a bit
// too much page too confusing" (owner, 12 Oct 2026).
//
// The reject box asks WHY, and says plainly that the answer is not final —
// because he asked for that: "do propose again if this becomes relevant and my
// reasoning is not correct. Don't always believe in my judgement." A reason
// box that looks like a final veto would be lying about what happens next.

export type ProposalView = {
  id: string
  kind: string
  where: string
  was: string | null
  now: string
  why: string
  status: 'open' | 'approved' | 'rejected' | 'gone'
  reason: string | null
  decidedBy: string | null
  decidedAt: string | null
  reopenWhy: string | null
  blocked: boolean
  spend: number
  clicks: number
  conv: number
  bestPos: number | null
}

const KIND: Record<string, string> = {
  title: 'Page title', meta: 'Meta description', heading: 'Heading',
  section: 'New section', copy: 'Copy',
}
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

export function ProposalCard({ p }: { p: ProposalView }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const send = async (choice: string, reason?: string) => {
    setBusy(true)
    const fd = new FormData()
    fd.set('id', p.id); fd.set('choice', choice)
    if (reason) fd.set('reason', reason)
    await decideProposal(fd)
    setBusy(false); setOpen(false)
  }

  return (
    <div className={`mw-prop is-${p.status}${p.blocked ? ' is-blocked' : ''}`}>
      <div className="mw-prop-head">
        <b>{KIND[p.kind] ?? p.kind}</b>
        <span className="mw-prop-where">{p.where}</span>
      </div>

      {p.reopenWhy && <p className="mw-prop-reopen">↻ {p.reopenWhy}</p>}

      {p.was && <p className="mw-prop-ba mw-prop-was">{p.was}</p>}
      <p className="mw-prop-ba mw-prop-now">{p.now.length > 180 ? p.now.slice(0, 180) + '…' : p.now}</p>
      <p className="mw-prop-why" dangerouslySetInnerHTML={{ __html: p.why }} />

      <p className="mw-prop-ev">
        {p.spend > 0 && <>S${p.spend.toFixed(2)} a month · {p.clicks} clicks · {p.conv} conversion{p.conv === 1 ? '' : 's'}</>}
        {p.spend > 0 && p.bestPos !== null && ' · '}
        {p.bestPos !== null && <>ranks #{p.bestPos}</>}
        {p.spend === 0 && p.bestPos === null && 'no spend or ranking recorded against this one'}
      </p>

      {p.blocked && (
        <p className="mw-prop-blocked">
          Blocked — this would delete a phrase the page already ranks for. Shown so the trade-off is visible.
        </p>
      )}

      {p.status === 'open' && !open && (
        <div className="mw-prop-acts">
          <button type="button" disabled={busy} className="mw-prop-yes" onClick={() => send('approved')}>Approve</button>
          <button type="button" disabled={busy} className="mw-prop-no" onClick={() => setOpen(true)}>Reject…</button>
        </div>
      )}

      {open && (
        <form
          className="mw-prop-form"
          onSubmit={e => { e.preventDefault(); send('rejected', new FormData(e.currentTarget).get('reason') as string) }}
        >
          <label htmlFor={`r-${p.id}`}>Why not? This is kept, and used to judge the next one.</label>
          <textarea id={`r-${p.id}`} name="reason" rows={2} placeholder="e.g. we do not sell transit in this market" />
          <p className="mw-prop-note">
            Not a permanent no. If the numbers later move against this reason, it comes back —
            with the figure that changed.
          </p>
          <div className="mw-prop-acts">
            <button type="submit" disabled={busy} className="mw-prop-no">Reject it</button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      {p.status !== 'open' && (
        <div className="mw-prop-done">
          <span className={p.status === 'approved' ? 'ok' : 'no'}>
            {p.status === 'approved' ? '✓ Approved' : '✕ Rejected'}
            {p.decidedBy ? ` by ${p.decidedBy}` : ''}{p.decidedAt ? ` · ${day(p.decidedAt)}` : ''}
          </span>
          {p.reason && <span className="mw-prop-reason">“{p.reason}”</span>}
          <button type="button" disabled={busy} onClick={() => send('undo')}>Change my mind</button>
        </div>
      )}
    </div>
  )
}

/** The download, beside the decisions rather than on another screen. */
export function ProposalPage({ slug, url, href, items }: {
  slug: string; url: string; href: string | null; items: ProposalView[]
}) {
  const openCount = items.filter(i => i.status === 'open').length
  const spend = items.reduce((s, i) => s + i.spend, 0)
  return (
    <details className="mw-lead is-ok" open={openCount > 0 && items.length <= 4}>
      <summary>
        <span className="mw-rt ok">{openCount || '✓'}</span>
        <span className="mw-task-main">
          <b>{url.replace(/^https?:\/\/(www\.)?movingwalls\.com/, '')}</b>
          <small>
            {items.length} proposed change{items.length === 1 ? '' : 's'}
            {openCount ? ` · ${openCount} waiting on you` : ' · all decided'}
            {spend > 0 ? ` · S$${spend.toFixed(2)} a month behind them` : ''}
          </small>
        </span>
      </summary>
      <div className="mw-task-body">
        {href
          ? <p><a className="mw-dl" href={href} download={`${slug}-proposal.html`}>⬇ Download the page with these changes on it</a></p>
          : <p className="lede">The rendered page is not stored yet — re-run the proposal script.</p>}
        {items.map(p => <ProposalCard key={p.id} p={p} />)}
      </div>
    </details>
  )
}
