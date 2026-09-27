// How a correction changes a filed receipt's LINES, and the split that follows.
//
// WHY THIS EXISTS: "line 3 should be food, it is tom yam paste" (owner, 27 Sep
// 2026). The correction tool could only set one type for the whole receipt, so
// it rewrote the lines without their types, left the old drinks/packaging split
// in place, stamped the receipt "food" on top -- and Jarvis then told the owner
// a split that was never saved. Three rules close that:
//   * a line keeps its type unless the owner changed it;
//   * the split is recomputed from the lines after every correction, so what
//     the tabs report is always what the lines say;
//   * the result is described back from what was saved, never from the request.
import { EXPENSE_TYPES, TYPE_WORD, splitByType, type VisionItem } from './vision'

const isType = (t: unknown): t is string =>
  typeof t === 'string' && (EXPENSE_TYPES as readonly string[]).includes(t)

export type LineFix = {
  prevItems: VisionItem[]
  // Replacement lines the owner typed out, if any. A line without a type keeps
  // the type of the old line with the same name.
  items?: Array<Omit<VisionItem, 'expense_type'> & { expense_type?: unknown }>
  lineTypes?: Array<{ line: unknown; expense_type: unknown }>
  // The whole receipt is this type -- applied to every line.
  wholeType?: string
  amount: number
}

export type LineFixResult =
  | { ok: false; message: string }
  | {
      ok: true
      changed: boolean
      items: VisionItem[]
      type_split?: Record<string, number>
      // The receipt's headline type: the only type, or the biggest share.
      expense_type?: string
    }

export function applyLineFix(f: LineFix): LineFixResult {
  const prev = f.prevItems ?? []
  const typeByName = new Map(prev.filter(i => i.expense_type).map(i => [i.name.trim().toLowerCase(), i.expense_type]))

  let items: VisionItem[] = f.items
    ? f.items.map((i, n) => {
        const own = isType(i.expense_type) ? i.expense_type : undefined
        const kept = typeByName.get(String(i.name).trim().toLowerCase())
          // Same position, same line count: the owner fixed a price, not the order.
          ?? (f.items!.length === prev.length ? prev[n]?.expense_type : undefined)
        return { ...(i as VisionItem), expense_type: (own ?? kept) as VisionItem['expense_type'] }
      })
    : prev.map(i => ({ ...i }))

  if (f.wholeType) {
    if (!isType(f.wholeType)) return { ok: false, message: `"${f.wholeType}" is not an expense type.` }
    items = items.map(i => ({ ...i, expense_type: f.wholeType as VisionItem['expense_type'] }))
  }

  for (const lt of f.lineTypes ?? []) {
    const n = Number(lt.line)
    if (!Number.isInteger(n) || n < 1 || n > items.length) {
      return { ok: false, message: `This receipt has ${items.length} line${items.length === 1 ? '' : 's'}; there is no line ${lt.line}.` }
    }
    if (!isType(lt.expense_type)) return { ok: false, message: `"${lt.expense_type}" is not an expense type.` }
    items[n - 1] = { ...items[n - 1], expense_type: lt.expense_type as VisionItem['expense_type'] }
  }

  const changed =
    !!f.items || items.some((i, n) => i.expense_type !== prev[n]?.expense_type)

  // The printed total is the truth; the lines only say how to divide it. A 5 sen
  // tolerance covers the rounding on a weighed line.
  const summed = items.reduce((t, i) => t + (Number(i.line_total) || 0), 0)
  const reconciles = Math.abs(summed - f.amount) <= 0.05
  const type_split = splitByType(items, f.amount, reconciles)

  const typed = items.filter(i => i.expense_type)
  const types = new Set(typed.map(i => i.expense_type))
  let expense_type: string | undefined
  if (type_split) expense_type = Object.entries(type_split).sort((a, b) => b[1] - a[1])[0][0]
  else if (types.size === 1 && typed.length === items.length) expense_type = [...types][0]
  else expense_type = f.wholeType

  return { ok: true, changed, items, type_split, expense_type }
}

