// The ingredients the kitchen tracks, and how a receipt line becomes stock.
//
// ONLY THE COSTLY ITEMS (owner's call, 22 Sep 2026): proteins, eggs, rice. Veg,
// sauces, drinks and noodles are not deducted -- they stay as Cash Out spend.
//
// Every quantity is held in the item's own unit: grams, pieces, or fish. A
// receipt says "2 kg", a recipe says "6 shrimp", so the conversions live here in
// one place and both sides meet in the same unit.
//
// Pure: no server imports, safe to test directly.

export type Unit = 'g' | 'pc' | 'fish'

export type ItemDef = {
  key: string
  name: string
  unit: Unit
  /** Receipt names that mean this item. Lower-case regex sources. */
  aliases: string[]
  /** Pieces per kg, for items bought by weight and used by the piece. */
  perKg?: number
  /** % of the bought weight that reaches a plate after trimming (owner's figures). */
  usablePct?: number
  /** Rough cost per unit, used ONLY until a receipt gives the real price. */
  fallbackCost: number
  /** Portioned into bags of this many grams (usable, already trimmed): counted in bags. */
  bagG?: number
  /** When a receipt line has no weight, assume this pack size in kg. */
  defaultPackKg?: number
  sort: number
}

// Owner's figures, 22 Sep 2026. Where a number is a starting guess it says so;
// the weekly count shows how far off it is.
export const ITEMS: ItemDef[] = [
  { key: 'breast', name: 'Chicken breast (boneless)', unit: 'g', sort: 10,
    // 2 kg bag loses about 80 g in trimming.
    usablePct: 96, fallbackCost: 0.012, bagG: 80,
    aliases: ['boneless breast', 'chicken breast', 'breast', 'dada ayam', 'isi dada', 'fillet ayam'] },
  { key: 'leg', name: 'Chicken leg quarter', unit: 'pc', sort: 11, perKg: 3.3, fallbackCost: 1.7,
    aliases: ['leg quarter', 'peha', 'thigh', 'drumstick', 'chicken leg'] },
  { key: 'feet', name: 'Chicken feet', unit: 'pc', sort: 12, perKg: 30, fallbackCost: 0.2,
    aliases: ['kaki ayam', 'chicken feet', 'ceker'] },
  { key: 'beef', name: 'Beef', unit: 'g', sort: 20, usablePct: 80, fallbackCost: 0.035, bagG: 80,
    // Owner's rule (22 Sep 2026): buffalo meat is stocked and used as beef.
    aliases: ['daging', 'beef', 'buffalo', 'kerbau', 'carabeef'] },
  { key: 'tongue', name: 'Beef tongue', unit: 'g', sort: 21, fallbackCost: 0.03, bagG: 120,
    aliases: ['lidah', 'tongue'] },
  { key: 'shrimp', name: 'Shrimp (fresh)', unit: 'pc', sort: 30, perKg: 38, fallbackCost: 0.75,
    aliases: ['udang(?! galah)', 'prawn', 'shrimp'] },
  // Owner, 23 Sep 2026: frozen shrimp is a different item -- it only goes into
  // fried rice; every other shrimp dish uses fresh. Checked BEFORE 'shrimp'.
  { key: 'shrimp_frozen', name: 'Shrimp (frozen)', unit: 'pc', sort: 31, perKg: 38, fallbackCost: 0.5,
    aliases: ['(frz|frozen|beku|iqf)[^a-z]*(isi )?(udang|prawn|shrimp)', '(udang|prawn|shrimp)[^a-z]*(frz|frozen|beku|iqf)'] },
  { key: 'galah', name: 'Udang galah', unit: 'pc', sort: 31, perKg: 20, fallbackCost: 3,
    aliases: ['udang galah', 'river prawn', 'galah'] },
  { key: 'crab', name: 'Crab', unit: 'pc', sort: 32, perKg: 6, fallbackCost: 6,
    aliases: ['ketam', 'crab'] },
  { key: 'squid', name: 'Squid / octopus', unit: 'g', sort: 33, usablePct: 75, fallbackCost: 0.03, bagG: 80,
    aliases: ['sotong', 'squid', 'calamari', 'octopus'] },
  { key: 'mussel', name: 'Mussels', unit: 'pc', sort: 34, perKg: 20, fallbackCost: 0.25,
    // A Sri Ternak bag is about 20 pieces; treated as a 1 kg bag when no weight prints.
    defaultPackKg: 1,
    aliases: ['kupang', 'mussel', 'kerang hijau'] },
  { key: 'lala', name: 'Lala', unit: 'g', sort: 35, fallbackCost: 0.015, bagG: 250,
    aliases: ['lala', 'clam', 'kepah'] },
  { key: 'siakap', name: 'Siakap', unit: 'fish', sort: 36, fallbackCost: 12,
    aliases: ['siakap', 'barramundi', 'sea ?bass', 'kerapu'] },
  { key: 'egg', name: 'Eggs', unit: 'pc', sort: 40, fallbackCost: 0.45,
    aliases: ['telur(?! masin)', '\\begg'] },
  { key: 'rice', name: 'Rice (uncooked)', unit: 'g', sort: 50, fallbackCost: 0.0046,
    // "ROYAL UMBRELLA BERAS" prints no weight; the owner buys 10 kg bags.
    defaultPackKg: 10,
    aliases: ['beras(?! pulut)', 'royal umbrella', 'jasmine rice', '\\brice\\b'] },
]

