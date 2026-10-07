// 👉 How a receipt is read on screen: its shop, its type, and what is wrong with it.
//
// Pure, so the day ledger, the attention list, the old Cash Out page and the
// morning brief all describe a receipt the same way. They did not before: the
// "to check" rule lived in app/cash-out/page.tsx and a second, different version
// lived in the cron, which is how a receipt could be flagged in one and not the
// other (owner, 5 Oct 2026).

import type { Rec } from './records'

export const TYPE_LABEL: Record<string, string> = {
  cogs_food: 'Food',
  cogs_beverage: 'Drinks',
  cogs_packaging: 'Packaging',
  supplies_cleaning: 'Cleaning & supplies',
  owner_drawings: "Owner's drawings",
  labour: 'Labour',
  rent: 'Rent',
  utilities: 'Utilities',
  marketing: 'Marketing',
  equipment: 'Equipment',
  services: 'Services',
  other: 'Other',
  unclassified: 'Not categorised',
}

export const money2 = (n: number) =>
  'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function spendByType(r: Rec): Record<string, number> {
  const split = r.meta?.type_split as Record<string, number> | undefined
  if (split && typeof split === 'object') {
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(split)) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) clean[k] = n
    }
    if (Object.keys(clean).length) return clean
  }
  return { [(r.meta?.expense_type as string) || 'unclassified']: Number(r.amount || 0) }
}

/** Owner's drawings are real money out, but not business spending. */
export const drawingsOf = (r: Rec) => spendByType(r).owner_drawings ?? 0
export const businessOf = (r: Rec) => Number(r.amount || 0) - drawingsOf(r)

/**
 * Suppliers print legal names in capitals: "99 SPEED MART SDN. BHD.". On a phone
 * that is noise. The stored name is never changed — this is display only.
 */
export function displayMerchant(raw: string): string {
  const s = String(raw || '')
    // Order matters: a legal name in brackets goes WHOLE first, or stripping its
    // "SDN BHD" leaves "(Pelita Hijrah )" behind.
    .replace(/\(\s*[^)]*\b(sdn|bhd|berhad)\b[^)]*\)/gi, '')
    .replace(/\(\s*m\s*\)/gi, '')
    .replace(/\b(sdn\.?\s*bhd\.?|s\/b|berhad|bhd|pte\.?\s*ltd\.?)(?=\s|$|[.,)])/gi, '')
    .replace(/\([^)]*$/, '')                 // a bracket the printer clipped: "(M"
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s.,-]+$/, '')
    .trim()
  if (!s) return raw
  const shouting = s === s.toUpperCase() && /[A-Z]{3}/.test(s)
  if (!shouting) return s
  // Title-case, but leave initialisms alone: "TH", "NSK" have no vowels and are
  // abbreviations, not words — "Th Supermart" reads as a typo.
  return s.toLowerCase().replace(/[a-z0-9]+/g, w =>
    w.length <= 3 && !/[aeiou]/.test(w) && /[a-z]/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
}

export const merchantOf = (r: Rec) =>
  displayMerchant(String(r.meta?.merchant || r.title.split(' — ')[0] || r.title))

export function typeOf(r: Rec): string {
  const parts = Object.keys(spendByType(r))
  if (parts.length > 1) return 'Mixed'
  return TYPE_LABEL[parts[0]] ?? parts[0]
}

export const lineCount = (r: Rec) => (Array.isArray(r.meta?.items) ? r.meta.items.length : 0)

// ---------------------------------------------------------------- problems

export type ProblemKind = 'no-photo' | 'bad-proof' | 'unsure' | 'wont-add-up' | 'no-category' | 'parked'

export type Problem = {
  kind: ProblemKind
  /** The one phrase shown in the margin. Short enough to read at a glance. */
  says: string
  /** The full sentence, for the receipt's own page. */
  detail: string
  /** Lower sorts first. */
  rank: number
}

const daysSince = (iso?: string | null) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0

/**
 * The single most important thing wrong with a receipt, or null.
 *
 * ONE problem, not a list. The reader's question standing in a kitchen is "do I
 * need to tap this?", and one phrase answers it where a count badge does not.
 *
 * `hasPhoto` is passed in rather than read from the row, because the truth lives
 * in the `vault_files` table and the caller has already fetched it in bulk —
 * asking per row would be 213 queries to draw one list.
 */
