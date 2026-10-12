import 'server-only'
// 👉 Search Console, fetched inside Composio's sandbox.
//
// A direct tool call for this comes back as:
//
//   GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY: response too large
//   (parked in Composio's sandbox)
//
// Composio parks a large payload rather than returning it, so both Search
// Console pulls were failing in production — the per-page one outright, and
// the plan's query x page x country one silently, which is why a plan run with
// Semrush also down produced no ranking data at all and could generate none of
// the ranking-dependent tasks (13 Oct 2026).
//
// So the query runs IN the sandbox and only the compacted rows travel back:
// four numbers and a path per row instead of Google's full envelope. Same
// arrangement as the Gmail fetch in lib/email-payments.ts, for the same reason
// — and the comment there says so, which I should have read first.

import { runWorkbench } from './composio-mcp'

const esc = (v: unknown) => JSON.stringify(v)

/**
 * Rows for the given dimensions, already trimmed.
 *
 * `keys` is returned as an array in dimension order, so one caller can ask for
 * ['page'] and another for ['query','page','country'] without this knowing
 * which is which.
 */
export async function gscQuery(opts: {
  property: string
  start: string
  end: string
  dimensions: string[]
  rowLimit?: number
}): Promise<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[]> {
  const { property, start, end, dimensions, rowLimit = 1000 } = opts
  const code = String.raw`
import json
_res, _err = run_composio_tool(
    'GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY',
    {'site_url': ${esc(property)}, 'start_date': ${esc(start)}, 'end_date': ${esc(end)},
     'dimensions': ${esc(dimensions)}, 'row_limit': ${rowLimit}},
    print_schema_for_tool=False)
_d = (_res or {}).get('data') or _res or {}
_rows = _d.get('rows') or []
# Only what the caller uses. Google's envelope is many times this and is what
# made the direct call too large to return at all.
_out = {'error': _err, 'rows': [
    {'k': [str(x) for x in (r.get('keys') or [])],
     'c': r.get('clicks', 0), 'i': r.get('impressions', 0),
     'r': r.get('ctr', 0), 'p': r.get('position', 0)}
    for r in _rows]}
print('<<<CFO' + json.dumps(_out, ensure_ascii=True) + '\nCFO>>>')
`
  const out = await runWorkbench(code)
  if (out?.error) throw new Error(String(out.error).slice(0, 200))
  return (out?.rows ?? []).map((r: any) => ({
    keys: Array.isArray(r.k) ? r.k.map(String) : [],
    clicks: Number(r.c) || 0,
    impressions: Number(r.i) || 0,
    ctr: Number(r.r) || 0,
    position: Number(r.p) || 0,
  }))
}
