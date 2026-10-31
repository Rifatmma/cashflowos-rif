// 👉 The pre-class checklist a consulting client works through before the session.
//
// Everything here was checked against code.claude.com/docs on 31 Oct 2026
// rather than written from memory, and two things came back different from
// what I would have written:
//
//  · NODE.JS IS NOT NEEDED. The recommended install is a native binary. Node
//    22+ is only required for the `npm install -g` route, which is not the
//    recommended one. I had been about to make a non-technical client install
//    a runtime she will never use.
//  · GIT FOR WINDOWS IS OPTIONAL. Without it Claude Code uses PowerShell; with
//    it, Git Bash. Worth having, but it does not block her, and telling her it
//    does turns a nice-to-have into a wall at 10pm the night before.
//
// Ordered so nothing asks for something that does not exist yet: accounts
// before the things that live inside them, Git before the repo, the paid plan
// before the login that needs it.

export type OS = 'mac' | 'windows'

export type Step = {
  /** Stable across edits: progress is stored against it. */
  key: string
  title: string
  /** Why she is doing it, in one line. Nobody follows instructions they think are pointless. */
  why: string
  /** Roughly how long, so she can plan an evening. */
  minutes: number
  /** Required before class, or only if we get to it. */
  need: 'required' | 'optional'
  /** Money she will spend. Shown up front rather than discovered. */
  cost?: string
  url?: string
  /** What she does. Per-OS where it differs, `both` where it does not. */
  does: { mac?: string[]; windows?: string[]; both?: string[] }
  /** How she knows it worked. Every step has one — "it seemed fine" is not a check. */
  check?: string
}

