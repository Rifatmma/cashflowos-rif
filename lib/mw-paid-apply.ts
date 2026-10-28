import 'server-only'

// Applies a paid-apply card's Google Ads change. Every call checks the change
// (checkPaid, lib/mw-week.ts), asks Google to validate it, and only then
// sends it for real — so a bad operation fails before anything changes, and
// a batch either all lands or none of it does.

import { runTool } from './composio-mcp'
import { checkPaid, type PaidPayload } from './mw-week'

export type ApplyResult =
  | { ok: true; resources: string[] }
  | { ok: false; error: string }

export async function applyPaid(payload: unknown, opts: { validateOnly?: boolean } = {}): Promise<ApplyResult> {
  const c = checkPaid(payload)
  if (!c.ok) return { ok: false, error: c.errors.join('; ') }
  const p: PaidPayload = c.payload
  const args = { customer_id: p.customerId, mutate_operations: p.operations }
  try {
    await runTool('GOOGLEADS_BATCH_MUTATE', undefined, { ...args, validate_only: true })
    if (opts.validateOnly) return { ok: true, resources: [] }
    const out = await runTool('GOOGLEADS_BATCH_MUTATE', undefined, args)
    const resources = ((out?.mutate_operation_responses ?? out?.mutateOperationResponses ?? []) as any[])
      .map(r => JSON.stringify(r).match(/customers\/\d+\/[^"]+/)?.[0] ?? '')
      .filter(Boolean)
    return { ok: true, resources }
  } catch (e: any) {
    return { ok: false, error: plain(String(e?.message ?? e)) }
  }
}

/**
 * Google's error, as a sentence. The API answers with nested JSON whose most
 * specific line is the last "message" (e.g. "Resource was not found."); the
 * card shows that, not the payload.
 */
function plain(raw: string): string {
  const msgs = [...raw.matchAll(/"message"\s*:\s*"([^"]+)"/g)].map(m => m[1])
  const best = msgs.length ? msgs[msgs.length - 1] : raw.replace(/^GOOGLEADS_BATCH_MUTATE:\s*/, '')
  return `Google Ads refused the change: ${best}`.slice(0, 240)
}
