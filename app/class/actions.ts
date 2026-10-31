'use server'

import { supabase, supabaseConfigured } from '@/lib/supabase'
import { runTool } from '@/lib/composio-mcp'
import { accountFor } from '@/lib/email-inboxes'
import { isStepKey } from '@/lib/class-plan'
import { revalidatePath } from 'next/cache'

// Signing up for a consultation, and ticking the checklist off.
//
// THIS PAGE IS PUBLIC. Everything arriving here was typed by somebody who is
// not logged in, so it is treated as data throughout: fields are length-capped,
// the step keys are checked against the real list rather than trusted, and
// nothing typed is ever interpolated into anything executable. The email the
// owner receives escapes every value before it goes into HTML — a name is the
// one field somebody would put a tag in.

const OWNER_EMAIL = (process.env.CLASS_NOTIFY_EMAIL || 'rifatmma@gmail.com').trim()
// Sent FROM the personal Gmail connection the receipt scan already uses, to
// itself. Consulting is Rif's own business: it must not go out through the
// Moving Walls work account (owner, 1 Nov 2026).
const SENDER_ACCOUNT = accountFor('rifatmma@gmail.com')

const clean = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Good enough to catch a typo, not a validator anybody should fight with. */
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)

export type SignUpResult = {
  ok: boolean; message?: string; email?: string; name?: string
  progress?: Record<string, boolean>
}

export async function signUp(_prev: SignUpResult, form: FormData): Promise<SignUpResult> {
  const name = clean(form.get('name'), 80)
  const email = clean(form.get('email'), 120).toLowerCase()
  const whatsapp = clean(form.get('whatsapp'), 40)
  const building = clean(form.get('building'), 500)
  const os = clean(form.get('os'), 10) === 'windows' ? 'windows' : 'mac'

  if (!name) return { ok: false, message: 'Please put your name in.' }
  if (!looksLikeEmail(email)) return { ok: false, message: 'That email address does not look right — check it and try again.' }
  if (!supabaseConfigured) return { ok: false, message: 'The form is not connected yet. Message Rif and he will sort it.' }

  // Upsert on email: she may come back on her phone, and a second go should
  // not create a second person or wipe what she has already ticked.
  const { data: had } = await supabase.from('class_signups').select('id, notified, progress').eq('email', email).maybeSingle()
  const { error } = await supabase.from('class_signups').upsert({
    email, name, whatsapp: whatsapp || null, building: building || null, os,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'email' })
  if (error) {
    console.error('[class] signup failed:', error.message)
    return { ok: false, message: 'Something went wrong saving that. Try again in a moment.' }
  }

  // Tell the owner, once per person. A second visit is not a second client, and
  // an inbox that repeats itself gets ignored.
  if (!had?.notified) {
    try {
      await runTool('GMAIL_SEND_EMAIL', SENDER_ACCOUNT, {
        recipient_email: OWNER_EMAIL,
        subject: `Pre-class checklist: ${name} signed up`,
        is_html: true, include_signature: false,
        body:
          `<p><b>${esc(name)}</b> has opened the pre-class checklist.</p>` +
          `<table cellpadding="6" style="border-collapse:collapse;font:14px system-ui">` +
          `<tr><td><b>Email</b></td><td>${esc(email)}</td></tr>` +
          `<tr><td><b>WhatsApp</b></td><td>${esc(whatsapp || '—')}</td></tr>` +
          `<tr><td><b>Computer</b></td><td>${os === 'windows' ? 'Windows' : 'Mac'}</td></tr>` +
          `<tr><td valign="top"><b>Wants to build</b></td><td>${esc(building || '—')}</td></tr>` +
          `</table>` +
          `<p style="color:#555">You will not get another email when she comes back — check her progress on the ` +
          `Claude Code Intermediate Plan tab.</p>`,
      })
      await supabase.from('class_signups').update({ notified: true }).eq('email', email)
    } catch (e: any) {
      // Her signup is saved; a failed notification must not lose it or show
      // her an error about something that is not her problem.
      console.error('[class] notify failed:', String(e?.message ?? e).slice(0, 200))
    }
  }

  revalidatePath('/class/signups')
  // Hand back what she already ticked, so opening the link on her phone after
  // starting on the laptop carries on rather than starting her at zero.
  const progress = Object.fromEntries(
    Object.entries((had?.progress ?? {}) as Record<string, boolean>).filter(([k, v]) => v && isStepKey(k)),
  )
  return { ok: true, email, name, progress }
}

export async function saveProgress(form: FormData): Promise<void> {
  const email = clean(form.get('email'), 120).toLowerCase()
  const key = clean(form.get('key'), 40)
  const done = String(form.get('done')) === '1'
  if (!looksLikeEmail(email) || !isStepKey(key) || !supabaseConfigured) return

  const { data } = await supabase.from('class_signups').select('progress').eq('email', email).maybeSingle()
  if (!data) return
  const progress = { ...(data.progress as Record<string, boolean> ?? {}) }
  if (done) progress[key] = true
  else delete progress[key]

  await supabase.from('class_signups')
    .update({ progress, updated_at: new Date().toISOString() })
    .eq('email', email)
  revalidatePath('/class/signups')
}

export type Signup = {
  name: string; email: string; whatsapp: string | null; building: string | null
  os: string | null; progress: Record<string, boolean>; created_at: string; updated_at: string
}

export async function allSignups(): Promise<Signup[]> {
  if (!supabaseConfigured) return []
  const { data } = await supabase.from('class_signups').select('*').order('updated_at', { ascending: false })
  return (data ?? []).map((r: any) => ({
    name: r.name, email: r.email, whatsapp: r.whatsapp, building: r.building, os: r.os,
    progress: (r.progress ?? {}) as Record<string, boolean>,
    created_at: r.created_at, updated_at: r.updated_at,
  }))
}
