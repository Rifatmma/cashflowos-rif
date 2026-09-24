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
/** One tappable answer, and what the meal comes to if it is the right one. */
export type FoodOption = { label: string; kcal: number }
export type FoodResult = {
  is_food: boolean
  /** A plate of food as served, or the nutrition panel on a packet. */
  kind: 'plate' | 'label'
  title: string
  kcal: number
  lines: FoodLine[]
  portion: string          // what it assumed: "one plate", "half a bowl"
  confidence: 'high' | 'medium' | 'low'
  drink?: boolean
  note?: string
  /** The one thing that would most change the number, asked in a few words. */
  question?: string
  options?: FoodOption[]
}

const notFood: FoodResult = {
  is_food: false, kind: 'plate', title: '', kcal: 0, lines: [], portion: '', confidence: 'low',
}

/** A button's text has to fit a phone: short, and it carries its own number. */
const OPTION_MAX = 24
/** Cut at a word, never mid-word: "One person eats the whol" reads as a bug. */
const shortLabel = (s: string) => {
  const t = s.trim()
  if (t.length <= OPTION_MAX) return t
  const cut = t.slice(0, OPTION_MAX)
  const space = cut.lastIndexOf(' ')
  return (space > 10 ? cut.slice(0, space) : cut).replace(/[,;:]$/, '') + '…'
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
    `is_food (true if the photo shows food or a drink someone is about to eat or drink, ` +
    `OR a packet of food showing its NUTRITION LABEL; ` +
    `FALSE for a receipt, an invoice, a bill, a screenshot, a document, a person, a room), ` +
    `kind ("plate" for food as served, "label" for a packet's nutrition information), ` +
    `title (short plain name of the meal, e.g. "Nasi goreng ayam with fried egg"), ` +
    `portion (what you assumed about size in plain words, e.g. "one restaurant plate", "half a bowl", "a small handful"), ` +
    `drink (true if it is only a drink), ` +
    `lines (array of the parts of the meal, each: what (string, e.g. "white rice"), grams (number, your estimate of the cooked weight), kcal (number)), ` +
    `kcal (number, the total for the WHOLE plate as photographed), ` +
    `confidence ("high" | "medium" | "low"), ` +
    `note (one short sentence ONLY if something important is uncertain, e.g. "cannot tell if the chicken is fried or grilled"), ` +
    `question (string, see ASK below; omit when you are sure), ` +
    `options (array of 2-4 answers to that question, each: label (AT MOST 20 characters -- it goes on ` +
    `a phone button, so "NY style, 2 slices" not "New York style pizza, two large slices", ` +
    `INCLUDING the size or style, e.g. "New York, 2 slices"), kcal (number, the total for the WHOLE ` +
    `meal if that answer is the right one)).\n\n` +
    `ASK. A photo cannot show weight or style, and those are where the error lives: a Neapolitan ` +
    `pizza and a New York slice of the same picture size differ by hundreds of calories. When the ` +
    `honest range is wider than about 150 kcal, ask the ONE question that would narrow it most -- ` +
    `the style, the size, how many pieces, fried or grilled, with or without rice -- and give the ` +
    `answers as options with a total for each. Order them small to large. Ask nothing when the food ` +
    `is plain enough to be sure (a banana, a black coffee), and never ask more than one question.\n\n` +
    `A NUTRITION LABEL. When the photo shows the back of a packet, do not estimate anything -- ` +
    `READ IT. Take the product name, the energy per serving, the energy per 100 g or 100 ml when the ` +
    `label prints one, the serving size, and the net weight or the servings per pack. Energy in kJ ` +
    `divides by 4.18 to give kcal. Put those figures in lines, exactly as printed, so he can check ` +
    `them against the packet. Then set kcal to ONE SERVING as the label defines it, and ALWAYS ask ` +
    `how much he ate, with options covering one serving, half the pack and the whole pack, each ` +
    `with its own total. If the label is blurred or cropped, say so in note and give what you can read. ` +
    `Work out which style of label you are looking at from the words on it; never ask him. ` +
    `MALAYSIAN ("NUTRITION INFORMATION", "MAKLUMAT PEMAKANAN"): TWO columns, per 100 g and per ` +
    `serving ("Per 100 g" / "Setiap 100 g", "Per serving" / "Setiap hidangan"), with the serving ` +
    `size and "Servings per package" / "Hidangan setiap bungkusan" above them; energy is "Energy" ` +
    `or "Tenaga". ` +
    `THAI ("ข้อมูลโภชนาการ"): usually ONE column, per serving only -- do not invent a per-100 g ` +
    `figure when none is printed. "หนึ่งหน่วยบริโภค" is the serving size, ` +
    `"จำนวนหน่วยบริโภคต่อภาชนะบรรจุ" the servings per pack, ` +
    `"พลังงานทั้งหมด" the total energy in กิโลแคลอรี (kcal). Also: ไขมันทั้งหมด fat, ` +
    `โปรตีน protein, คาร์โบไฮเดรต carbohydrate, น้ำตาล sugar, โซเดียม sodium. ` +
    `The percentages beside them are Thai RDI, not calories -- ignore them. ` +
    `THAI GDA, the front-of-pack strip with พลังงาน in a box: that energy is for the WHOLE PACK, and ` +
    `"ควรแบ่งกิน X ครั้ง" means the pack should be split into X servings -- so one serving is ` +
    `that energy divided by X. Say which reading you used in portion.\n\n` +
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
  const kind: FoodResult['kind'] = p.kind === 'label' ? 'label' : 'plate'
  const summed = lines.reduce((t, l) => t + l.kcal, 0)
  const stated = Math.round(num(p.kcal, 5000))
  // On a PLATE the lines are the parts of the meal, so they win when they
  // disagree with the total. On a LABEL they are reference figures off the
  // packet -- per 100 g and per serving -- and adding them together gave 670
  // for a 154 kcal serving of biscuits (24 Sep 2026). Never sum a label.
  const kcal = kind === 'label'
    ? (stated || summed)
    : summed > 0 && (stated === 0 || Math.abs(stated - summed) > stated * 0.5) ? summed : (stated || summed)

  // Two buttons with the same number are one button: on a 2-serving Thai pack,
  // "one serving" and "half the pack" are the same 90 kcal (24 Sep 2026).
  const seenKcal = new Set<number>()
  const options: FoodOption[] = (Array.isArray(p.options) ? p.options : [])
    .filter((o: any) => o && typeof o.label === 'string' && num(o.kcal, 5000) > 0)
    .map((o: any) => ({ label: shortLabel(String(o.label)), kcal: Math.round(num(o.kcal, 5000) / 10) * 10 }))
    .filter((o: FoodOption) => (seenKcal.has(o.kcal) ? false : (seenKcal.add(o.kcal), true)))
    .slice(0, 4)
  const question = p.question && options.length >= 2 ? String(p.question).slice(0, 120) : undefined

  return {
    is_food: true,
    kind,
    title: String(p.title ?? 'Meal').slice(0, 100) || 'Meal',
    kcal: Math.round(kcal / 10) * 10,
    lines,
    portion: String(p.portion ?? '').slice(0, 80),
    confidence: p.confidence === 'high' ? 'high' : p.confidence === 'low' ? 'low' : 'medium',
    drink: !!p.drink,
    note: p.note ? String(p.note).slice(0, 160) : undefined,
    question,
    options: question ? options : undefined,
  }
}