export const ITEM = Object.fromEntries(ITEMS.map(i => [i.key, i])) as Record<string, ItemDef>

// A whole bird isn't a stock item of its own: it becomes leg quarters plus
// breast the moment it's cut. Starting estimate (owner chose "estimate, the count
// corrects it"): one ~1.8 kg bird = 2 leg quarters + 300 g breast.
export const BIRD_KG = 1.8
export const BIRD_YIELD = { leg: 2, breast: 300 }
const WHOLE_BIRD = /(ayam segar|whole chicken|ayam proses|ayam bulat|ayam hidup)/

// Receipt lines that contain an alias word but are NOT the ingredient.
const NOT_STOCK = /(stok|stock|kiub|cube|perasa|serbuk|powder|sos|sauce|tepung|flour|mee|mi |bihun|kuey|noodle|minyak|oil|kicap|pes|paste|keropok|cracker|nugget|sosej|sausage|burger|masin kering|kering|dried|biskut|susu)/

/** Uses of `unit` and 'fish' are singular-friendly labels for the UI. */
export function fmtQty(q: number, unit: Unit): string {
  const r = (x: number, dp = 0) => x.toLocaleString('en-MY', { maximumFractionDigits: dp })
  if (unit === 'g') return Math.abs(q) >= 1000 ? `${r(q / 1000, 2)} kg` : `${r(q)} g`
  if (unit === 'fish') return `${r(q, 1)} fish`
  return `${r(q, 1)} pc${Math.abs(q) === 1 ? '' : 's'}`
}

export type ReceiptLine = {
  name: string; qty?: number; unit?: string; line_total?: number
  pack_size?: number; pack_unit?: string; base_qty?: number; base_unit?: string
  expense_type?: string
}

export type StockIn = { item: string; qty: number; unit_cost: number | null; from: string; note?: string }

// Names the owner has marked "not stock" -- vegetables, sauces, dry goods. Kept
// under this key in the taught-alias map so the same "this is…" picker can also
// mean "stop asking me about this one".
export const IGNORE_KEY = '__ignore'

