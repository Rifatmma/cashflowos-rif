// 👉 Whether a keyword deserves its money — judged on more than conversions.
//
// Pure module. It decides what gets paused, so it must be testable without a
// network call.
//
// THE RULE THE OWNER ASKED FOR (5 Oct 2026): "If some keyword have low quality
// score but generated a lot of clicks and spent some money but didn't generate
// conversion, perhaps we could look into optimizing the quality score first,
// then once the score is optimized and yet still no result, we can remove it."
//
// That is the right order, and the data says why. Across this account, ad
// relevance is mostly ABOVE_AVERAGE and landing page experience is
// BELOW_AVERAGE on every single keyword Google scores. Pausing those keywords
// would be pausing demand we are failing to serve, not demand that is not
// there. The page is the problem, and a keyword cannot be judged on conversion
// until the page it points at has had a fair chance.
//
// So a keyword is only ever a pause candidate once its quality score says the
// click was well served and it STILL did not convert.

export type QualityBand = 'ABOVE_AVERAGE' | 'AVERAGE' | 'BELOW_AVERAGE' | null

export type KeywordRow = {
  text: string
  matchType: string | null
  campaign: string
  adGroup: string
  cost: number
  clicks: number
  conversions: number
  impressions: number
  ctr: number
  /** 1–10. Null when Google has not scored it (too few impressions). */
  qs: number | null
  /** The three halves of quality score, in Google's own words. */
  adRelevance: QualityBand
  landingPage: QualityBand
  expectedCtr: QualityBand
  /** Where the click goes, when known. */
  landingUrl?: string | null
}

export type Verdict =
  | 'converting'       // it works; leave it alone
  | 'fix-page'         // clicks and spend, no conversions, landing page below average
  | 'fix-ad'           // ad relevance below average
  | 'fix-ctr'          // nobody clicks it; the ad or the match type is wrong
  | 'pause-candidate'  // quality is fine, it had its chance, still nothing
  | 'watch'            // not enough spend or clicks to say anything yet

export type KeywordVerdict = {
  row: KeywordRow
  verdict: Verdict
  /** One line naming the problem with its numbers. */
  finding: string
  /** What to do, specifically. */
  action: string
  /** Money at stake: what this keyword has cost with nothing to show. */
  wasted: number
  /** Sort key — biggest, most fixable problem first. */
  priority: number
}

/**
 * Below this many clicks a keyword has not had a fair test, whatever it cost.
 * Ten clicks on a B2B form with a ~1% conversion rate proves nothing.
 */
export const FAIR_TEST_CLICKS = 25
/** And below this much spend, nobody should be spending time on it either. */
export const WORTH_LOOKING_AT = 10

const band = (b: QualityBand) =>
  b === 'BELOW_AVERAGE' ? 'below average' : b === 'ABOVE_AVERAGE' ? 'above average' : b === 'AVERAGE' ? 'average' : 'unscored'

const rm = (n: number) => `S$${n.toFixed(2)}`

export function judgeKeyword(r: KeywordRow): KeywordVerdict {
  const cpc = r.clicks ? r.cost / r.clicks : 0

  if (r.conversions > 0) {
    return {
      row: r, verdict: 'converting', wasted: 0,
      priority: -1,
      finding: `${r.conversions} conversion${r.conversions > 1 ? 's' : ''} from ${r.clicks} clicks at ${rm(r.cost)}.`,
      action: r.landingPage === 'BELOW_AVERAGE'
        ? 'Working despite a below-average landing page — fixing the page should make it work harder, not differently.'
        : 'Leave it alone. Consider raising the bid if it is losing impression share.',
    }
  }

  if (r.clicks < FAIR_TEST_CLICKS || r.cost < WORTH_LOOKING_AT) {
    return {
      row: r, verdict: 'watch', wasted: r.cost,
      priority: 0,
      finding: `Only ${r.clicks} clicks and ${rm(r.cost)} so far — too little to judge.`,
      action: `Leave it running. Revisit once it passes ${FAIR_TEST_CLICKS} clicks.`,
    }
  }

  // It has had a fair test and produced nothing. Now the quality score decides
  // whether the fault is ours or the keyword's.
  if (r.landingPage === 'BELOW_AVERAGE') {
    return {
      row: r, verdict: 'fix-page', wasted: r.cost,
      priority: r.cost * 3,
      finding:
        `${r.clicks} clicks, ${rm(r.cost)}, no conversions — and Google rates the landing page `
        + `experience ${band(r.landingPage)}${r.adRelevance === 'ABOVE_AVERAGE' ? ', while the ad itself is above average' : ''}.`,
      action:
        'Do not pause this. The ad is winning the click and the page is losing it. Fix the page '
        + 'first, give it a month, and only then judge the keyword on conversions.',
    }
  }

  if (r.adRelevance === 'BELOW_AVERAGE') {
    return {
      row: r, verdict: 'fix-ad', wasted: r.cost,
      priority: r.cost * 2,
      finding: `${r.clicks} clicks, ${rm(r.cost)}, no conversions, and the ad is rated ${band(r.adRelevance)} for relevance.`,
      action:
        `Rewrite the ad so the headline contains "${r.text}" or close to it, and move the keyword `
        + 'into an ad group of its own if the group is covering too many ideas.',
    }
  }

  if (r.expectedCtr === 'BELOW_AVERAGE') {
    return {
      row: r, verdict: 'fix-ctr', wasted: r.cost,
      priority: r.cost * 1.5,
      finding:
        `${r.impressions.toLocaleString('en-US')} impressions but only ${r.clicks} clicks `
        + `(${(r.ctr * 100).toFixed(1)}%), and Google expects it to underperform.`,
      action:
        'People see it and do not click, so we are paying for the wrong intent. Tighten the match '
        + 'type, add negatives for the searches that do not fit, and put the searcher’s own words '
        + 'in the headline.',
    }
  }

  return {
    row: r, verdict: 'pause-candidate', wasted: r.cost,
    priority: r.cost,
    finding:
      `${r.clicks} clicks and ${rm(r.cost)} with no conversions, and the quality score is `
      + `${r.qs ?? '—'}/10 with nothing rated below average. The click was served well and still did nothing.`,
    action:
      `Now it is fair to pause it. ${rm(r.cost)} bought ${r.clicks} visits at ${rm(cpc)} each and no enquiry; `
      + 'that money buys more elsewhere.',
  }
}

