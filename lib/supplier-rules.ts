// Supplier layout rules — how YOU taught the robot to read a particular shop's
// receipt.
//
// WHY THIS FILE EXISTS
// A model does not learn from being corrected. Nothing you tell it today changes
// how it reads tomorrow's photo — the weights are fixed and it has no memory of
// this conversation. What DOES work is storage: we write the correction down and
// re-inject it into the prompt on every single read. The model isn't remembering,
// it's being told again, every time.
//
// That makes these rules a lookup table the owner owns: visible on the Cash Out
// tab, editable, deletable. Which is the point, because a rule enters EVERY future
// read — a wrong one poisons the cost base silently and forever. They have to be
// as easy to delete as they are to add.
//
// Notes ACCUMULATE. A supplier can have several, and teaching a new one never
// overwrites an old one -- the owner may have told us two different things about
// the same shop and both are true. Replacing is possible, but only when the owner
// has explicitly said to replace; a machine guessing that two notes conflict is a
// machine quietly throwing away something they said.
//
// Stored as ordinary `records` rows (category 'supplier_rule') so they inherit
// everything the rest of the app already has: one table, one backup, one history.
// No 'server-only' here on purpose — these are pure functions so they can be
// tested without dragging in the whole server.

export type SupplierRule = {
  id?: number
  supplier: string      // display name, as printed: "99 SPEED MART SDN. BHD."
  key: string           // matching key: "99 speed mart"
  rule: string          // plain English, injected into the vision prompt verbatim
  taught_at?: string
  example?: string      // the correction that prompted it — the receipt for the rule
  active?: boolean
}

// Keep the injected block small enough that it can never crowd out the receipt
// itself, and keep any single rule short enough to stay readable on the tab.
export const RULE_MAX_CHARS = 400
export const SUPPLIER_MAX_CHARS = 80
export const MAX_RULES_IN_PROMPT = 40

// Legal-entity suffixes carry no identity — "99 SPEED MART SDN. BHD." and
// "99 Speed Mart" are the same shop and must collapse to the same key, or a rule
// taught once never fires again.
const NOISE = /\b(sdn\.?\s*bhd\.?|s\/b|berhad|bhd|enterprise|ent\.?|trading|holdings?|pte\.?\s*ltd\.?|ltd\.?|llp|plt|inc\.?|co\.?|company|group|resources|marketing|supplies|supplier)\b/gi

// The matching key. Lowercase, strip legal suffixes, strip punctuation, collapse
// whitespace. Deliberately lossy: over-matching two branches of the same chain is
// fine (same layout), under-matching is not (the rule silently stops working).
export function supplierKey(name: string | undefined | null): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(NOISE, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SUPPLIER_MAX_CHARS)
}

// Do these two names refer to the same supplier? Exact key match, or one key
// being a whole-word prefix of the other ("99 speed mart" vs "99 speed mart
// kuchai"), which is how branches of one chain come out.
export function sameSupplier(a: string | undefined, b: string | undefined): boolean {
  const ka = supplierKey(a), kb = supplierKey(b)
  if (!ka || !kb) return false
  if (ka === kb) return true
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka]
  return short.length >= 4 && long.startsWith(short + ' ')
}

// Trim and bound a rule before it is stored. Returns null for anything empty,
// because a blank rule injected into every read is pure noise.
export function normaliseRule(supplier: string, rule: string): SupplierRule | null {
  const s = String(supplier ?? '').trim().slice(0, SUPPLIER_MAX_CHARS)
  const r = String(rule ?? '').replace(/\s+/g, ' ').trim().slice(0, RULE_MAX_CHARS)
  const key = supplierKey(s)
  if (!s || !r || !key) return null
  return { supplier: s, key, rule: r }
}

// The prompt block. Every active rule goes in, every read — we don't know which
// supplier the receipt is from until AFTER it's been read, so filtering first is
// impossible. At a few dozen suppliers this costs a rounding error in tokens, and
// the instruction tells the model to apply only the matching block.
export function rulesPromptBlock(rules: SupplierRule[]): string {
  const live = rules.filter(r => r.active !== false && r.rule).slice(0, MAX_RULES_IN_PROMPT)
  if (live.length === 0) return ''

  // Group by supplier, because a shop ACCUMULATES notes -- teaching a second thing
  // about 99 Speed Mart must never quietly erase the first. All of a supplier's
  // notes apply together, listed under its name.
  const bySupplier = new Map<string, { supplier: string; rules: string[] }>()
  for (const r of live) {
    const k = r.key || supplierKey(r.supplier)
    const g = bySupplier.get(k)
    if (g) g.rules.push(r.rule)
    else bySupplier.set(k, { supplier: r.supplier, rules: [r.rule] })
  }

  const lines = [...bySupplier.values()]
    .map(g => `- ${g.supplier}:\n` + g.rules.map(t => `    * ${t}`).join('\n'))
    .join('\n')

  return (
    `\n\nThe owner has corrected you before on how specific shops lay out their receipts. ` +
    `Apply ONLY the block whose supplier matches the shop on THIS receipt; ignore all the ` +
    `others. Where a supplier has several notes, ALL of them apply to that receipt. If the ` +
    `merchant here is not listed, none of these apply:\n${lines}\n`
  )
}

// Are these two notes saying the same thing, word for word? Used to swallow an
// exact repeat so the same sentence is not stored twice. Deliberately dumb: it
// catches duplicates, and makes NO attempt to judge whether two differently-worded
// notes conflict. That judgement belongs to the owner, who gets asked.
export function sameRuleText(a: string, b: string): boolean {
  const n = (t: string) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return n(a) === n(b) && n(a) !== ''
}
