// 👉 Why we win an auction, why we lose it, and which lever moves it.
//
// Pure module: this decides what the owner is told to do with his money, so
// it has to be testable without a network call.
//
// WHAT THIS IS NOT. It is not Google's "Auction insights" report. That one
// names rival domains and their overlap rate, and it exists only in the Google
// Ads interface — `auction_insight_domain` is not a field in the API, which
// answers UNRECOGNIZED_FIELD (checked against v23, 5 Oct 2026). Naming
// competitors needs a CSV exported from the UI. Everything here is our own
// side of the same auctions, which is where the actions are anyway.
//
// THE ONE IDEA WORTH HOLDING: a missed impression has exactly two causes and
// they need opposite responses.
//
//   Lost to BUDGET — the money ran out before the day did. Nothing is wrong
//   with the campaign; there is simply less of it than the market wants. The
//   lever is spend, and it is a finance decision.
//
//   Lost to RANK — we were in the auction and lost it, on bid or on quality.
//   More budget buys nothing here; it would only lose faster. The lever is
//   bids, relevance and landing pages.
//
// A single "impression share: 39%" number hides which, and the two have been
// confused often enough to be worth the whole module.

export type ShareRow = {
  name: string
  status?: string | null
  impressions: number
  clicks: number
  /** Fractions 0–1, as Google returns them. Null when not reported. */
  is: number | null
  lostBudget: number | null
  lostRank: number | null
  top: number | null
  absTop: number | null
  exact: number | null
}

export type PrevShare = { name: string; is: number | null; lostBudget: number | null; lostRank: number | null }

export type Verdict = {
  row: ShareRow
  /** Where the missed impressions mostly went. */
  cause: 'budget' | 'rank' | 'mixed' | 'winning' | 'unknown'
  /** A sentence a person can act on. */
  finding: string
  action: string
  /** How many more impressions a fix is worth, roughly. */
  upside: number
  /** Change in impression share against last month, in points. */
  shift: number | null
  severity: number
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 1000) / 10)
const say = (v: number | null) => (v === null ? '—' : `${v}%`)

/**
 * Rank-lost share above this is the dominant story even when budget also
 * leaks. Below it, a budget leak of similar size matters more, because money
 * is the easier lever and the one the owner controls directly.
 */
const RANK_DOMINATES = 0.35
const BUDGET_MATTERS = 0.15

export function judge(row: ShareRow, prev?: PrevShare | null): Verdict {
  const { is, lostBudget: lb, lostRank: lr } = row
  const shift = is !== null && prev?.is != null ? Math.round((is - prev.is) * 1000) / 10 : null

  // Impressions we did not get, and could have.
  const missed = is === null ? 0 : Math.round(row.impressions * ((1 - is) / Math.max(is, 0.01)))

  if (is === null) {
    return {
      row, cause: 'unknown', shift, upside: 0, severity: 0,
      finding: 'Google reports no impression share for this campaign.',
      action: 'Nothing to act on. Display and Performance Max campaigns often report only partially.',
    }
  }

  if (is >= 0.85) {
    return {
      row, cause: 'winning', shift, upside: missed, severity: 0,
      finding: `Showing on ${say(pct(is))} of the auctions it enters — close to all of them.`,
      action: 'Nothing to fix here. Spend added to this campaign buys very little extra reach.',
    }
  }

  const rank = lr ?? 0
  const budget = lb ?? 0

  if (rank >= RANK_DOMINATES && rank > budget) {
    return {
      row, cause: 'rank', shift,
      upside: Math.round(row.impressions * (rank / Math.max(is, 0.01))),
      severity: rank * 100 + 10,
      finding:
        `Losing ${say(pct(rank))} of its auctions on rank and only ${say(pct(budget))} on budget. `
        + `We are entering these auctions and being beaten in them.`,
      action:
        'More budget will not help — it would only lose faster. Raise bids on the keywords that '
        + 'convert, and look at ad relevance and landing page experience: rank is bid × quality, '
        + 'and quality is the half that is free.',
    }
  }

  if (budget >= BUDGET_MATTERS && budget >= rank) {
    return {
      row, cause: 'budget', shift,
      upside: Math.round(row.impressions * (budget / Math.max(is, 0.01))),
      severity: budget * 100,
      finding:
        `Losing ${say(pct(budget))} of its auctions purely because the budget ran out, `
        + `against ${say(pct(rank))} lost on rank. The campaign works; there is not enough of it.`,
      action:
        `Roughly ${Math.round(row.impressions * (budget / Math.max(is, 0.01))).toLocaleString('en-US')} `
        + 'more impressions are sitting behind the daily cap. Raise it only if this campaign’s cost '
        + 'per lead is one you are happy to buy more of.',
    }
  }

  if (budget >= BUDGET_MATTERS && rank >= BUDGET_MATTERS) {
    return {
      row, cause: 'mixed', shift, upside: missed, severity: (budget + rank) * 50,
      finding: `Losing ${say(pct(budget))} on budget and ${say(pct(rank))} on rank — both are biting.`,
      action: 'Fix rank first: raising the budget while losing on rank spends more to lose more.',
    }
  }

  return {
    row, cause: 'mixed', shift, upside: missed, severity: (1 - is) * 20,
    finding: `Showing on ${say(pct(is))} of its auctions, with no single dominant cause.`,
    action: 'Nothing urgent. Watch it rather than change it.',
  }
}

/** Every campaign, worst first. */
export function auctionReport(rows: ShareRow[], prev: PrevShare[] = []): Verdict[] {
  const was = new Map(prev.map(p => [p.name, p]))
  return rows
    .filter(r => r.impressions > 0)
    .map(r => judge(r, was.get(r.name)))
    .sort((a, b) => b.severity - a.severity)
}

export type AuctionSummary = {
  /** Weighted by impressions, so a tiny campaign cannot swing it. */
  impressionShare: number | null
  lostToBudget: number | null
  lostToRank: number | null
  /** Impressions we could have had if nothing were lost. */
  missed: number
  headline: string
}

export function summarise(rows: ShareRow[]): AuctionSummary {
  const usable = rows.filter(r => r.impressions > 0 && r.is !== null)
  const total = usable.reduce((a, r) => a + r.impressions, 0)
  if (!total) {
    return { impressionShare: null, lostToBudget: null, lostToRank: null, missed: 0,
      headline: 'No impression share reported yet.' }
  }
  const w = (pick: (r: ShareRow) => number | null) =>
    usable.reduce((a, r) => a + (pick(r) ?? 0) * r.impressions, 0) / total

  const is = w(r => r.is)
  const lb = w(r => r.lostBudget)
  const lr = w(r => r.lostRank)
  const missed = usable.reduce((a, r) => a + Math.round(r.impressions * ((1 - (r.is ?? 1)) / Math.max(r.is ?? 1, 0.01))), 0)

  const headline = lb > lr
    ? `Showing on ${Math.round(is * 100)}% of auctions. The biggest loss is budget, not competition.`
    : lr > lb
      ? `Showing on ${Math.round(is * 100)}% of auctions. Most of what we miss, we are losing on rank.`
      : `Showing on ${Math.round(is * 100)}% of auctions.`

  return {
    impressionShare: Math.round(is * 1000) / 10,
    lostToBudget: Math.round(lb * 1000) / 10,
    lostToRank: Math.round(lr * 1000) / 10,
    missed,
    headline,
  }
}
