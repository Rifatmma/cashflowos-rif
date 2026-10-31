// The pre-class checklist a client follows unsupervised, the night before.
//   npx -y tsx --conditions=react-server tests/class-plan.test.mts
//
// Tested because nobody is standing next to her. A step in the wrong order, a
// missing verification line or an instruction that only suits one computer is
// not a cosmetic fault here — it is a client stuck at 10pm with no way to tell
// whether she is finished.
//
// It also pins the two things the docs corrected me on (31 Oct 2026): Node.js
// is NOT required by the recommended install, and Git for Windows is optional.
// Both were about to go on the page as blockers.

import { STEPS, REQUIRED, stepsFor, progressOf, isStepKey, requiredMinutes, costedSteps } from '../lib/class-plan'

let bad = 0
const ok = (m: string) => console.log(`ok   ${m}`)
const is = (c: boolean, m: string) => (c ? ok(m) : (bad++, console.log(`FAIL ${m}`)))

// ── every step has to stand on its own ─────────────────────────────────────
{
  is(STEPS.every(s => s.key && s.title && s.why), 'every step says what it is and why she is doing it')
  is(STEPS.every(s => s.check), 'and every step says how she knows it worked')
  is(new Set(STEPS.map(s => s.key)).size === STEPS.length, 'keys are unique, so saved progress cannot land on the wrong step')
  is(STEPS.every(s => stepsFor('mac', s).length > 0), 'a Mac user gets instructions for every step')
  is(STEPS.every(s => stepsFor('windows', s).length > 0), 'and so does a Windows user')
  is(STEPS.every(s => s.minutes > 0), 'each one says how long it takes')
}

// ── order: nothing asks for something that does not exist yet ──────────────
const at = (k: string) => STEPS.findIndex(s => s.key === k)
{
  is(at('claude-pro') < at('install'),
     'Pro comes before the install — Claude Code will not log in without it, and that is the wall she would hit')
  is(at('github') < at('repo'), 'the GitHub account comes before the repository that lives in it')
  is(at('git') < at('repo'), 'Git is installed before there is a repository to use it on')
  is(at('github') < at('vercel'), 'GitHub before Vercel, so she can sign into Vercel with it')
}

// ── the two things the docs corrected ──────────────────────────────────────
{
  const all = JSON.stringify(STEPS).toLowerCase()
  is(!/node\.js|nodejs|npm install -g/.test(all),
     'Node.js is never mentioned — the recommended install is a native binary and does not need it')
  const install = STEPS.find(s => s.key === 'install')!
  is(stepsFor('mac', install).some(l => l.includes('claude.ai/install.sh')), 'Mac gets the native installer')
  is(stepsFor('windows', install).some(l => l.includes('claude.ai/install.ps1')), 'Windows gets the PowerShell one')
  const git = STEPS.find(s => s.key === 'git')!
  is(git.need === 'required', 'Git is still asked for — it is how the work gets published')
  is(!/required|must|blocked/i.test(git.why), 'but it is not described as a blocker, because it is not one')
}

// ── required versus optional ───────────────────────────────────────────────
{
  const req = REQUIRED.map(s => s.key)
  is(['claude-pro', 'install', 'git', 'github', 'repo', 'vercel', 'supabase', 'api-key'].every(k => req.includes(k)),
     'everything needed to get a site with a database live is required')
  is(!req.includes('composio') && !req.includes('chrome'),
     'Composio and the Chrome extension are optional — she can launch without them')
  is(requiredMinutes() <= 90, `the required path is ${requiredMinutes()} minutes, so one evening is an honest promise`)
}

// ── money, stated rather than discovered ───────────────────────────────────
{
  const costs = costedSteps().map(s => s.key)
  is(costs.includes('claude-pro') && costs.includes('api-key'),
     'both things she pays for are flagged as costing money')
  const api = STEPS.find(s => s.key === 'api-key')!
  is(/separate/i.test(api.why), 'and the API credit explains that it is NOT the same as Pro, which is the usual confusion')
  is(/do not put it in a chat/i.test(api.check ?? ''), 'the API key step warns her not to paste the key anywhere shared')
}

// ── progress ───────────────────────────────────────────────────────────────
{
  is(progressOf({}).done === 0 && progressOf({}).pct === 0, 'nothing ticked is zero, not NaN')
  is(progressOf(null).total === REQUIRED.length, 'a client with no saved progress still sees the full list')
  const all = Object.fromEntries(REQUIRED.map(s => [s.key, true]))
  is(progressOf(all).pct === 100, 'every required step ticked is 100%')
  is(progressOf({ ...all, composio: true }).pct === 100, 'and the optional ones cannot push it over 100')
  is(progressOf({ 'made-up': true }).done === 0, 'a key that is not a step counts for nothing')
  is(isStepKey('install') && !isStepKey('drop table'), 'only real step keys are accepted from the form')
}

console.log(bad ? `\n${bad} failed` : '\nall passed')
process.exit(bad ? 1 : 0)
