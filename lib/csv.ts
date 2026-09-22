// A small, strict CSV reader for POS exports (EasyEat can export CSV or Excel).
//
// Handles what real exports do: a UTF-8 byte-order mark, Windows line endings,
// quoted fields with commas / newlines / doubled quotes inside ("Set 2-4 Pax",
// "(Kuah Merah)(Siakap, 3 Rasa)"), and a semicolon or tab delimiter from
// spreadsheet apps set to a non-English locale.
//
// Pure: no imports. Returns rows of strings; the Dish Report reader finds its
// columns by header name, so the CSV and Excel paths share every rule after this.

function delimiterOf(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n')
  const count = (d: string) => firstLines.split(d).length - 1
  const tabs = count('\t'), semis = count(';'), commas = count(',')
  if (tabs > commas && tabs > semis) return '\t'
  if (semis > commas) return ';'
  return ','
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const d = delimiterOf(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }   // "" inside quotes = one quote
        else quoted = false
      } else field += c
      continue
    }
    if (c === '"' && field === '') { quoted = true; continue }
    if (c === d) { row.push(field); field = ''; continue }
    if (c === '\r') continue
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.map(r => r.map(f => f.trim()))
}
