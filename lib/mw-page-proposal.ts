// 👉 A proposed change to a live page, shown ON that page.
//
// Replaces the old approach in lib/mw-page-content.ts, which wrote a
// standalone HTML file — a section with no surroundings, that could not say
// where it belonged:
//
//   "I kind of feel that the HTML doesn't fit into the page. I would rather
//    prefer you to render the whole page including all the existing content
//    and show me exactly where you would put those additional content...
//    I have to decide where to put it and honestly I can't decide cause I'm
//    also not the designer. I want you to think for me and tell me exactly
//    where to put them."                                 (owner, 12 Oct 2026)
//
// So: fetch the real page, apply the proposed changes to its real markup, mark
// each one in place with a numbered badge, and put a change list at the top
// saying what each one was, what it becomes, and why.
//
// THE SEO RULE IS ENFORCED HERE, NOT REMEMBERED. Every replacement is checked
// against the terms the page already ranks for (docs/SEO-RANKING-PROTECTION.md,
// built by lib/mw-seo-protect.ts). A change that would delete a ranking phrase
// is marked BLOCKED and rendered struck through — it is still shown, because
// hiding it would hide the trade-off, but it cannot be presented as safe.
//
// PURE. HTML in, HTML out. No network: the caller fetches the page.

export type ChangeKind = 'title' | 'meta' | 'heading' | 'section' | 'copy'

export type Evidence = {
  /** Paid: the searches being bought that this change serves. */
  paid?: { term: string; cost: number; clicks: number; conv: number; quality?: string | null }[]
  /** Organic: where the page already sits for the terms involved. */
  organic?: { term: string; pos: number; vol: number }[]
  /** Anything a human must supply or verify before this is published. */
  placeholders?: string[]
}

export type Change = {
  id: string
  kind: ChangeKind
  /** Where it goes, in the owner's terms: "H2 #5" or "above the CTA". */
  where: string
  /** Exact existing text to locate in the markup. Null for a new section. */
  anchor: string | null
  /**
   * 'replace' the anchor text in place; 'before'/'after' put the new block
   * next to the matched ELEMENT; 'before-section'/'after-section' put it
   * outside the whole `<section>` the anchor sits in.
   *
   * The section-level modes exist because the first version did not have them
   * and the result was wrong in a way only a screenshot caught: a new pricing
   * block placed "before the CTA heading" landed two divs deep INSIDE the
   * blue CTA band, inheriting its background. Adjacent to a heading is not the
   * same as before a section, and on a real page the difference is the whole
   * question the owner is asking.
   */
  mode: 'replace' | 'before' | 'after' | 'before-section' | 'after-section'
  was: string | null
  /** Plain text for title/meta/heading; an HTML fragment for a section. */
  now: string
  why: string
  evidence?: Evidence
}

export type ProtectedTerm = { q: string; pos: number; band: 'locked' | 'protect' | 'watch' }

export type Verdict = {
  ok: boolean
  /** Ranking phrases this change would delete from the page entirely. */
  removes: ProtectedTerm[]
  /** Ranking phrases it keeps that were at risk — the reassurance. */
  keeps: ProtectedTerm[]
  /** Ranking phrases it puts on the page that were not there before. */
  adds: ProtectedTerm[]
}

const flat = (s: string) =>
  ' ' + s.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '
const has = (hay: string, term: string) => {
  const t = flat(term).trim()
  return t.length > 0 && flat(hay).includes(' ' + t + ' ')
}

/**
 * Would this change delete a phrase the page ranks for?
 *
 * The test is deliberately whole-page, not local. A term disappearing from the
 * heading being edited is harmless if the same words survive in the body —
 * what matters is whether the PAGE still carries it afterwards. Judging the
 * fragment alone would block safe edits and teach everyone to ignore the flag.
 */
export function checkChange(c: Change, terms: ProtectedTerm[], pageCopy: string): Verdict {
  const binding = terms.filter(t => t.band !== 'watch')
  const after = c.mode === 'replace' && c.was
    ? pageCopy.split(c.was).join(' ' + c.now + ' ')
    : pageCopy + ' ' + c.now

  const removes: ProtectedTerm[] = []
  const keeps: ProtectedTerm[] = []
  const adds: ProtectedTerm[] = []
  for (const t of binding) {
    const before = has(pageCopy, t.q)
    const still = has(after, t.q)
    if (before && !still) removes.push(t)
    else if (before && c.was && has(c.was, t.q)) keeps.push(t)
    else if (!before && still) adds.push(t)
  }
  return { ok: removes.length === 0, removes, keeps, adds }
}

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = (n: number) => `S$${n.toFixed(2)}`

