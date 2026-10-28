// 👉 What a paid card's Apply button may do to Google Ads.
//
// A `paid-apply` card carries the exact change, prepared by the Monday run,
// and Rif applies it with one tap (owner, 26 Oct 2026). What a tap may do
// (owner, 28 Oct 2026):
//   • add or remove a NEGATIVE keyword on a campaign
//   • pause or re-enable a keyword or an ad group
//   • add keywords to an ad group
//   • create an ad group, with its keywords and a responsive search ad, in
//     one tap — the ad written to rate Good or Excellent
//
// Budgets, bids, bidding strategies, campaigns, and removing anything other
// than a negative keyword are refused here, whatever the card says: a card is
// data written by a run, and this is the line between a suggestion and the
// account. Whether a removed criterion really is a negative keyword is checked
// against the account itself in lib/mw-paid-apply.ts.
//
// Pure: no server imports. Tested in tests/mw-week.test.mts.

export const ADS_CUSTOMER = '3759727500'

export type PaidPayload = {
  customerId: string
  /** GOOGLEADS_BATCH_MUTATE mutate_operations, exactly as sent. */
  operations: Record<string, any>[]
  /** One plain line per operation, shown on the card before Apply. */
  summary: string[]
}

/** The floor every new responsive search ad must clear: what Google's ad strength rewards. */
export const RSA_FLOOR = { headlines: 12, descriptions: 4, keywordHeadlines: 3, headlineMax: 30, descriptionMax: 90 }

