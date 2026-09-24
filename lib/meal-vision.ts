import 'server-only'
// 👉 Reading a plate of food. One model call, one small form back.
//
// It answers two questions at once:
//   is_food  -- so a photo in the owner's chat can be routed to the diary or to
//               the Vault without him having to say which it is
//   the meal -- what is on the plate, how big, and the calories, line by line
//
// The lines matter more than the total: "rice 400, chicken 130, oil 120" can be
// argued with; "820 kcal" cannot. Same rule as the receipts.
import Anthropic from '@anthropic-ai/sdk'

const VISION_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export type FoodLine = { what: string; grams?: number; kcal: number }
export type FoodResult = {
  is_food: boolean
  title: string
  kcal: number
  lines: FoodLine[]
  portion: string          // what it assumed: "one plate", "half a bowl"
  confidence: 'high' | 'medium' | 'low'
  drink?: boolean
  note?: string
}

const notFood: FoodResult = {
  is_food: false, title: '', kcal: 0, lines: [], portion: '', confidence: 'low',
}

const num = (v: any, max = 5000) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0
}

/**
 * Look at a photo and cost the meal.
 *
 * MENU DISHES ARE COSTED ELSEWHERE. When the plate is one of the restaurant's
 * own dishes, lib/meals.ts prices it from the recipe book instead -- real gram
 * weights beat any look at a photo. This is the fallback for everything else.
 */
export async function readMeal(base64: string, mime: string): Promise<FoodResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return notFood
  const mediaType = (mime || '').toLowerCase()
  if (!VISION_MIME.has(mediaType)) return notFood

  const system =
    `You are a dietitian looking at a photo for a man in Malaysia who is counting calories to lose weight. ` +
    `Return ONLY a JSON object (no prose, no markdown) with these keys:\n` +
    `is_food (true if the photo shows food or a drink someone is about to eat or drink; ` +
    `FALSE for a receipt, an invoice, a bill, a screenshot, a document, a person, a room, a product on a shelf), ` +
    `title (short plain name of the meal, e.g. "Nasi goreng ayam with fried egg"), ` +
    `portion (what you assumed about size in plain words, e.g. "one restaurant plate", "half a bowl", "a small handful"), ` +
    `drink (true if it is only a drink), ` +
    `lines (array of the parts of the meal, each: what (string, e.g. "white rice"), grams (number, your estimate of the cooked weight), kcal (number)), ` +
    `kcal (number, the total for the WHOLE plate as photographed), ` +
    `confidence ("high" | "medium" | "low"), ` +
    `note (one short sentence ONLY if something important is uncertain, e.g. "cannot tell if the chicken is fried or grilled").\n\n` +
    `HOW TO COUNT. Malaysian and Thai restaurant food. Be realistic, not optimistic: ` +
    `count the cooking oil, the coconut milk, the sauce and the sugar in the drink -- these are where the calories hide. ` +
    `A restaurant plate of fried rice is 600-800 kcal, not 300. Nasi lemak with fried chicken is about 950. ` +
    `A clear tomyam soup is 250-350. Teh tarik is about 180, black coffee is 5. ` +
    `Judge the portion against the plate, the bowl and any cutlery you can see. ` +
    `If several dishes are shared on the table, count only ONE person's share and say so in portion. ` +
    `If you truly cannot tell what it is, set confidence "low" and give your best guess anyway -- ` +
    `he corrects it in a word, and a rough number today beats a perfect number never.`

  let raw = ''
  try {
    const anthropic = new Anthropic({ apiKey })
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType as any, data: base64 } },
          { type: 'text', text: 'What is this, and how many calories? Return the JSON form.' },
        ],
      }],
    })
    raw = res.content.find(c => c.type === 'text')?.text ?? ''
  } catch (e) {
    console.error('[CFO] meal vision failed:', e)
    return notFood
  }

  let p: any
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    p = JSON.parse(m ? m[0] : raw)
  } catch {
    return notFood
  }

  if (!p?.is_food) return notFood

  // Never trust the model's arithmetic: rebuild the total from the lines when
  // they are there, and clamp anything absurd.
  const lines: FoodLine[] = Array.isArray(p.lines)
    ? p.lines.filter((l: any) => l && typeof l.what === 'string').slice(0, 10).map((l: any) => ({
        what: String(l.what).slice(0, 60),
        grams: l.grams ? num(l.grams, 2000) : undefined,
        kcal: Math.round(num(l.kcal, 3000)),
      })).filter((l: FoodLine) => l.kcal > 0)
    : []
  const summed = lines.reduce((t, l) => t + l.kcal, 0)
  const stated = Math.round(num(p.kcal, 5000))
  // The lines win when they exist and roughly agree; a wild total is discarded.
  const kcal = summed > 0 && (stated === 0 || Math.abs(stated - summed) > stated * 0.5) ? summed : (stated || summed)

  return {
    is_food: true,
    title: String(p.title ?? 'Meal').slice(0, 100) || 'Meal',
    kcal: Math.round(kcal / 10) * 10,
    lines,
    portion: String(p.portion ?? '').slice(0, 80),
    confidence: p.confidence === 'high' ? 'high' : p.confidence === 'low' ? 'low' : 'medium',
    drink: !!p.drink,
    note: p.note ? String(p.note).slice(0, 160) : undefined,
  }
}
