# My AI C-Suite Canvas — filled

> The take-home from [ai-csuite-blueprint.md](ai-csuite-blueprint.md), filled in for this business.
> Filled 2026-09-20. One head is live; the other three are mapped but not built.

**My business:** Restoran Jaosamut — Thai seafood, CBD Perdana 2, Cyberjaya. Also Salam Bangkok (Dataran Jelatek, KL), which shares the same Meta ad account.

**My CEO threshold rule (the dial):** **Fully closed to start.** Every head recommends and nothing runs alone, on any head, in any lane. The dial turns up only after a head's recommendations have proved right over a fortnight — and never for anything a customer would receive.

---

## The four heads, mapped

| Head | In MY business, this head watches… | May do ALONE (🟢) | Must ASK me first (🟡) | May NEVER (🔴) | Where the data lives |
|------|-------------------------------------|-------------------|------------------------|----------------|----------------------|
| **Marketing 📣** ← **LIVE** | The Facebook Ads playbook (25 tracked tasks) + the content calendar. Overdue work, the promo clock, the on-time rate. | **Nothing.** Dial fully closed. | Every recommendation, every day — one brief, one priority. | Publish, boost, spend on ads, message a customer | `records` `category=content` + `category=ad_task` |
| **Sales 🎯** — not built | 12 leads (10 open), 4 customers, WhatsApp enquiries from the ads | — | Draft a follow-up for a quiet lead; any offer or discount change | Send any DM itself; promise a price | `records` `category=lead/customer` |
| **Finance 💰** — not built | 7 `cash_in` rows (4 unpaid), 6 `cash_out` | — | Draft an invoice chase; spend above threshold | Move money, pay a bill, delete a record | `records` `category=cash_in/cash_out` |
| **Ops ⚙️** — not built | 5 ops tasks, 1 doc, kitchen and supplier paperwork | — | Change a status with money impact | Delete anything; email a customer | `records` `category=task/doc` |

---

## My top escalation triggers

1. **Anything a customer would receive** — a WhatsApp reply, a published post, a boosted ad. The head drafts; I send. No exceptions and no threshold.
2. **Any spend at all** — ad budget changes, placement shifts, a new test that costs money. The ads account has burned RM 10,678 across six runs this year; none of that moves without me.
3. **Two heads would disagree** — e.g. Marketing wants to widen targeting while Finance sees cash is tight. That conflict comes to me with both cases, not resolved between them.

---

## The first head I'll actually turn on

**Head of Marketing 📣**

**Why this one first:** it has by far the most to watch — 25 tracked ad tasks with real deadlines against a promo that ends 30 September — and it makes the playbook board self-enforcing instead of something I have to remember to open. It is also the lane I know best, so I can judge whether its recommendations are any good.

**How I'll know it's earning its keep in 2 weeks:**

> **Ad tasks completed on or before their due date.**

Baseline at install: **0 of 25 done, on-time rate not yet measurable.** The head reports this number in every brief. If by 4 October the on-time rate is above 70% and the phase 1 and 2 work landed before the promo ended, it earned its keep. If tasks still slip while it politely reports them slipping, it did not — and the fix is a louder escalation, not a second head.

---

## What "live" means in code

| Blueprint concept | Where it actually is |
|---|---|
| WHEN it wakes | `agents/head-marketing/definition.ts` → `when: 'daily'`, swept by the existing cron |
| LOOK-AT | same file → `lookAt`, filters `content` + `ad_task` |
| ASK-BEFORE (the dial) | same file → `askBefore: () => true` — fully closed |
| SUGGEST (the words) | `agents/head-marketing/prompt.ts` → `briefText()` |
| 🔴 never-zone | `agents/head-marketing/executor.ts` is `draftOnly`. **No network call exists in it.** Not a setting — absent code. |
| Registered | `agents/registry.ts` → `AGENTS`, `EXECUTORS`, `SCHEDULED` |

Every brief it raises lands on **Approvals** with Telegram buttons, and whatever I decide is written to the audit trail. I review the trail, not every action.

---

## Turning the dial up later

When the Marketing head has earned trust, the smallest safe first step is to let it mark a task overdue on its own — internal, reversible, no customer involved. That is one line in `definition.ts`:

```ts
askBefore: (row) => !(row.category === 'ad_task' && row.meta?.phase !== 'ongoing'),
```

Nothing customer-facing ever moves to 🟢, no matter how much trust it earns.