/** Which stock item a receipt name means, if any. Owner-taught aliases win. */
export function itemForName(name: string, extraAliases: Record<string, string[]> = {}): string | 'bird' | null {
  const n = ' ' + String(name || '').toLowerCase() + ' '
  // Taught aliases first: an exact "this is…" from the owner beats any guess.
  if ((extraAliases[IGNORE_KEY] ?? []).some(a => a && n.includes(a.toLowerCase()))) return null
  for (const [key, list] of Object.entries(extraAliases)) {
    if (key === IGNORE_KEY) continue
    if (list.some(a => a && n.includes(a.toLowerCase()))) return key
  }
  if (WHOLE_BIRD.test(n)) return 'bird'
  if (NOT_STOCK.test(n)) return null
  // Most specific first: "udang galah" must not land on shrimp, "kaki ayam" not on breast.
  for (const key of ['galah', 'feet', 'tongue', 'breast', 'leg', 'shrimp_frozen', 'shrimp', 'crab', 'squid', 'mussel', 'lala', 'siakap', 'beef', 'egg', 'rice']) {
    if (ITEM[key].aliases.some(a => new RegExp(a).test(n))) return key
  }
  return null
}

/** kg in a receipt line: its printed weight, else the name ("10KG"), else the item's usual pack. */
function kgOf(l: ReceiptLine, def?: ItemDef): number | null {
  if (typeof l.base_qty === 'number' && l.base_qty > 0 && (l.base_unit === 'kg' || !l.base_unit)) return l.base_qty
  const m = String(l.name).match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i)
  const qty = Number(l.qty) > 0 ? Number(l.qty) : 1
  if (m) return (m[2].toLowerCase() === 'kg' ? Number(m[1]) : Number(m[1]) / 1000) * qty
  // A loose weighed item often comes back as qty in kg.
  if (l.unit && /^kg$/i.test(l.unit)) return qty
  if (def?.defaultPackKg) return def.defaultPackKg * qty
  return null
}

/** Pieces printed on a pack: "TELUR GRED A 30S", "10 BIJI". */
function packCount(name: string): number | null {
  const m = String(name).match(/(\d+)\s*(s|biji|pcs|pc|ekor|keping)\b/i)
  return m ? Number(m[1]) : null
}

/**
 * Turn one receipt line into stock. Returns [] for lines that aren't tracked
 * stock, and a line with `note` when it IS stock but the quantity couldn't be
 * worked out (shown on the Stock page for a human to fix).
 */
export function stockFromLine(l: ReceiptLine, extraAliases: Record<string, string[]> = {}): StockIn[] | { unknownQty: string; item: string } {
  const key = itemForName(l.name, extraAliases)
  if (!key) return []
  const total = Number(l.line_total) || 0
  const qty = Number(l.qty) > 0 ? Number(l.qty) : 1

  if (key === 'bird') {
    const kg = kgOf(l)
    if (!kg) return { unknownQty: l.name, item: 'bird' }
    const birds = kg / BIRD_KG
    const legs = birds * BIRD_YIELD.leg
    const breast = birds * BIRD_YIELD.breast
    // Split the bird's cost by weight: a leg quarter weighs about 300 g.
    const perKg = total > 0 ? total / kg : null
    return [
      { item: 'leg', qty: legs, unit_cost: perKg ? perKg * 0.3 : null, from: l.name, note: `${birds.toFixed(1)} birds (est. ${BIRD_KG} kg each)` },
      { item: 'breast', qty: breast, unit_cost: perKg ? perKg / 1000 : null, from: l.name, note: `${birds.toFixed(1)} birds` },
    ]
  }

  const def = ITEM[key]
  const usable = (def.usablePct ?? 100) / 100
  let q: number | null = null
  if (def.unit === 'g') {
    const kg = kgOf(l, def)
    q = kg ? kg * 1000 * usable : null
  } else if (def.unit === 'fish') {
    // Bought by the fish, or by weight at ~550 g a fish.
    const kg = l.unit && /^kg$/i.test(l.unit) ? qty : null
    q = kg ? kg / 0.55 : qty
  } else {
    const pack = packCount(l.name)
    if (key === 'egg') q = (pack ?? 1) * qty
    else {
      const kg = kgOf(l, def)
      q = kg && def.perKg ? kg * def.perKg * usable : pack ? pack * qty : null
    }
  }
  if (!q || !Number.isFinite(q)) return { unknownQty: l.name, item: key }
  return [{ item: key, qty: q, unit_cost: total > 0 ? total / q : null, from: l.name }]
}
