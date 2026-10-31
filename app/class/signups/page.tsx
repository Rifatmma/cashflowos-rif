import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { allSignups, type Signup } from '../actions'
import { STEPS, REQUIRED, progressOf } from '@/lib/class-plan'
import '../class.css'

// 👉 Who has filled in the pre-class checklist, and how far they got.
//
// The owner's side of the public page. Behind the app's login, unlike /class.

export const dynamic = 'force-dynamic'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default async function SignupsPage() {
  if (!(await cookies()).get('cfo_session')?.value) redirect('/class')   // never /login: see proxy.ts
  const people = await allSignups()
  const base = process.env.APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
  const link = `${base}/class`

  return (
    <div className="cls">
      <header className="cls-head">
        <p className="cls-kicker">Claude Code Intermediate Plan</p>
        <h1>{people.length ? `${people.length} ${people.length === 1 ? 'person has' : 'people have'} started` : 'Nobody has started yet'}</h1>
        <p className="cls-lede">Send this link to a client and their progress appears here as they tick things off.</p>
        <p className="cls-cmd"><code>{link}</code></p>
        <p><Link href="/class">Open the checklist as they see it →</Link></p>
      </header>

      {people.map((p: Signup) => {
        const pr = progressOf(p.progress)
        const left = REQUIRED.filter(s => !p.progress[s.key])
        return (
          <div className="cls-step" key={p.email}>
            <div className="cls-step-head">
              <div style={{ gridColumn: '1 / -1' }}>
                <h3>
                  {p.name}
                  <span className="cls-tag">{p.os === 'windows' ? 'Windows' : 'Mac'}</span>
                  <span className="cls-cost">{pr.done} of {pr.total} done</span>
                </h3>
                <p className="cls-why">
                  <a href={`mailto:${p.email}`}>{p.email}</a>
                  {p.whatsapp && <> · <a href={`https://wa.me/${p.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">{p.whatsapp}</a></>}
                  {' · '}signed up {when(p.created_at)}
                  {p.updated_at !== p.created_at && <> · last active {when(p.updated_at)}</>}
                </p>
              </div>
            </div>
            <div className="cls-bar-track" style={{ marginTop: 12 }}>
              <div className="cls-bar-fill" style={{ width: `${pr.pct}%` }} />
            </div>
            {p.building && <p className="cls-verify"><b>Wants to build:</b> {p.building}</p>}
            {left.length > 0
              ? <p className="cls-why" style={{ marginTop: 10 }}><b>Still to do:</b> {left.map(s => s.title).join(' · ')}</p>
              : <p className="cls-done" style={{ marginTop: 10 }}>Everything required is done.</p>}
          </div>
        )
      })}

      {!people.length && (
        <p className="cls-lede">
          Once somebody fills the form in you will get an email, and their card shows up here with how far they have got.
        </p>
      )}
    </div>
  )
}