/** The styles and the badge markup injected into the mirrored page. */
const MARK_CSS = `
<style id="mw-proposal">
  .mwp-mark{position:relative!important;outline:3px dashed #2563eb!important;outline-offset:4px!important;
    background:rgba(37,99,235,.07)!important;scroll-margin-top:120px!important}
  .mwp-mark.is-blocked{outline-color:#b91c1c!important;background:rgba(185,28,28,.07)!important}
  .mwp-badge{position:absolute!important;top:-14px!important;left:-14px!important;z-index:2147483646!important;
    background:#2563eb!important;color:#fff!important;font:700 13px/26px system-ui,sans-serif!important;
    width:26px!important;height:26px!important;border-radius:50%!important;text-align:center!important;
    display:block!important;box-shadow:0 2px 6px rgba(0,0,0,.3)!important}
  .mwp-badge.is-blocked{background:#b91c1c!important}
  .mwp-new{border:3px dashed #2563eb!important;background:#f5f8ff!important;padding:28px!important;
    margin:28px auto!important;max-width:1140px!important;border-radius:10px!important;
    font-family:Poppins,system-ui,sans-serif!important;color:#0f172a!important;position:relative!important}
  .mwp-new h2{font-size:30px!important;margin:0 0 14px!important;color:#0f172a!important}
  .mwp-new h3{font-size:19px!important;margin:18px 0 6px!important;color:#1e293b!important}
  .mwp-new p,.mwp-new li{font-size:16px!important;line-height:1.65!important;color:#334155!important}
  .mwp-tag{display:inline-block!important;background:#2563eb!important;color:#fff!important;
    font:600 11px/1 system-ui,sans-serif!important;letter-spacing:.08em!important;text-transform:uppercase!important;
    padding:6px 10px!important;border-radius:4px!important;margin-bottom:12px!important}
  .mwp-todo{background:#fff7ed!important;border-left:4px solid #ea580c!important;padding:10px 14px!important;
    margin:12px 0!important;font-size:14px!important;color:#7c2d12!important}
  .mwp-bar{position:sticky!important;top:0!important;z-index:2147483647!important;background:#0f172a!important;
    color:#fff!important;padding:12px 20px!important;font:600 14px/1.5 system-ui,sans-serif!important;
    text-align:center!important}
  .mwp-panel{background:#fff!important;border-bottom:4px solid #0f172a!important;padding:28px 20px 34px!important;
    font-family:system-ui,sans-serif!important;color:#0f172a!important}
  .mwp-panel .in{max-width:1000px!important;margin:0 auto!important}
  .mwp-panel h1{font-size:26px!important;margin:0 0 6px!important}
  .mwp-panel .sub{color:#475569!important;font-size:15px!important;margin:0 0 22px!important}
  .mwp-c{border:1px solid #e2e8f0!important;border-left:5px solid #2563eb!important;border-radius:8px!important;
    padding:16px 18px!important;margin:0 0 14px!important;background:#fff!important}
  .mwp-c.is-blocked{border-left-color:#b91c1c!important;background:#fef2f2!important}
  .mwp-c .no{display:inline-block!important;background:#2563eb!important;color:#fff!important;width:24px!important;
    height:24px!important;border-radius:50%!important;text-align:center!important;font:700 13px/24px system-ui!important;
    margin-right:8px!important}
  .mwp-c.is-blocked .no{background:#b91c1c!important}
  .mwp-c h3{display:inline!important;font-size:16px!important;margin:0!important}
  .mwp-c .loc{color:#64748b!important;font-size:13px!important;margin:6px 0 10px!important}
  .mwp-ba{font-family:ui-monospace,Menlo,monospace!important;font-size:13px!important;margin:4px 0!important;
    padding:8px 10px!important;border-radius:5px!important;white-space:pre-wrap!important}
  .mwp-was{background:#fef2f2!important;color:#7f1d1d!important;text-decoration:line-through!important}
  .mwp-now{background:#ecfdf5!important;color:#064e3b!important}
  .mwp-why{font-size:14px!important;color:#334155!important;margin:10px 0 0!important;line-height:1.6!important}
  .mwp-ev{font-size:13px!important;color:#475569!important;margin:8px 0 0!important;padding-left:16px!important}
  .mwp-ok{font-size:13px!important;margin:10px 0 0!important;padding:8px 10px!important;border-radius:5px!important;
    background:#ecfdf5!important;color:#065f46!important}
  .mwp-bad{background:#fef2f2!important;color:#991b1b!important}
  .mwp-jump{color:#2563eb!important;font-size:13px!important;text-decoration:underline!important}
</style>`

