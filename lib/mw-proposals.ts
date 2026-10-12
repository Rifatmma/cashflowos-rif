import 'server-only'
// 👉 Proposed page changes, kept rather than regenerated.
//
// The old generator rebuilt its suggestions on every page load, which meant
// there was no such thing as an old one:
//
//   "check if the suggestion you provided is old or new and if the old ones is
//    not relevant anymore where did you put them?"   (owner, 12 Oct 2026)
//
// Nowhere, was the honest answer. Now every proposed change is a row with a
// decision and a history, and the rendered mirror lives in the vault bucket so
// the plan page stays light.
//
// REJECTIONS ARE NOT FOREVER, and that is his instruction, not my idea:
//
//   "Ask why, but do propose again if this becomes relevant and my reasoning is
//    not correct. Don't always believe in my judgement — every decision musts
//    be a data driven decision and mine isn't always data driven."
//
// So a rejection stores the reason AND the numbers that were true when it was
// given. `reopenStale` re-raises one only when those numbers have moved enough
// to undercut the reason, and says which number moved. Re-raising on the same
// evidence he already saw is nagging, not new information.

import { supabase, supabaseConfigured } from './supabase'
import type { Change } from './mw-page-proposal'

const BUCKET = 'vault'

export type ProposalRow = {
  id: string
  url: string
  slug: string
  change_id: string
  kind: string
  where_: string
  was: string | null
  now_: string
  why: string
  evidence: any
  cycle: string | null
  blocked: boolean
  status: 'open' | 'approved' | 'rejected' | 'gone'
  reason: string | null
  decided_at: string | null
  decided_by: string | null
  reopened_at: string | null
  reopen_why: string | null
  html_path: string | null
  updated_at: string
}

/** Total paid spend behind a change, as recorded when it was raised. */
export const spendOf = (ev: any): number =>
  (ev?.paid ?? []).reduce((s: number, p: any) => s + (Number(p?.cost) || 0), 0)
export const clicksOf = (ev: any): number =>
  (ev?.paid ?? []).reduce((s: number, p: any) => s + (Number(p?.clicks) || 0), 0)
/** Best (lowest) organic position behind it. */
export const bestPos = (ev: any): number | null => {
  const ps = (ev?.organic ?? []).map((o: any) => Number(o?.pos) || 0).filter((n: number) => n > 0)
  return ps.length ? Math.min(...ps) : null
}

/**
 * Write this run's changes for one page.
 *
 * Existing rows keep their decision: re-running the generator must never undo
 * an approval or forget a rejection. Only the evidence and the wording are
 * refreshed, because those are what the next comparison is made against.
 */
export async function saveProposals(opts: {
  url: string; slug: string; cycle: string | null
  changes: { change: Change; blocked: boolean }[]
  html: string; filename: string
}): Promise<{ saved: number; path: string | null }> {
  if (!supabaseConfigured) return { saved: 0, path: null }

  const path = `proposals/${opts.filename}`
  const { error: upErr } = await supabase.storage
    .from(BUCKET).upload(path, Buffer.from(opts.html, 'utf8'), { contentType: 'text/html', upsert: true })
  if (upErr) console.warn('[MW] proposal upload failed:', upErr.message)

  const ids = opts.changes.map(c => `${opts.slug}:${c.change.id}`)
  const { data: existing } = await supabase.from('mw_page_proposals').select('id, status, reason, decided_at, decided_by').in('id', ids)
  const keep = new Map((existing ?? []).map((r: any) => [r.id, r]))

  const rows = opts.changes.map(({ change: c, blocked }) => {
    const id = `${opts.slug}:${c.id}`
    const was = keep.get(id)
    return {
      id, url: opts.url, slug: opts.slug, change_id: c.id, kind: c.kind,
      where_: c.where, was: c.was, now_: c.now, why: c.why,
      evidence: c.evidence ?? {}, cycle: opts.cycle, blocked,
      // Decisions survive a regeneration. Everything else is refreshed.
      status: was?.status ?? 'open',
      reason: was?.reason ?? null,
      decided_at: was?.decided_at ?? null,
      decided_by: was?.decided_by ?? null,
      html_path: upErr ? null : path,
      updated_at: new Date().toISOString(),
    }
  })
  if (rows.length) {
    const { error } = await supabase.from('mw_page_proposals').upsert(rows, { onConflict: 'id' })
    if (error) { console.error('[MW] proposal save failed:', error.message); return { saved: 0, path } }
  }

  // A change this run no longer proposes, that nobody has decided on, is gone
  // — the page moved on. Marked rather than deleted, so "where did the old
  // ones go" has an answer.
  await supabase.from('mw_page_proposals')
    .update({ status: 'gone', updated_at: new Date().toISOString() })
    .eq('slug', opts.slug).eq('status', 'open').not('id', 'in', `(${ids.map(i => `"${i}"`).join(',')})`)

  return { saved: rows.length, path }
}

