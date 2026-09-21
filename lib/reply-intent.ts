// Does a short reply to an approval card mean YES, NO, or neither?
//
// This decides whether money gets filed, so it is deliberately dumb and strict:
// plain code, not the language model. Anything it is not sure about returns null,
// and the message simply falls through to normal conversation -- where Jarvis can
// ask what was meant. A wrong "no idea" costs a follow-up question. A wrong "yes"
// files money the owner did not agree to.
//
// It only ever runs on a message that is a DIRECT REPLY to an approval card. The
// caller matches the card by message id; this function never sees anything else.

// 'drawings' = "yes it happened, but it was personal" -- file it as owner's
// drawings rather than a business expense.
export type ReplyIntent = 'approve' | 'reject' | 'drawings' | null

// English, Malay and the usual chat shorthand. Kept to words that mean yes/no on
// their own -- "sure" and "go" are in; "fine" is out, it is too often sarcastic.
const YES = new Set([
  'yes', 'y', 'ya', 'yah', 'yeah', 'yep', 'yup', 'ok', 'okay', 'k', 'sure',
  'approve', 'approved', 'confirm', 'confirmed', 'proceed', 'go',
  'betul', 'boleh', 'setuju', 'teruskan', 'correct', 'right',
])
const NO = new Set([
  'no', 'n', 'nope', 'nah', 'reject', 'rejected', 'cancel', 'cancelled', 'stop',
  'dont', 'decline', 'declined', 'tak', 'tidak', 'jangan', 'batal', 'bukan',
])

// "It was for me" -- in English and Malay. Only honoured on a money card.
const PERSONAL = new Set(['personal', 'peribadi', 'drawing', 'drawings', 'sendiri', 'private'])

// Words that turn a "yes" into "yes, BUT..." -- the owner is correcting something,
// so filing as-is would file the wrong thing.
const HEDGE = new Set([
  'but', 'however', 'except', 'tapi', 'cuma', 'not', 'wrong', 'salah', 'change',
  'actually', 'wait', 'hold', 'instead', 'should', 'maybe', 'mungkin',
])

// Phrases whose words point the OPPOSITE way to their meaning. "no problem" is a
// yes; "tak apa" is "never mind". Rather than guess the owner's mood, these are
// treated as unclear and handed back to conversation.
const TWISTED = ['no problem', 'no worries', 'no prob', 'tak apa', 'takpe', 'tak pe', 'never mind', 'nevermind']

// Longer than this and it is a conversation, not a verdict.
const MAX_WORDS = 6

export function replyIntent(text: string): ReplyIntent {
  const raw = String(text ?? '').trim()
  if (!raw) return null

  // Any number means they are quoting an amount or a quantity -- a correction,
  // never a bare approval ("yes, 30" / "ok but 2 units").
  if (/\d/.test(raw)) return null

  const words = raw
    .toLowerCase()
    .replace(/[’']/g, '')        // "don't" -> "dont", "you're" -> "youre"
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0 || words.length > MAX_WORDS) return null
  if (words.some(w => HEDGE.has(w))) return null
  const joined = ' ' + words.join(' ') + ' '
  if (TWISTED.some(p => joined.includes(' ' + p + ' '))) return null

  // "personal" wins over a bare yes ("yes personal") but not over a no.
  const personal = words.some(w => PERSONAL.has(w))
  const yes = words.some(w => YES.has(w))
  const no = words.some(w => NO.has(w))
  if (personal && no) return null
  if (personal) return 'drawings'
  // Both at once ("no ok") is exactly the case to leave to a human.
  if (yes && no) return null
  if (yes) return 'approve'
  if (no) return 'reject'
  return null
}
