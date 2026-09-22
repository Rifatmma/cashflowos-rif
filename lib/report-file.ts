import 'server-only'
// Turn an uploaded POS report -- Excel (.xlsx) or CSV -- into rows for the Dish
// Report reader. Shared by the Cash In upload and Jarvis on Telegram, so both
// accept exactly the same files and read them the same way.
import ExcelJS from 'exceljs'
import { parseCsv } from './csv'
import { ReportError } from './easyeat'

export const isReportFile = (name: string, mime = '') =>
  /\.(xlsx|csv)$/i.test(name) ||
  /spreadsheetml|text\/csv|application\/csv|vnd\.ms-excel/i.test(mime)

export async function readReportRows(bytes: Buffer, name: string, mime = ''): Promise<unknown[][]> {
  const csv = /\.csv$/i.test(name) || /csv/i.test(mime)
  // An .xlsx is a zip ("PK" magic). Trust the bytes over the name.
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b
  if (csv && !zip) return parseCsv(bytes.toString('utf8'))
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
