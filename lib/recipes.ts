// The recipe book: which stock each dish on the POS uses.
//
// Built 22 Sep 2026 from the owner's "Food Recipe สูตรอาหารทุกเมนู.xlsx" plus
// his answers in chat, which OVERRIDE the sheet where they differ (tomyum chicken
// 100 g, tomyum seafood 3 shrimp + 40 g squid + 3 mussels, set chicken 80 g...).
// Entries marked `guess` are my fill-ins for gaps; the Recipes page shows them
// as such so he can correct them.
//
// Matching: EasyEat names mix English, Malay and Thai ("Beef Oyster Sauce
// (เนื้อน้ำมันหอย)"). Thai is stripped, the rest lower-cased, and each recipe's
// `pattern` is tried in `sort` order -- first match wins, so specific dishes
// ("tomyum fried rice") sit above the families they'd otherwise fall into
// ("tomyum"). `variant` narrows by the variation text ("(Beef)").
//
// Pure: safe to test directly. The seed is written to the `recipes` table once
// and edited there; this file is the starting point, not the live copy.
import { variationParts, isSet, type DishLine } from './easyeat'

export type Line = { item: string; qty: number }
export type Size = 'S' | 'M' | 'L'
export type Recipe = {
  key: string
  label: string
  pattern: string
  variant?: string | null
  variant_not?: string | null
  sizes: Partial<Record<Size, Line[]>>
  guess?: boolean
  sort: number
}

export const RICE_G = 110 // per portion; from "a 10 kg bag lasts about RM 2,500 of sales"
const L = (item: string, qty: number): Line => ({ item, qty })
const rice = L('rice', RICE_G)

type Seed = Omit<Recipe, 'sort'>
const S = (key: string, label: string, pattern: string, s: Line[], more: Partial<Seed> = {}): Seed =>
  ({ key, label, pattern, ...more, sizes: { S: s, ...(more.sizes ?? {}) } })
const SM = (key: string, label: string, pattern: string, item: string, s: number, m: number, more: Partial<Seed> = {}): Seed =>
  ({ key, label, pattern, sizes: { S: [L(item, s)], M: [L(item, m)] }, ...more })

