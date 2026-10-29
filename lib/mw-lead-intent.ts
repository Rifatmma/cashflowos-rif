// 👉 Lead intent, read from the enquiry itself (Rif, 29 Oct 2026): how serious
// a buyer looks, so Home can say which pages and channels bring serious ones.
// Pure rules, no API call, so the weekly run and tests can use them anywhere.
//
//   high        a buyer naming at least two of: a place or site, a duration or
//               date, a quote / price / budget / plan ask, a campaign goal or
//               audience ("DOOH quotation for Jalan Song Ban Kheng and Aeon
//               Mall Bukit Mertajam, 1 month"). A format alone does not count
//               twice: "billboard in Ahmedabad" is still medium.
//   medium      a buyer with one detail, or a clear but vague ask
//   low         a buyer with no detail, or a personal / fan request
//   not a buyer job seekers, students, media owners and partnership pitches,
//               vendors selling to us
//
// The reason is a generic phrase ("site + duration + quote"), never their words.

export type Intent = 'high' | 'medium' | 'low' | 'not a buyer'
export const INTENTS: Intent[] = ['high', 'medium', 'low', 'not a buyer']

export type IntentIn = { role?: string | null; interest?: string | null; inquiry?: string | null; company?: string | null }

const has = (re: RegExp, s: string) => re.test(s)

const JOB = /\b(?:job|jobs|career|vacanc|internship|intern\b|resume|\bcv\b|hiring|apply(?:ing)?\s+for|employment|fresher|work\s+(?:with|for)\s+you|looking\s+for\s+(?:a\s+)?(?:role|opportunit|work))/
const STUDENT = /\b(?:student|thesis|dissertation|assignment|university\s+project|college\s+project|research\s+(?:project|paper)|survey\s+for\s+my|academic)/
const SELLER = /\b(?:partnership|partner\s+with\s+you|collaborat|host(?:ing)?\s+(?:your\s+)?(?:panels?|screens?|boards?|hoardings?)|(?:my|our)\s+(?:society|building|property|premises|shop|land|rooftop|wall)\b.*\b(?:panel|screen|hoarding|billboard|space)|(?:we|i)\s+(?:have|own|operate)\s+(?:\d+\s+)?(?:led|digital|screens?|billboards?|hoardings?|inventory|media|sites?|space)|list\s+(?:our|my)|(?:our|my)\s+(?:inventory|screens|media\s+network)|rent\s+out|lease\s+(?:out\s+)?(?:my|our)|(?:we|i)\s+(?:offer|provide|sell)\b|(?:printing|fabrication|installation|seo|web\s*design|software|app\s+development)\s+(?:services|company)|vendor\s+registration|supplier)/
const FAN = /\b(?:birthday|anniversary|propos(?:e|al)\s+to\s+(?:my|her|him)|wish(?:ing)?\s+(?:my|her|him)|fan\s*(?:club|base|project|support)|fandom|idol|k-?pop|\bbias\b|surprise\s+(?:my|for)|my\s+(?:girlfriend|boyfriend|wife|husband|mom|mother|dad|friend))/