function changeCard(c: Change, i: number, v: Verdict): string {
  const no = i + 1
  const bad = !v.ok
  const ev = c.evidence ?? {}
  const paid = (ev.paid ?? []).map(p =>
    `<li>Paying for <b>${esc(p.term)}</b> — ${money(p.cost)}, ${p.clicks} click${p.clicks === 1 ? '' : 's'}, ` +
    `${p.conv} conversion${p.conv === 1 ? '' : 's'}${p.quality ? ` · Google rates this landing page <b>${esc(p.quality.toLowerCase().replace('_', ' '))}</b>` : ''}</li>`).join('')
  const org = (ev.organic ?? []).map(o =>
    `<li>Ranks <b>#${o.pos}</b> for <b>${esc(o.term)}</b> (${o.vol.toLocaleString('en-US')} searches a month)</li>`).join('')

  const keeps = v.keeps.length
    ? `<div class="mwp-ok">✓ Keeps the ranking phrase${v.keeps.length > 1 ? 's' : ''} ` +
      v.keeps.map(t => `<b>${esc(t.q)}</b> (#${t.pos})`).join(', ') + '</div>'
    : ''
  const adds = v.adds.length
    ? `<div class="mwp-ok">✚ Puts <b>${v.adds.map(t => esc(t.q)).join('</b>, <b>')}</b> on the page for the first time</div>`
    : ''
  const removes = v.removes.length
    ? `<div class="mwp-ok mwp-bad">✕ <b>BLOCKED.</b> This would delete ` +
      v.removes.map(t => `<b>${esc(t.q)}</b> (#${t.pos})`).join(', ') +
      ` from the page. Not proposed — shown so the trade-off is visible.</div>`
    : ''
  const todo = (ev.placeholders ?? []).length
    ? `<div class="mwp-ok mwp-bad" style="background:#fff7ed!important;color:#7c2d12!important">⚠ Needs a real answer before publishing: ` +
      (ev.placeholders ?? []).map(esc).join('; ') + '</div>'
    : ''

  return `
<div class="mwp-c${bad ? ' is-blocked' : ''}">
  <span class="no">${no}</span><h3>${esc(titleOf(c))}</h3>
  <p class="loc">${esc(c.where)} · <a class="mwp-jump" href="#mwp-${c.id}">jump to it on the page ↓</a></p>
  ${c.was ? `<div class="mwp-ba mwp-was">was: ${esc(c.was)}</div>` : ''}
  <div class="mwp-ba mwp-now">${c.was ? 'now: ' : 'new: '}${esc(c.kind === 'section' ? stripTags(c.now).slice(0, 220) + '…' : c.now)}</div>
  <p class="mwp-why">${c.why}</p>
  ${paid || org ? `<ul class="mwp-ev">${paid}${org}</ul>` : ''}
  ${keeps}${adds}${removes}${todo}
</div>`
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

function titleOf(c: Change): string {
  switch (c.kind) {
    case 'title': return 'Page title — rewritten'
    case 'meta': return 'Meta description — rewritten'
    case 'heading': return 'Heading — reworded'
    case 'section': return 'New section'
    default: return 'Copy — rewritten'
  }
}

export type Proposal = {
  html: string
  filename: string
  /** Plain-text change list, for the plan row and the decision log. */
  summary: string[]
  blocked: number
}

/**
 * Build the mirrored page.
 *
 * `liveHtml` is the page exactly as the server returned it. Scripts are
 * stripped: the mirror must not fire their analytics, load their chat widget,
 * or let a form be submitted from a review copy.
 */
export function buildProposal(opts: {
  url: string
  liveHtml: string
  changes: Change[]
  terms: ProtectedTerm[]
  generatedOn: string
}): Proposal {
  const { url, liveHtml, changes, terms, generatedOn } = opts
  const pageCopy = stripTags(liveHtml.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' '))

  const verdicts = changes.map(c => checkChange(c, terms, pageCopy))

  let html = liveHtml
    // No analytics, no chat widget, no live form posts from a review copy.
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    // Relative assets still resolve, so it looks like the real page.
    .replace(/<head([^>]*)>/i, `<head$1><base href="${esc(url)}">`)

  changes.forEach((c, i) => {
    const v = verdicts[i]
    const cls = v.ok ? 'mwp-mark' : 'mwp-mark is-blocked'
    const badge = `<span class="mwp-badge${v.ok ? '' : ' is-blocked'}">${i + 1}</span>`

    if (c.kind === 'title') {
      html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i,
        `<title>${esc(v.ok ? c.now : c.was ?? c.now)}</title>`)
      return
    }
    if (c.kind === 'meta') {
      html = html.replace(/(<meta\s+name=["']description["']\s+content=")([^"]*)(")/i,
        (_m, a, _old, z) => a + esc(v.ok ? c.now : c.was ?? '') + z)
      return
    }
    if (!c.anchor) return

    // Locate the anchor by its visible text inside an element, so the real
    // markup and its classes survive — a mirror that loses the site's own
    // styling is just the orphan file again.
    const re = new RegExp(`(<(h[1-6]|p|span|div)\\b[^>]*>)((?:(?!</?\\2)[\\s\\S])*?${
      c.anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }(?:(?!</?\\2)[\\s\\S])*?)(</\\2>)`, 'i')

    if (c.mode === 'replace') {
      html = html.replace(re, (_m, open, _tag, inner, close) => {
        const body = v.ok ? inner.replace(c.anchor as string, esc(c.now)) : inner
        const open2 = open.replace(/^<(\w+)/, '<$1 id="mwp-' + c.id + '"')
        return addClass(open2, cls) + badge + body + close
      })
      return
    }
    const block = `
<section id="mwp-${c.id}" class="mwp-new">
  ${badge}<span class="mwp-tag">Proposed · new section ${i + 1}</span>
  ${c.now}
</section>`

    if (c.mode === 'before' || c.mode === 'after') {
      html = html.replace(re, m => (c.mode === 'before' ? block + m : m + block))
      return
    }
    // Section level: step out of whatever wrappers the anchor sits in, so the
    // block becomes a sibling of the band rather than a tenant inside it.
    const at = html.search(re)
    if (at < 0) return
    const sec = enclosingSection(html, at)
    if (!sec) { html = html.replace(re, m => (c.mode === 'before-section' ? block + m : m + block)); return }
    html = c.mode === 'before-section'
      ? html.slice(0, sec.start) + block + html.slice(sec.start)
      : html.slice(0, sec.end) + block + html.slice(sec.end)
  })

  const blocked = verdicts.filter(v => !v.ok).length
  const panel = `
<div class="mwp-bar">⚠ THIS IS A PROPOSAL, NOT THE LIVE SITE — ${esc(url)} · generated ${esc(generatedOn)}</div>
<div class="mwp-panel"><div class="in">
  <h1>${changes.length} proposed change${changes.length === 1 ? '' : 's'} to this page</h1>
  <p class="sub">Each one is numbered and outlined on the page below. Nothing here is live.
    ${blocked ? `<b>${blocked} is blocked</b> because it would remove a phrase the page already ranks for.` : 'None of them removes a phrase the page already ranks for.'}</p>
  ${changes.map((c, i) => changeCard(c, i, verdicts[i])).join('')}
</div></div>`

  html = html.replace(/<\/head>/i, MARK_CSS + '</head>')
  html = html.replace(/<body([^>]*)>/i, `<body$1>${panel}`)

  const slug = url.replace(/^https?:\/\/[^/]+/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'page'
  const summary = changes.map((c, i) => {
    const v = verdicts[i]
    const head = `${i + 1}. ${titleOf(c)} — ${c.where}`
    const body = c.was ? `was "${c.was}" → now "${c.kind === 'section' ? stripTags(c.now).slice(0, 80) + '…' : c.now}"` : `new: ${stripTags(c.now).slice(0, 80)}…`
    const seo = !v.ok ? ` [BLOCKED: removes ${v.removes.map(t => t.q).join(', ')}]`
      : v.keeps.length ? ` [keeps ${v.keeps.map(t => t.q).join(', ')}]` : ''
    return `${head}\n   ${body}${seo}`
  })

  return { html, filename: `${slug}-proposal.html`, summary, blocked }
}

/**
 * The innermost `<section>` that encloses `index`, as [start, end) offsets.
 *
 * Walks the open/close tags with a depth counter rather than regex-matching a
 * pair, because sections nest and a naive match finds the wrong closing tag.
 * Returns null when the anchor is not inside one — the caller then falls back
 * to element-level insertion rather than guessing.
 */
export function enclosingSection(html: string, index: number): { start: number; end: number } | null {
  const tags = [...html.matchAll(/<section\b[^>]*>|<\/section\s*>/gi)]
  const open: number[] = []
  let target: number | null = null
  for (const t of tags) {
    const at = t.index ?? 0
    if (at >= index && target === null) { target = open.length ? open[open.length - 1] : null; break }
    if (t[0][1] === '/') open.pop()
    else open.push(at)
  }
  if (target === null) target = open.length ? open[open.length - 1] : null
  if (target === null) return null

  // Find its matching close, counting nested opens.
  let depth = 0
  for (const t of tags) {
    const at = t.index ?? 0
    if (at < target) continue
    if (t[0][1] === '/') {
      depth--
      if (depth === 0) return { start: target, end: at + t[0].length }
    } else depth++
  }
  return null
}

function addClass(openTag: string, cls: string): string {
  return /class\s*=\s*"/.test(openTag)
    ? openTag.replace(/class\s*=\s*"/, `class="${cls} `)
    : openTag.replace(/^<(\w+)/, `<$1 class="${cls}"`)
}
