// A receipt TYPED to Jarvis, for bills a photo can't be read from.
//
// The owner's format (22 Sep 2026), one block per item:
//
//   Supplier: Kakak            <- optional, once
//   Date: 21/09/2026           <- optional, once (default: today)
//   Item Name: Chicken Breast
//   Weight: 2 kg               <- size of ONE pack (kg / g / pcs), optional
//   Quantity: 2                <- how many packs, default 1
//   Price: RM 40               <- TOTAL paid for this item
//
// So "2 kg × 2 = RM 40" is 4 kg, RM 20 a bag, RM 10/kg. Numbers are the staff's
// own, typed -- no reading, no guessing -- so nothing here ever invents a value:
// a block with no Price is a problem to send back, not a zero.
//
// Pure: no server imports. Returns raw lines in the same shape the vision model
// returns, so the route runs them through the SAME sanitiser (lib/vision.ts).

export type TypedLine = {
  name: string; qty: number; unit: string; unit_price: number; line_total: number
  pack_size?: number; pack_unit?: string; expense_type: string
}
export type Typed =
  | { ok: true; merchant?: string; date?: string; total?: number; lines: TypedLine[] }
  | { ok: false; problems: string[] }

// Labels in English, Malay and Thai (the team writes all three).
const LABELS: [RegExp, keyof Fields][] = [
  [/^(item\s*name|item|nama\s*barang|barang|ชื่อสินค้า|สินค้า)$/i, 'item'],
  [/^(weight|berat|size|saiz|น้ำหนัก)$/i, 'weight'],
  [/^(quantity|qty|kuantiti|kuantity|jumlah\s*bungkus|จำนวน)$/i, 'qty'],
  [/^(price|harga|ราคา|amount|total\s*price)$/i, 'price'],
  [/^(supplier|shop|kedai|pembekal|ผู้ขาย|ร้าน)$/i, 'supplier'],
  [/^(date|tarikh|วันที่)$/i, 'date'],
  [/^(total|grand\s*total|jumlah|รวม|รวมทั้งหมด)$/i, 'total'],
]
type Fields = { item: string; weight: string; qty: string; price: string; supplier: string; date: string; total: string }

// What each line was for. Typed items are mostly ingredients; the few that
// aren't are obvious from the name.
const PACKAGING = /(box|kotak|bekas|container|cup|cawan|straw|straw|plastik|plastic bag|beg plastik|polystyrene|foil tray|takeaway|tapau|lid|penutup)/i
const CLEANING = /(sabun|soap|detergent|bleach|clorox|sampah|garbage|rubbish|bin bag|glove|sarung tangan|tisu|tissue|span|sponge|mop|penyapu|broom)/i
const DRINKS = /(air mineral|mineral water|soft drink|coke|pepsi|100 ?plus|sirap|syrup|jus|juice concentrate)/i
// Gas, water and electricity get typed like anything else, and they are not food.
const UTILITIES = /(\bgas\b|silinder|cylinder|lpg|elektrik|electric|tnb|air selangor|water bill|bil air)/i
const typeOf = (name: string) =>
  UTILITIES.test(name) ? 'utilities'
    : CLEANING.test(name) ? 'supplies_cleaning'
    : PACKAGING.test(name) ? 'cogs_packaging'
    : DRINKS.test(name) ? 'cogs_beverage'
    : 'cogs_food'

const money = (s: string): number | null => {
  const m = String(s).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

/** "21/09/2026", "21-9-26", "21.09" -> YYYY-MM-DD (day first, as Malaysians write it). */
export function typedDate(s: string, today: string): string | undefined {
  const m = String(s).match(/(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*(\d{2,4}))?/)
  if (!m) return undefined
  const d = Number(m[1]), mo = Number(m[2])
  let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4))
  if (y < 100) y += 2000
  if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return undefined
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Does this message look like the template at all? Two labelled lines, one of them an item. */
export function looksTyped(text: string): boolean {
  const labels = String(text || '').split(/\r?\n/).map(l => labelOf(l)?.[0]).filter(Boolean)
  return labels.includes('item') && labels.length >= 2
}

