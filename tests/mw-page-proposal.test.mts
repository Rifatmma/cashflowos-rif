// Proposals shown on the real page: does the block land where the summary
// says it lands, and does the ranking rule actually block anything?
//   npx -y tsx --conditions=react-server tests/mw-page-proposal.test.mts
//
// The placement tests exist because the first version got it wrong in a way
// only a screenshot caught. A pricing block placed "before the CTA heading"
// landed two divs deep INSIDE the blue CTA band and inherited its background.
// Adjacent to a heading is not the same as before a section, and on a real
// page that difference is the entire question being asked.

import { buildProposal, checkChange, enclosingSection, type Change, type ProtectedTerm } from '../lib/mw-page-proposal'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

// A page shaped like theirs: a heading wrapped in two divs inside a coloured
// section, which is what broke it.
const PAGE = `<!doctype html><html><head>
<title>Out of Home Advertising Malaysia: Maximize Your Brand Visibility</title>
<meta name="description" content="Reach your audience effectively.">
</head><body><main>
<section class="body"><div><h2>Market Landscape</h2><p>Kuala Lumpur, Penang and Johor Bahru.</p></div></section>
<section class="cta bg-mw"><div class="container"><div class="inner">
  <h2>Looking for a Billboard in Malaysia?</h2><p>Launch Your Campaign</p>
</div></div></section>
<section class="faq"><h2>Frequently Asked Questions</h2><p>What is DOOH advertising?</p></section>
</main></body></html>`

const TERMS: ProtectedTerm[] = [
  { q: 'out of home advertising malaysia', pos: 11, band: 'protect' },
  { q: 'billboard advertising malaysia', pos: 13, band: 'protect' },
  { q: 'wilayah advertising', pos: 19, band: 'watch' },
]

const change = (o: Partial<Change>): Change => ({
  id: 'x', kind: 'section', where: 'somewhere', anchor: null, mode: 'replace',
  was: null, now: '<h2>New</h2>', why: 'because', ...o,
})

// ── placement ───────────────────────────────────────────────────────────────
{
  const p = buildProposal({
    url: 'https://www.movingwalls.com/locations/malaysia/', liveHtml: PAGE, terms: TERMS,
    generatedOn: '2026-10-12',
    changes: [change({ id: 'pricing', anchor: 'Looking for a Billboard in Malaysia?', mode: 'before-section',
                       now: '<h2>What Billboard Advertising Costs</h2>' })],
  })
  const atBlock = p.html.indexOf('id="mwp-pricing"')
  const atCta = p.html.indexOf('<section class="cta')
  const atCtaH2 = p.html.indexOf('Looking for a Billboard')
  is(atBlock > -1, 'the new section is inserted')
  is(atBlock < atCta, 'and lands BEFORE the whole CTA section, not just before its heading')
  is(atBlock < atCtaH2, 'so it is above the heading too, as the summary promises')
  is(p.html.slice(atBlock, atCtaH2).includes('</section>') === false ||
     p.html.indexOf('<section class="cta') > atBlock,
     'and is not nested inside the band it is supposed to sit above')
}
{
  const p = buildProposal({
    url: 'https://x/', liveHtml: PAGE, terms: TERMS, generatedOn: '2026-10-12',
    changes: [change({ id: 'faq', anchor: 'Frequently Asked Questions', mode: 'after-section' })],
  })
  is(p.html.indexOf('id="mwp-faq"') > p.html.indexOf('What is DOOH advertising?'),
     'an after-section block clears the whole section, not just its heading')
}
{
  const p = buildProposal({
    url: 'https://x/', liveHtml: PAGE, terms: TERMS, generatedOn: '2026-10-12',
    changes: [change({ id: 'h', kind: 'heading', anchor: 'Market Landscape', mode: 'replace',
                       was: 'Market Landscape', now: 'Billboard Advertising Across Malaysia' })],
  })
  is(p.html.includes('Billboard Advertising Across Malaysia'), 'a heading is reworded in place')
  is(!p.html.includes('>Market Landscape<'), 'and the old wording is gone from the page')
  is(p.html.includes('Kuala Lumpur, Penang and Johor Bahru.'), 'while the body copy under it is untouched')
}
{
  is(enclosingSection('<p>no sections here</p>', 5) === null,
     'an anchor outside any section returns null rather than guessing')
  const nested = '<section a><section b><h2>deep</h2></section></section>'
  const e = enclosingSection(nested, nested.indexOf('deep'))
  is(e !== null && nested.slice(e.start).startsWith('<section b>'),
     'nested sections resolve to the innermost one that contains the anchor')
}