const SEED: Seed[] = [
  // ── rice & eggs ──────────────────────────────────────────────────────────
  S('rice-plate', 'Plain rice (1 plate)', 'jasmine rice|^nasi putih|^white rice|^plain rice', [rice]),
  S('egg-fried-rice', 'Egg fried rice', 'egg fried rice|nasi goreng telur', [L('egg', 1), rice]),
  S('telur', 'Telur dadar / mata', 'telur dadar|telur mata|telur goreng|fried egg|omelet', [L('egg', 1)]),

  // ── fried rice & rice plates (above "tomyum", "petai", "chicken") ─────────
  S('hatyai', 'Nasi goreng ayam goreng Hatyai (1/6 bird)', 'hat ?yai', [L('leg', 1 / 3), L('breast', 50), rice]),
  S('fr-kampung', 'Kampung fried rice', 'kampung fried rice|nasi goreng kampung', [L('leg', 1), rice]),
  S('fr-tomyum', 'Tomyum fried rice', 'tom ?y[au]m fried rice|nasi goreng tom ?y[au]m', [L('leg', 1), rice]),
  S('shrimp-petai', 'Udang masak petai', '(udang|shrimp|prawn).*petai', [L('shrimp', 6)]),
  S('fr-petai', 'Nasi goreng petai', 'petai', [L('leg', 1), rice]),
  S('fr-belacan', 'Nasi goreng belacan', 'nasi goreng belacan|belacan fried rice|nasi kerabu belacan', [L('breast', 80), rice]),
  S('fr-seafood', 'Seafood fried rice', 'seafood fried rice|nasi goreng seafood', [L('shrimp', 3), L('squid', 40), rice]),
  S('fr-thai-seafood', 'Thai fried rice, seafood', 'nasi goreng thai|thai fried rice', [L('shrimp', 3), L('squid', 40), rice], { variant: 'seafood|udang|sotong' }),
  S('fr-thai-crab', 'Thai fried rice, crab meat', 'nasi goreng thai|thai fried rice', [rice], { variant: 'crab|ketam' }),
  S('fr-thai', 'Thai fried rice, chicken', 'nasi goreng thai|thai fried rice', [L('leg', 1), rice]),
  S('khao-mok', 'Nasi khao mok', 'khao ?mok|nasi mok', [L('leg', 1), rice]),
  S('katsu', 'Green curry chicken katsu (half breast)', 'katsu', [L('breast', 100), rice]),
  S('nasi-krapao-beef', 'Nasi pad krapao, beef', '^nasi pad kra', [L('beef', 80), L('egg', 1), rice], { variant: 'beef|daging' }),
  S('nasi-krapao-seafood', 'Nasi pad krapao, seafood', '^nasi pad kra', [L('shrimp', 3), L('squid', 40), L('egg', 1), rice], { variant: 'seafood', guess: true }),
  S('nasi-krapao', 'Nasi pad krapao, chicken', '^nasi pad kra', [L('breast', 80), L('egg', 1), rice]),

  // ── noodles ────────────────────────────────────────────────────────────────
  S('tyn-seafood', 'Tomyum noodles, seafood', 'tom ?y[au]m noodles? seafood', [L('shrimp', 2), L('squid', 20)]),
  S('tyn-galah', 'Tomyum noodles, udang galah', 'tom ?y[au]m noodles? (udang galah|galah)', [L('galah', 2)]),
  S('tyn-chicken', 'Tomyum noodles, chicken', 'tom ?y[au]m noodles?', [L('breast', 80)]),
  S('ktg-seafood', 'Kuay teow goreng, seafood', 'k[uw]e?a?y ?t[eu]o?w goreng|char kuey', [L('shrimp', 3), L('squid', 40)], { variant: 'seafood' }),
  S('ktg', 'Kuay teow goreng, chicken', 'k[uw]e?a?y ?t[eu]o?w goreng|char kuey', [L('breast', 80)]),
  S('kungfu-beef', 'Kuey teow kungfu, beef', 'kung ?fu', [L('beef', 80)], { variant: 'beef|daging' }),
  S('kungfu', 'Kuey teow kungfu, chicken', 'kung ?fu', [L('breast', 80)]),
  S('padthai-galah', 'Pad thai, udang galah', 'pad ?thai', [L('galah', 3)], { variant: 'galah' }),
  S('padthai-shrimp', 'Pad thai, shrimp', 'pad ?thai', [L('shrimp', 3)], { variant: 'shrimp|udang|prawn' }),
  S('padthai', 'Pad thai, chicken', 'pad ?thai', [L('breast', 80)]),
  S('khao-soy', 'Khao soy', 'khao ?so[yi]', [L('leg', 1)]),

  // ── tomyum & soups ─────────────────────────────────────────────────────────
  S('tomyam-jaosamut', 'Tomyam kelapa Jaosamut', 'jaosamut', [L('shrimp', 3), L('squid', 40), L('mussel', 3), L('galah', 2), L('crab', 1)]),
  S('tomyum-galah', 'Tomyum udang galah', 'tom ?y[au]m.*galah', [L('galah', 2)], { sizes: { M: [L('galah', 4)] } }),
  S('tomyum-seafood', 'Tomyum seafood', 'tom ?y[au]m.*seafood', [L('shrimp', 3), L('squid', 40), L('mussel', 3)]),
  S('tomyum-chicken', 'Tomyum chicken', 'tom ?y[au]m', [L('breast', 100)]),
  SM('tom-kha', 'Tom kha gai', 'tom ?kha', 'breast', 80, 160, { sizes: { S: [L('breast', 80)], M: [L('breast', 160)], L: [L('breast', 240)] } }),
  S('sup-daging', 'Sup daging / tom sab daging', 'sup daging|tom ?sa[ab]+ daging|soup daging|beef soup', [L('beef', 90)]),
  S('sup-ekor', 'Sup ekor', 'ekor|oxtail', [L('beef', 40)], { guess: true }),
  S('sup-tulang', 'Sup tulang', 'tulang', [L('beef', 40)], { guess: true }),
  S('feet', 'Chicken feet dishes (tom sab / kerabu)', 'kaki ayam|chicken feet', [L('feet', 7)]),
  S('kengsom-udang', 'Keng som udang', 'keng ?som udang|kengsom udang', [L('shrimp', 4)]),
  SM('green-curry', 'Green curry', 'green curry|kari hijau', 'breast', 80, 160),
  S('massaman', 'Massaman daging', 'm[au]ss?[au]man', [L('beef', 90)]),

  // ── kerabu & somtum ────────────────────────────────────────────────────────
  S('kerabu-sh-seafood', 'Kerabu soo hoon / maggie, seafood', 'kerabu (soo ?hoon|maggi|mama)', [L('shrimp', 2), L('squid', 40)], { variant: 'seafood' }),
  S('kerabu-sh', 'Kerabu soo hoon / maggie, chicken', 'kerabu (soo ?hoon|maggi|mama)', [L('breast', 80)]),
  S('kerabu-campur', 'Kerabu campur', 'kerabu campur', [L('breast', 40), L('squid', 40), L('shrimp', 4), L('mussel', 4)], { guess: true }),
  S('nam-tok', 'Kerabu daging / tiger cry', 'kerabu daging|nam ?tok|tiger cry|crying tiger', [L('beef', 180)]),
  S('larb-beef', 'Larb daging', 'larb|laab|laap', [L('beef', 160)], { variant: 'beef|daging' }),
  S('larb', 'Larb ayam', 'larb|laab|laap', [L('breast', 160)]),
  SM('kerabu-ayam', 'Kerabu ayam / chicken spicy', 'kerabu ayam|chicken spicy|yam gai', 'breast', 80, 160),
  S('somtum-goreng', 'Somtum goreng udang', 'som ?tum goreng|fried som ?tum', [L('shrimp', 4)]),
  S('somtum-plara', 'Somtum plara', 'pla ?ra', [L('shrimp', 4)]),

  // ── seafood ────────────────────────────────────────────────────────────────
  S('siakap', 'Siakap (1 fish)', 'siakap|barramundi|pla pao|mieng pla|ikan(?! masin)', [L('siakap', 1)]),
  S('seafood-chilli-crab', 'Seafood chilli crab', 'seafood chil+i crab', [L('shrimp', 6), L('squid', 80), L('mussel', 6)]),
  S('lala', 'Lala', 'lala', [L('lala', 250)]),
  S('galah-dish', 'Udang galah dishes', 'udang galah|galah', [L('galah', 5)]),
  S('shrimp-donut', 'Donat udang', 'donat udang|shrimp donut|tod ?man', [L('breast', 160), L('shrimp', 4), L('egg', 1)], { guess: true }),
  S('shrimp-dish', 'Shrimp dishes (6 shrimp)', 'udang|shrimp|prawn', [L('shrimp', 6)]),
  SM('squid-dish', 'Sotong / calamari dishes', 'sotong|calamari|squid|octopus', 'squid', 80, 160),

  // ── chicken & beef ala carte ───────────────────────────────────────────────
  S('tongue', 'Lidah (tongue)', 'lidah|tongue', [L('tongue', 120)]),
  SM('beef-minced', 'Beef, minced', '(cincang|minced?).*(beef|daging)|(beef|daging).*(cincang|minced?)', 'beef', 160, 240),
  SM('chicken-minced', 'Chicken, minced', 'cincang|minced?', 'breast', 160, 240),
  SM('beef', 'Beef dishes', 'beef|daging', 'beef', 80, 160),
  S('wings', 'Chicken wings (not tracked)', 'wings?\\b|kepak', []),
  SM('chicken', 'Chicken dishes', 'chicken|ayam|\\bgai\\b', 'breast', 80, 160),

  // ── matched, nothing tracked ───────────────────────────────────────────────
  S('somtum', 'Somtum / kerabu mangga (no tracked items)', 'som ?tum|kerabu mangga|mango salad', []),
]

