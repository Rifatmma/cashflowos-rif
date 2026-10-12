// The do-not-remove list: does it bind the right terms, and spot the ones an
// edit could actually delete?
//   npx -y tsx --conditions=react-server tests/mw-seo-protect.test.mts
//
// Written against the real page that caused it. /locations/malaysia ranks at
// position 8 for `out of home advertising malaysia`, and those exact words are
// in its current title — so a title rewrite deletes it. That is the case this
// file has to catch; everything else is detail.

import { bandOf, appearsIn, protectionDoc, type RankedTerm } from '../lib/mw-seo-protect'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

const term = (q: string, pos: number, vol = 100, traffic = 1): RankedTerm => ({ q, pos, vol, traffic })

// ── the bands ───────────────────────────────────────────────────────────────
{
  is(bandOf(term('out of home advertising malaysia', 8)) === 'locked', 'page one is locked')
  is(bandOf(term('x', 1)) === 'locked' && bandOf(term('x', 10)) === 'locked', 'and the whole of page one, 1 to 10')
  is(bandOf(term('x', 11)) === 'protect' && bandOf(term('x', 30)) === 'protect', '11 to 30 is protected — work already done')
  is(bandOf(term('x', 31)) === 'watch', 'past 30 is listed but binds nothing')
  is(bandOf(term('x', 0)) === 'watch', 'and an unranked term is never a constraint')
}

// ── does the phrase appear in the copy? ─────────────────────────────────────
const TITLE = 'Out of Home Advertising Malaysia: Maximize Your Brand Visibility'
{
  is(appearsIn('out of home advertising malaysia', TITLE),
     'the real title is found to contain the term it ranks for — the whole point')
  is(!appearsIn('billboard rental malaysia', TITLE),
     'and does not contain the paid term I wanted to swap it for')
  is(appearsIn('OUT OF HOME', TITLE), 'case does not matter')
  is(appearsIn('out of home advertising malaysia', 'Out-of-Home Advertising, Malaysia'),
     'punctuation between the words does not break the match')
  is(!appearsIn('malaysia advertising home', TITLE),
     'but the words must be in order — a bag of words is not the phrase')
  is(!appearsIn('', TITLE), 'an empty term matches nothing')
  is(!appearsIn('home advertising thailand', TITLE), 'and a near miss is a miss')
}

// ── the document ────────────────────────────────────────────────────────────
{
  const doc = protectionDoc([{
    url: 'https://www.movingwalls.com/locations/malaysia',
    copy: TITLE + ' Explore by City Kuala Lumpur Market Landscape',
    terms: [
      term('out of home advertising malaysia', 8, 480, 3),
      term('billboard price malaysia', 14, 320, 1),
      term('wilayah advertising', 71, 20, 0),
    ],
  }], '2026-09', '2026-10-12')

  is(doc.includes('🔒 Locked'), 'the page-one term is filed under Locked')
  is(doc.includes('⚠️ Protect'), 'the close-behind term under Protect')
  is(doc.includes('👁 Watch'), 'and the distant one under Watch, still listed')
  is(doc.includes('must survive any edit'),
     'a ranking phrase that IS on the page is called out as undeletable')
  is(doc.includes('ranks without the phrase being on it'),
     'and one that is not on the page is marked as not a constraint on the copy')
  is(doc.includes('`/locations/malaysia`'), 'pages are listed by path, not by full URL')
  is(doc.includes('may not remove'), 'the rule is stated as a prohibition, not a preference')
  is(/3 terms · best position 8/.test(doc), 'and the page header counts terms and the best position')

  // The first cut of this emitted "| 140 | | no — ..." — a stray empty cell and
  // no closing pipe, so every table rendered one column out of line.
  const rows = doc.split(/\r?\n/).filter(l => /^\| (out of home|billboard|wilayah)/.test(l))
  is(rows.length === 3, 'every term gets exactly one table row')
  is(rows.every(r => r.split('|').length - 1 === 5),
     'and four columns, so the table is not emitted one cell out of line')
  is(rows.every(r => r.trimEnd().endsWith('|')), 'each row is closed')
}
{
  // A page we could not fetch must not silently read as "nothing to protect".
  const doc = protectionDoc([{
    url: 'https://www.movingwalls.com/locations/qatar',
    copy: null,
    terms: [term('ooh advertising qatar', 6)],
  }], '2026-09', '2026-10-12')
  is(doc.includes('could not be fetched'), 'an unfetchable page says so rather than looking clean')
  is(!doc.includes('must survive any edit'), 'and claims nothing about copy it never read')
}
{
  const doc = protectionDoc([{ url: 'https://x/y', terms: [], copy: 'hello' }], '2026-09', '2026-10-12')
  is(!doc.includes('https://x/y'), 'a page that ranks for nothing is left out entirely')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
