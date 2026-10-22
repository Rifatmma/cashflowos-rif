// 👉 Who is who on the Moving Walls side: name, email, what they own, who they report to.
//
// Until 21 Oct 2026 the team existed only as first names on markets
// (lib/mw-markets.ts) and as a bare list of emails allowed to sign in. Nothing
// joined the two, so the app could not say "Sukrithi has three tasks and has
// never opened this", could not email her, and could not show Mehul and
// Safwaan what their people are doing.
//
//   "Need to show that they don't use it but the task is open so the boss
//    which is Mehul and Safwaan will push them."           (owner, 21 Oct 2026)
//
// The seed below is the starting point; the live copy is mw_settings.people,
// editable without a deploy. `name` must match the owner names used on tasks
// (mw_actions.owner, lib/mw-markets.ts), because that is how tasks find people.
//
// Pure: no server imports, so the matching is testable.

export type Role = 'lead' | 'specialist' | 'market' | 'boss' | 'viewer'

export type Person = {
  name: string
  email: string
  role: Role
  /** What they look after, in words a manager reads. */
  title: string
  /** Market keys from lib/mw-markets.ts. */
  markets: string[]
  /** Hours a week they can give to tasks from this app. Caps the queue. */
  hours: number
}

export const OWNER_NAME = 'Rif'

export const PEOPLE_SEED: Person[] = [
  { name: 'Rif', email: 'rif-at.wanwang@movingwalls.com', role: 'lead', title: 'SEO and paid search lead', markets: [], hours: 4 },
  { name: 'Dinesh', email: 'dinesh@movingwalls.com', role: 'specialist', title: 'Website and on-page SEO', markets: [], hours: 5 },
  { name: 'Sukrithi', email: 'sukriti.taneja@movingwalls.com', role: 'market', title: 'India', markets: ['india'], hours: 1 },
  { name: 'Deewakshi', email: 'deewakshi.shrestha@movingwalls.com', role: 'market', title: 'SEA and Philippines', markets: ['sea', 'philippines'], hours: 1 },
  { name: 'Sherlee', email: 'sherlee@movingwalls.com', role: 'market', title: 'Americas and Japan', markets: ['americas', 'japan'], hours: 1 },
  { name: 'Rukshana', email: 'rukshana@movingwalls.com', role: 'market', title: 'MENA', markets: ['mena'], hours: 1 },
  { name: 'Sumaiya', email: 'sumaiya@movingwalls.com', role: 'market', title: 'Europe and ANZ', markets: ['europe', 'anz'], hours: 1 },
  { name: 'Savita', email: 'savita.s@movingwalls.com', role: 'market', title: 'Sub-Saharan Africa', markets: ['africa'], hours: 1 },
  { name: 'Sai', email: 'saibhavani@movingwalls.com', role: 'market', title: 'North Asia', markets: ['north-asia'], hours: 1 },
  { name: 'Mehul', email: 'mehul@movingwalls.com', role: 'boss', title: 'Management', markets: [], hours: 0 },
  { name: 'Safwaan', email: 'safwaan@movingwalls.com', role: 'boss', title: 'Management', markets: [], hours: 0 },
]

/** The markets that get the effort; the rest are on maintenance (owner, 21 Oct 2026). */
export const FOCUS_MARKETS = ['india', 'sea', 'americas']

export const isFocusMarket = (key: string | null | undefined) => !!key && FOCUS_MARKETS.includes(key)

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase()

/** A person by the name used on a task. Tolerates "Rifat" for Rif and full names. */
export function personByName(people: Person[], name: string | null | undefined): Person | null {
  const n = norm(name)
  if (!n) return null
  if (n === 'rifat' || n === 'me' || n === 'owner') return people.find(p => p.name === OWNER_NAME) ?? null
  return people.find(p => norm(p.name) === n)
    ?? people.find(p => n.startsWith(norm(p.name)) || norm(p.name).startsWith(n.split(/\s+/)[0]))
    ?? null
}

/** The signed-in person: the owner session is Rif; a guest is matched by email. */
export function personByActor(people: Person[], actor: string | null): Person | null {
  if (!actor || actor === 'owner') return people.find(p => p.name === OWNER_NAME) ?? null
  return people.find(p => norm(p.email) === norm(actor)) ?? null
}

/** Who owns a market, from the directory. */
export function ownerOfMarket(people: Person[], market: string | null | undefined): Person | null {
  return people.find(p => p.markets.includes(String(market ?? ''))) ?? null
}

/** People whose tasks appear on the People view: everyone except the bosses. */
export const doers = (people: Person[]) => people.filter(p => p.role !== 'boss' && p.role !== 'viewer')
export const bosses = (people: Person[]) => people.filter(p => p.role === 'boss')

/** Accept a stored directory only if it is well-formed; otherwise fall back to the seed. */
export function parsePeople(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return PEOPLE_SEED
  const ok = raw.filter((p: any) => p && typeof p.name === 'string' && typeof p.email === 'string')
    .map((p: any): Person => ({
      name: String(p.name), email: String(p.email).toLowerCase(),
      role: (['lead', 'specialist', 'market', 'boss', 'viewer'].includes(p.role) ? p.role : 'viewer') as Role,
      title: String(p.title ?? ''), markets: Array.isArray(p.markets) ? p.markets.map(String) : [],
      hours: Number.isFinite(Number(p.hours)) ? Number(p.hours) : 1,
    }))
  return ok.length ? ok : PEOPLE_SEED
}
