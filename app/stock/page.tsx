// 👉 Stock — what's on the shelf, what's running low, and the weekly count.
//
// Stock comes IN from receipts (Jarvis reads the photo; lib/stock-items.ts turns
// "FDZ CHICKEN BONELESS BREAST 2KG" into 1,920 g of usable breast) and goes OUT
// with each day's sales upload on Cash In (lib/recipes.ts). The weekly count is
// the truth check: what's physically there vs what the book says.
//
// Phone first: staff fill the count standing at the fridge, so every input is a
// big number box, grams are typed in kg, and nothing needs a laptop.
import Link from 'next/link'
import { getRecords } from '@/lib/records'
import { getItems, getMoves, stockState, wasteBetween, unitCosts, taughtAliases } from '@/lib/stock-data'
import { ITEM, ITEMS, IGNORE_KEY, fmtQty, itemForName, stockFromLine, type ReceiptLine } from '@/lib/stock-items'
import { addDays, daysBetween, dayLabel, mytDate } from '@/lib/period'
import { forecastFor, shortTonight, buyFor, coverDays, roundBuy, BASIS_WORD } from '@/lib/stock-forecast'
import ActionForm from './ActionForm'
import { saveCount, addMove, teachAlias, ignoreAll, skipLine } from './actions'

export const dynamic = 'force-dynamic'

const money2 = (n: number) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const costLabel = (c: number, unit: string) =>
  unit === 'g' ? `${money2(c * 1000)}/kg` : unit === 'fish' ? `${money2(c)}/fish` : `${money2(c)}/pc`
