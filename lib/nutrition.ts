// 👉 Calories. Pure arithmetic, no server imports, so it can be tested directly.
//
// THE POINT OF THIS FILE. A photo of a plate can only ever be a guess. But the
// owner eats his own restaurant's food most days, and every dish on that menu
// already has gram weights in lib/recipes.ts -- 80 g breast, 110 g uncooked
// rice, 3 shrimp. So for those meals the calories are a sum, not an opinion,
// and the sum is shown so a wrong line can be spotted.
//
// Figures are per 100 g RAW unless the name says otherwise, from the Malaysian
// food composition tables and USDA. They are honest round numbers, not
// laboratory ones: a plate of fried rice varies by more than any of these.

/** kcal per 100 g, raw weight, for the ingredients the kitchen already tracks. */
export const KCAL_PER_100G: Record<string, number> = {
  breast: 120,          // chicken breast, boneless skinless
  leg: 215,             // leg quarter with skin -- a whole quarter is ~300 g
  feet: 215,
  beef: 190,            // lean-ish beef / buffalo
  tongue: 225,
  shrimp: 85,
  shrimp_frozen: 85,
  galah: 90,
  crab: 85,
  squid: 90,            // squid / octopus
  squid_frozen: 90,
  mussel: 85,
  lala: 80,
  siakap: 95,           // barramundi
  egg: 145,
  rice: 355,            // UNCOOKED rice: 110 g raw = one portion = ~390 kcal
}

/** What one piece weighs, for the items counted in pieces rather than grams. */
export const PIECE_G: Record<string, number> = {
  leg: 300,             // a leg quarter
  feet: 35,
  shrimp: 30,           // ~33 to a kilo (owner, 24 Sep 2026)
  shrimp_frozen: 30,
  galah: 50,
  crab: 165,
  mussel: 15,           // shell-on, edible part much less; treated as eaten weight
  squid_frozen: 55,     // one ring, 18 to a kilo
  siakap: 550,          // one fish (owner: 500-600 g, he settled on 550)
  egg: 55,
}

/**
 * What the recipe book cannot see: oil, sauce, sugar, coconut milk.
 *
 * A stir-fry leaves a tablespoon of oil on the plate; a soup leaves none. This
 * is the honest fudge factor, and it is shown on its own line so the owner can
 * argue with it rather than wonder about it.
 */
export const COOKING_KCAL: { test: RegExp; kcal: number; why: string }[] = [
  { test: /fried rice|nasi goreng|kuay ?teow|pad ?thai|mee goreng|char/i, kcal: 180, why: 'oil for frying rice or noodles' },
  { test: /goreng|fried|crispy|butter|tempura|katsu|tod/i, kcal: 220, why: 'deep frying and batter' },
  { test: /kelapa|santan|coconut|green curry|gaeng|rendang|massaman/i, kcal: 200, why: 'coconut milk' },
  { test: /salted egg|cheese|creamy|mayo/i, kcal: 190, why: 'salted egg or cream sauce' },
  { test: /pad ?krapao|kra ?pao|stir|tumis|sambal|kung ?fu|garlic|pepper|chil+i|spicy|masak/i, kcal: 120, why: 'oil and sauce for stir-frying' },
  { test: /tom ?y[au]m|soup|sup|clear|stim|steam|kukus|salad|yam|kerabu|nam ?tok/i, kcal: 40, why: 'a light broth or dressing' },
]

/**
 * The carbohydrate the recipe book cannot see.
 *
 * The kitchen tracks proteins, eggs and rice -- not noodles, not kuay teow, not
 * the rice inside a dish whose recipe lists no rice line. Left out, a plate of
 * pad thai reads as 280 kcal, which would be a lie told in the owner's favour.
 */
export const BASE_KCAL: { test: RegExp; kcal: number; why: string; item?: string }[] = [
  { test: /kuay ?teow|kwe ?tiau|char ?kuey|hor fun/i, kcal: 330, why: 'a plate of kuay teow' },
  { test: /pad ?thai|sen ?lek|rice noodle/i, kcal: 350, why: 'rice noodles' },
  { test: /bee ?hoon|mee ?hoon|vermicelli|soo ?hoon|glass noodle/i, kcal: 300, why: 'bee hoon' },
  { test: /maggi|instant noodle|ramen|mama/i, kcal: 350, why: 'instant noodles' },
  { test: /\bmee\b|mi goreng|noodle|yellow noodle|udon/i, kcal: 340, why: 'noodles' },
  { test: /spaghetti|pasta|penne/i, kcal: 350, why: 'pasta' },
  { test: /roti|bread|bun|burger/i, kcal: 260, why: 'bread' },
  { test: /nasi|rice|khao|\bkao\b/i, kcal: 390, why: 'a plate of rice', item: 'rice' },
]