export async function openProposals(): Promise<ProposalRow[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_page_proposals').select('*')
    .in('status', ['open', 'approved', 'rejected'])
    .order('slug').order('change_id')
  return (data ?? []) as ProposalRow[]
}

export async function decide(id: string, status: 'approved' | 'rejected', by: string, reason?: string) {
  if (!supabaseConfigured) return
  await supabase.from('mw_page_proposals').update({
    status, reason: reason?.trim() ? reason.trim().slice(0, 600) : null,
    decided_by: by.slice(0, 80), decided_at: new Date().toISOString(),
    // A fresh decision clears any earlier re-raise, so the note does not
    // linger next to an answer it is no longer about.
    reopened_at: null, reopen_why: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function undecide(id: string) {
  if (!supabaseConfigured) return
  await supabase.from('mw_page_proposals').update({
    status: 'open', reason: null, decided_at: null, decided_by: null,
    reopened_at: null, reopen_why: null, updated_at: new Date().toISOString(),
  }).eq('id', id)
}

/** How much the evidence must move before a "no" is worth revisiting. */
export const REOPEN_SPEND_X = 1.5
export const REOPEN_POS_GAIN = 5

/**
 * Pure: has the evidence moved far enough to put a rejected change back?
 *
 * Deliberately a high bar. The cost of re-raising too eagerly is that he stops
 * reading the list, which loses every suggestion, not just this one.
 */
export function reopenReason(old: any, now: any): string | null {
  const oldSpend = spendOf(old), newSpend = spendOf(now)
  if (oldSpend > 0 && newSpend >= oldSpend * REOPEN_SPEND_X) {
    return `the spend behind it has gone from S$${oldSpend.toFixed(2)} to S$${newSpend.toFixed(2)} a month`
  }
  if (oldSpend === 0 && newSpend > 0) {
    return `it now has S$${newSpend.toFixed(2)} a month of paid clicks behind it, where it had none`
  }
  const oldPos = bestPos(old), newPos = bestPos(now)
  if (oldPos !== null && newPos !== null && oldPos - newPos >= REOPEN_POS_GAIN) {
    return `the page has climbed from #${oldPos} to #${newPos} for it, so the ranking is now worth defending`
  }
  if (oldPos === null && newPos !== null && newPos <= 20) {
    return `the page now ranks #${newPos} for it, where it did not rank at all`
  }
  return null
}

/**
 * Re-raise rejected changes the data has overtaken.
 *
 * Called by the generator with this run's evidence. Returns what it reopened,
 * for the run log.
 */
export async function reopenStale(slug: string, fresh: Map<string, any>): Promise<string[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('mw_page_proposals').select('id, evidence, reason').eq('slug', slug).eq('status', 'rejected')
  const out: string[] = []
  for (const r of (data ?? []) as any[]) {
    const now = fresh.get(r.id)
    if (!now) continue
    const why = reopenReason(r.evidence, now)
    if (!why) continue
    await supabase.from('mw_page_proposals').update({
      status: 'open', reopened_at: new Date().toISOString(),
      reopen_why: `You turned this down${r.reason ? ` — “${String(r.reason).slice(0, 180)}”` : ''}. Raising it again because ${why}.`,
      updated_at: new Date().toISOString(),
    }).eq('id', r.id)
    out.push(`${r.id}: ${why}`)
  }
  return out
}

/**
 * A link the browser can download the mirror from.
 *
 * `download` matters. Without it Supabase serves the object inline, and it
 * refuses to serve text/html AS html — so the owner clicked the button and got
 * a page of markup on screen instead of a file ("I was redirected to the
 * storage page with codes in it", 12 Oct 2026). The same quirk bit the email
 * proof snapshots a week earlier; I should have remembered it here.
 */
export async function proposalUrl(path: string | null): Promise<string | null> {
  if (!path || !supabaseConfigured) return null
  const name = path.split('/').pop() ?? 'proposal.html'
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60, { download: name })
  return data?.signedUrl ?? null
}
