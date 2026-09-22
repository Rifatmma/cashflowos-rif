import 'server-only'
// Composio through its MCP endpoint (connect.composio.dev/mcp), authenticated
// with the owner's CONSUMER key (ck_…, sent as x-consumer-api-key).
//
// Why not the developer REST API: the owner's Gmail and Meta connections live in
// the consumer account; a developer-platform project would need every app
// reconnected there. The consumer key already reaches them.
//
// Protocol: MCP "streamable HTTP" -- initialize, then tools/call. Replies come
// back as JSON or as a server-sent-event stream; both are handled.

const URL_ = 'https://connect.composio.dev/mcp'

function key() {
  const k = process.env.COMPOSIO_API_KEY?.trim()
  if (!k) throw new Error('COMPOSIO_API_KEY is not set')
  return k
}

async function rpc(body: any, session?: string): Promise<{ json: any; session?: string }> {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-consumer-api-key': key(),
      ...(session ? { 'mcp-session-id': session } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  })
  const sid = res.headers.get('mcp-session-id') ?? session
  const text = await res.text()
  if (!res.ok) throw new Error(`Composio MCP ${res.status}: ${text.slice(0, 200)}`)
  if (!text.trim()) return { json: null, session: sid ?? undefined }
  // SSE: take the last "data:" line that parses as JSON-RPC.
  if (/^\s*(event|data):/m.test(text)) {
    const datas = text.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim())
    for (let i = datas.length - 1; i >= 0; i--) {
      try { return { json: JSON.parse(datas[i]), session: sid ?? undefined } } catch { /* keep looking */ }
    }
    throw new Error('Composio MCP: unreadable event stream')
  }
  return { json: JSON.parse(text), session: sid ?? undefined }
}

let sessionPromise: Promise<string | undefined> | null = null
async function session(): Promise<string | undefined> {
  sessionPromise ??= (async () => {
    const init = await rpc({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'cashflowos', version: '1.0' } },
    })
    if (init.json?.error) throw new Error(`Composio MCP init: ${init.json.error.message}`)
    await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, init.session).catch(() => {})
    return init.session
  })()
  try { return await sessionPromise } catch (e) { sessionPromise = null; throw e }
}

let nextId = 2
/** Call one MCP tool; returns its parsed JSON (the text content of the result). */
async function callTool(name: string, args: Record<string, any>): Promise<any> {
  const sid = await session()
  const { json } = await rpc({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } }, sid)
  if (json?.error) throw new Error(`Composio MCP ${name}: ${json.error.message}`)
  const text = (json?.result?.content ?? []).find((c: any) => c.type === 'text')?.text ?? ''
  try { return JSON.parse(text) } catch { return { raw: text } }
}

/**
 * Run Python in Composio's sandbox and return what it printed between
 * <<<CFO and CFO>>> as JSON. Used where a tool's raw output (e.g. HTML emails,
 * ~50k tokens each) is too big to come back directly: the sandbox shrinks it
 * first and only the compact result travels.
 */
export async function runWorkbench(code: string): Promise<any> {
  const out = await callTool('COMPOSIO_REMOTE_WORKBENCH', { code_to_execute: code, thought: 'CashflowOS nightly job' })
  const d = out?.data ?? out
  if (d?.error) throw new Error(`Composio sandbox: ${String(d.error).slice(0, 300)}`)
  const stdout = String(d?.stdout ?? '')
  const m = stdout.match(/<<<CFO([\s\S]*?)\nCFO>>>/)
  if (!m) throw new Error(`Composio sandbox gave no result: ${(stdout || String(d?.stderr ?? out?.raw ?? '')).slice(0, 300)}`)
  return JSON.parse(m[1])
}

/**
 * Run ONE Composio tool on a named connected account (alias, e.g. the inbox
 * address, or account id). Returns the tool's data. Throws on failure, and when
 * the response was too large and got parked in Composio's sandbox instead.
 */
export async function runTool(slug: string, account: string | undefined, args: Record<string, any>): Promise<any> {
  const out = await callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
    tools: [{ tool_slug: slug, ...(account ? { account } : {}), arguments: args }],
    sync_response_to_workbench: false,
    thought: 'CashflowOS nightly job',
  })
  const r = out?.data?.results?.[0]
  if (!r) throw new Error(`${slug}: ${String(out?.error ?? out?.raw ?? 'no result').slice(0, 200)}`)
  const resp = r.response ?? r
  if (resp?.successful === false) throw new Error(`${slug}: ${String(resp?.error ?? 'failed').slice(0, 200)}`)
  if (resp?.data === undefined && resp?.data_preview !== undefined) {
    throw new Error(`${slug}: response too large (parked in Composio's sandbox)`)
  }
  return resp?.data ?? {}
}
