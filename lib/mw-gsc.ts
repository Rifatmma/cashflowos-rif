import 'server-only'
// 👉 Search Console, fetched through Composio's sandbox, in pieces.
//
// Two walls, found one after the other on 13 Oct 2026:
//
//  1. A DIRECT tool call comes back "response too large (parked in Composio's
//     sandbox)" and the rows never arrive. So the query has to run INSIDE the
//     sandbox, which is what lib/email-payments.ts has always done.
//  2. The sandbox returns its answer on stdout, and Composio truncates stdout
//     at around 10,000 characters. Measured on the live property: 528 page
//     rows are 17k gzipped and base64'd, and the plan's query x page x country
//     pull is 78k. Filtering to what the planner uses only gets it to 18k.
//     There is no filter that makes one print fit.
//
// So the sandbox runs the query ONCE, keeps the compressed payload in a
// variable, and hands it back a slice at a time. Sandbox state survives
// between calls — the same sandbox answers each one — which is what makes this
// possible at all.
//
// Until this worked, Search Console had never actually reached the planner: the
// direct call had been failing silently since it was written, and nobody saw it
// because Semrush was carrying the ranking data. When Semrush's key stopped
// working there was nothing left.

import { gunzipSync } from 'zlib'
import { runWorkbench } from './composio-mcp'

/**
 * Inside the ~10,000 character stdout cap, with room for the JSON wrapper and
 * the two markers — about 9,000 would still fit and leaves nothing spare.
 *
 * Raised from 6,000 on 13 Oct 2026 when the market pull went from a truncated
 * 5,000 rows to Search Console's full 25,000. Every chunk is a separate
 * sandbox round-trip inside a function with a 60-second ceiling, so the
 * payload growing from ~78k to ~134k would have cost seven more calls at the
 * old size. At 8,500 it costs three.
 */
const CHUNK = 8500
/** A runaway would be a loop; 40 slices is 240k, far more than any real pull. */
const MAX_CHUNKS = 40

const esc = (v: unknown) => JSON.stringify(v)

export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }

/**
 * Rows for the given dimensions.
 *
 * `minImpressions` is applied in the sandbox, not here: it is the difference
 * between 78k and 30k of payload, and a row seen once in a month is noise in
 * every calculation downstream anyway.
 */
export async function gscQuery(opts: {
  property: string
  start: string
  end: string
  dimensions: string[]
  rowLimit?: number
  minImpressions?: number
}): Promise<GscRow[]> {
  const { property, start, end, dimensions, rowLimit = 1000, minImpressions = 0 } = opts
  // Namespaced per call so two pulls in one request cannot read each other's
  // payload out of the shared sandbox.
  const v = `_cfo_${Math.random().toString(36).slice(2, 10)}`

  const first = String.raw`
import json, gzip, base64
_res, _err = run_composio_tool(
    'GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY',
    {'site_url': ${esc(property)}, 'start_date': ${esc(start)}, 'end_date': ${esc(end)},
     'dimensions': ${esc(dimensions)}, 'row_limit': ${rowLimit}},
    print_schema_for_tool=False)
_rows = ((_res or {}).get('data') or _res or {}).get('rows') or []
_keep = [r for r in _rows if (r.get('impressions') or 0) >= ${minImpressions}]
# Arrays, not objects: the field names cost more than the numbers do.
_c = [[[str(x) for x in (r.get('keys') or [])],
       r.get('clicks', 0), r.get('impressions', 0),
       round(r.get('ctr', 0), 5), round(r.get('position', 0), 2)] for r in _keep]
${v} = base64.b64encode(gzip.compress(json.dumps(_c, separators=(',', ':')).encode())).decode()
print('<<<CFO' + json.dumps({'error': _err, 'total': len(_rows), 'kept': len(_keep),
      'len': len(${v}), 'chunks': (len(${v}) + ${CHUNK} - 1) // ${CHUNK}}, ensure_ascii=True) + '\nCFO>>>')
`
  const head = await runWorkbench(first)
  if (head?.error) throw new Error(String(head.error).slice(0, 200))
  const chunks = Number(head?.chunks) || 0
  if (!chunks) return []
  if (chunks > MAX_CHUNKS) throw new Error(`Search Console: ${head.len} bytes is more than this can carry`)

  let b64 = ''
  for (let i = 0; i < chunks; i++) {
    const part = await runWorkbench(String.raw`
import json
print('<<<CFO' + json.dumps({'s': ${v}[${i * CHUNK}:${(i + 1) * CHUNK}]}, ensure_ascii=True) + '\nCFO>>>')
`)
    b64 += String(part?.s ?? '')
  }
  if (b64.length !== Number(head.len)) {
    throw new Error(`Search Console: payload arrived short (${b64.length} of ${head.len})`)
  }

  const rows = JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'))
  return (rows as any[]).map(r => ({
    keys: (r[0] ?? []).map(String),
    clicks: Number(r[1]) || 0,
    impressions: Number(r[2]) || 0,
    ctr: Number(r[3]) || 0,
    position: Number(r[4]) || 0,
  }))
}
