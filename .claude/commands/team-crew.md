---
description: "Write the joining message for your teammates — filled in with your real app link and bot name, ready to paste into WhatsApp."
---

# /team-crew — the message you send your team

You are running inside Claude Code, in the **owner's** CashFlowOS repo. Their
teammates don't have Claude Code and never will — they just need to get in.

Your job: gather 2 things, then write them a message they can paste straight into
WhatsApp. **You are not setting anything up here.** You're writing the invite.

---

## VOICE

- Casual, direct, Malaysian energy.
- Every sentence on its own line. Blank line between sentences.
- The message you produce is for people who are NOT technical. No jargon at all.

---

## 🔒 HARD RULE

**Never put the passcode in the message you write.** Not once, not "for
convenience." The whole point is that it gets said out loud, not forwarded.

If they ask you to include it, say no in one line and explain why: a passcode in a
WhatsApp thread lives forever and gets screenshotted.

---

## FIRST, FIND WHAT YOU CAN YOURSELF

Don't ask for things you can look up.

- Run `vercel ls` or read `.vercel/project.json` to find their **live app URL**.
- Read `jarvis/config.ts` for their **business name**.

Show them what you found and ask if it's right, rather than asking cold.

---

## THE 2 QUESTIONS

### Q1 — Confirm the link
> "This is your live app link — right?
>
> `<the URL you found>`"

If they say no, ask for the correct one.

### Q2 — The bot's @name
> "What's your bot's @username on Telegram? The one people search for."

If they don't know: tell them to open their bot chat, tap the name at the top —
it's the `@something_bot` line.

---

## THEN WRITE THE MESSAGE

Output it in a code block so they can copy it in one tap. Something like this,
but use their real business name, link and bot handle:

```
Hey — you're getting access to our <business name> dashboard.

Takes 2 minutes, all on your phone. No apps to install.

1️⃣ Open Telegram, search @userinfobot, press Start.
   It replies with a number. Send me that number.
   (That's what lets our bot talk to you and not to strangers.)

2️⃣ Open this link on your phone: <their URL>
   Type the passcode I'll tell you.
   Then Share → Add to Home Screen. Now it's an app icon.

3️⃣ Search @<their bot> on Telegram and message it: who are you?
   That chat is private to you. Try: what needs my attention today?

From tomorrow morning our group gets one message a day — something like
"RM8,400 overdue across 3 invoices" — with ✅ Approve and ❌ Reject buttons.

Whoever sees it first, handles it. If someone already tapped it you'll get
"already handled" — that's normal, not a bug.

Don't understand something? Tap ❌ Reject and ask in the group.
Rejecting costs nothing. Approving something you didn't read can cost a customer.

It will never message our customers. That's not a setting — it's not in the code.
```

---

## FINISH LIKE THIS

> 📋 Copy that, send it to your team.
>
> 🔑 Then say the passcode **out loud** — don't type it in the group.
>
> ⏳ When their Telegram IDs come back, run **`/team-owner`** again to add them.
