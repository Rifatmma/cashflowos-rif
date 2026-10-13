// 👉 Is this bill one we have already filed today?
//
// The rule used to be "same shop, same money, same day" and it was written for
// a real problem: Yuu typed the gas bill, Tina photographed it ninety seconds
// later, and RM 52 went in twice because the waiting-for-a-photo note belongs
// to whoever typed it (24 Sep 2026).
//
// But it is a guess, and on 11 Oct 2026 it was wrong twice inside ninety
// seconds. TH Supermart issued checks 1457255, 1457256 and 1457257, each
// RM 7.50 for the same cooking oil. The first became record #493; the other two
// were refused as duplicates of it. RM 15 never reached the books, and both
// photos were stacked onto a record they did not belong to:
//
//   "I found that Jarvis recognize these 2 bills as duplicate but actually
//    it's not the first screenshot bill number is : 1457256 and the second one
//    is: 1457257 how come you identify them as duplicate?"  (owner, 14 Oct 2026)
//
// A printed receipt number is the shop's own transaction id. Where both sides
// have one and they differ, that settles it. Where either has none — a typed
// record, a bank alert, a handwritten note — the heuristic is still the best
// available, and still catches the gas bill.
//
// Pure, and separate from the route, so the rule has one home and can be
// tested against the bills that broke it.

export type TwinCandidate = {
  id: number
  merchant?: string | null
  title?: string | null
  receipt_no?: string | null
}
export type TwinSubject = {
  merchant?: string | null
  receipt_no?: string | null
}

/** A shop name, reduced to what two readings of it will agree on. */
export const shopKey = (s: unknown) =>
  String(s || '').toLowerCase().replace(/\(.*$/, '')
    .replace(/(sdn\.?\s*bhd\.?|berhad|enterprise|trading|holdings?)/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()

/** A printed receipt or invoice number, comparable across readings. */
export const refKey = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

export type TwinVerdict =
  | { twin: false; why: 'no-merchant' | 'different-shop' | 'different-receipt-no' }
  | { twin: true; why: 'same-receipt-no' | 'same-shop-same-money-same-day'; id: number }

/**
 * Decide, for one candidate already in the books.
 *
 * The caller has already narrowed by amount and date, so this only judges shop
 * and reference. Returning the REASON rather than a boolean is deliberate: the
 * difference between "the shop printed the same number" and "everything else
 * happened to line up" is the difference between certainty and a guess, and the
 * message to the sender should not sound the same for both.
 */
export function judgeTwin(subject: TwinSubject, candidate: TwinCandidate): TwinVerdict {
  const mineShop = shopKey(subject.merchant)
  if (mineShop.length < 3) return { twin: false, why: 'no-merchant' }

  const theirShop = shopKey(candidate.merchant || candidate.title)
  if (!theirShop) return { twin: false, why: 'different-shop' }
  const sameShop = theirShop === mineShop || theirShop.includes(mineShop) || mineShop.includes(theirShop)
  if (!sameShop) return { twin: false, why: 'different-shop' }

  const mineRef = refKey(subject.receipt_no)
  const theirRef = refKey(candidate.receipt_no)

  // Both printed, and different: two purchases. Nothing else outranks this.
  if (mineRef && theirRef && mineRef !== theirRef) {
    return { twin: false, why: 'different-receipt-no' }
  }
  // Both printed, and the same: the shop says it is one transaction. This is
  // the reprint case — "* DUPLICATED *" across the top of the slip.
  if (mineRef && theirRef && mineRef === theirRef) {
    return { twin: true, why: 'same-receipt-no', id: candidate.id }
  }
  // One side has no number to compare. Fall back to the original rule.
  return { twin: true, why: 'same-shop-same-money-same-day', id: candidate.id }
}

/** The first candidate that is genuinely the same bill, if any. */
export function findTwinAmong(subject: TwinSubject, candidates: TwinCandidate[]): TwinVerdict & { twin: true } | null {
  // A matching printed number beats a heuristic match, however they are
  // ordered coming out of the database.
  const verdicts = candidates.map(c => judgeTwin(subject, c)).filter(v => v.twin) as (TwinVerdict & { twin: true })[]
  return verdicts.find(v => v.why === 'same-receipt-no') ?? verdicts[0] ?? null
}
