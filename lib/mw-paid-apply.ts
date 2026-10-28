import 'server-only'

// Applies a paid-apply card's Google Ads change. Every call checks the change
// (checkPaid, lib/mw-paid.ts), confirms against the account that anything it
// removes is a negative keyword, asks Google to validate the whole batch, and
// only then sends it for real — so a bad operation fails before anything
// changes, and a batch either all lands or none of it does. After a new ad is
// created, its ad strength is read back and kept on the card.

import { runTool } from './composio-mcp'
import { checkPaid, removedCriteria, createsAds, type PaidPayload } from './mw-paid'

export type ApplyResult =
  | { ok: true; resources: string[]; adStrength?: { ad: string; strength: string }[] }
  | { ok: false; error: string }

async function gaql(customer: string, query: string): Promise<any[]> {
  const out = await runTool('GOOGLEADS_SEARCH_STREAM_GAQL', undefined, { customer_id: customer, query })
  return (out?.results ?? out?.data?.results ?? []) as any[]
}

/** Every removed campaign criterion must be a negative KEYWORD — never a location, schedule or anything else. */
async function onlyNegatives(p: PaidPayload): Promise<string | null> {
  const ids = removedCriteria(p)
  if (!ids.length) return null
  const rows = await gaql(p.customerId,
    `SELECT campaign.id, campaign_criterion.resource_name, campaign_criterion.negative, campaign_criterion.type FROM campaign_criterion WHERE campaign_criterion.resource_name IN (${ids.map(r => `'${r.replace(/'/g, '')}'`).join(',')})`)
  for (const id of ids) {
    const r = rows.find(x => x?.campaignCriterion?.resourceName === id)
    if (!r) return `${id} was not found in the account`
    if (r.campaignCriterion.negative !== true || r.campaignCriterion.type !== 'KEYWORD') return `${id} is not a negative keyword, so Apply will not remove it`
  }
  return null
}

export async function applyPaid(payload: unknown, opts: { validateOnly?: boolean } = {}): Promise<ApplyResult> {
  const c = checkPaid(payload)
  if (!c.ok) return { ok: false, error: c.errors.join('; ') }
  const p: PaidPayload = c.payload
  const args = { customer_id: p.customerId, mutate_operations: p.operations }
  try {
    const notNegative = await onlyNegatives(p)
    if (notNegative) return { ok: false, error: notNegative }
    await runTool('GOOGLEADS_BATCH_MUTATE', undefined, { ...args, validate_only: true })
    if (opts.validateOnly) return { ok: true, resources: [] }
    const out = await runTool('GOOGLEADS_BATCH_MUTATE', undefined, args)
    const resources = ((out?.mutate_operation_responses ?? out?.mutateOperationResponses ?? []) as any[])
      .map(r => JSON.stringify(r).match(/customers\/\d+\/[^"]+/)?.[0] ?? '')
      .filter(Boolean)
    let adStrength: { ad: string; strength: string }[] | undefined
    const ads = resources.filter(r => r.includes('/adGroupAds/'))
    if (createsAds(p) && ads.length) {
      // Google may still say PENDING right after creation; the Monday run reads it again.
      const rows = await gaql(p.customerId,
        `SELECT ad_group_ad.resource_name, ad_group_ad.ad_strength FROM ad_group_ad WHERE ad_group_ad.resource_name IN (${ads.map(a => `'${a}'`).join(',')})`).catch(() => [])
      adStrength = ads.map(a => ({ ad: a, strength: String(rows.find(x => x?.adGroupAd?.resourceName === a)?.adGroupAd?.adStrength ?? 'PENDING') }))
    }
    return { ok: true, resources, adStrength }
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