const PLACE = /\b(?:mall|airport|station|jalan|jln|road|rd\b|street|st\.|highway|expressway|lebuhraya|mrt|lrt|metro|klcc|trx|bukit|taman|plaza|tower|sector|nagar|junction|circle|avenue|district|cbd|downtown|city\s+centre|orchard|marina|sentosa|changi|shibuya|shinjuku|ginza|kuala\s+lumpur|\bkl\b|selangor|penang|johor|ipoh|melaka|sabah|sarawak|singapore|jakarta|bali|surabaya|manila|makati|cebu|bangkok|phuket|hanoi|ho\s+chi\s+minh|saigon|tokyo|osaka|seoul|hong\s+kong|taipei|sydney|melbourne|auckland|dubai|abu\s+dhabi|riyadh|jeddah|doha|london|new\s+york|mumbai|delhi|ncr|gurgaon|gurugram|noida|bengaluru|bangalore|chennai|hyderabad|pune|kolkata|ahmedabad|jaipur|lucknow|chandigarh|kochi|indore|surat|goa|nairobi|lagos|johannesburg)\b/
const FORMAT = /\b(?:led|billboards?|hoardings?|unipoles?|lifts?|elevators?|bus(?:es)?|taxis?|transit|screens?|dooh|ooh|digital\s+signage|signage|mall\s+media|bridge|gantry|wraps?|standees?|kiosks?|static|3d|anamorphic|lamp\s*posts?|bus\s+(?:stop|shelter)s?|train|outdoor|banners?|posters?|facade|mupi|cinema)\b/
const DURATION = /\b(?:\d+\s*-?\s*(?:days?|weeks?|months?|years?|wks?|mths?)|(?:one|two|three|four|six|a)\s+(?:day|week|month|year)s?|monthly|weekly|quarterly|annual|q[1-4]\b|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may\s+\d|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|next\s+(?:week|month|year)|from\s+\d|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|festive|diwali|ramadan|raya|christmas|cny|chinese\s+new\s+year|launch\s+date)\b/
const QUOTE = /\b(?:quot(?:e|ation|es)|pric(?:e|es|ing)|rate\s*card|rates|cost(?:s|ing)?|budget|proposal|media\s+plan|package|how\s+much|charges?|tariff|estimate|rfq|rm\s?\d|s?\$\s?\d|usd|inr|₹|\d+\s*k\b|lakhs?|lacs?|crores?)/
const GOAL = /\b(?:launch\w*|awareness|campaigns?|audience|target(?:ing)?|footfall|branding|promot(?:e|ion|ing)|visibility|customers|commuters|residents|shoppers|drive\s+(?:traffic|sales)|recruit(?:ment)?\s+drive|admissions?|open(?:ing)?\s+(?:of|a|our))\b/
const AD_ASK = /\b(?:advertis\w*|ads?|campaigns?|billboards?|hoardings?|dooh|ooh|media|promot\w*|marketing|book(?:ing)?|demo|clients?|offerings?)\b/

/** Strip the form's own labels and footer so they never count as the buyer's words. */
const clean = (s: string) => s
  .replace(/key\s+campaign\s+details\s*:|please\s+share\s*:|please\s+check\s+the\s+notification\s+email\s+for\s+further\s+information\.?/gi, ' ')
  .replace(/\s+/g, ' ').trim()

export function leadIntent(f: IntentIn): { intent: Intent; reason: string } {
  const role = (f.role ?? '').toLowerCase(), interest = (f.interest ?? '').toLowerCase()
  const text = clean(f.inquiry ?? '').toLowerCase()
  const all = `${interest} ${text}`

  // Our own form tests ("Test - Thailand", "Test Website Lead - SL").
  if (/^test(?![a-z])/.test(text)) return { intent: 'not a buyer', reason: 'internal test' }
  if (/media\s*owner|publisher|vendor/.test(role) || /selling|connecting\s+media|media\s+network|partnerships?\s*&?\s*integration/.test(interest) && !has(AD_ASK, text.replace(/\bmedia\b/g, ''))) {
    return { intent: 'not a buyer', reason: 'media owner or partnership pitch' }
  }
  if (/job\s*seeker|candidate/.test(role) || has(JOB, all)) return { intent: 'not a buyer', reason: 'job seeker' }
  if (/student/.test(role) || has(STUDENT, text)) return { intent: 'not a buyer', reason: 'student' }
  if (has(SELLER, text)) return { intent: 'not a buyer', reason: 'selling to us or offering their space' }
  if (has(FAN, text)) return { intent: 'low', reason: 'personal or fan request' }

  const sig = [
    has(PLACE, text) && 'site',
    has(DURATION, text) && 'duration',
    has(QUOTE, text) && 'quote',
    has(GOAL, text) && 'goal',
  ].filter((x): x is string => !!x)
  const fmt = has(FORMAT, text)
  const words = text.split(/\s+/).filter(w => /[a-zÀ-￿]{2,}/.test(w)).length
  const reason = [...(fmt ? ['format'] : []), ...sig].join(' + ')

  if (sig.length >= 2) return { intent: 'high', reason }
  if (sig.length === 1 || fmt) return { intent: 'medium', reason }
  if (words >= 4 && has(AD_ASK, text)) return { intent: 'medium', reason: 'clear ask, no detail' }
  if (/demo/.test(interest) && words >= 4) return { intent: 'medium', reason: 'demo request' }
  return { intent: 'low', reason: text ? 'no detail' : 'no message' }
}
