// Monday, first step of the weekly build: Search Console by ISO week.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/gsc-week.mts            # last week + the week before
//   npx -y tsx --conditions=react-server --env-file=.env scripts/gsc-week.mts --back 16  # backfill 16 weeks
//   npx -y tsx --conditions=react-server --env-file=.env scripts/gsc-week.mts 2026-W43   # one week
//
// Search Console lags two to three days, so the default re-pulls the week
// before last as well: on Monday last week is still missing its weekend.

import { pullGscWeek } from '../lib/mw-gsc-week'
import { isoWeek } from '../lib/mw-week'

const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
const weekAgo = (n: number) => isoWeek(new Date(Date.parse(`${today}T00:00:00Z`) - n * 7 * 864e5).toISOString().slice(0, 10))

const arg = process.argv[2]
const back = process.argv.includes('--back') ? Number(process.argv[process.argv.indexOf('--back') + 1]) || 16 : 0
const weeks = arg && /^\d{4}-W\d{2}$/.test(arg) ? [arg]
  : back ? Array.from({ length: back }, (_, i) => weekAgo(i + 1))
  : [weekAgo(1), weekAgo(2)]

for (const w of weeks) {
  try {
    const r = await pullGscWeek(w)
    console.log(`${r.week}: ${r.queries} query rows, ${r.pages} pages`)
  } catch (e: any) {
    console.log(`${w}: FAILED ${String(e?.message ?? e).slice(0, 160)}`)
  }
}