/** The carb under the dish, unless the recipe already counted it. */
export function baseAllowance(dish: string, already: Record<string, number>) {
  const hit = BASE_KCAL.find(b => b.test.test(dish))
  if (!hit) return null
  if (hit.item && (already[hit.item] ?? 0) > 0) return null   // the recipe counted the rice
  return hit
}

export const cookingAllowance = (dish: string) =>
  COOKING_KCAL.find(c => c.test.test(dish)) ?? { kcal: 100, why: 'the usual oil and seasoning' }

/**
 * Dishes the owner eats that are NOT on his menu, per standard portion.
 * Malaysian and Thai staples, so a typed "nasi lemak" needs no photo and no
 * model call. Calories are for one normal serving as sold.
 */
export const COMMON_DISHES: { match: RegExp; name: string; kcal: number; note: string }[] = [
  { match: /nasi lemak.*(ayam|chicken)|ayam.*nasi lemak/i, name: 'Nasi lemak with fried chicken', kcal: 950, note: 'rice in coconut milk, fried chicken, sambal, egg' },
  { match: /nasi lemak/i, name: 'Nasi lemak (plain)', kcal: 500, note: 'coconut rice, sambal, anchovies, peanut, egg' },
  { match: /roti canai|roti kosong/i, name: 'Roti canai', kcal: 300, note: 'one piece with dhal' },
  { match: /roti telur/i, name: 'Roti telur', kcal: 400, note: 'one piece with egg' },
  { match: /nasi kandar|nasi campur|mixed rice/i, name: 'Nasi campur', kcal: 800, note: 'rice with two or three dishes' },
  { match: /char ?kuey ?teow|char ?kway/i, name: 'Char kuey teow', kcal: 740, note: 'one plate' },
  { match: /mee goreng|mi goreng/i, name: 'Mee goreng', kcal: 660, note: 'one plate' },
  { match: /maggi goreng/i, name: 'Maggi goreng', kcal: 700, note: 'one plate' },
  { match: /nasi goreng/i, name: 'Nasi goreng', kcal: 640, note: 'one plate' },
  { match: /tom ?y[au]m/i, name: 'Tomyam', kcal: 300, note: 'one bowl with seafood' },
  { match: /pad ?thai/i, name: 'Pad thai', kcal: 700, note: 'one plate' },
  { match: /som ?tam|papaya salad/i, name: 'Som tam', kcal: 150, note: 'one plate' },
  { match: /mango sticky rice|bingsu/i, name: 'Mango sticky rice', kcal: 480, note: 'one serving' },
  { match: /teh tarik|teh ais|milk tea/i, name: 'Teh tarik', kcal: 180, note: 'one glass, condensed milk' },
  { match: /kopi ?o|black coffee|americano|long black/i, name: 'Black coffee', kcal: 5, note: 'no sugar, no milk' },
  { match: /kopi|latte|white coffee/i, name: 'Coffee with milk and sugar', kcal: 150, note: 'one cup' },
  { match: /coke|pepsi|soft drink|sprite|100 ?plus/i, name: 'Soft drink', kcal: 140, note: 'one can, 330 ml' },
  { match: /beer|stout|guinness/i, name: 'Beer', kcal: 200, note: 'one can or small glass' },
  { match: /nasi putih|white rice|plain rice|steamed rice/i, name: 'Plain rice', kcal: 260, note: 'one plate, ~200 g cooked' },
  { match: /banana|pisang/i, name: 'Banana', kcal: 100, note: 'one medium' },
  { match: /apple|epal/i, name: 'Apple', kcal: 80, note: 'one medium' },
  { match: /egg|telur/i, name: 'Egg', kcal: 80, note: 'one egg' },
]

export const findCommonDish = (text: string) => COMMON_DISHES.find(d => d.match.test(String(text || ''))) ?? null