// Groceries that are obviously not meat, seafood, eggs or rice: never offered
// for "this is…", or the list becomes sugar and cooking oil every week.
const DRY_GOODS = /(gula|sugar|minyak|oil|tepung|flour|susu|milk|krimer|creamer|sauce|sos|kicap|mush|cendawan|margarin|butter|milo|kopi|coffee|nescafe|teh|tea|garam|salt|ajinomoto|perasa|stok|stock|knorr|dipping|cili|chili|bawang|onion|garlic|halia|serai|limau|lime|santan|coconut|beg|bag|tisu|tissue|sabun|soap)/i
const displayShop = (raw: string) => String(raw || '').replace(/\s*\(.*$/, '').replace(/(sdn\.?\s*bhd\.?|berhad)/gi, '').trim().slice(0, 28)
const KIND: Record<string, string> = { purchase: 'Bought', sale: 'Sold', count: 'Count', waste: 'Wasted', correction: 'Fixed' }

export default async function Stock() {
  const today = mytDate()
  const [items, moves, all] = await Promise.all([getItems(), getMoves(), getRecords()])
  const state = stockState(items, moves, today)
  const costs = unitCosts(moves, items)

  const low = state.filter(s => s.low)
  const neverCounted = state.filter(s => !s.counted)
  const lastCountDay = state.map(s => s.lastCount).filter(Boolean).sort().at(-1) as string | undefined
  const countDue = !lastCountDay || daysBetween(lastCountDay, today) >= 7

  // Missing since the last count (count moves that aren't openings).
  const since = lastCountDay ? addDays(lastCountDay, -7) : today
  const waste = wasteBetween(moves, costs, since, today)
  const wasteRows = Object.entries(waste).filter(([, w]) => Math.abs(w.qty) > 0.0001).sort((a, b) => b[1].rm - a[1].rm)

  // Receipt lines from the last 30 days that are stock but couldn't be sized,
  // and food lines that matched nothing (candidates for "this is…").
  const aliases = await taughtAliases()
  // Lines the owner has already marked "not tracked" must never be asked about
  // again -- they read as "unknown" otherwise, which is what kept 20 vegetables
  // on this list after he had answered them (23 Sep 2026).
  const ignored = (aliases[IGNORE_KEY] ?? []).map(a => a.toLowerCase())
  const isIgnored = (name: string) => ignored.some(a => a && name.toLowerCase().includes(a))
  // Every receipt line still waiting for an amount stays here until someone
  // answers it or closes it -- staff may never reply in the chat, and the owner
  // will not be reading the chat all day (owner, 23 Sep 2026). 60 days is plenty.
  const resolved = new Set(moves.filter(m => m.meta?.resolved_line).map(m => String(m.meta.resolved_line)))
  const recent = all.filter(r => r.category === 'cash_out' && (r.due_date || r.created_at.slice(0, 10)) >= addDays(today, -60))
  const unsized = new Map<string, { item: string; recordId: number; from: string; when: string; total: number }>()
  const unknownFood = new Set<string>()
  for (const r of recent) {
    for (const l of (Array.isArray(r.meta?.items) ? r.meta.items : []) as ReceiptLine[]) {
      if (!l?.name) continue
      const got = stockFromLine(l, aliases)
      if (!Array.isArray(got)) {
        if (!resolved.has(l.name)) unsized.set(l.name, {
          item: got.item,
          recordId: r.id,
          from: String(r.meta?.merchant || r.title),
          when: String(r.due_date || r.created_at.slice(0, 10)),
          total: Number(r.amount || 0),
        })
      } else if (!got.length && l.expense_type === 'cogs_food' && !itemForName(l.name, aliases) &&
        !DRY_GOODS.test(l.name) && !isIgnored(l.name)) unknownFood.add(l.name)
    }
  }

  // What a normal day uses, per item -- and therefore what runs out tonight and
  // what to pick up on the way in. The owner shops most days (23 Sep 2026), so
  // the buy list covers 2 days.
  const COVER_DAYS = 2
  const view = state.map(st => {
    const usage = moves
      .filter(m => m.item === st.key && m.kind === 'sale' && m.sales_date)
      .map(m => ({ date: String(m.sales_date), qty: -m.qty }))
    const f = forecastFor(usage, today)
    const bagG = ITEM[st.key]?.bagG
    const boughtWeek = moves
      .filter(m => m.item === st.key && m.kind === 'purchase' && mytDate(m.created_at) > addDays(today, -7))
      .reduce((t, m) => t + m.qty, 0)
    return {
      ...st, f, bagG, boughtWeek,
      short: shortTonight(st.onHand, f),
      cover: coverDays(st.onHand, f),
      buy: roundBuy(buyFor(st.onHand, f, COVER_DAYS), st.unit, bagG),
      show: (q: number) => {
        if (!bagG) return fmtQty(q, st.unit)
        const n = Math.round((q / bagG) * 10) / 10
        return `${n} bag${Math.abs(n) === 1 ? '' : 's'}`
      },
    }
  })
  // An item Jarvis has never seen arrive (no receipt, never counted) is UNKNOWN,
  // not short -- saying "you'll run out of eggs" when nobody ever told it about
  // eggs is crying wolf, and the owner stops trusting the warnings.
  const seen = (key: string) => moves.some(m => m.item === key && (m.kind === 'purchase' || m.kind === 'count'))
  const known = view.filter(v => seen(v.key))
  const unknownItems = view.filter(v => !seen(v.key) && v.f.perDay > 0)
  const tonight = known.filter(v => v.short > 0 && v.f.perDay > 0).sort((a, b) => b.short - a.short)
  const toBuy = known.filter(v => v.buy.qty > 0 && v.f.perDay > 0).sort((a, b) => (a.cover ?? 99) - (b.cover ?? 99))
  const thinnest = known.filter(v => v.cover !== null).sort((a, b) => (a.cover ?? 99) - (b.cover ?? 99))[0]
  const basis = view.find(v => v.f.basis === 'weekday')?.f.basis ?? view.find(v => v.f.days > 0)?.f.basis ?? 'none'
  const historyDays = Math.max(0, ...view.map(v => v.f.days))
  const lastSalesDay = view.find(v => v.f.yesterdayDate)?.f.yesterdayDate ?? null

  const history = [...moves].filter(m => m.kind !== 'sale').reverse().slice(0, 25)
  const saleDays = [...new Set(moves.filter(m => m.kind === 'sale').map(m => m.sales_date))].length

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">Stock</h1>
        <Link href="/stock/recipes" className="co-dim">Recipes →</Link>
      </div>

      {/* ── tonight ──────────────────────────────────────────────────── */}
      <section className="co-card co-hero">
        <div className="co-row" style={{ marginBottom: 6 }}>
          <span className="eyebrow">Tonight</span>
          <span className="co-dim">{historyDays > 0 ? `${BASIS_WORD[basis]} · ${historyDays} day${historyDays === 1 ? '' : 's'} of sales` : 'no sales uploaded yet'}</span>
        </div>
        {historyDays === 0 ? (
          <p className="co-sub" style={{ marginTop: 0 }}>
            Upload a day&rsquo;s sales on <Link href="/cash-in">Cash In</Link> and I can tell you what tonight needs.
          </p>
        ) : tonight.length === 0 ? (
          <>
            <div className="co-big num" style={{ fontSize: 26 }}>Enough for tonight</div>
            {thinnest && thinnest.cover !== null && (
              <p className="co-sub">
                Thinnest is <b>{thinnest.name.toLowerCase()}</b> &mdash; {thinnest.show(Math.max(thinnest.onHand, 0))} left,
                about {thinnest.cover < 1 ? 'under a day' : `${thinnest.cover.toFixed(1)} days`} at this pace.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="co-big num co-up" style={{ fontSize: 26 }}>
              {tonight.length} item{tonight.length === 1 ? '' : 's'}{' '}won&rsquo;t last tonight
            </div>
            <ul className="st-list">
              {tonight.map(v => (
                <li key={v.key}>
                  <div className="co-row">
                    <span className="st-name">{v.name}</span>
                    <span className="num co-flag">short {v.show(v.short)}</span>
                  </div>
                  <div className="co-row co-dim">
                    <span>{v.show(Math.max(v.onHand, 0))} left · a night like tonight uses {v.show(v.f.perDay)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {unknownItems.length > 0 && (
        <section className="co-card">
          <div className="eyebrow" style={{ marginBottom: 6 }}>I&rsquo;ve never seen these arrive</div>
          <p className="co-sub" style={{ marginTop: 0 }}>
            Your dishes use them, but no receipt has shown them coming in, so I can&rsquo;t say how much is left or
            warn you properly. File a receipt for them, or count them once below.
          </p>
          <ul className="st-list">
            {unknownItems.map(v => (
              <li key={v.key}>
                <div className="co-row">
                  <span className="st-name">{v.name}</span>
                  <span className="co-dim">uses about {v.show(v.f.perDay)}/day</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── buy today ────────────────────────────────────────────────── */}
      {toBuy.length > 0 && (
        <section className="co-card" id="buy">
          <div className="co-row" style={{ marginBottom: 6 }}>
            <span className="eyebrow">Buy today</span>
            <span className="co-dim">enough for {COVER_DAYS} days</span>
          </div>
          <ul className="st-list">
            {toBuy.map(v => (
              <li key={v.key}>
                <div className="co-row">
                  <span className="st-name">{v.name}</span>
                  <span className="num">{v.buy.label}</span>
                </div>
                <div className="co-row co-dim">
                  <span>
                    {v.show(Math.max(v.onHand, 0))} left
                    {v.cover !== null ? ` · ${v.cover < 1 ? 'under a day' : `${v.cover.toFixed(1)} days`} of cover` : ''}
                    {` · uses ${v.show(v.f.perDay)}/day`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── in the fridge ────────────────────────────────────────────── */}
      <section className="co-card" id="onhand">
        <div className="co-row" style={{ marginBottom: 6 }}>
          <span className="eyebrow">In the fridge</span>
          <span className="co-dim">{lastCountDay ? `counted ${dayLabel(lastCountDay, today).toLowerCase()}` : 'from receipts & sales'}</span>
        </div>
        <div className="st-grid st-grid-head">
          <span>Item</span>
          <span>Used {lastSalesDay ? dayLabel(lastSalesDay, today).toLowerCase() : 'yest.'}</span>
          <span>Left now</span>
        </div>
        {[...known, ...view.filter(v => !seen(v.key))].map(v => (
          <details key={v.key} className="st-row">
            <summary>
              <span className="st-grid">
                <span className="st-name">{v.name}</span>
                <span className="num co-dim">{v.f.yesterday > 0 ? v.show(v.f.yesterday) : '—'}</span>
                <span className={`num ${seen(v.key) && v.short > 0 ? 'co-flag' : ''}`}>
                  {seen(v.key) ? v.show(v.onHand) : <span className="co-dim">not seen</span>}
                </span>
              </span>
            </summary>
            <div className="st-row-body co-dim">
              {v.cover !== null && <div>About {v.cover < 1 ? 'under a day' : `${v.cover.toFixed(1)} days`} left at {v.show(v.f.perDay)}/day.</div>}
              <div>Bought this week: {v.boughtWeek > 0 ? v.show(v.boughtWeek) : 'nothing'} · 7-day average {v.show(v.f.avg7)}/day</div>
              <div>Latest price {costLabel(v.cost, v.unit)}{v.costEstimated ? ' (estimated)' : ''}</div>
              {v.onHand < 0 && (
                <div className="co-flag">
                  Below zero: stock was already in the fridge before this started, or a receipt didn&rsquo;t print an
                  amount. Put the real number in under &ldquo;Correct a number by counting&rdquo;.
                </div>
              )}
            </div>
          </details>
        ))}
        <p className="co-meta">
          Counted for you: receipts add what they say, each day&rsquo;s sales take off what the recipes used.
          {historyDays > 0 && historyDays < 14 ? ' Forecasts sharpen as more days of sales come in.' : ''}
        </p>
      </section>

      {/* ── count ────────────────────────────────────────────────────── */}
      <details className="co-card co-fold" id="count">
        <summary>
          <span>Correct a number by counting</span>
          <span className="co-dim">{lastCountDay ? `last ${dayLabel(lastCountDay, today).toLowerCase()}` : 'not needed yet'}</span>
        </summary>
        <p className="co-sub" style={{ marginTop: 0 }}>
          Only when a figure above looks wrong, or to set what was already in the fridge when you started &mdash;
          the receipts do the counting the rest of the time. Count the <b>bags</b> for breast, beef and octopus (80 g),
          tongue (120 g) and lala (250 g); weigh anything not yet bagged as kg loose, and count pieces and fish.
          Leave an item empty to skip it; whatever you type replaces that item&rsquo;s figure.
        </p>
        <ActionForm action={saveCount} submit="Save count">
          <div className="st-count">
            {items.map(i => (
              <label key={i.key} className={`st-field ${ITEM[i.key]?.bagG ? 'st-bag' : ''}`}>
                <span>{i.name}</span>
                <span className="st-input">
                  {ITEM[i.key]?.bagG && (
                    <>
                      <input type="number" name={`c_${i.key}_bags`} inputMode="numeric" step="any" min="0" placeholder="—" aria-label={`${i.name} bags`} />
                      <span className="co-dim st-unit">bags of {ITEM[i.key].bagG} g</span>
                    </>
                  )}
                  <input type="number" name={`c_${i.key}`} inputMode="decimal" step="any" min="0" placeholder="—"
                    aria-label={ITEM[i.key]?.bagG ? `${i.name} loose kg` : i.name} />
                  <span className="co-dim st-unit">{ITEM[i.key]?.bagG ? 'kg loose' : i.unit === 'g' ? 'kg' : i.unit === 'fish' ? 'fish' : 'pcs'}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="st-field"><span>Counted by</span><span className="st-input"><input type="text" name="by" placeholder="Name" autoComplete="name" /></span></label>
        </ActionForm>
      </details>

      {/* ── missing since last count ─────────────────────────────────── */}
      {wasteRows.length > 0 && (
        <section className="co-card">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Missing since last count</div>
          <ul className="co-lines">
            {wasteRows.map(([k, w]) => (
              <li key={k}>
                <span>{ITEM[k]?.name ?? k}<span className="co-dim"> · {w.qty > 0 ? 'short' : 'over'} {fmtQty(Math.abs(w.qty), ITEM[k]?.unit ?? 'g')}</span></span>
                <span className={`num ${w.rm > 0 ? 'co-flag' : ''}`}>{money2(Math.abs(w.rm))}</span>
              </li>
            ))}
          </ul>
          <p className="co-meta">
            Short = the shelf had less than recipes + receipts say: waste, bigger portions, staff meals, or a recipe that&rsquo;s
            off. Over = a recipe uses less than written, or a delivery wasn&rsquo;t filed.
          </p>
        </section>
      )}

      {/* ── waste ────────────────────────────────────────────────────── */}
      <details className="co-card co-fold">
        <summary><span>Record waste</span><span className="co-dim">food that never reached a customer</span></summary>
        <p className="co-sub" style={{ marginTop: 0 }}>
          A dish cooked wrong, an order cancelled, something spoiled or dropped. Recording it keeps the shelf honest
          and shows up as the gap between what you bought and what you sold.
        </p>
        <ActionForm action={addMove} submit="Record it">
          <input type="hidden" name="kind" value="waste" />
          <label className="st-field"><span>What happened</span>
            <span className="st-input">
              <select name="reason" defaultValue="Cooked wrong">
                <option>Cooked wrong / order remade</option>
                <option>Order cancelled</option>
                <option>Spoiled / expired</option>
                <option>Dropped or damaged</option>
                <option>Staff meal</option>
                <option>Other</option>
              </select>
            </span>
          </label>
          <label className="st-field"><span>Item</span>
            <span className="st-input">
              <select name="item" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {ITEMS.map(i => <option key={i.key} value={i.key}>{i.name}</option>)}
              </select>
            </span>
          </label>
          <label className="st-field"><span>How much</span>
            <span className="st-input">
              <input type="number" name="amount" inputMode="decimal" step="any" min="0" required />
              <select name="unit" defaultValue="bag">
                <option value="bag">bags</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="pc">pcs</option>
                <option value="fish">fish</option>
              </select>
            </span>
          </label>
          <label className="st-field"><span>Note (optional)</span><span className="st-input"><input type="text" name="note" placeholder="e.g. table 4, made spicy by mistake" /></span></label>
          <label className="st-field"><span>Your name</span><span className="st-input"><input type="text" name="by" autoComplete="name" /></span></label>
        </ActionForm>
      </details>

      {/* ── receipts that need a human ───────────────────────────────── */}
      {unsized.size > 0 && (
        <div className="co-needs" role="status" style={{ marginTop: 12 }}>
          <span aria-hidden="true">●</span>
          <a href="#tofix">{unsized.size} item{unsized.size === 1 ? '' : 's'} waiting for a quantity</a>
        </div>
      )}
      {(unsized.size > 0 || unknownFood.size > 0) && (
        <details className="co-card co-fold" id="tofix" open={unsized.size > 0}>
          <summary>
            <span>{unsized.size > 0 ? 'Receipts that didn’t say how much' : 'Receipt lines to check'}</span>
            <span className="co-dim num">{unsized.size || unknownFood.size}</span>
          </summary>
          {unsized.size > 0 && (
            <>
              <p className="co-sub" style={{ marginTop: 0 }}>
                The receipt printed no weight or count. Jarvis asks in the chat when it arrives; anything nobody
                answered waits here until you fill it in or close it. Open the receipt to check what it says.
              </p>
              {[...unsized].map(([name, u]) => (
                <ActionForm key={name} action={addMove} submit="Add" ghost className="st-teach">
                  <input type="hidden" name="kind" value="purchase" />
                  <input type="hidden" name="item" value={u.item === 'bird' ? 'leg' : u.item} />
                  <input type="hidden" name="note" value={`From receipt line: ${name}`.slice(0, 200)} />
                  <input type="hidden" name="line" value={name} />
                  <input type="hidden" name="record_id" value={u.recordId} />
                  <span className="st-teach-name">{name}
                    <span className="co-dim"> &middot; {u.item === 'bird' ? 'whole chicken' : ITEM[u.item]?.name}</span>
                    <span className="co-meta">{displayShop(u.from)} &middot; {dayLabel(u.when, today)} &middot; {money2(u.total)} &middot;{' '}
                      <Link href={`/vault/${u.recordId}`}>see the receipt</Link></span>
                  </span>
                  <span className="st-input">
                    <input type="number" name="amount" inputMode="decimal" step="any" min="0" required aria-label={`How much ${name}`} />
                    <select name="unit" defaultValue={u.item !== 'bird' && ITEM[u.item]?.unit === 'pc' ? 'pc' : 'kg'} aria-label="unit">
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="pc">pcs</option>
                      <option value="bag">bags</option>
                      <option value="fish">fish</option>
                    </select>
                  </span>
                </ActionForm>
              ))}
              <div className="st-skips">
                {[...unsized].map(([name, u]) => (
                  <ActionForm key={'skip-' + name} action={skipLine} submit={`Not needed: ${name.slice(0, 22)}${name.length > 22 ? '…' : ''}`} ghost>
                    <input type="hidden" name="line" value={name} />
                    <input type="hidden" name="item" value={u.item === 'bird' ? 'leg' : u.item} />
                    <input type="hidden" name="record_id" value={u.recordId} />
                    <span />
                  </ActionForm>
                ))}
              </div>
            </>
          )}
          {unknownFood.size > 0 && (
            <>
              <ActionForm action={ignoreAll} submit={`None of these are stock — stop asking (${unknownFood.size})`} ghost>
                <input type="hidden" name="names" value={[...unknownFood].join(String.fromCharCode(10))} />
                <span />
              </ActionForm>
              <details className="st-msize">
              <summary className="co-dim">{unknownFood.size} food line{unknownFood.size === 1 ? '' : 's'} I don&rsquo;t recognise — open only if one is meat, seafood, eggs or rice</summary>
              {[...unknownFood].slice(0, 20).map(name => (
                <ActionForm key={name} action={teachAlias} submit="Learn" ghost className="st-teach">
                  <input type="hidden" name="text" value={name.toLowerCase().replace(/^\d+\s+/, '').replace(/\s+rm\s.*$/i, '').slice(0, 60)} />
                  <span className="st-teach-name">{name}</span>
                  <select name="item" defaultValue="" required>
                    <option value="" disabled>This is…</option>
                    <option value={IGNORE_KEY}>Not tracked (veg, sauces, dry goods)</option>
                    {ITEMS.map(i => <option key={i.key} value={i.key}>{i.name}</option>)}
                  </select>
                </ActionForm>
              ))}
              <p className="co-meta">Taught names add to what&rsquo;s known; nothing is overwritten.</p>
              </details>
            </>
          )}
        </details>
      )}

      {/* ── history ──────────────────────────────────────────────────── */}
      <details className="co-card co-fold">
        <summary><span>Recent stock in and fixes</span><span className="co-dim num">{history.length}</span></summary>
        {history.length === 0 ? (
          <p className="co-sub" style={{ marginTop: 0 }}>Receipts Jarvis files from now on add their meat, seafood, eggs and rice here.</p>
        ) : (
          <ul className="co-lines">
            {history.map(m => (
              <li key={m.id}>
                <span>
                  {KIND[m.kind] ?? m.kind} · {ITEM[m.item]?.name ?? m.item}
                  <span className="co-dim"> · {dayLabel(mytDate(m.created_at), today)}{m.by ? ` · ${m.by}` : ''}{m.meta?.from ? ` · ${m.meta.from}` : ''}{m.note ? ` · ${m.note}` : ''}{m.meta?.opening ? ' · opening' : ''}</span>
                </span>
                <span className="num">{m.kind === 'count' ? fmtQty(m.meta?.counted ?? 0, ITEM[m.item]?.unit ?? 'g') : (m.qty > 0 ? '+' : '') + fmtQty(m.qty, ITEM[m.item]?.unit ?? 'g')}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  )
}
