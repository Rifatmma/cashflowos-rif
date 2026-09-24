'use server'

import { revalidatePath } from 'next/cache'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { mytDate } from '@/lib/period'
import {
  logMeal, correctMeal, deleteMeal, costTyped, costFromMenu, saveBody, getBody,
} from '@/lib/meals'
import { readMeal } from '@/lib/meal-vision'
import { ACTIVITY, type Body } from '@/lib/nutrition'
import { createHash } from 'node:crypto'

export type Result = { ok: boolean; message: string } | null

const refresh = () => revalidatePath('/me')
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** A photo from the tab. Same ladder as Telegram: the menu, then the table, then the photo. */
export async function addPhoto(_prev: Result, form: FormData): Promise<Result> {
  const file = form.get('photo') as File | null
  if (!file || !file.size) return { ok: false, message: 'Pick a photo first.' }
  if (file.size > 8_000_000) return { ok: false, message: 'That photo is very large — try a smaller one.' }
  const bytes = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const mime = file.type || 'image/jpeg'

  const read = await readMeal(bytes.toString('base64'), mime)
  if (!read.is_food) return { ok: false, message: 'That does not look like food. A receipt? Send it to Jarvis instead.' }

  // The photo might be one of the restaurant's own dishes -- then the recipe
  // book knows the real weights and beats anything a photo can show.
  const menu = await costFromMenu(read.title)
  const use = menu ?? {
    title: read.title, kcal: read.kcal, confidence: read.confidence, source: 'photo' as const,
    lines: read.lines.map(l => ({ what: l.what + (l.grams ? ` ${Math.round(l.grams)} g` : ''), kcal: l.kcal })),
    working: [read.portion, read.lines.map(l => `${l.what} ${l.kcal}`).join(' · '), `= ${read.kcal} kcal`]
      .filter(Boolean).join(' · '),
  }

  let storage_path: string | null = null
  if (supabaseConfigured) {
    const ext = mime === 'image/png' ? 'png' : 'jpg'
    const path = `meals/${sha256}.${ext}`
    const { error } = await supabase.storage.from('vault').upload(path, bytes, { contentType: mime, upsert: false })
    if (!error || /exist/i.test(error.message)) storage_path = path
  }

  const meal = await logMeal({
    ...use, source: use.source, items: use.lines, sha256, storage_path, mime,
    meta: { portion: read.portion, note: read.note, from_menu: !!menu },
  })
  if (!meal) return { ok: false, message: 'That photo is already logged.' }
  refresh()
  return { ok: true, message: `${meal.title} — ${meal.kcal} kcal. ${use.working}` }
}

/** Typed: "nasi lemak", "tomyam seafood x2", or a plain "650" if you know it. */
export async function addTyped(_prev: Result, form: FormData): Promise<Result> {
  const text = String(form.get('what') || '').trim()
  if (!text) return { ok: false, message: 'Type what you ate.' }
  const portions = Math.max(0.25, Math.min(10, num(form.get('portions')) || 1))
  const kcalTyped = num(form.get('kcal'))

  if (kcalTyped && !Number.isNaN(kcalTyped) && kcalTyped > 0) {
    const meal = await logMeal({
      title: text, kcal: kcalTyped, source: 'typed', confidence: 'high',
      working: 'You typed the calories yourself.',
    })
    refresh()
    return meal ? { ok: true, message: `${meal.title} — ${meal.kcal} kcal.` } : { ok: false, message: 'Could not save that.' }
  }

  const cost = await costTyped(text, portions)
  if (!cost) {
    return {
      ok: false,
      message: `I do not know "${text}" yet. Type the calories in the box beside it and I will take your number, or send a photo.`,
    }
  }
  const meal = await logMeal({ ...cost, source: cost.source, items: cost.lines })
  refresh()
  return meal ? { ok: true, message: `${meal.title} — ${meal.kcal} kcal. ${cost.working}` } : { ok: false, message: 'Could not save that.' }
}

/** "Half that", "two plates", or a straight number. */
export async function fixMeal(_prev: Result, form: FormData): Promise<Result> {
  const id = Number(form.get('id'))
  const kcal = num(form.get('kcal'))
  if (!id || kcal === null || Number.isNaN(kcal) || kcal < 0) return { ok: false, message: 'Type the calories.' }
  const meal = await correctMeal(id, kcal, String(form.get('why') || 'corrected by hand').slice(0, 80))
  refresh()
  return meal ? { ok: true, message: `Changed to ${meal.kcal} kcal.` } : { ok: false, message: 'That meal is gone.' }
}

export async function removeMeal(_prev: Result, form: FormData): Promise<Result> {
  const id = Number(form.get('id'))
  if (!id) return { ok: false, message: 'Nothing to remove.' }
  await deleteMeal(id)
  refresh()
  return { ok: true, message: 'Removed.' }
}

/** Weight, height, age, how active, how fast to lose. The target follows. */
export async function saveProfile(_prev: Result, form: FormData): Promise<Result> {
  const cur = await getBody()
  const next: Body = {
    weight_kg: num(form.get('weight_kg')) ?? cur.weight_kg,
    height_cm: num(form.get('height_cm')) ?? cur.height_cm,
    age: num(form.get('age')) ?? cur.age,
    sex: String(form.get('sex') || cur.sex) === 'female' ? 'female' : 'male',
    activity: (String(form.get('activity') || cur.activity) as Body['activity']),
    lose_kg_per_week: num(form.get('lose_kg_per_week')) ?? cur.lose_kg_per_week,
  }
  if (!ACTIVITY[next.activity]) next.activity = cur.activity
  for (const [k, v] of Object.entries(next)) {
    if (typeof v === 'number' && (Number.isNaN(v) || v <= 0)) return { ok: false, message: `Check the ${k.replace(/_/g, ' ')}.` }
  }
  if (next.lose_kg_per_week > 1) return { ok: false, message: 'More than 1 kg a week is not worth the muscle it costs. Try 0.5.' }
  await saveBody(next, String(form.get('why') || '').slice(0, 120) || undefined)
  refresh()
  return { ok: true, message: `Saved from ${mytDate()}.` }
}
