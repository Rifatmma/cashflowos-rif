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
import ActionForm from './ActionForm'
import { saveCount, addMove, teachAlias } from './actions'

export const dynamic = 'force-dynamic'

const money2 = (n: number) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const costLabel = (c: number, unit: string) =>
  unit === 'g' ? `${money2(c * 1000)}/kg` : unit === 'fish' ? `${money2(c)}/fish` : `${money2(c)}/pc`
// Groceries that are obviously not meat, seafood, eggs or rice: never offered
// for "this is…", or the list becomes sugar and cooking oil every week.
const DRY_GOODS = /(gula|sugar|minyak|oil|tepung|flour|susu|milk|krimer|creamer|sauce|sos|kicap|mush|cendawan|margarin|butter|milo|kopi|coffee|nescafe|teh|tea|garam|salt|ajinomoto|perasa|stok|stock|knorr|dipping|cili|chili|bawang|onion|garlic|halia|serai|limau|lime|santan|coconut|beg|bag|tisu|tissue|sabun|soap)/i
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
  const recent = all.filter(r => r.category === 'cash_out' && (r.due_date || r.created_at.slice(0, 10)) >= addDays(today, -30))
  const unsized = new Map<string, string>()
  const unknownFood = new Set<string>()
  for (const r of recent) {
    for (const l of (Array.isArray(r.meta?.items) ? r.meta.items : []) as ReceiptLine[]) {
      if (!l?.name) continue
      const got = stockFromLine(l, aliases)
      if (!Array.isArray(got)) unsized.set(l.name, got.item)
      else if (!got.length && l.expense_type === 'cogs_food' && !itemForName(l.name, aliases) && !DRY_GOODS.test(l.name)) unknownFood.add(l.name)
    }
  }

  const history = [...moves].filter(m => m.kind !== 'sale').reverse().slice(0, 25)
  const saleDays = [...new Set(moves.filter(m => m.kind === 'sale').map(m => m.sales_date))].length

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">Stock</h1>
        <Link href="/stock/recipes" className="co-dim">Recipes →</Link>
      </div>

      {(low.length > 0 || unsized.size > 0) && (
        <div className="co-needs" role="status">
          <span aria-hidden="true">●</span>
          {low.length > 0 && <a href="#onhand">{low.length} running low</a>}
          {unsized.size > 0 && <a href="#tofix">{unsized.size} receipt line{unsized.size === 1 ? '' : 's'} with no amount</a>}
        </div>
      )}

      {/* ── on hand ──────────────────────────────────────────────────── */}
      <section className="co-card co-hero" id="onhand">
        <div className="co-row" style={{ marginBottom: 6 }}>
          <span className="eyebrow">On hand now</span>
          <span className="co-dim">{lastCountDay ? `checked ${dayLabel(lastCountDay, today).toLowerCase()}` : 'from receipts & sales'}</span>
        </div>
        <p className="co-sub" style={{ marginTop: 0 }}>
          Counted for you: each receipt Jarvis reads puts its meat, seafood, eggs and rice on the shelf, and each
          day&rsquo;s sales take off what the recipes used. Count by hand only when a receipt didn&rsquo;t say how much.
        </p>
        <ul className="st-list">
          {[...state].sort((a, b) => Number(b.low) - Number(a.low)).map(s => (
            <li key={s.key} className={s.low ? 'st-low' : ''}>
              <div className="co-row">
                <span className="st-name">{s.name}</span>
                <span className={`num ${s.onHand < 0 ? 'co-flag' : ''}`}>
                  {ITEM[s.key]?.bagG ? `${Math.round(s.onHand / ITEM[s.key].bagG!)} bags` : fmtQty(s.onHand, s.unit)}
                </span>
              </div>
              <div className="co-row co-dim">
                <span>
                  {s.perDay > 0 ? `uses ${fmtQty(s.perDay, s.unit)}/day` : 'no sales yet'}
                  {s.daysLeft !== null && s.onHand > 0 ? ` · ${s.daysLeft < 1 ? 'under a day' : `${s.daysLeft.toFixed(1)} days`} left` : ''}
                </span>
                <span>{costLabel(s.cost, s.unit)}{s.costEstimated ? ' est.' : ''}</span>
              </div>
              {s.low && <div className="co-meta co-flag">Running low{s.min !== null ? ` (minimum ${fmtQty(s.min, s.unit)})` : ''}</div>}
            </li>
          ))}
        </ul>
        {state.some(s => s.onHand < 0) && (
          <p className="co-meta co-flag">
            A minus means more was used than Jarvis has seen come in &mdash; stock that was already in the fridge before
            you started, or a receipt that didn&rsquo;t print an amount. Type the real number under
            &ldquo;Correct a number by counting&rdquo; and it&rsquo;s right from then on.
          </p>
        )}
        <p className="co-meta">
          &ldquo;est.&rdquo; = estimated price until a receipt shows the real one. Days left use the last 7 trading days
          {saleDays === 0 ? ', once sales are uploaded on Cash In' : ''}.
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
      {(unsized.size > 0 || unknownFood.size > 0) && (
        <details className="co-card co-fold" id="tofix" open={unsized.size > 0}>
          <summary>
            <span>{unsized.size > 0 ? 'Receipts that didn’t say how much' : 'Receipt lines to check'}</span>
            <span className="co-dim num">{unsized.size || unknownFood.size}</span>
          </summary>
          {unsized.size > 0 && (
            <>
              <p className="co-sub" style={{ marginTop: 0 }}>
                These are stock, but the receipt printed no weight or count. Type how much came in and it goes straight
                onto the shelf &mdash; this is the only counting you have to do.
              </p>
              {[...unsized].map(([name, item]) => (
                <ActionForm key={name} action={addMove} submit="Add" ghost className="st-teach">
                  <input type="hidden" name="kind" value="purchase" />
                  <input type="hidden" name="item" value={item === 'bird' ? 'leg' : item} />
                  <input type="hidden" name="note" value={`From receipt line: ${name}`.slice(0, 200)} />
                  <span className="st-teach-name">{name}<span className="co-dim"> &middot; {item === 'bird' ? 'whole chicken' : ITEM[item]?.name}</span></span>
                  <span className="st-input">
                    <input type="number" name="amount" inputMode="decimal" step="any" min="0" required aria-label={`How much ${name}`} />
                    <select name="unit" defaultValue={item !== 'bird' && ITEM[item]?.unit === 'pc' ? 'pc' : 'kg'} aria-label="unit">
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="pc">pcs</option>
                      <option value="bag">bags</option>
                      <option value="fish">fish</option>
                    </select>
                  </span>
                </ActionForm>
              ))}
            </>
          )}
          {unknownFood.size > 0 && (
            <>
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
