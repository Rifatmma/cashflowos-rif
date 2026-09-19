# 👥 One CashFlowOS, five people

> One business. One database. One app. Five phones.
> **Nobody shares a Supabase login. Nobody pays for Vercel.**

---

## The shape

```
        GitHub repo                     Supabase
     owner + deputy push            owner only, the keys
            │                              │
            └──────────────┬───────────────┘
                           ▼
              Vercel — ONE deployment
        free hobby plan · one daily cron · all secrets live here
                           │
            ┌──────────────┴───────────────┐
            ▼                              ▼
          Web app                    One Telegram bot
     one shared passcode            five allowed user IDs
            │                              │
            ▼                    ┌─────────┴─────────┐
    Home screen app              ▼                   ▼
                          Private chat each     Team group
            └──────────────┬─────────────────────────┘
                           ▼
          👑 owner   🔧 deputy   📱 crew ×3
```

**One database. One deployment. One cron. One bot. Five phones.**

Everything that goes wrong at this scale comes from duplicating one of those.

---

## The three roles

| Role | How many | Holds | Can do |
|---|---|---|---|
| 👑 **Owner** | **exactly 1** | Supabase · Vercel · bot token | Everything. Only person who edits secrets |
| 🔧 **Deputy** | 0–1 | GitHub access | Push code → auto-deploys. Never sees a key |
| 📱 **Crew** | the rest | Passcode + group chat | Use the app, tap Approve, talk to the bot |

**Who is the owner?** The person whose business the data actually is — not the most
technical one in the room. Everything else here is reversible in ten minutes. That
choice isn't.

---

## Run these, in this order

| Command | Who runs it | What it does |
|---|---|---|
| **`/team-owner`** | 👑 owner | 4 questions → wires the passcode + Telegram group, redeploys, verifies |
| **`/team-crew`** | 👑 owner | Writes the joining message to send your teammates |
| **`/team-deputy`** | 🔧 deputy | Clones the repo, builds, explains their limits |

---

## Why nobody else needs a Vercel login

**Vercel deploys on every push to GitHub.** So a GitHub collaborator can ship
changes to the live app without ever opening Vercel — and without ever seeing the
Supabase key.

A Vercel seat would only add two things: reading build logs, and **editing the
secrets** — which is exactly what you didn't want to share. The free path isn't a
downgrade. It's the safer design.

**Vercel Hobby has no team seats at all**, so this isn't just cheaper, it's the only
way to do it without paying.

---

## Do the others need their own bot?

Almost always **no** — and people ask because they want a private chat, which they
already have.

One bot, five IDs in `TELEGRAM_ALLOWED_USER_IDS`. Each person DMs that bot and the
reply goes back to *their* chat, invisible to the other four. Nothing to build.

Want your own *voice* rather than your own bot? Make `jarvisIdentity()` in
`jarvis/config.ts` take the sender's ID and look them up in a small map. One bot,
one deployment, one cron — five people spoken to differently.

**Five real bots** means five deployments, which means all five people hold the
`service_role` key, and four of them must delete their cron or they'll race every
morning. You'd be handing out something stronger than the Supabase login you were
trying not to share.

---

## Four house rules

1. **Only the owner edits env vars.** Everyone else asks.
2. **First person to see it, approves it.** Don't wait for each other — "already
   handled" means nobody can double-fire it.
3. **Nothing gets approved that the approver doesn't understand.** Reject and ask in
   the group. A rejected proposal costs nothing.
4. **Someone opens the app every week.** Free Supabase pauses a project after ~7
   idle days, and then all five of you are dark at once.

---

## Don't do this

> *"Let's each deploy our own copy pointing at the same Supabase — free for everyone!"*

It works, and then **every copy runs its own daily cron.** Five people = five crons
hitting the same rows each morning. The idempotency key stops the duplicate
*actions*, but everyone gets buzzed five times and it feels broken.

---

## What this does NOT give you

Be honest with your team before you rely on it:

- **No roles.** Anyone who can tap Approve *is* an approver. The log records that the
  action happened, not which human tapped it. Fine for five people who trust each
  other. Not fine for staff you're supervising.
- **One shared passcode.** No individual accounts. Someone leaves → the owner changes
  `APP_PASSCODE`, removes their ID from `TELEGRAM_ALLOWED_USER_IDS`, redeploys.
- **The owner is a single point of failure.** Which is exactly why it must be the
  person whose business this is.

---

## The day you should pay

Free works. Two limits are real, though:

- **Vercel Hobby is for non-commercial projects.** A business running its real ops on
  it is outside the terms.
- **Free Supabase pauses when idle** and has no point-in-time backup.

> **Run it free until it's load-bearing.** The day you'd be genuinely upset if it
> went down is the day it's worth ~USD20/month — split five ways, that's the
> cheapest employee you'll ever hire.