// ── the ranking rule ────────────────────────────────────────────────────────
const COPY = 'Out of Home Advertising Malaysia: Maximize Your Brand Visibility. ' +
  'Billboard Advertising in Malaysia. Market Landscape.'
{
  // The real mistake: swapping the title for a paid phrase, losing the term.
  const v = checkChange(change({
    kind: 'title', mode: 'replace',
    was: 'Out of Home Advertising Malaysia: Maximize Your Brand Visibility',
    now: 'Billboard Rental Malaysia — Prices and Sites',
  }), TERMS, COPY)
  is(!v.ok, 'a rewrite that drops a ranking phrase is blocked')
  is(v.removes.some(t => t.q === 'out of home advertising malaysia'),
     'and names the exact phrase it would have deleted')
}
{
  // The change actually proposed: keeps the ranking half, replaces the rest.
  const v = checkChange(change({
    kind: 'title', mode: 'replace',
    was: 'Out of Home Advertising Malaysia: Maximize Your Brand Visibility',
    now: 'Out of Home Advertising Malaysia — Billboard Prices, Sites & Availability',
  }), TERMS, COPY)
  is(v.ok, 'keeping the ranking half passes')
  is(v.keeps.some(t => t.q === 'out of home advertising malaysia'), 'and is credited with keeping it')
}
{
  // A phrase that survives ELSEWHERE on the page is not a loss.
  const v = checkChange(change({
    kind: 'heading', mode: 'replace', was: 'Billboard Advertising in Malaysia', now: 'Our Sites',
  }), [{ q: 'out of home advertising malaysia', pos: 11, band: 'protect' }], COPY)
  is(v.ok, 'a term still present elsewhere on the page is not reported as removed')
}
{
  const v = checkChange(change({
    kind: 'heading', mode: 'replace', was: 'Market Landscape', now: 'Wilayah Advertising Rates',
  }), TERMS, COPY)
  is(v.ok, 'a Watch-band term never blocks anything')
}
{
  const v = checkChange(change({ mode: 'before-section', now: '<h2>Billboard Advertising Malaysia prices</h2>' }),
    TERMS, 'Out of Home Advertising Malaysia only.')
  is(v.adds.some(t => t.q === 'billboard advertising malaysia'),
     'adding a ranking phrase that was not on the page is reported as a gain')
}

// ── the mirror itself ───────────────────────────────────────────────────────
{
  const p = buildProposal({
    url: 'https://x/', generatedOn: '2026-10-12', terms: TERMS,
    liveHtml: PAGE.replace('</head>', '<script>alert(1)</script></head>'),
    changes: [change({ id: 'a', anchor: 'Frequently Asked Questions', mode: 'after-section' })],
  })
  is(!/<script/i.test(p.html), 'scripts are stripped: a review copy must not fire their analytics')
  is(p.html.includes('THIS IS A PROPOSAL, NOT THE LIVE SITE'), 'and it says plainly that it is not the live site')
  is(p.html.includes('<base href="https://x/">'), 'a base href is injected so the site styling still loads')
  is(p.summary.length === 1 && p.summary[0].startsWith('1.'), 'the summary is numbered to match the badges')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