function labelOf(line: string): [keyof Fields, string] | null {
  const m = line.match(/^\s*[-•*]?\s*([^:：=\-–]{2,24}?)\s*[:：=\-–]\s*(.*)$/)
  if (!m) return null
  const key = LABELS.find(([re]) => re.test(m[1].trim()))?.[1]
  return key ? [key, m[2].trim()] : null
}

export function parseTypedReceipt(text: string, today: string): Typed | null {
  if (!looksTyped(text)) return null

  const head: Partial<Fields> = {}
  const blocks: Partial<Fields>[] = []
  for (const raw of String(text).split(/\r?\n/)) {
    const hit = labelOf(raw)
    if (!hit) continue
    const [key, value] = hit
    if (key === 'supplier' || key === 'date' || key === 'total') { head[key] = value; continue }
    // A new "Item Name" starts a new block; so does repeating a field the
    // current block already has (someone skipped a label).
    const cur = blocks.at(-1)
    if (key === 'item' || !cur || cur[key] !== undefined) blocks.push({})
    blocks.at(-1)![key] = value
  }

  const problems: string[] = []
  const lines: TypedLine[] = []
  blocks.forEach((b, i) => {
    const label = b.item ? `"${b.item}"` : `item ${i + 1}`
    if (!b.item) { problems.push(`${label} has no Item Name`); return }
    const price = b.price !== undefined ? money(b.price) : null
    if (price === null || price <= 0) { problems.push(`${label} has no Price`); return }
    let qty = 1
    // "Quantity: 50 pieces" is a COUNT of things, not 50 packs -- and then the
    // Weight beside it is the weight of all of them together. Tina typed
    // "Weight: 2 kilo / Quantity: 50 pieces" for RM 54 of shrimp and it was read
    // as 50 bags of 2 kg = 100 kg (owner, 24 Sep 2026).
    const countedInPieces = /\b(pcs?|pieces?|biji|ekor|keping|fish|ikan|tail)\b/i.test(String(b.qty ?? ''))
    if (b.qty !== undefined && b.qty !== '') {
      const q = money(b.qty)
      if (q === null || q <= 0) { problems.push(`${label}: Quantity "${b.qty}" isn't a number`); return }
      qty = q
    }

    let name = b.item.slice(0, 80)
    let pack_size: number | undefined, pack_unit: string | undefined
    const w = (b.weight ?? '').toLowerCase().replace(/,/g, '.')
    const wm = w.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|g|gm|gram|grams|pcs|pc|biji|ekor|keping|pieces?)?\b/)
    if (w && !/^[-–—\s]*$/.test(w)) {
      if (!wm) { problems.push(`${label}: Weight "${b.weight}" — write it like 2 kg, 500 g or 30 pcs`); return }
      const n = Number(wm[1]), u = wm[2] ?? 'kg'
      // Counted in pieces: the weight covers the lot, so one piece weighs
      // weight / count, and the count rides in the name for the stock reader.
      const per = countedInPieces && qty > 0 ? n / qty : n
      if (/^(kg|kilo)$/.test(u)) { pack_size = per; pack_unit = 'kg' }
      else if (/^(g|gm|gram|grams)$/.test(u)) { pack_size = per; pack_unit = 'g' }
      // Pieces have no weight; they ride in the name, where the stock reader
      // looks for "(30 pcs)".
      else name = `${name} (${n} pcs)`
    }

    if (countedInPieces && !/\(\d+\s*pcs\)/.test(name)) name = `${name} (${qty} pcs)`
    lines.push({
      name, qty, unit: countedInPieces ? 'pcs' : 'bag',
      unit_price: Math.round((price / qty) * 10000) / 10000,
      line_total: price,
      pack_size, pack_unit,
      expense_type: typeOf(name),
    })
  })

  if (!blocks.length) problems.push('no items found')
  if (problems.length) return { ok: false, problems }

  const total = head.total !== undefined ? money(head.total) ?? undefined : undefined
  return {
    ok: true,
    merchant: head.supplier?.slice(0, 60) || undefined,
    date: head.date ? typedDate(head.date, today) : undefined,
    total,
    lines,
  }
}