export function problemOf(r: Rec, hasPhoto: boolean): Problem | null {
  const m = r.meta ?? {}

  // The owner parked it himself. His note wins over anything derived.
  if (m.fix_later) {
    return {
      kind: 'parked', rank: 0,
      says: 'you said you would fix this',
      detail: `You said you'd fix this one in the app${m.fix_later_note ? `: ${m.fix_later_note}` : '.'}`,
    }
  }

  // Proof. Two things are never chased for a photo, because no photo exists to
  // find: a bill the staff TYPED because there was no printed receipt, and the
  // recurring costs the app files for itself (wages, rent, the POS licence).
  // Chasing those is how a chase list becomes noise and stops being read.
  if (!hasPhoto && m.source !== 'typed' && !m.auto_fixed) {
    const days = daysSince(r.created_at)
    return {
      kind: 'no-photo', rank: 1,
      says: days >= 1 ? `no photo · ${days}d` : 'no photo',
      detail: 'Nothing proves this one. A photo of the bill, a bank transfer slip or a '
        + 'Touch ’n Go receipt all count.',
    }
  }
  if (m.proof === 'list') {
    const days = daysSince(m.proof_since ?? r.created_at)
    return {
      kind: 'bad-proof', rank: 2,
      says: days >= 1 ? `proof not valid · ${days}d` : 'proof not valid',
      detail: 'The photo is a handwritten list, not a bill from the seller. A real receipt, '
        + 'a bank slip or a Touch ’n Go confirmation replaces it.',
    }
  }

  // An explicit "checked, it's right" clears everything derived below here --
  // including Jarvis's own doubt, which the Telegram "Looks right" button sets.
  if (m.fixed_note || m.checked_ok) return null

  // JARVIS FILED IT ANYWAY AND SAID SO.
  //
  // Receipts no longer wait for an answer in chat: "Everything should be filed
  // without asking then correct it in the app later" (owner, 8 Oct 2026). What
  // used to be a question is now a flag on the row, so a doubtful read is in
  // the books AND in front of him, instead of sitting in a chat he has to argue
  // with.
  if (m.needs_check) {
    const why = String(m.needs_check_why ?? '').replace(/\s+/g, ' ').trim()
    return {
      kind: 'unsure', rank: 2.5,
      says: why ? (why.length <= 60 ? why : why.slice(0, why.lastIndexOf(' ', 57)) + '…') : 'check this one',
      detail: (why ? why + ' ' : '')
        + 'Jarvis filed its best guess rather than holding the receipt. Put the numbers right, '
        + 'or mark it correct.',
    }
  }

  if (m.items_note) {
    const text = String(m.items_note).replace(/\s+/g, ' ').trim()
    // The margin phrase has to carry information. "Needs a look" only repeats
    // the filter it sits under, and splitting on a full stop cuts a note in
    // half at the decimal point of a ringgit figure — so clip on a word.
    const says = text.length <= 60
      ? text
      : text.slice(0, text.lastIndexOf(' ', 57)) + '…'
    return { kind: 'wont-add-up', rank: 3, says, detail: text }
  }

  const items: any[] = Array.isArray(m.items) ? m.items : []
  if (items.length) {
    const lines = items.reduce((t, i) => t + (Number(i?.line_total) || 0), 0) - (Number(m.discount) || 0)
    const amt = Number(r.amount) || 0
    if (Math.abs(lines - amt) > Math.max(0.05, amt * 0.02)) {
      return {
        kind: 'wont-add-up', rank: 3,
        says: `off by ${money2(Math.abs(lines - amt))}`,
        detail: `Lines add to ${money2(lines)} but the receipt total is ${money2(amt)}.`,
      }
    }
  }

  if ((spendByType(r).unclassified ?? 0) > 0) {
    return {
      kind: 'no-category', rank: 4,
      says: 'not categorised',
      detail: 'This spending has no category, so it is missing from every total.',
    }
  }

  return null
}

/** Kept for the old page, which still calls it. */
export const checkNote = (r: Rec): string | null => problemOf(r, true)?.detail ?? null