export function analyseKeywords(rows: KeywordRow[]): KeywordVerdict[] {
  return rows.map(judgeKeyword).sort((a, b) => b.priority - a.priority)
}

export type KeywordSummary = {
  spend: number
  /** Spent on keywords that produced nothing. */
  wasted: number
  conversions: number
  counts: Record<Verdict, number>
  /** Money sitting behind each verdict. */
  money: Record<Verdict, number>
  /** The single sentence at the top. */
  headline: string
  /** True when the landing page is the dominant fault across the account. */
  pageIsTheProblem: boolean
}

const EMPTY = (): Record<Verdict, number> =>
  ({ converting: 0, 'fix-page': 0, 'fix-ad': 0, 'fix-ctr': 0, 'pause-candidate': 0, watch: 0 })

export function summariseKeywords(vs: KeywordVerdict[]): KeywordSummary {
  const counts = EMPTY()
  const money = EMPTY()
  let spend = 0, wasted = 0, conversions = 0
  for (const v of vs) {
    counts[v.verdict]++
    money[v.verdict] += v.row.cost
    spend += v.row.cost
    conversions += v.row.conversions
    if (v.verdict !== 'converting') wasted += v.row.cost
  }

  const pageIsTheProblem = money['fix-page'] > money['fix-ad'] + money['fix-ctr'] + money['pause-candidate']
  const headline = pageIsTheProblem
    ? `${rm(money['fix-page'])} went to keywords whose ads are working and whose landing pages are not.`
    : counts['pause-candidate'] > 0
      ? `${counts['pause-candidate']} keywords have had a fair test and earned nothing.`
      : 'No keyword has yet had a fair test and failed it.'

  return { spend, wasted, conversions, counts, money, headline, pageIsTheProblem }
}

// ------------------------------------------------------- landing page work

export type PageGroup = {
  url: string
  keywords: KeywordVerdict[]
  cost: number
  clicks: number
  conversions: number
  /** The searches this page has to answer, most expensive first. */
  mustAnswer: string[]
}

/**
 * Keywords needing page work, grouped by the page they point at.
 *
 * Grouped because the fix is a page, not a keyword: eleven keywords pointing
 * at /locations/india with a below-average page experience is one afternoon's
 * work, not eleven.
 */
export function pagesToFix(vs: KeywordVerdict[]): PageGroup[] {
  const by = new Map<string, PageGroup>()
  for (const v of vs) {
    if (v.verdict !== 'fix-page') continue
    const url = v.row.landingUrl || '(unknown page)'
    if (!by.has(url)) by.set(url, { url, keywords: [], cost: 0, clicks: 0, conversions: 0, mustAnswer: [] })
    const g = by.get(url)!
    g.keywords.push(v)
    g.cost += v.row.cost
    g.clicks += v.row.clicks
    g.conversions += v.row.conversions
  }
  for (const g of by.values()) {
    g.keywords.sort((a, b) => b.row.cost - a.row.cost)
    g.mustAnswer = g.keywords.map(k => k.row.text)
  }
  return [...by.values()].sort((a, b) => b.cost - a.cost)
}