// ---------------------------------------------------------------------------
// The budget
// ---------------------------------------------------------------------------
export type Body = {
  weight_kg: number
  height_cm: number
  age: number
  sex: 'male' | 'female'
  activity: keyof typeof ACTIVITY
  /** kg a week the owner wants to lose. 0.5 is the usual safe pace. */
  lose_kg_per_week: number
}

export const ACTIVITY = {
  desk: { factor: 1.2, label: 'sitting most of the day, no exercise' },
  light: { factor: 1.375, label: 'desk work, exercise once or twice a week' },
  moderate: { factor: 1.55, label: 'on your feet, or exercise most days' },
  hard: { factor: 1.725, label: 'physical work or hard training most days' },
} as const

/** 7,700 kcal is about a kilo of body fat, so 0.5 kg a week is 550 a day. */
export const KCAL_PER_KG_FAT = 7700

/** Mifflin-St Jeor: the least-wrong of the simple formulas. */
export function bmr(b: Body): number {
  const base = 10 * b.weight_kg + 6.25 * b.height_cm - 5 * b.age
  return Math.round(base + (b.sex === 'male' ? 5 : -161))
}

export function budgetFor(b: Body) {
  const rest = bmr(b)
  const burn = Math.round(rest * ACTIVITY[b.activity].factor)
  const cut = Math.round((b.lose_kg_per_week * KCAL_PER_KG_FAT) / 7)
  // Never below the floor: under this and it stops being a diet and starts
  // being a problem -- muscle goes first and it cannot be kept up.
  const floor = b.sex === 'male' ? 1500 : 1200
  const target = Math.max(floor, Math.round((burn - cut) / 10) * 10)
  return { rest, burn, cut, target, floored: burn - cut < floor }
}

// ---------------------------------------------------------------------------
// A meal, costed
// ---------------------------------------------------------------------------
export type MealLine = { what: string; kcal: number }
export type Estimate = { kcal: number; lines: MealLine[]; confidence: 'high' | 'medium' | 'low' }

/** The calories in a recipe's worth of tracked ingredients, line by line. */
export function fromIngredients(use: Record<string, number>, dish = ''): Estimate {
  const lines: MealLine[] = []
  const base = baseAllowance(dish, use ?? {})
  for (const [item, qty] of Object.entries(use ?? {})) {
    const per100 = KCAL_PER_100G[item]
    if (!per100 || !qty) continue
    // Grams for the weighed items; pieces for the counted ones.
    const grams = PIECE_G[item] && !isGramItem(item) ? qty * PIECE_G[item] : qty
    const kcal = Math.round((grams / 100) * per100)
    if (kcal > 0) lines.push({ what: `${label(item)} ${fmtAmount(item, qty)}`, kcal })
  }
  if (base) lines.push({ what: base.why, kcal: base.kcal })
  const cook = cookingAllowance(dish)
  if (lines.length) lines.push({ what: cook.why, kcal: cook.kcal })
  return {
    kcal: lines.reduce((t, l) => t + l.kcal, 0),
    lines,
    confidence: lines.length > 1 ? 'high' : 'low',
  }
}

// Items measured in grams by the kitchen; everything else is pieces.
const GRAM_ITEMS = new Set(['breast', 'beef', 'tongue', 'squid', 'lala', 'rice'])
const isGramItem = (k: string) => GRAM_ITEMS.has(k)

const LABEL: Record<string, string> = {
  breast: 'chicken breast', leg: 'chicken leg', feet: 'chicken feet', beef: 'beef', tongue: 'beef tongue',
  shrimp: 'shrimp', shrimp_frozen: 'shrimp', galah: 'udang galah', crab: 'crab', squid: 'squid',
  squid_frozen: 'squid rings', mussel: 'mussels', lala: 'lala', siakap: 'siakap', egg: 'egg',
  rice: 'rice (uncooked)',
}
const label = (k: string) => LABEL[k] ?? k

const fmtAmount = (item: string, qty: number) =>
  isGramItem(item) ? `${Math.round(qty)} g` : `${Math.round(qty * 10) / 10} ${qty === 1 ? 'pc' : 'pcs'}`

/** One line of plain English for the whole sum. */
export const workingOf = (e: Estimate) =>
  e.lines.map(l => `${l.what} ${l.kcal}`).join(' · ') + ` = ${e.kcal} kcal`
