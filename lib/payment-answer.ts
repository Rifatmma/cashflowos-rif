// Reading the owner's answer to "I found these payments in your email".
//
// Jarvis lists them numbered; the owner answers in one line, any of:
//   "1 services, 2 drawings, 3 skip"
//   "1 3 drawings 2 food"          (numbers take the NEXT category named)
//   "1-3 drawings"                 (ranges)
//   "all drawings"  /  "rest skip" (everything / everything not yet named)
//   "4 drawings RM 25.50"          (an RM amount for one whose price wasn't in RM)
//
// Pure: no imports. Deterministic on purpose -- money is filed from this, so a
// word it doesn't know is reported back, never guessed.

export type Choice = { type: string; rm?: number }
export type Answer = { choices: Record<number, Choice>; unknownWords: string[]; badNumbers: number[] }

// Words -> expense type. 'skip' means "not a payment to record".
const WORDS: [RegExp, string][] = [
  [/^(skip|ignore|no|none|not|x|abaikan|ข้าม)$/, 'skip'],
  [/^(drawings?|draw|owner|owners|personal|withdraw(al)?|peribadi|ส่วนตัว)$/, 'owner_drawings'],
  [/^(food|cogs|ingredients?|makanan|bahan)$/, 'cogs_food'],
  [/^(drinks?|beverages?|minuman)$/, 'cogs_beverage'],
  [/^(packaging|package|takeaway|bekas)$/, 'cogs_packaging'],
  [/^(cleaning|supplies|supply)$/, 'supplies_cleaning'],
  [/^(equipment|tools?|peralatan)$/, 'equipment'],
  [/^(software|subscriptions?|services?|service|apps?|saas|langganan)$/, 'services'],
  [/^(marketing|ads?|advertising|iklan)$/, 'marketing'],
  [/^(utilities|utility|bills?|electric(ity)?|water|internet|phone|bil)$/, 'utilities'],
  [/^(rent|sewa)$/, 'rent'],
  [/^(salary|salaries|wages?|labour|labor|staff|gaji)$/, 'labour'],
  [/^(other|others|lain)$/, 'other'],
]
// Glue words that carry no meaning here.
const FILLER = /^(and|&|as|is|are|to|for|the|a|an|cost|costs|restaurant|business|file|it|them|dan|kos|pls|please)$/

export function parseAnswer(text: string, max: number): Answer {
  const choices: Record<number, Choice> = {}
  const unknownWords: string[] = []
  const badNumbers: number[] = []
  let pending: number[] = []
  let restMode = false
  let lastAssigned: number[] = []

  const tokens = String(text).toLowerCase()
    .replace(/rm\s*(\d+(?:\.\d+)?)/g, ' rm:$1 ')
    .replace(/(\d)\s*[-–]\s*(\d)/g, '$1-$2')
    .split(/[\s,;/\n]+|(?<=\d)\.(?!\d)/)
    .map(t => t.replace(/[.!?)(]+$/g, '').replace(/^[(]+/, ''))
    .filter(Boolean)

  const push = (n: number) => {
    if (n >= 1 && n <= max) pending.push(n)
    else badNumbers.push(n)
  }

  for (const t of tokens) {
    const rm = t.match(/^rm:(\d+(?:\.\d+)?)$/)
    if (rm) {
      // An amount belongs to the one number just named.
      const target = lastAssigned.length === 1 ? lastAssigned[0] : pending.length === 1 ? pending[0] : null
      if (target !== null && choices[target]) choices[target].rm = Number(rm[1])
      else if (target !== null) choices[target] = { type: '', rm: Number(rm[1]) }
      continue
    }
    const range = t.match(/^(\d+)-(\d+)$/)
    if (range) { for (let n = Number(range[1]); n <= Number(range[2]); n++) push(n); continue }
    if (/^\d+$/.test(t)) { push(Number(t)); continue }
    if (t === 'all' || t === 'semua' || t === 'everything') { pending = Array.from({ length: max }, (_, i) => i + 1); continue }
    if (t === 'rest' || t === 'lain-lain') { restMode = true; continue }
    const type = WORDS.find(([re]) => re.test(t))?.[1]
    if (type) {
      const targets = restMode
        ? Array.from({ length: max }, (_, i) => i + 1).filter(n => !choices[n]?.type)
        : pending
      for (const n of targets) choices[n] = { ...choices[n], type }
      lastAssigned = targets
      pending = []
      restMode = false
      continue
    }
    if (FILLER.test(t)) continue
    unknownWords.push(t)
  }
  // An amount given before its category ("4 rm25 drawings") was stored with an
  // empty type; any number still without a type is simply unanswered.
  for (const [k, c] of Object.entries(choices)) if (!c.type) delete choices[Number(k)]
  return { choices, unknownWords, badNumbers }
}

/** Does a message look like an answer to the numbered list at all? */
export const looksLikeAnswer = (text: string) =>
  /^\s*(all|semua|rest|\d+(\s*[-–]\s*\d+)?)\b/i.test(String(text || ''))

// A plain-language reply with no numbers: "add as owner withdraw", "file both
// as drawings", "semua peribadi". Returns the category and whether it clearly
// means EVERY item ("both", "all", "these"...). null = no category word at all.
const ALL_WORDS = /\b(all|both|these|those|them|everything|semua|kedua|dua-dua|keduanya|ทั้งหมด)\b/i
export function plainAnswer(text: string): { type: string; saysAll: boolean } | null {
  const t = String(text || '').toLowerCase()
  if (/\d/.test(t)) return null
  const words = t.split(/[^a-z฀-๿-]+/).filter(Boolean)
  const types = [...new Set(words.map(w => WORDS.find(([re]) => re.test(w))?.[1]).filter(Boolean) as string[])]
  if (types.length !== 1) return null
  return { type: types[0], saysAll: ALL_WORDS.test(t) }
}
