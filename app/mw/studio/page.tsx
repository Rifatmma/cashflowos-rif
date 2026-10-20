import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { currentGuest } from '@/lib/guest'
import { MwHero, Section } from '../_ui'
import { Studio } from './_studio-ui'

// 👉 Moving Walls → Studio. Type a topic, get a post.
//
// Not a data tab: nothing is pulled on a schedule and there is no snapshot to
// be stale. So the hero says what it actually is rather than borrowing the
// "pulled from Ads, GA4 and Semrush" line every other tab carries.

export const dynamic = 'force-dynamic'
// Ava reads a whole script in one server action — eight lines, three at a
// time — which can outlast the default function limit.
export const maxDuration = 60

export default async function MwStudio() {
  const guest = await currentGuest()
  const jar = await cookies()
  if (!jar.get('cfo_session')?.value && jar.get('cfo_guest')?.value && !guest) redirect('/login')

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  const hasPexels = Boolean(process.env.PEXELS_API_KEY?.trim())

  return (
    <div className="mw-wrap">
      {/* Poppins is the brand face and is not otherwise used in this app, so
          it is loaded here rather than globally — every other screen would
          pay for a font it never draws. */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap"
      />

      <MwHero
        tab="studio"
        pulled="on demand"
        stale={false}
        sources="Moving Walls · web research · Search Console · Pexels · generated"
        headline="Studio"
      >
        <p>
          Type a topic. It researches it, shows you the facts and where they came from, then builds
          a single image or a carousel in the Moving Walls brand. Download the PNGs and post them.
        </p>
      </MwHero>

      {!hasKey && (
        <Section title="Not configured yet">
          <p className="lede">
            <code>ANTHROPIC_API_KEY</code> is not set on this deployment, so nothing can be researched
            or written. Add it in the Vercel project settings and redeploy.
          </p>
        </Section>
      )}

      {hasKey && (
        <Section title="Make a post">
          {!hasPexels && (
            <p className="lede">
              <code>PEXELS_API_KEY</code> is not set, so there are no cover photos — covers will use the
              blue gradient instead. Everything else works.
            </p>
          )}
          <Studio />
        </Section>
      )}

      <Section title="What it will and will not do">
        <p className="lede">
          Every number on a slide comes from the researched facts shown above it, each with a named
          source. Nothing is invented, and a statistic with no source is flagged rather than drawn.
          Headlines are capped at a length the layout can actually hold — if the writing comes back
          too long it is rewritten shorter once, and if it still does not fit you are told which
          slide and by how much, instead of being handed a broken design.
        </p>
        <p className="lede">
          It does not post anything. It produces PNGs at the sizes Instagram and LinkedIn want
          (1080&nbsp;×&nbsp;1350 for a carousel, 1080&nbsp;×&nbsp;1080 for a single image) and an
          MP4 if you want one, at those sizes or 1080&nbsp;×&nbsp;1920 for Reels. You post them
          yourself.
        </p>
        <p className="lede">
          Video is encoded frame by frame rather than filmed off the screen, so it is 30 frames a
          second by construction and you can work in another tab while it runs. The earlier
          version recorded the canvas in real time and a measured clip came back at 19.6 frames a
          second with a 2.3-second freeze in the middle — which is what screen capture does when
          the machine hiccups, and why it is no longer used where the browser can encode instead.
        </p>
      </Section>
    </div>
  )
}
