'use client'

import { StatusControl } from '../_status-control'
import { stageOfProposal } from '@/lib/mw-status'

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
  // The open/busy state and the reject form moved into StatusControl, which
  // every kind of decision on this screen now shares.
  return (
    <div className={`mw-prop is-${p.status}${p.blocked ? ' is-blocked' : ''}`}>
      <div className="mw-prop-head">
        <b>{KIND[p.kind] ?? p.kind}</b>
        <span className="mw-prop-where">{p.where}</span>
      </div>

      {p.reopenWhy && <p className="mw-prop-reopen">↻ {p.reopenWhy}</p>}

      {p.was && <p className="mw-prop-ba mw-prop-was">{p.was}</p>}
      <p className="mw-prop-ba mw-prop-now">{p.now.length > 180 ? p.now.slice(0, 180) + '…' : p.now}</p>
      <p className="mw-prop-why">{richText(p.why)}</p>

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

      {/* ONE CONTROL, the same as a task and a city page. The three-way
          Approve / Reject… / Change-my-mind gesture is gone: the state it is
          in and the states it could be in are now the same row of buttons,
          and "Not doing" asks why, as it did before. The reason still
          matters — it is what lets a rejected proposal come back when the
          numbers move against the reason given. */}
      <StatusControl kind="proposal" id={p.id} stage={stageOfProposal(p.status)} reason={p.reason} />

      {p.status !== 'open' && (
        <p className="mw-prop-done">
          <span className={p.status === 'approved' ? 'ok' : 'no'}>
            {p.decidedBy ? `${p.decidedBy}` : 'Decided'}{p.decidedAt ? ` · ${day(p.decidedAt)}` : ''}
          </span>
          {p.reason && <span className="mw-prop-reason">“{p.reason}”</span>}
        </p>
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

/**
 * The reason text carries a little emphasis (<b>, <strong>, <em>) and nothing
 * else. It used to be injected as raw HTML; now every tag except those three is
 * dropped and the text is rendered as text, so a proposal can never carry script.
 */
function richText(html: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  const parts = String(html ?? '').split(/(<\/?(?:b|strong|em)>)/i)
  let bold = false, em = false
  parts.forEach((part, i) => {
    const tag = part.toLowerCase()
    if (tag === '<b>' || tag === '<strong>') { bold = true; return }
    if (tag === '</b>' || tag === '</strong>') { bold = false; return }
    if (tag === '<em>') { em = true; return }
    if (tag === '</em>') { em = false; return }
    const text = decode(part.replace(/<[^>]*>/g, ''))
    if (!text) return
    out.push(bold ? <b key={i}>{text}</b> : em ? <em key={i}>{text}</em> : text)
  })
  return out
}
