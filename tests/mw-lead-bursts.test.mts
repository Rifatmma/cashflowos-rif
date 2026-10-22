// Batch imports are flagged, real enquiries are not.
//   npx -y tsx tests/mw-lead-bursts.test.mts
import { burstIds } from '../lib/mw-lead-bursts'
let bad = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }
const at = (h: number, m: number) => `2026-10-14T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+00:00`
const batch = Array.from({ length: 9 }, (_, i) => ({ id: `b${i}`, created_time: at(3, i * 5), owner_name: 'Rukshana' }))
const real = [
  { id: 'r1', created_time: at(3, 10), owner_name: 'Sukriti' },
  { id: 'r2', created_time: at(9, 0), owner_name: 'Rukshana' },
  ...Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, created_time: at(5, i), owner_name: 'Deewakshi' })),
]
const ids = burstIds([...batch, ...real])
check(batch.every(b => ids.has(b.id)), 'nine leads to one owner in one hour are flagged')
check(!ids.has('r1') && !ids.has('r2'), 'a lead to another owner, or the same owner later, is not')
check(!['s0', 's1', 's2', 's3'].some(i => ids.has(i)), 'four in an hour is still believable, not flagged')
console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0)