export const RECIPE_SEED: Recipe[] = SEED.map((r, i) => ({ ...r, sort: (i + 1) * 10 }))

// Drinks, veg and desserts: sold, but nothing on the tracked list.
const UNTRACKED_CATEGORY = /beverage|drink|minuman|sayur|vegetable|dessert/i
const UNTRACKED_NAME = /bingsu|sticky rice|ice cream|^ice\b|^air\b/i

export const normName = (s: string) =>
  String(s || '')
    .replace(/[฀-๿]+/g, ' ')   // Thai script
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function sizeOf(variation: string): Size {
  const v = variation.toLowerCase()
  if (/\blarge\b/.test(v)) return 'L'
  if (/\bmedium\b/.test(v)) return 'M'
  return 'S'
}

const safe = (src: string | null | undefined) => {
  if (!src) return null
  try { return new RegExp(src, 'i') } catch { return null }
}

export function findRecipe(name: string, variation: string, book: Recipe[]): Recipe | null {
  const n = normName(name)
  const v = normName(variation)
  for (const r of [...book].sort((a, b) => a.sort - b.sort)) {
    const p = safe(r.pattern)
    if (!p || !p.test(n)) continue
    const vr = safe(r.variant)
    if (vr && !vr.test(v)) continue
    const vn = safe(r.variant_not)
    if (vn && vn.test(v)) continue
    return r
  }
  return null
}

