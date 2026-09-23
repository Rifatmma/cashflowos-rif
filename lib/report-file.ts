import 'server-only'
// Turn an uploaded POS report -- Excel (.xlsx) or CSV -- into rows for the Dish
// Report reader. Shared by the Cash In upload and Jarvis on Telegram, so both
// accept exactly the same files and read them the same way.
import ExcelJS from 'exceljs'
import { parseCsv } from './csv'
import { ReportError } from './easyeat'

// What the RECEIPT reader handles. Anything else that arrives as a file is
// treated as a possible sales report -- deciding by name and mime alone was too
// fussy: on 23 Sep a sales export was rejected as "I can file photos and PDFs"
// and nothing was logged, so it looked like it had simply vanished.
const RECEIPT_MIME = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/i

export const isReportFile = (name: string, mime = '') =>
  /\.(xlsx|xls|csv|tsv|txt)$/i.test(name) ||
  /spreadsheetml|text\/csv|application\/csv|vnd\.ms-excel|text\/tab|text\/plain|octet-stream|sheet/i.test(mime) ||
  // A document that is plainly not a receipt photo: try it as a report rather
  // than turning it away.
  (!!name && !RECEIPT_MIME.test(mime) && !/\.(jpe?g|png|gif|webp|pdf|heic|mov|mp4)$/i.test(name))

/** Does this look like text a person could read (CSV/TSV), rather than binary? */
function looksLikeText(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 2048)
  let odd = 0
  for (const b of head) if (b === 0 || (b < 9 && b !== 7) || (b > 13 && b < 32 && b !== 27)) odd++
  return odd / Math.max(head.length, 1) < 0.02
}

export async function readReportRows(bytes: Buffer, name: string, mime = ''): Promise<unknown[][]> {
  // Decide from the BYTES, not the name: phones and cloud drives rename and
  // re-label files on the way through Telegram.
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b            // .xlsx is a zip
  const oldExcel = bytes[0] === 0xd0 && bytes[1] === 0xcf       // .xls is OLE2
  if (oldExcel) {
    throw new ReportError('That is an old-style .xls file, which I can’t open. In EasyEat choose Excel (.xlsx) or CSV.')
  }
  if (!zip && looksLikeText(bytes)) return parseCsv(bytes.toString('utf8'))
  if (zip) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes as any)
    const ws = wb.worksheets[0]
    if (!ws) throw new ReportError('The file has no sheets.')
    const rows: unknown[][] = []
    ws.eachRow({ includeEmpty: false }, r => { rows.push((r.values as unknown[]).slice(1)) })
    return rows
  }
  throw new ReportError('That file isn’t an Excel (.xlsx) or CSV report. Export the Dish Report Over Time from EasyEat as Excel or CSV.')
}
