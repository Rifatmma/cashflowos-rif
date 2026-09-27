// The receipt search box: Cash Out and /cash-out/find.
/** The search box, also shown at the top of Cash Out. A plain GET form: works on any phone. */
export default function FindBox({ q = '' }: { q?: string }) {
  return (
    <form action="/cash-out/find" method="get" className="co-find" role="search">
      <input name="q" defaultValue={q} placeholder="Record # or shop name, e.g. 174 or Sri Ternak"
        aria-label="Find a receipt by record number or shop name" inputMode="search" />
      <button className="btn">Find</button>
    </form>
  )
}