const linesFor = (r: Recipe, size: Size): Line[] => r.sizes[size] ?? r.sizes.S ?? []

export type Use = Record<string, number>
export type LineResult = {
  line: DishLine
  status: 'deducted' | 'untracked' | 'unmatched'
  recipe?: { key: string; label: string; guess: boolean }
  /** Stock used by ONE of this dish (multiply by line.qty for the day). */
  each: Use
  /** Set parts that couldn't be matched. */
  missing?: string[]
}

const add = (u: Use, lines: Line[], times = 1) => {
  for (const l of lines) u[l.item] = (u[l.item] ?? 0) + l.qty * times
}

/** A set's contents come from its variation: "(Kuah Merah)(Siakap Stim Limau)…(4 plate rice)". */
function expandSet(line: DishLine, book: Recipe[]): { each: Use; missing: string[]; guess: boolean } {
  const each: Use = {}
  const missing: string[] = []
  let guess = false
  const soup = book.find(r => r.key === 'tomyum-seafood')
  for (const part of variationParts(line.variation)) {
    const p = normName(part)
    const plates = p.match(/(\d+)\s*plates?\s*rice/)
    if (plates) { add(each, [rice], Number(plates[1])); continue }
    if (!p || /^no\b/.test(p) || /bingsu|dessert|sticky/.test(p)) continue
    // Owner, 22 Sep: the set's soup is Tomyum Seafood, whichever broth.
    if (/kuah|soup/.test(p) && soup) { add(each, linesFor(soup, 'S')); continue }
    const r = findRecipe(part, '', book)
    if (r) { add(each, linesFor(r, 'S')); guess ||= !!r.guess }
    else missing.push(part)
  }
  return { each, missing, guess }
}

/** An egg bought as an add-on ("+RM 2") on a dish that doesn't already include one. */
function eggAddOn(variation: string): boolean {
  return variationParts(variation).some(p => {
    const t = normName(p)
    return /\b(egg|telur)\b/.test(t) && !/\bno\b|salted|masin|tanpa|without/.test(t)
  })
}

export function matchLine(line: DishLine, book: Recipe[]): LineResult {
  if (isSet(line)) {
    const { each, missing, guess } = expandSet(line, book)
    return {
      line, each, missing,
      status: Object.keys(each).length ? 'deducted' : 'unmatched',
      recipe: { key: 'set', label: 'Set menu (from its contents)', guess },
    }
  }
  if (UNTRACKED_CATEGORY.test(line.category) || UNTRACKED_NAME.test(normName(line.name))) {
    return { line, each: {}, status: 'untracked' }
  }
  const r = findRecipe(line.name, line.variation, book)
  if (!r) return { line, each: {}, status: 'unmatched' }
  const each: Use = {}
  add(each, linesFor(r, sizeOf(line.variation)))
  if (eggAddOn(line.variation) && !each.egg) each.egg = 1
  return {
    line, each,
    status: Object.keys(each).length ? 'deducted' : 'untracked',
    recipe: { key: r.key, label: r.label, guess: !!r.guess },
  }
}

export type DayUse = {
  results: LineResult[]
  total: Use
  setsSold: number
  unmatched: { name: string; variation: string; qty: number; total: number }[]
}

export function useForDay(lines: DishLine[], book: Recipe[]): DayUse {
  const results = lines.map(l => matchLine(l, book))
  const total: Use = {}
  for (const r of results) for (const [k, q] of Object.entries(r.each)) total[k] = (total[k] ?? 0) + q * r.line.qty
  return {
    results,
    total,
    setsSold: lines.filter(isSet).reduce((t, l) => t + l.qty, 0),
    unmatched: results.filter(r => r.status === 'unmatched')
      .map(r => ({ name: r.line.name, variation: r.line.variation, qty: r.line.qty, total: r.line.total })),
  }
}