export const STEPS: Step[] = [
  {
    key: 'claude-pro',
    title: 'Get Claude Pro',
    why: 'Claude Code does not run on the free plan. Everything else waits on this one, so do it first.',
    minutes: 5, need: 'required', cost: 'about USD 20 a month',
    url: 'https://claude.ai/upgrade',
    does: { both: ['Sign in at claude.ai, or create an account.', 'Upgrade to Pro.'] },
    check: 'claude.ai shows Pro on your account.',
  },
  {
    key: 'install',
    title: 'Install Claude Code',
    why: 'This is the tool we use for the whole session. One command, and it needs nothing installed first.',
    minutes: 10, need: 'required',
    url: 'https://code.claude.com/docs/en/setup',
    does: {
      mac: [
        'Open Terminal (press Cmd+Space, type Terminal, press Enter).',
        'Paste: curl -fsSL https://claude.ai/install.sh | bash',
        'Close Terminal and open it again.',
      ],
      windows: [
        'Open PowerShell (press the Windows key, type PowerShell, press Enter).',
        'Paste: irm https://claude.ai/install.ps1 | iex',
        'Close PowerShell and open it again.',
      ],
      both: ['Run: claude', 'Log in with the Claude account you just upgraded.'],
    },
    check: 'Running  claude --version  prints a version number. If it does not, run  claude doctor  and send me what it says.',
  },
  {
    key: 'git',
    title: 'Install Git',
    why: 'Git is how your work gets saved and published. On Windows it also gives Claude Code a better terminal.',
    minutes: 10, need: 'required',
    url: 'https://git-scm.com/downloads',
    does: {
      mac: [
        'In Terminal run: git --version',
        'If it asks to install developer tools, say yes and wait.',
        'If it prints a version already, you are done.',
      ],
      windows: [
        'Download Git for Windows from git-scm.com/downloads/win.',
        'Run the installer and accept every default.',
      ],
    },
    check: 'git --version  prints a version number.',
  },
  {
    key: 'github',
    title: 'Create a GitHub account',
    why: 'Where your code lives. Vercel publishes your site straight from it.',
    minutes: 5, need: 'required', cost: 'free',
    url: 'https://github.com/signup',
    does: { both: ['Sign up at github.com.', 'Confirm your email address — the next step will not work until you do.'] },
    check: 'You can see your own profile page while logged in.',
  },
  {
    key: 'repo',
    title: 'Create the project repository',
    why: 'The folder your website will live in. Making it now means we start the class building, not setting up.',
    minutes: 5, need: 'required',
    url: 'https://github.com/new',
    does: {
      both: [
        'On GitHub click New repository.',
        'Name it after your site — lower case, hyphens instead of spaces.',
        'Set it to Private.',
        'Tick "Add a README file".',
        'Click Create repository.',
      ],
    },
    check: 'The repository opens and shows a README. Keep the browser tab — we will use the link in class.',
  },
  {
    key: 'vercel',
    title: 'Create a Vercel account',
    why: 'This puts your site on the internet. Sign in with GitHub so the two are already connected.',
    minutes: 5, need: 'required', cost: 'free',
    url: 'https://vercel.com/signup',
    does: { both: ['Go to vercel.com and choose "Continue with GitHub".', 'Allow the access it asks for.'] },
    check: 'Your Vercel dashboard loads and shows your GitHub name.',
  },
  {
    key: 'supabase',
    title: 'Create a Supabase account and project',
    why: 'Your database — where anything your site remembers gets stored. Creating the project takes a few minutes on their side, so start it early.',
    minutes: 10, need: 'required', cost: 'free',
    url: 'https://supabase.com/dashboard',
    does: {
      both: [
        'Sign up at supabase.com, with GitHub if you like.',
        'Click New project.',
        'Name it the same as your repository.',
        'Choose the region closest to you — Singapore for Malaysia.',
        'Save the database password it asks you to set. You will not be shown it again.',
      ],
    },
    check: 'The project dashboard opens and no longer says "setting up". Have that password to hand in class.',
  },
  {
    key: 'api-key',
    title: 'Add USD 5 of API credit',
    why: 'Separate from Claude Pro, and often confused with it. Pro is you using Claude; this is your SITE using Claude. Five dollars goes a long way.',
    minutes: 5, need: 'required', cost: 'USD 5, one-off',
    url: 'https://platform.claude.com/settings/billing',
    does: { both: [
      'Go to platform.claude.com and sign in with the same account.',
      'Billing → Buy credits → add USD 5.',
      'API keys → Create key, and copy it somewhere safe straight away.',
    ] },
    check: 'Your balance shows USD 5 and you have a key starting sk-ant- saved somewhere you can find it. Do not put it in a chat or a document anyone else can read.',
  },
  {
    key: 'chrome',
    title: 'Install Claude for Chrome',
    why: 'Lets Claude see and click around a web page — useful when we are checking your site looks right.',
    minutes: 5, need: 'optional',
    url: 'https://claude.ai/chrome',
    does: { both: ['Install the extension from the Chrome Web Store.', 'Sign in with your Claude account.'] },
    check: 'The Claude icon appears next to your Chrome address bar.',
  },
  {
    key: 'connectors',
    title: 'Connect your apps to Claude',
    why: 'Lets Claude read your Gmail and Calendar when you ask it to. Optional, and only worth doing if you want that.',
    minutes: 10, need: 'optional',
    url: 'https://claude.ai/settings/connectors',
    does: { both: ['In Claude, open Settings → Connectors.', 'Connect Gmail and Google Calendar.', 'Approve the Google permission screen.'] },
    check: 'Both show as connected in Settings.',
  },
  {
    key: 'composio',
    title: 'Sign up for Composio',
    why: 'Lets the site you build talk to outside services later. Not needed to get a site live, so leave it if you are short of time.',
    minutes: 5, need: 'optional', cost: 'free to start',
    url: 'https://composio.dev',
    does: { both: ['Sign up at composio.dev, with GitHub if you like.'] },
    check: 'You can open the Composio dashboard.',
  },
]

export const REQUIRED = STEPS.filter(s => s.need === 'required')

/** Minutes for the steps she must do, for the "set aside an hour" line. */
export const requiredMinutes = () => REQUIRED.reduce((t, s) => t + s.minutes, 0)

/** Steps that cost money, so the total is stated rather than discovered. */
export const costedSteps = () => STEPS.filter(s => s.cost && !/free/i.test(s.cost))

export function stepsFor(os: OS, s: Step): string[] {
  return [...(s.does[os] ?? []), ...(s.does.both ?? [])]
}

/** How far through the required steps she is. */
export function progressOf(progress: Record<string, boolean> | null | undefined) {
  const done = REQUIRED.filter(s => progress?.[s.key]).length
  return { done, total: REQUIRED.length, pct: REQUIRED.length ? Math.round((done / REQUIRED.length) * 100) : 0 }
}

/** Keys we accept from the form. Anything else is ignored rather than stored. */
export const isStepKey = (k: string) => STEPS.some(s => s.key === k)
