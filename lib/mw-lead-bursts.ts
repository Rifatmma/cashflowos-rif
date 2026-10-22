// 👉 Leads that arrived as a batch, not as enquiries.
//
// On 14, 15 and 19 Oct 2026, 22 "Website / Webform" leads were created in
// bursts of 6–9 inside the same hour, all owned by the same person, all with
// near-consecutive Zoho ids, and none answered. A real website does not send
// nine enquiries to one owner in an hour; a list import does. Counted as
// enquiries they made the unanswered rate look far worse than it is and gave
// one market credit for leads it did not earn.
//
// They are FLAGGED, never dropped: the flag is shown, and the person can say
// otherwise. Pure, so the rule is tested.

export type LeadStamp = { id: string; created_time: string; owner_name: string | null }

/** How many leads one owner must receive inside one clock hour to count as a batch. */
export const BURST_MIN = 5

export function burstIds(rows: LeadStamp[], min = BURST_MIN): Set<string> {
  const groups = new Map<string, string[]>()
  for (const r of rows) {
    const hour = String(r.created_time ?? '').slice(0, 13)        // YYYY-MM-DDTHH
    if (!hour) continue
    const key = `${r.owner_name ?? '?'}|${hour}`
    const g = groups.get(key) ?? []
    g.push(r.id)
    groups.set(key, g)
  }
  const out = new Set<string>()
  for (const ids of groups.values()) if (ids.length >= min) ids.forEach(id => out.add(id))
  return out
}
