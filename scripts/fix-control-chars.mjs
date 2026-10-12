// Replace control bytes that shell escaping put into regex literals.
//
//   node scripts/fix-control-chars.mjs [--write]
//
// Three times in this project a `\b` or `\1` written through a shell heredoc
// has arrived in the source as the byte it denotes — 0x08 and 0x01 — leaving a
// regex that compiles, never matches, and fails silently. The worst of them
// stopped <script> tags being stripped from 289 crawled blog posts, so every
// topical match was computed against JSON-LD instead of article text.
//
// Written as a FILE rather than a shell one-liner on purpose: passing these
// bytes through a command line is what caused the problem, and four attempts
// to fix it from the command line all failed for the same reason.

import { readFileSync, writeFileSync } from 'fs'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

const BAD = {
  '\u0001': '\\1',   // backreference
  '\u0002': '\\2',
  '\u0008': '\\b',   // word boundary
  '\u000b': '\\v',
  '\u000c': '\\f',
}
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g
const DIRS = ['lib', 'app', 'scripts', 'tests']
const EXT = /\.(ts|tsx|mts|mjs)$/

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(p)) out.push(p)
  }
  return out
}

const write = process.argv.includes('--write')
let found = 0, fixed = 0, unknown = 0

for (const dir of DIRS) {
  let files
  try { files = walk(dir) } catch { continue }
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const hits = src.match(CONTROL)
    if (!hits) continue
    found += hits.length

    let out = ''
    for (const ch of src) {
      if (!CONTROL.test(ch)) { out += ch; continue }
      CONTROL.lastIndex = 0
      const repl = BAD[ch]
      if (repl === undefined) {
        unknown++
        console.error(`  ${file}: unknown control char ${JSON.stringify(ch)} — left alone`)
        out += ch
      } else {
        fixed++
        out += repl
      }
    }
    CONTROL.lastIndex = 0

    const line = (s, i) => s.slice(0, i).split('\n').length
    console.log(`${file}: ${hits.length} on line(s) ${[...src.matchAll(CONTROL)].map(m => line(src, m.index)).join(', ')}`)
    if (write) writeFileSync(file, out, 'utf8')
  }
}

console.log(`\n${found} control characters, ${fixed} replaceable, ${unknown} unknown`)
console.log(write ? 'written' : 'dry run — pass --write to apply')
process.exit(found && !write ? 1 : 0)
