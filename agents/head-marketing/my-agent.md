# Head of Marketing 📣

The first AI department head, per [docs/ai-csuite-blueprint.md](../../docs/ai-csuite-blueprint.md).
Filled canvas: [docs/my-ai-csuite-canvas.md](../../docs/my-ai-csuite-canvas.md).

## The four knobs

| Knob | Setting | File |
|---|---|---|
| **WHEN** | `daily` — swept by the existing cron, no new cron entry | `definition.ts` |
| **LOOK-AT** | `records` where `category` is `content` or `ad_task` | `definition.ts` |
| **ASK-BEFORE** | `true`, always. The dial is fully closed. | `definition.ts` |
| **SUGGEST** | A one-priority daily brief | `prompt.ts` |

## What it does each morning

Reads the ads playbook board and the content calendar, then raises **one** proposal:

- **Do this first** — the single highest-priority task, ranked overdue → due today → due soon → priority number
- The facts: overdue / due today / due within 3 days / open / done / declined
- The promo clock, which is why phase 1 and 2 work has a deadline at all
- **On-time rate** — the number this head is judged on
- A flag if the content calendar has nothing scheduled

## Why one proposal and not twenty-five

The blueprint is explicit that a head "gathers the facts, grills the numbers, and hands you ONE clear recommendation". One proposal per overdue row would put 25 cards on Approvals and you would stop reading them. So the check emits a single daily brief keyed `head-marketing:<date>`, and **stays silent** on days when there is nothing to raise.

## How the on-time rate is measured

When you mark a task done on `/ads/playbook`, the server action stamps `meta.done_at`. On-time = `done_at <= due_date`. Re-opening a task clears the stamp so a later completion is judged fresh.

`records` has `created_at` but no `updated_at`, so without that stamp the moment of completion is lost and the metric is unmeasurable. That is why the stamp exists.

## Ongoing habits are not overdue

Two tasks — chat labelling and the weekly organic posts — carry a **start-by** date, not a deadline. They are excluded from overdue counting in the head, the Playbook tab, the Tasks tab and the cron. Without that they would sit permanently red and drown the real deadlines.

## The 🔴 never-zone

`executor.ts` is the locked template copy: `draftOnly`, no network call. This head **cannot** publish, boost, spend or message anyone. Not because a flag says so — because the code that would do it does not exist in the file.

## Turning the dial up

See the last section of the canvas. The smallest safe first step is letting it flag a task overdue on its own. Nothing customer-facing ever moves to 🟢.