const resOf = (r: unknown) => String(r ?? '')
const inAccount = (r: unknown, cust: string) => resOf(r).startsWith(`customers/${cust}/`)
const MATCH = new Set(['EXACT', 'PHRASE', 'BROAD'])
const matchOf = (k: any) => String(k?.match_type ?? k?.matchType ?? '')
const statusOnly = (u: Record<string, any>) => {
  const f = Object.keys(u).filter(k => k !== 'resource_name' && k !== 'resourceName')
  return f.length === 1 && f[0] === 'status' && ['PAUSED', 'ENABLED'].includes(u.status)
}
const BID = /bid|cpc|cpm|cpv|target|budget|bidding/i
const hasBid = (o: Record<string, any>) => Object.keys(o).some(k => BID.test(k))
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Why a responsive search ad would not rate Good or Excellent. Empty when it clears the floor. */
export function rsaProblems(ad: any, keywords: string[]): string[] {
  const out: string[] = []
  const rsa = ad?.responsive_search_ad ?? ad?.responsiveSearchAd
  if (!rsa) return ['only responsive search ads']
  const hs: any[] = rsa.headlines ?? []
  const ds: any[] = rsa.descriptions ?? []
  const urls: string[] = ad?.final_urls ?? ad?.finalUrls ?? []
  if (!urls.length || !urls.every(u => /^https:\/\/(www\.)?movingwalls\.com\//.test(String(u)))) out.push('final URL must be a movingwalls.com page')
  if ([...hs, ...ds].some(a => a?.pinned_field || a?.pinnedField)) out.push('no pinned headlines or descriptions (pinning lowers ad strength)')
  const hText = hs.map(h => String(h?.text ?? ''))
  const dText = ds.map(d => String(d?.text ?? ''))
  const uniqH = new Set(hText.map(norm)).size
  const uniqD = new Set(dText.map(norm)).size
  if (uniqH < RSA_FLOOR.headlines) out.push(`at least ${RSA_FLOOR.headlines} different headlines (has ${uniqH})`)
  if (uniqD < RSA_FLOOR.descriptions) out.push(`${RSA_FLOOR.descriptions} different descriptions (has ${uniqD})`)
  const longH = hText.filter(t => t.length > RSA_FLOOR.headlineMax)
  if (longH.length) out.push(`headlines over ${RSA_FLOOR.headlineMax} characters: ${longH.join(' | ')}`)
  if (dText.some(t => t.length > RSA_FLOOR.descriptionMax)) out.push(`descriptions over ${RSA_FLOOR.descriptionMax} characters`)
  if (keywords.length) {
    const kws = keywords.map(norm)
    const uses = (t: string) => kws.some(k => norm(t).includes(k) || k.split(' ').filter(w => w.length > 3).every(w => norm(t).includes(w)))
    const withKw = hText.filter(uses).length
    if (withKw < RSA_FLOOR.keywordHeadlines) out.push(`at least ${RSA_FLOOR.keywordHeadlines} headlines must use the ad group's keywords (has ${withKw})`)
  }
  return out
}

/** Why an operation may not be applied, or null if it may. `kwByGroup` = keywords created in this batch, by ad group. */
function refuse(op: Record<string, any>, cust: string, kwByGroup: Map<string, string[]>): string | null {
  const keys = Object.keys(op)
  if (keys.length !== 1) return 'one operation family per item'
  const [fam] = keys
  const body = op[fam] ?? {}

  if (fam === 'campaign_criterion_operation') {
    if (body.remove) return resOf(body.remove).startsWith(`customers/${cust}/campaignCriteria/`) ? null : 'that criterion is not in this account'
    const c = body.create
    if (!c) return 'campaign criteria: only adding or removing negative keywords'
    if (c.negative !== true || !c.keyword?.text || !MATCH.has(matchOf(c.keyword))) return 'campaign criteria: only negative keywords'
    if (!inAccount(c.campaign, cust)) return 'campaign is not in this account'
    return null
  }
  if (fam === 'ad_group_criterion_operation') {
    if (body.remove) return 'keywords are paused, never removed'
    if (body.create) {
      const c = body.create
      if (!c.keyword?.text || !MATCH.has(matchOf(c.keyword))) return 'ad group criteria: only keywords'
      if (c.negative) return 'ad group criteria: negatives go on the campaign'
      if (hasBid(c)) return 'no bids'
      if (!inAccount(c.ad_group, cust)) return 'ad group is not in this account'
      return null
    }
    if (body.update) return statusOnly(body.update) && inAccount(body.update.resource_name ?? body.update.resourceName, cust) ? null : 'keywords: only pausing or re-enabling'
    return 'ad group criteria: create or update only'
  }
  if (fam === 'ad_group_operation') {
    if (body.remove) return 'ad groups are paused, never removed'
    if (body.update) return statusOnly(body.update) && inAccount(body.update.resource_name ?? body.update.resourceName, cust) ? null : 'ad groups: only pausing or re-enabling'
    const c = body.create
    if (!c) return 'ad groups: create, pause or re-enable only'
    if (!c.name || !inAccount(c.campaign, cust)) return 'a new ad group needs a name and a campaign in this account'
    if (hasBid(c)) return 'a new ad group carries no bid; the campaign bidding decides'
    if (c.type && c.type !== 'SEARCH_STANDARD') return 'search ad groups only'
    const temp = c.resource_name ?? c.resourceName
    if (temp && !inAccount(temp, cust)) return 'temporary id must be in this account'
    return null
  }
  if (fam === 'ad_group_ad_operation') {
    if (body.remove) return 'ads are never removed by Apply'
    const c = body.create
    if (!c) return 'ads: only creating a responsive search ad'
    if (!inAccount(c.ad_group, cust)) return 'ad group is not in this account'
    const problems = rsaProblems(c.ad, kwByGroup.get(resOf(c.ad_group)) ?? [])
    return problems.length ? `the ad would not rate Good: ${problems.join('; ')}` : null
  }
  return `${fam} is not something Apply may change (budgets, bidding and campaigns are yours alone)`
}

/** Check a paid card's change before anything reaches Google Ads. */
export function checkPaid(payload: unknown): { ok: true; payload: PaidPayload } | { ok: false; errors: string[] } {
  const p = payload as Partial<PaidPayload> | null
  const errors: string[] = []
  if (!p || typeof p !== 'object') return { ok: false, errors: ['no change on this card'] }
  if (p.customerId !== ADS_CUSTOMER) errors.push(`wrong Google Ads account (${p.customerId ?? 'none'})`)
  const ops = Array.isArray(p.operations) ? p.operations : []
  if (!ops.length) errors.push('no operations')
  if (ops.length > 50) errors.push('more than 50 operations; split the card')
  if (!Array.isArray(p.summary) || p.summary.length !== ops.length) errors.push('every operation needs one summary line')
  const kwByGroup = new Map<string, string[]>()
  for (const op of ops) {
    const c = op?.ad_group_criterion_operation?.create
    if (c?.keyword?.text) kwByGroup.set(resOf(c.ad_group), [...(kwByGroup.get(resOf(c.ad_group)) ?? []), String(c.keyword.text)])
  }
  ops.forEach((op, i) => { const why = refuse(op ?? {}, ADS_CUSTOMER, kwByGroup); if (why) errors.push(`#${i + 1}: ${why}`) })
  return errors.length ? { ok: false, errors } : { ok: true, payload: p as PaidPayload }
}

/** Campaign criteria a payload removes. Each must be a negative keyword, checked against the account before Apply. */
export const removedCriteria = (p: PaidPayload): string[] =>
  p.operations.map(o => o?.campaign_criterion_operation?.remove).filter(Boolean).map(String)

/** Ads a payload creates, by temporary or real ad group, so their strength can be read back after Apply. */
export const createsAds = (p: PaidPayload): boolean => p.operations.some(o => o?.ad_group_ad_operation?.create)
