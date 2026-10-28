// What a paid card's Apply button may and may not do. No network.
//   npx -y tsx --conditions=react-server tests/mw-paid.test.mts
import { checkPaid, rsaProblems, removedCriteria, createsAds, RSA_FLOOR } from '../lib/mw-paid'

let bad = 0
const check = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++ }

const C = 'customers/3759727500'
const AG = C + '/adGroups/-1'
const pay = (ops: any[]) => ({ customerId: '3759727500', operations: ops, summary: ops.map(() => 'line') })
const yes = (ops: any[], m: string) => { const r = checkPaid(pay(ops)); check(r.ok, m + (r.ok ? '' : ` — ${r.errors.join('; ')}`)) }
const no = (ops: any[], m: string) => check(!checkPaid(pay(ops)).ok, m)

// ── negatives: add and remove
yes([{ campaign_criterion_operation: { create: { campaign: C + '/campaigns/24205311003', negative: true, keyword: { text: 'per hari', match_type: 'PHRASE' } } } }], 'add a negative keyword')
yes([{ campaign_criterion_operation: { remove: C + '/campaignCriteria/24205311003~309677404068' } }], 'remove a negative keyword (checked as a negative against the account before Apply)')
no([{ campaign_criterion_operation: { remove: 'customers/2228254174/campaignCriteria/1~2' } }], 'a criterion in another account is refused')
check(removedCriteria(pay([{ campaign_criterion_operation: { remove: C + '/campaignCriteria/1~2' } }]) as any).length === 1, 'removals are listed for the account check')

// ── pause / re-enable
yes([{ ad_group_operation: { update: { resource_name: C + '/adGroups/197430781101', status: 'ENABLED' } } }], 're-enable an ad group')
yes([{ ad_group_criterion_operation: { update: { resource_name: C + '/adGroupCriteria/1~2', status: 'PAUSED' } } }], 'pause a keyword')
no([{ ad_group_operation: { update: { resource_name: C + '/adGroups/1', status: 'PAUSED', name: 'x' } } }], 'a pause changes nothing else')

// ── the hard limits
no([{ campaign_budget_operation: { update: { resource_name: C + '/campaignBudgets/1', amount_micros: 99e6 } } }], 'never a budget')
no([{ campaign_operation: { update: { resource_name: C + '/campaigns/1', status: 'PAUSED' } } }], 'never a whole campaign')
no([{ ad_group_operation: { update: { resource_name: C + '/adGroups/1', cpc_bid_micros: 5e6 } } }], 'never a bid')
no([{ ad_group_operation: { remove: C + '/adGroups/1' } }], 'an ad group is paused, never removed')
no([{ ad_group_criterion_operation: { remove: C + '/adGroupCriteria/1~2' } }], 'a keyword is paused, never removed')
no([{ ad_group_ad_operation: { remove: C + '/adGroupAds/1~2' } }], 'an ad is never removed')

// ── new ad group + keywords + ad, in one tap
const kws = ['billboard rate card malaysia', 'billboard rates malaysia']
const H = ['Billboard Rate Card Malaysia', 'Billboard Rates in Malaysia', 'Malaysia Billboard Rates', 'KL Billboard Prices', 'Digital Billboards in KL',
  'Plan Your Campaign Online', 'Prices by Site and Format', 'See Sites Near Your Store', 'DOOH Screens Across Malaysia', 'Book Billboards in Days',
  'Highway and Mall Screens', 'Audience Data on Every Site', 'Measure Every Campaign', 'Start With a Small Budget', 'Get a Site Plan Today']
const D = ['See billboard and digital screen rates across Malaysia, by site and format.', 'Plan, book and measure outdoor ads in KL, Penang and Johor from one place.',
  'Ask for the rate card: highway, mall and transit screens with audience data.', 'Start small with digital screens and pay only for the hours you need.']
const ad = (h = H, d = D, extra: any = {}) => ({ final_urls: ['https://www.movingwalls.com/locations/malaysia'], responsive_search_ad: { headlines: h.map(text => ({ text })), descriptions: d.map(text => ({ text })) }, ...extra })
const group = [
  { ad_group_operation: { create: { resource_name: AG, name: 'MY-Rate Card', campaign: C + '/campaigns/24205311003', status: 'ENABLED', type: 'SEARCH_STANDARD' } } },
  ...kws.map(text => ({ ad_group_criterion_operation: { create: { ad_group: AG, status: 'ENABLED', keyword: { text, match_type: 'PHRASE' } } } })),
]
yes([...group, { ad_group_ad_operation: { create: { ad_group: AG, status: 'ENABLED', ad: ad() } } }], 'a new ad group with its keywords and a 15-headline ad')
check(createsAds(pay([...group, { ad_group_ad_operation: { create: { ad_group: AG, ad: ad() } } }]) as any), 'the ad is read back for its strength after Apply')
no([{ ad_group_operation: { create: { name: 'x', campaign: C + '/campaigns/1', cpc_bid_micros: 1e6 } } }], 'a new ad group carries no bid')
no([{ ad_group_operation: { create: { name: 'x', campaign: C + '/campaigns/1', type: 'DISPLAY_STANDARD' } } }], 'search ad groups only')

// ── the ad must be written to rate Good or Excellent
check(rsaProblems(ad(), kws).length === 0, `${H.length} headlines, 4 descriptions, keywords in headlines: clears the floor`)
check(rsaProblems(ad(H.slice(0, RSA_FLOOR.headlines - 1)), kws).some(p => /headlines/.test(p)), `fewer than ${RSA_FLOOR.headlines} different headlines is refused`)
check(rsaProblems(ad([...H.slice(0, 11), H[0]]), kws).some(p => /different headlines/.test(p)), 'duplicate headlines do not count twice')
check(rsaProblems(ad(H, D.slice(0, 3)), kws).some(p => /descriptions/.test(p)), 'fewer than 4 descriptions is refused')
check(rsaProblems(ad([...H.slice(0, 14), 'This headline is far too long to show']), kws).some(p => /over 30/.test(p)), 'a headline over 30 characters is refused')
check(rsaProblems(ad(H.map(t => t.replace(/billboard|rate/gi, 'Media'))), kws).some(p => /keywords/.test(p)), 'headlines that never use the keywords are refused')
check(rsaProblems({ ...ad(), responsive_search_ad: { ...ad().responsive_search_ad, headlines: [{ text: H[0], pinned_field: 'HEADLINE_1' }, ...H.slice(1).map(text => ({ text }))] } }, kws).some(p => /pinned/.test(p)), 'pinning is refused')
check(rsaProblems({ ...ad(), final_urls: ['https://example.com/'] }, kws).some(p => /movingwalls/.test(p)), 'the ad only links to movingwalls.com')
no([{ ad_group_ad_operation: { create: { ad_group: AG, ad: ad(H.slice(0, 8)) } } }], 'a weak ad stops the whole card')

console.log(bad ? `\n${bad} FAILED` : '\nall passed')
process.exit(bad ? 1 : 0)
