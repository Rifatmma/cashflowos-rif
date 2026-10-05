// The counters bag has two tenants, and one used to evict the other.
//   npx -y tsx tests/bot-memory.test.mts
//
// `bot_memory.counters` holds BOTH the daily vision-cost counter and the bot's
// conversational state (`pending:<userId>` — a receipt parked waiting for its
// missing fields, holding the only copy of its payload, with a twelve-hour
// window). Pruning was `{ [key]: next }`, so every photo wiped every parked
// receipt in that chat.
//
// This tests the pruning rule in isolation. The rule: drop a key only when it
// ends in `:YYYY-MM-DD` for a day that is not today. Everything else stays.

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const eq = (a: unknown, b: unknown, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? ok(m)
    : (bad++, console.log(`FAIL ${m}\n       got    ${JSON.stringify(a)}\n       wanted ${JSON.stringify(b)}`))

const DAY_KEYED = /:(\d{4}-\d{2}-\d{2})$/

/** Exactly the pruning in lib/bot-memory.ts bumpDailyCounter. */
function bump(counters: Record<string, unknown>, name: string, day: string) {
  const key = `${name}:${day}`
  const next = (Number(counters[key]) || 0) + 1
  const kept: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(counters)) {
    const m = k.match(DAY_KEYED)
    if (m && m[1] !== day) continue
    kept[k] = v
  }
  kept[key] = next
  return { kept, next }
}

const TODAY = '2026-10-05'
const parked = {
  type: 'need_fields',
  gaps: ['shop', 'total'],
  by: 'Tina Kuno',
  payload: { amount: 199.65, idempotencyKey: 'photo:abc' },
  until: Date.now() + 12 * 3600_000,
}

// ---- the bug itself -------------------------------------------------------
{
  const before = { 'pending:chat': parked, [`vision:${TODAY}`]: 3 }
  const { kept, next } = bump(before, 'vision', TODAY)
  eq(next, 4, 'the counter still increments')
  eq(kept['pending:chat'], parked, 'a parked receipt survives a photo')
  eq(kept[`vision:${TODAY}`], 4, "and today's count is kept")
}

// ---- stale counters are still dropped -------------------------------------
{
  const before = {
    'vision:2026-10-01': 20, 'vision:2026-10-02': 11, [`vision:${TODAY}`]: 1,
    'pending:8880775629': parked,
  }
  const { kept } = bump(before, 'vision', TODAY)
  eq(Object.keys(kept).sort(), ['pending:8880775629', `vision:${TODAY}`],
    'counters from other days are dropped, state is not')
  eq(kept[`vision:${TODAY}`], 2, 'and today keeps counting from where it was')
}

// ---- several people parked at once ----------------------------------------
{
  const before = {
    'pending:chat': parked,
    'pending:851007120': { type: 'have_photo', sha256: 'deadbeef', until: 1 },
    'pending:5880782382': { type: 'need_amount', record_id: 260, until: 2 },
  }
  const { kept } = bump(before, 'vision', TODAY)
  eq(Object.keys(kept).length, 4, 'three parked receipts plus the new counter')
  eq(kept['pending:851007120'], before['pending:851007120'], 'each one untouched')
}

// ---- a first photo of the day ---------------------------------------------
{
  const { kept, next } = bump({}, 'vision', TODAY)
  eq(next, 1, 'an empty bag starts at one')
  eq(kept, { [`vision:${TODAY}`]: 1 }, 'and holds only that')
}

// ---- a key that merely CONTAINS a date is not a daily counter -------------
{
  // Defensive: a pending key is `pending:<telegram id>`, never a date. But if a
  // future key ever looked like `note:2026-10-01:draft`, the date is not at the
  // end, so it must not be read as stale.
  const before = { 'note:2026-10-01:draft': { text: 'keep me' } }
  const { kept } = bump(before, 'vision', TODAY)
  eq(kept['note:2026-10-01:draft'], { text: 'keep me' },
    'only a date at the END of a key marks a daily counter')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
