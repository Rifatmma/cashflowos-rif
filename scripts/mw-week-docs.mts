// Monday, step 4b: put the week's drafts into Google Docs in the shared
// "MW Content" folder, on the WORK account. Idempotent: a doc with the same
// title already in the folder is reused, not duplicated.
//
//   npx -y tsx --conditions=react-server --env-file=.env scripts/mw-week-docs.mts <week> <drafts dir> <folderId> <docs account> <drive account>
//
// Each draft is docs/week/drafts/<week-short>-<slug>.md; its first H1 is the
// doc's topic. Writes docs/week/<week>-docs.json: { "<file>": "<doc url>" }.

import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { runTool } from '../lib/composio-mcp'

const [week, dir, folder, docsAcct, driveAcct] = process.argv.slice(2)
if (!week || !dir || !folder || !docsAcct || !driveAcct) {
  console.error('usage: mw-week-docs.mts <week> <drafts dir> <folderId> <docs account> <drive account>')
  process.exit(1)
}
const short = `W${week.split('-W')[1]}`
const MARKET: Record<string, string> = { us: 'Americas', id: 'Indonesia', ph: 'Philippines', tw: 'Taiwan', in: 'India', uk: 'UK', dinesh: 'Dinesh' }

const out: Record<string, string> = {}
for (const f of readdirSync(dir).filter(n => n.startsWith(`${short}-`) && n.endsWith('.md')).sort()) {
  const md = readFileSync(`${dir}/${f}`, 'utf8')
  const topic = (md.match(/^#\s+(.+)$/m)?.[1] ?? f).trim()
  const market = MARKET[f.split('-')[1]] ?? f.split('-')[1]
  const title = `${short} · ${market} · ${topic}`.slice(0, 120)

  const found = await runTool('GOOGLEDRIVE_FIND_FILE', driveAcct, { q: `name = '${title.replace(/'/g, "\\'")}' and trashed = false`, folder_id: folder })
    .catch(() => null)
  const existing = (found?.files ?? found?.data?.files ?? [])[0]
  if (existing?.id) {
    out[f] = `https://docs.google.com/document/d/${existing.id}/edit`
    console.log(`kept    ${title}`)
    continue
  }

  // A long draft makes Composio park the (huge) response instead of returning
  // it — the doc is still created, so find it by its title rather than make a second one.
  const made = await runTool('GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN', docsAcct, { title, markdown_text: md })
    .catch(async e => {
      if (!/too large/.test(String(e?.message))) throw e
      const hit = await runTool('GOOGLEDRIVE_FIND_FILE', driveAcct, { q: `name = '${title.replace(/'/g, "\\'")}' and trashed = false` })
      return { id: (hit?.files ?? [])[0]?.id }
    })
  const id = made?.document_id ?? made?.documentId ?? made?.id ?? made?.response_data?.documentId ?? made?.document?.documentId
  if (!id) { console.error(`no id for ${f}: ${JSON.stringify(made).slice(0, 300)}`); process.exit(1) }
  await runTool('GOOGLEDRIVE_MOVE_FILE', driveAcct, { file_id: id, add_parents: folder, remove_parents: 'root' })
    .catch(e => console.error(`  could not move ${f}: ${String(e?.message ?? e).slice(0, 160)}`))
  out[f] = `https://docs.google.com/document/d/${id}/edit`
  console.log(`created ${title}`)
}
writeFileSync(`docs/week/${week}-docs.json`, JSON.stringify(out, null, 2))
console.log(`${Object.keys(out).length} docs → docs/week/${week}-docs.json`)
