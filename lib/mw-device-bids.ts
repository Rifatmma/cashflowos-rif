// Should the desktop bid be cut, and would cutting it do anything?
//
// Pulled out of lib/mw-refresh.ts so the judgement can be tested against real
// account numbers, because the old version of it was wrong in three ways at
// once and nothing caught that until the owner tried to act on it
// (9 Oct 2026):
//
//   · it counted 12 DESKTOP criteria of which 8 were paused and 2 deleted;
//   · it never read the bidding strategy, so it recommended a lever that
//     Smart Bidding ignores;
//   · and it asked "is a modifier set?" rather than "is desktop worse?" — a
//     question whose answer can only ever be no until somebody sets one.
//
// Pure: takes rows, returns a verdict.

/** Smart Bidding sets a bid per auction and IGNORES device modifiers.
 *
 *  The one device value these honour is −100%, which excludes the device
 *  outright. Google's API still accepts and stores any other number — checked
 *  with a validate_only mutate — so a −40% here looks applied in the interface
 *  and changes nothing in the auction. That is worse than leaving it alone.
 */
export const SMART_BIDDING = /MAXIMIZE_CONVERSIONS|TARGET_CPA|MAXIMIZE_CONVERSION_VALUE|TARGET_ROAS/i

/** Desktop is only "worse" once it is clear of the noise in a small sample. */
export const WORSE_BY = 1.15

export type DeviceCriterion = {
  n: string                     // campaign name
  dev: string                   // DESKTOP | MOBILE | TABLET
  mod: number | null            // bid modifier, 1 = none, null = never set
  strategy: string              // campaign.bidding_strategy_type
}
export type DevicePerf = { n: string; dev: string; clicks: number; cost: number; conv: number }

export type DeviceVerdict = {
  status: 'not' | 'part' | 'done' | 'moot'
  evidence: string
  /** Set only when status is 'moot': why, and what can be done instead. */
  mootWhy?: string
}

const rm = (n: number) => `S$${n.toFixed(2)}`
const costPerLead = (r: DevicePerf | undefined) =>
  r && r.conv > 0 ? r.cost / r.conv : null

export function desktopBidVerdict(devices: DeviceCriterion[], perf: DevicePerf[]): DeviceVerdict | null {
  const desktops = devices.filter(d => String(d.dev ?? '') === 'DESKTOP')
  if (!desktops.length) return null

  const find = (name: string, dev: string) => perf.find(x => x.n === name && x.dev === dev)
  const already = desktops.filter(d => d.mod != null && Number(d.mod) !== 1)

  const worth: { n: string; cut: number; d: number; m: number }[] = []
  const blocked: string[] = []

  for (const d of desktops) {
    if (d.mod != null && Number(d.mod) !== 1) continue
    if (SMART_BIDDING.test(String(d.strategy ?? ''))) { blocked.push(d.n); continue }
    const dc = costPerLead(find(d.n, 'DESKTOP'))
    const mc = costPerLead(find(d.n, 'MOBILE'))
    // No conversions on one side is not evidence the other is bad — it is
    // usually evidence there is not enough of it yet to judge. Say nothing.
    if (dc === null || mc === null) continue
    if (dc <= mc * WORSE_BY) continue
    // The cut that levels cost per lead, never deeper than the −60% the
    // original recommendation named.
    worth.push({ n: d.n, cut: Math.max(-60, Math.round((mc / dc - 1) * 100)), d: dc, m: mc })
  }

  if (worth.length) {
    return {
      status: already.length ? 'part' : 'not',
      evidence: worth.slice(0, 2).map(w =>
        `${w.n}: desktop ${rm(w.d)} a lead against mobile's ${rm(w.m)} — about ${w.cut}% would level them`).join(' · '),
    }
  }
  if (already.length) {
    return {
      status: 'done',
      evidence: `${already.length} campaign${already.length === 1 ? '' : 's'} adjust desktop (` +
        `${already.slice(0, 3).map(d => `${Math.round((Number(d.mod) - 1) * 100)}%`).join(', ')})`,
    }
  }

  const why = blocked.length
    ? `${blocked.join(', ')} ${blocked.length === 1 ? 'runs' : 'run'} Smart Bidding, which ignores device ` +
      `bid modifiers — the only device lever there is excluding desktop outright. ` +
      `If desktop really must come down, the levers are a tCPA target, or −100% to exclude it, ` +
      `which also gives up the conversions desktop does bring.`
    : `desktop is not costing more per lead than mobile on any live campaign`
  return { status: 'moot', evidence: why, mootWhy: why }
}
