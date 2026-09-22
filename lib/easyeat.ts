// Reading EasyEat's "Dish Report Over Time" export.
//
// The file (22 Sep 2026 sample): a title row "DISH REPORT OVER TIME 2026-09-21-2026-09-21",
// a header row (SR NO. | CATEGORY | SUB-CATEGORY | ITEM CODE | ITEM NAME |
// VARIATION OPTIONS | QUANTITY | AVG PRICE PER DISH IN ORDER | TOTAL | AVAILABILITY),
// one row per dish+variation, then a "Thanks & Regards" footer.
//
// Columns are found by their header NAME, not position, so EasyEat adding a
// column doesn't silently shift every number one to the right.
//
// Pure: takes the sheet as an array of rows, so it's testable without a file.

export type DishLine = {
  category: string
  sub: string
  name: string
  variation: string
  qty: number
  price: number
  total: number
}

export type DishReport = { date: string; lines: DishLine[]; total: number; qty: number }

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && v !== null) {
    const o = v as any
    if ('result' in o) return cell(o.result)          // formula cell
    if ('richText' in o) return (o.richText as any[]).map(t => t.text).join('')
    if ('text' in o) return String(o.text)
  }
  return String(v).trim()
}
const num = (v: unknown): number => {
  const n = Number(cell(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export class ReportError extends Error {}

export function parseDishReport(rows: unknown[][]): DishReport {
  // The date range lives in the title row.
  let date = ''
  for (const r of rows.slice(0, 5)) {
    const text = r.map(cell).join(' ')
    const m = text.match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/)
    if (m) {
      if (m[1] !== m[2]) {
        throw new ReportError(`This report covers ${m[1]} to ${m[2]}. Export one day at a time, so each day's sales and stock land on the right date.`)
      }
      date = m[1]
      break
    }
  }
  // No date in the title: fine, the uploader picks the day (date stays '').

  const hi = rows.findIndex(r => r.map(c => cell(c).toUpperCase()).includes('ITEM NAME'))
  if (hi < 0) throw new ReportError('Could not find the ITEM NAME column. Is this the EasyEat "Dish Report Over Time" export?')
  const head = rows[hi].map(c => cell(c).toUpperCase())
  const col = (label: string) => head.findIndex(h => h.startsWith(label))
  const C = {
    cat: col('CATEGORY'), sub: col('SUB-CATEGORY'), name: col('ITEM NAME'),
    variation: col('VARIATION'), qty: col('QUANTITY'), price: col('AVG PRICE'), total: col('TOTAL'),
  }
  if (C.qty < 0 || C.total < 0) throw new ReportError('The QUANTITY or TOTAL column is missing from this report.')

  const lines: DishLine[] = []
  for (const r of rows.slice(hi + 1)) {
    const name = cell(r[C.name])
    const qty = num(r[C.qty])
    // Footer rows ("Thanks & Regards") have no quantity; skip anything without one.
    if (!name || !(qty > 0)) continue
    lines.push({
      category: cell(r[C.cat]),
      sub: C.sub >= 0 ? cell(r[C.sub]) : '',
      name,
      variation: C.variation >= 0 ? cell(r[C.variation]) : '',
      qty,
      price: C.price >= 0 ? num(r[C.price]) : 0,
      total: num(r[C.total]),
    })
  }
  if (!lines.length) throw new ReportError('No dishes found in this report.')
  const total = Math.round(lines.reduce((t, l) => t + l.total, 0) * 100) / 100
  const qty = lines.reduce((t, l) => t + l.qty, 0)
  return { date, lines, total, qty }
}

/** "(Kuah Merah)(Siakap Stim Limau)(No add on)" -> ["Kuah Merah", "Siakap Stim Limau", "No add on"] */
export function variationParts(v: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of v) {
    if (ch === '(') { if (depth === 0) cur = ''; else cur += ch; depth++ }
    else if (ch === ')') { depth--; if (depth === 0) { if (cur.trim()) out.push(cur.trim()) } else cur += ch }
    else if (depth > 0) cur += ch
  }
  return out
}

export const isSet = (l: Pick<DishLine, 'sub' | 'name'>) => /set menu/i.test(l.sub) || /^set\b/i.test(l.name)
