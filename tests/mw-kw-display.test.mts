// A 0 that means "no data" must never render as a 0.
//   npx -y tsx tests/mw-kw-display.test.mts
import { demandCell, difficultyCell, keywordsCell, trafficCell } from '../lib/mw-kw-display'

let bad = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }

const gsc = { vol: 0, kd: 0, impr: 2015, src: 'gsc' as const, traffic: 3 }
const sem = { vol: 880, kd: 23, src: 'semrush' as const }
const none = { vol: 0, kd: 0 }

check(demandCell(gsc).text === '2,015 impr.', 'a Search Console row shows impressions, labelled')
check(demandCell(sem).text === '880', 'a Semrush row shows monthly searches')
check(demandCell(none).text === '—', 'no source shows a dash')
check(difficultyCell(gsc).text === '—' && difficultyCell(gsc).band === null, 'no difficulty for a Search Console row')
check(difficultyCell(sem).band === 'mid', 'Semrush difficulty keeps its band')
check(difficultyCell({ vol: 300, kd: 0, src: 'semrush' }).text === '0', 'a real Semrush 0 difficulty is still shown')
check(keywordsCell(0, [gsc, gsc]).text === '2 (GSC)', 'no Semrush count → the GSC count, labelled')
check(keywordsCell(0, []).text === '—', 'no keywords at all → dash')
check(trafficCell(0, [gsc, gsc]).text === '6 clicks (GSC)', 'no Semrush traffic → real clicks, labelled')
check(trafficCell(1200, [gsc]).text === '1,200', 'Semrush traffic when it has it')
for (const c of [demandCell(gsc), demandCell(none), difficultyCell(gsc), keywordsCell(0, []), trafficCell(0, [])])
  check(c.text !== '0', `"${c.text}" is never a bare 0 for missing data`)

console.log(bad ? `\n${bad} FAILED` : '\nall passed')
process.exit(bad ? 1 : 0)