// A quantity fix keeps the line's MONEY. "Line 1 should be 90 eggs" on a RM 43.20
// receipt read as 60 x RM 0.72: the printed RM 43.20 was right and the count was
// misread, so it is 90 x RM 0.48 -- not 90 x RM 0.72 = RM 64.80, which is what
// carrying the old unit price over produced (#175, 27 Sep 2026).
//
// Applied only where it makes the lines add up to the receipt total and the
// old line did: then the old line's money is known good. Anything else is left
// as given, for the lines-don't-add-up warning to catch.
export function keepLineMoney<T extends { name: string; qty: number; unit_price: number; line_total: number }>(
  items: T[], prevItems: Array<Partial<VisionItem>>, amount: number,
): T[] {
  const sum = (xs: Array<{ line_total?: number }>) => xs.reduce((t, i) => t + (Number(i.line_total) || 0), 0)
  const close = (a: number, b: number) => Math.abs(a - b) <= 0.05
  if (close(sum(items), amount) || !close(sum(prevItems), amount)) return items

  const fixed = items.map((i, n) => {
    const old = prevItems.find(p => String(p.name ?? '').trim().toLowerCase() === i.name.trim().toLowerCase())
      ?? (items.length === prevItems.length ? prevItems[n] : undefined)
    const oldTotal = Number(old?.line_total)
    const qtyOnly = old && Number(old.qty) !== i.qty && Math.abs(Number(old.unit_price) - i.unit_price) <= 0.005
    if (!qtyOnly || !(oldTotal > 0) || !(i.qty > 0)) return i
    return { ...i, line_total: oldTotal, unit_price: Math.round((oldTotal / i.qty) * 10000) / 10000 }
  })
  return close(sum(fixed), amount) ? fixed : items
}

// "Line 1 should be 90 pieces of eggs", "Line 2 udang 2 kg price rm 54" -- line
// fixes written into a reply. The receipt card numbers its lines so the owner
// can do exactly this, and a reply that also fills in the total used to have
// its line fix silently dropped (#175, 27 Sep 2026).
export type LineEdit = { line: number; qty: number; unit?: string; line_total?: number }
const UNIT_WORD: Array<[RegExp, string]> = [
  [/^(pcs?|pieces?|biji|butir|ekor|nos?)$/i, 'pcs'],
  [/^(kg|kgs|kilos?)$/i, 'kg'],
  [/^(g|gm|grams?)$/i, 'g'],
  [/^(pkts?|packets?)$/i, 'pkt'],
  [/^(tins?)$/i, 'tin'],
  [/^(box|boxes)$/i, 'box'],
  [/^(bottles?|btl)$/i, 'bottle'],
  [/^(trays?)$/i, 'tray'],
]
export function parseLineEdits(text: string): LineEdit[] {
  const out: LineEdit[] = []
  for (const row of String(text).split(/\r?\n/)) {
    const m = row.match(/\bline\s*(\d{1,3})\b(.*)$/i)
    if (!m) continue
    const rest = m[2]
    // The money first, so "rm 54" is never mistaken for the quantity.
    const money = rest.match(/\brm\s*(\d+(?:\.\d+)?)/i)
    const noMoney = money ? rest.replace(money[0], ' ') : rest
    const q = noMoney.match(/(\d+(?:\.\d+)?)\s*([a-z]+)?/i)
    if (!q) continue
    const unitWord = q[2] ? UNIT_WORD.find(([re]) => re.test(q[2]!))?.[1] : undefined
    out.push({
      line: Number(m[1]),
      qty: Number(q[1]),
      ...(unitWord ? { unit: unitWord } : {}),
      ...(money ? { line_total: Number(money[1]) } : {}),
    })
  }
  return out
}

// "Line 3 · THAI OMYAM 3KG TIN — RM 39.90 · filed as food" -- the same wording
// the receipt card uses, so the owner can compare them line for line.
export function describeLines(items: VisionItem[]): string[] {
  return items.map((i, n) =>
    `Line ${n + 1} · ${i.name} — RM ${Number(i.line_total).toFixed(2)} · ` +
    (i.expense_type ? `filed as ${TYPE_WORD[i.expense_type] ?? i.expense_type}` : 'not sorted yet'))
}

export function describeSplit(split: Record<string, number> | undefined): string | undefined {
  if (!split) return undefined
  return Object.entries(split)
    .sort((a, b) => b[1] - a[1])
    .map(([t, v]) => `${TYPE_WORD[t] ?? t} RM ${v.toFixed(2)}`)
    .join(' · ')
}
