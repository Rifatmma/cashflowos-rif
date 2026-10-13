// 👉 Who we are actually measured against, and how much of the gap each holds.
//
// This was a text box. Somebody typed four domains and the quarterly pull used
// them, which meant the comparison was only ever as good as whoever last
// remembered to edit it — and it drifted: Japan's box held caasie.co and
// civicoutdoor.com.au, two Australian domains, while the pull that produced
// Japan's topics ran against tokai-ad.co.jp and nichemedia.jp.
//
//   "I don't want anyone to input anymore who the competitors is I want it to
//    come from SERP result so what you pick should be here."
//                                                   (owner, 14 Oct 2026)
//
// So it shows the rivals the pull used, read from mw_market_gaps, and how many
// of this market's gap keywords each one holds. The overlap is computed from
// the gap itself rather than drawn from Semrush, so it cannot disagree with
// the list of topics underneath it.

import type { GapCluster } from '@/lib/mw-gap'

const n = (x: number) => Math.round(x).toLocaleString('en-US')

export type RivalHold = { domain: string; keywords: number; volume: number; best: number }

/** How much of this market's gap each rival is the one holding. */
export function holdsOf(clusters: GapCluster[]): RivalHold[] {
  const acc = new Map<string, { keywords: number; volume: number; best: number }>()
  for (const c of clusters) {
    for (const k of c.keywords) {
      const d = String(k.rival || '').replace(/^www\./, '')
      if (!d) continue
      const at = acc.get(d) ?? { keywords: 0, volume: 0, best: 999 }
      at.keywords += 1
      at.volume += k.vol || 0
      at.best = Math.min(at.best, k.theirBest || 999)
      acc.set(d, at)
    }
  }
  return [...acc.entries()]
    .map(([domain, a]) => ({ domain, ...a }))
    .sort((a, b) => b.keywords - a.keywords)
}

export function RivalsPanel({
  label, rivals, clusters, ourRanked,
}: {
  label: string
  /** The domains the pull actually compared against. */
  rivals: string[]
  clusters: GapCluster[]
  /** How many of this market's searches we hold ourselves. */
  ourRanked: number
}) {
  const holds = holdsOf(clusters)
  const max = Math.max(...holds.map(h => h.keywords), ourRanked, 1)

  if (!rivals.length) {
    return (
      <p className="lede">
        No pull stored for {label} yet. Competitors are taken from {label}&rsquo;s own Google
        results during the monthly pull — nobody types them in.
      </p>
    )
  }

  return (
    <div className="mw-rivals">
      <p className="lede">
        Taken from {label}&rsquo;s own search results, in {label}&rsquo;s own language, during the
        last pull. The bars are how much of this market&rsquo;s gap each one is the one holding.
      </p>

      <table className="mw-ib wide">
        <tbody>
          <tr className="mw-rivals-us">
            <th scope="row">movingwalls.com</th>
            <td className="w"><span className="mw-ibar"><i style={{ width: `${(ourRanked / max) * 100}%` }} data-tone="good" /></span></td>
            <td className="num">{n(ourRanked)}</td>
            <td className="eg">searches we already hold here</td>
          </tr>
          {holds.map(h => (
            <tr key={h.domain}>
              <th scope="row">{h.domain}</th>
              <td className="w"><span className="mw-ibar"><i style={{ width: `${(h.keywords / max) * 100}%` }} /></span></td>
              <td className="num">{n(h.keywords)}</td>
              <td className="eg">{n(h.volume)} searches a month · best #{h.best === 999 ? '—' : h.best}</td>
            </tr>
          ))}
          {rivals.filter(r => !holds.some(h => h.domain === r.replace(/^www\./, ''))).map(r => (
            <tr key={r}>
              <th scope="row">{r}</th>
              <td className="w"><span className="mw-ibar"><i style={{ width: '0%' }} /></span></td>
              <td className="num">0</td>
              <td className="eg">compared against, holds none of the gap</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