/**
 * A bill with NO lines: just who was paid and how much.
 *
 *   Touch n Go RM 45
 *   TNG 45.60
 *   Supplier: Shell / Total: RM 80
 *
 * The owner's case (8 Oct 2026): "let's say touch and go receipt if I don't
 * want to add a line I just want to tell how much is the total bill I should be
 * able to do that." An e-wallet payment has no itemisation to type, and
 * demanding item blocks for one meant it could not be filed by typing at all.
 *
 * DELIBERATELY NARROW, because this runs against ordinary group chatter. It
 * takes a labelled Total with no item blocks, or a SHORT single line that is
 * essentially a name and a ringgit figure. "the rice was 2 at 45.90" is a
 * correction, not a bill, and must not be swallowed here -- so the bare form
 * requires the money to sit at one end of the line with nothing else after it.
 */
const PAID_WORD = /^(paid|bayar|pay|beli|bought|topup|top ?up|transfer|tng|touch ?'?\s?n ?go)\b/i

export function parseTotalOnly(text: string, today: string): Typed | null {
  const raw = String(text ?? '').trim()
  if (!raw || raw.startsWith('/')) return null

  // Form 1: labelled, with a Total and no Item Name.
  const labelled = parseLabelled(raw)
  const hasItem = raw.split(/\r?\n/).some(l => labelOf(l)?.[0] === 'item')
  if (labelled.total && !hasItem) {
    const total = money(labelled.total)
    if (total === null || total <= 0) return null
    return {
      ok: true,
      merchant: labelled.supplier?.slice(0, 60) || undefined,
      date: labelled.date ? typedDate(labelled.date, today) : undefined,
      total, lines: [],
    }
  }

  // Form 2: one short line, a name and a figure. At most 60 characters, so a
  // sentence can never qualify.
  if (/\r?\n/.test(raw) || raw.length > 60) return null
  const m = raw.match(/^(.*?)\s*(?:rm\s*)?([\d]+(?:[.,]\d{1,2})?)\s*$/i)
  if (!m) return null
  const name = m[1].replace(/[-–:=]+\s*$/, '').trim()
  const total = money(m[2])
  if (total === null || total <= 0) return null
  // Either the money is written as RM, or the line opens with a paying word.
  // A bare "Kakak 40" is too close to ordinary chat to file on its own.
  if (!/rm\s*[\d]/i.test(raw) && !PAID_WORD.test(name)) return null
  // A SHOP NAME IS A NAME, NOT A SENTENCE. "can you check how much we spent on
  // udang last week RM 300" fits in 60 characters and would otherwise file as a
  // RM 300 bill to a payee called "can you check how much...". A payee is short
  // and contains no question or request words.
  if (!name || name.length < 2 || name.length > 40) return null
  // Whole words only: without the boundaries "Domino's" contains "do" and
  // "Isetan" contains "is", and a real payee would be refused.
  if (/(can|could|would|will|what|which|how|why|when|where|who|is|are|was|were|do|does|did|should|please|thanks|tolong|boleh|berapa|kenapa)/i.test(name)) return null
  // A payee is a name, not a clause. Five words is Technology Park Malaysia
  // Flexi Parking; anything longer is somebody talking.
  if (name.split(/\s+/).filter(Boolean).length > 5) return null
  // A name that is only digits or punctuation is not a payee.
  if (!/[a-z\u0E00-\u0E7F]/i.test(name)) return null
  return { ok: true, merchant: name.slice(0, 60), date: undefined, total, lines: [] }
}

/** The template, ready to paste. Shown whenever a bill can't be read. */
export const TEMPLATE =
  'Supplier: \n' +
  'Date: \n' +
  'Item Name: \n' +
  'Weight: \n' +
  'Quantity: \n' +
  'Price: RM '

/**
 * Pull labelled header lines out of a reply ("Shop: Pasar Borong / Date: 22/09 /
 * Total: RM 112.70"). Used when a receipt was unreadable in some field and the
 * staff are asked to fill a template: anything not in this shape is refused,
 * rather than guessed at.
 */
export function parseLabelled(text: string): { supplier?: string; date?: string; total?: string } {
  const out: { supplier?: string; date?: string; total?: string } = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const hit = labelOf(line)
    if (!hit) continue
    const [key, value] = hit
    if ((key === 'supplier' || key === 'date' || key === 'total') && value.trim()) out[key] = value.trim()
  }
  return out
}
