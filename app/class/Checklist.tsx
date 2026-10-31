'use client'

import { useActionState, useEffect, useState } from 'react'
import { signUp, saveProgress, type SignUpResult } from './actions'
import { STEPS, REQUIRED, stepsFor, progressOf, type OS, type Step } from '@/lib/class-plan'

// The page a client works through alone, the night before the session.
//
// Three things it has to get right, because nobody is sitting next to her:
//  · one path at a time — a Mac user should never read a Windows command;
//  · her place is kept, because this is two evenings' work for most people;
//  · every step says how she KNOWS it worked, so "done" is not a guess.
//
// Progress is written twice on purpose: to her browser so it survives a
// refresh even if the network is bad, and to the server so Rif can see how far
// she got without having to ask her.

const KEY = 'cc-plan-v1'

export function Checklist({ shareUrl }: { shareUrl: string }) {
  const [os, setOs] = useState<OS>('mac')
  const [me, setMe] = useState<{ name: string; email: string } | null>(null)
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [state, formAction, pending] = useActionState<SignUpResult, FormData>(signUp, { ok: false })

  // Come back later and pick up where you left off.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const v = JSON.parse(raw)
        if (v.os === 'mac' || v.os === 'windows') setOs(v.os)
        if (v.me?.email) setMe(v.me)
        if (v.done) setDone(v.done)
      } else if (/Win/i.test(navigator.platform || navigator.userAgent)) {
        setOs('windows')      // a sensible first guess; the switcher still wins
      }
    } catch { /* private window, or storage blocked: the page still works */ }
  }, [])

  const remember = (next: { os?: OS; me?: typeof me; done?: Record<string, boolean> }) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ os, me, done, ...next }))
    } catch { /* not worth telling her about */ }
  }

  useEffect(() => {
    if (state.ok && state.email) {
      // The name comes back from the server: by the time this runs the form
      // has unmounted, so reading the input here gave an empty string.
      const who = { name: state.name ?? '', email: state.email }
      // Server ticks and this browser's ticks are merged, never replaced: either
      // device may be the one she ticked on.
      const merged = { ...(state.progress ?? {}), ...done }
      setMe(who); setDone(merged); remember({ me: who, done: merged })
    }
  }, [state])

  const tick = (key: string, next: boolean) => {
    const updated = { ...done, [key]: next }
    if (!next) delete updated[key]
    setDone(updated); remember({ done: updated })
    if (me?.email) {
      const fd = new FormData()
      fd.set('email', me.email); fd.set('key', key); fd.set('done', next ? '1' : '0')
      // Nothing waits on this: a slow save must not make the tick feel broken.
      void saveProgress(fd)
    }
  }

  const p = progressOf(done)
  const pickOs = (next: OS) => { setOs(next); remember({ os: next }) }

  return (
    <div className="cls">
      <header className="cls-head">
        <p className="cls-kicker">Before our session</p>
        <h1>Get set up for Claude Code</h1>
        <p className="cls-lede">
          Everything here is account setup and installing — no coding. Give it about <b>an hour</b>, and do it
          before we meet so we spend the session building your site instead of making accounts.
          Two things cost money: <b>Claude Pro</b> at about USD 20 a month and <b>USD 5</b> of API credit.
        </p>
        <div className="cls-os" role="group" aria-label="Which computer are you on?">
          <span>I’m on a</span>
          <button type="button" className={os === 'mac' ? 'on' : ''} onClick={() => pickOs('mac')} aria-pressed={os === 'mac'}>Mac</button>
          <button type="button" className={os === 'windows' ? 'on' : ''} onClick={() => pickOs('windows')} aria-pressed={os === 'windows'}>Windows</button>
        </div>
      </header>

      {!me ? (
        <form className="cls-form" action={formAction}>
          <h2>First, who are you?</h2>
          <p>So I know you’ve started, and can help if you get stuck before we meet.</p>
          <input type="hidden" name="os" value={os} />
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" required autoComplete="name" />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
          <label htmlFor="whatsapp">WhatsApp number</label>
          <input id="whatsapp" name="whatsapp" inputMode="tel" autoComplete="tel" placeholder="+60…" />
          <label htmlFor="building">What do you want to build?</label>
          <textarea id="building" name="building" rows={3} placeholder="A page for my business, a booking site, a shop — whatever you have in mind. A sentence is plenty." />
          <button type="submit" disabled={pending} className="cls-go">
            {pending ? 'Saving…' : 'Start the checklist'}
          </button>
          {state.message && <p className="cls-err">{state.message}</p>}
          <p className="cls-small">Your details go to Rif only, so he can get in touch about the session.</p>
        </form>
      ) : (
        <>
          <div className="cls-bar">
            <div className="cls-bar-top">
              <b>{me.name ? `${me.name}, you’re ` : 'You’re '}{p.done} of {p.total} done</b>
              <span>{p.pct}%</span>
            </div>
            <div className="cls-bar-track"><div className="cls-bar-fill" style={{ width: `${p.pct}%` }} /></div>
            {p.pct === 100 && <p className="cls-done">That’s everything. See you at the session.</p>}
          </div>

          <ol className="cls-steps">
            {STEPS.map((s, i) => (
              <StepCard key={s.key} step={s} n={i + 1} os={os} done={!!done[s.key]} onTick={tick} />
            ))}
          </ol>

          <footer className="cls-foot">
            <p><b>Stuck on any of it?</b> Send me a message — don’t spend an evening fighting it. Tell me the step number and what it said.</p>
            <p className="cls-small">Keep this link to come back to: <code>{shareUrl}</code></p>
          </footer>
        </>
      )}
    </div>
  )
}

function StepCard({ step, n, os, done, onTick }: {
  step: Step; n: number; os: OS; done: boolean; onTick: (k: string, v: boolean) => void
}) {
  const lines = stepsFor(os, step)
  return (
    <li className={`cls-step${done ? ' is-done' : ''}`}>
      <div className="cls-step-head">
        <label className="cls-check">
          <input type="checkbox" checked={done} onChange={e => onTick(step.key, e.target.checked)}
                 aria-label={`Step ${n}: ${step.title} — mark as done`} />
          <span className="cls-n">{n}</span>
        </label>
        <div>
          <h3>
            {step.title}
            {step.need === 'optional' && <span className="cls-tag">optional</span>}
            {step.cost && <span className="cls-cost">{step.cost}</span>}
          </h3>
          <p className="cls-why">{step.why}</p>
        </div>
        <span className="cls-mins">{step.minutes} min</span>
      </div>

      <ol className="cls-do">
        {lines.map((l, i) => <li key={i}>{l.includes(': ') && /curl|irm|claude|git /.test(l) ? <Cmd line={l} /> : l}</li>)}
      </ol>

      {step.check && <p className="cls-verify"><b>You’ll know it worked when:</b> {step.check}</p>}
      {step.url && <p><a href={step.url} target="_blank" rel="noreferrer">Open the page you need →</a></p>}
    </li>
  )
}

/** A line like "Paste: curl …" — the command gets its own copyable block. */
function Cmd({ line }: { line: string }) {
  const at = line.indexOf(': ')
  const label = line.slice(0, at + 1)
  const cmd = line.slice(at + 2)
  const [copied, setCopied] = useState(false)
  return (
    <>
      {label}
      <span className="cls-cmd">
        <code>{cmd}</code>
        <button type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch {}
        }}>{copied ? 'Copied' : 'Copy'}</button>
      </span>
    </>
  )
}
