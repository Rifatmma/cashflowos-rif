// 👉 Me — the owner's own food diary. Nobody else's numbers are on this page.
//
// His brief (24 Sep 2026): lose weight, calories only, log by photo from
// Telegram or here, best estimate now and correct it in words later. So the
// page leads with one number -- what is left of today -- and everything else
// explains where that number came from.
import Link from 'next/link'
import { getMeals, getBudget, kcalOn } from '@/lib/meals'
import { getRecipes } from '@/lib/stock-data'
import { COMMON_DISHES } from '@/lib/nutrition'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { mytDate, addDays, dayLabel, shortDate } from '@/lib/period'
import ActionForm from '@/app/stock/ActionForm'
import AddMeal from './AddMeal'
import { fixMeal, removeMeal, saveProfile } from './actions'

export const dynamic = 'force-dynamic'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayOf = (iso: string) => WEEKDAY[new Date(iso + 'T12:00:00Z').getUTCDay()]
const timeOf = (iso: string) =>
  new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(11, 16)

export default async function Me() {
  const today = mytDate()
  const [meals, budget, book] = await Promise.all([getMeals(30), getBudget(), getRecipes()])

  const todays = meals.filter(m => m.day === today)
  const eaten = kcalOn(meals, today)
  const left = budget.target - eaten

  // The last 7 days, oldest first, for the bars.
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, -6 + i)).map(d => ({
    day: d, kcal: kcalOn(meals, d), logged: meals.some(m => m.day === d),
  }))
  const logged = week.filter(d => d.logged)
  const average = logged.length ? Math.round(logged.reduce((t, d) => t + d.kcal, 0) / logged.length) : 0
  const under = logged.filter(d => d.kcal <= budget.target).length
  const worst = Math.max(budget.target, ...week.map(d => d.kcal))

  // Photos are private: a signed link, valid for the page view only.
  const photo: Record<number, string> = {}
  if (supabaseConfigured) {
    for (const m of todays) {
      if (!m.storage_path) continue
      const { data } = await supabase.storage.from('vault').createSignedUrl(m.storage_path, 3600)
      if (data?.signedUrl) photo[m.id] = data.signedUrl
    }
  }

  // What the type-ahead offers: his own menu first, then the everyday dishes.
  const dishes = [...new Set([...book.map(r => r.label), ...COMMON_DISHES.map(d => d.name)])].slice(0, 120)

  const pace = Math.round((budget.burn - average) * 7 / 7700 * 100) / 100   // kg a week at this rate

  return (
    <div className="co">
      <div className="co-head">
        <h1 className="ph">Me</h1>
        <span className="co-dim">{dayLabel(today, today)} · {weekdayOf(today)}</span>
      </div>

      {/* ── today ─────────────────────────────────────────────────── */}
      <section className="co-card">
        <div className="co-hero-row">
          <span className="co-big">{left >= 0 ? left : 0}</span>
          <span className={left >= 0 ? 'co-good' : 'co-flag'}>
            {left >= 0 ? `kcal left of ${budget.target}` : `${-left} kcal over ${budget.target}`}
          </span>
        </div>
        <div className="co-track" aria-hidden>
          <div
            className="co-fill"
            style={{
              width: `${Math.min(100, (eaten / budget.target) * 100)}%`,
              background: left >= 0 ? 'var(--green)' : 'var(--bad)',
            }}
          />
        </div>
        {todays.length === 0 ? (
          <p className="co-sub">Nothing logged yet today. Send Jarvis a photo of your plate, or use the box below.</p>
        ) : (
          <ul className="co-lines" style={{ marginTop: 10 }}>
            {todays.map(m => (
              <li key={m.id} style={{ display: 'block' }}>
                <details className="co-rx">
                  <summary>
                    <span className="co-rx-main">
                      <span className="co-rx-name">{m.title}</span>
                      <span className="co-rx-sub">
                        {timeOf(m.eaten_at)}
                        {m.corrected && ' · corrected'}
                        {m.confidence === 'low' && ' · rough guess'}
                        {m.source === 'menu' && ' · from your recipe'}
                      </span>
                    </span>
                    <span className="co-rx-amt">{m.kcal}</span>
                  </summary>
                  <div className="co-rx-body">
                    {photo[m.id] && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={photo[m.id]} alt="" className="me-shot" />
                    )}
                    {m.working && <p className="co-meta">{m.working}</p>}
                    <ActionForm action={fixMeal} submit="Change it" ghost>
                      <input type="hidden" name="id" value={m.id} />
                      <div className="me-typed-row">
                        <label className="me-small">
                          <span className="co-dim">kcal</span>
                          <input type="number" name="kcal" step="10" min="0" defaultValue={m.kcal} />
                        </label>
                        <label className="me-small" style={{ flex: 1 }}>
                          <span className="co-dim">why</span>
                          <input type="text" name="why" placeholder="half a plate, no rice…" />
                        </label>
                      </div>
                    </ActionForm>
                    <ActionForm action={removeMeal} submit="Remove" ghost>
                      <input type="hidden" name="id" value={m.id} />
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddMeal dishes={dishes} today={today} />

      {/* ── the week ──────────────────────────────────────────────── */}
      <section className="co-card">
        <div className="co-row" style={{ marginBottom: 10 }}>
          <span className="eyebrow">Last 7 days</span>
          <span className="co-dim">{logged.length ? `${average} a day · ${under}/${logged.length} under` : 'nothing logged yet'}</span>
        </div>
        <div className="me-bars">
          {week.map(d => (
            <div key={d.day} className="me-bar">
              <div className="me-bar-track">
                <div
                  className="me-bar-fill"
                  style={{
                    height: `${d.kcal ? Math.max(4, (d.kcal / worst) * 100) : 0}%`,
                    background: d.kcal > budget.target ? 'var(--bad)' : 'var(--green)',
                  }}
                />
                <div className="me-bar-target" style={{ bottom: `${(budget.target / worst) * 100}%` }} />
              </div>
              <span className="me-bar-day">{weekdayOf(d.day)}</span>
              <span className="me-bar-num">{d.kcal || '—'}</span>
            </div>
          ))}
        </div>
        {logged.length >= 3 && (
          <p className="co-meta">
            At {average} a day against a {budget.burn} burn, that is about{' '}
            <b>{pace > 0 ? `${pace} kg a week off` : `${Math.abs(pace)} kg a week on`}</b>. The line across the bars is your {budget.target} target.
          </p>
        )}
      </section>

      {/* ── the budget, with its sum ──────────────────────────────── */}
      <details className="co-card co-fold">
        <summary><span>Your budget · {budget.target} kcal a day</span><span className="co-dim num">{budget.body.weight_kg} kg</span></summary>
        <ul className="co-lines">
          <li><span>Resting burn <span className="co-dim">{budget.body.height_cm} cm · {budget.body.age} · {budget.body.sex}</span></span><span className="num">{budget.rest}</span></li>
          <li><span>What you burn a day <span className="co-dim">{budget.activityLabel}</span></span><span className="num">{budget.burn}</span></li>
          <li><span>Eating less, for {budget.body.lose_kg_per_week} kg a week</span><span className="num">− {budget.cut}</span></li>
          <li className="co-total"><span>Your target</span><span className="num">{budget.target}</span></li>
        </ul>
        {budget.floored && <p className="co-meta co-flag">That deficit would go under a safe floor, so the target is held at {budget.target}.</p>}
        <div style={{ marginTop: 10 }}>
          <ActionForm action={saveProfile} submit="Save">
            <div className="me-typed-row">
              <label className="me-small"><span className="co-dim">Weight kg</span><input type="number" name="weight_kg" step="0.1" defaultValue={budget.body.weight_kg} /></label>
              <label className="me-small"><span className="co-dim">Height cm</span><input type="number" name="height_cm" step="1" defaultValue={budget.body.height_cm} /></label>
              <label className="me-small"><span className="co-dim">Age</span><input type="number" name="age" step="1" defaultValue={budget.body.age} /></label>
            </div>
            <div className="me-typed-row">
              <label className="me-small">
                <span className="co-dim">How active</span>
                <select name="activity" defaultValue={budget.body.activity}>
                  <option value="desk">Sitting all day</option>
                  <option value="light">Desk work, exercise once or twice a week</option>
                  <option value="moderate">On your feet, or most days</option>
                  <option value="hard">Physical work or hard training</option>
                </select>
              </label>
              <label className="me-small"><span className="co-dim">kg a week</span><input type="number" name="lose_kg_per_week" step="0.1" min="0" max="1" defaultValue={budget.body.lose_kg_per_week} /></label>
              <label className="me-small">
                <span className="co-dim">Formula</span>
                <select name="sex" defaultValue={budget.body.sex}><option value="male">Male</option><option value="female">Female</option></select>
              </label>
            </div>
          </ActionForm>
        </div>
      </details>

      {/* ── earlier ───────────────────────────────────────────────── */}
      <details className="co-card co-fold">
        <summary><span>Earlier meals</span><span className="co-dim num">{meals.length}</span></summary>
        {meals.filter(m => m.day !== today).length === 0 ? (
          <p className="co-sub" style={{ marginTop: 0 }}>Only today so far.</p>
        ) : (
          <ul className="co-lines">
            {meals.filter(m => m.day !== today).slice(0, 40).map(m => (
              <li key={m.id}>
                <span>{m.title} <span className="co-dim">· {shortDate(m.day)}</span></span>
                <span className="num">{m.kcal}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      <p className="co-meta" style={{ textAlign: 'center' }}>
        Private to you — no member of staff sees this page, and Jarvis never mentions it in the group.{' '}
        <Link href="/">Dashboard</Link>
      </p>
    </div>
  )
}
