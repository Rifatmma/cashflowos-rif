import 'server-only'
import type { Rec } from './records'
import { rm, todayISO, getFunnel } from './records'
import { sameSupplier } from './supplier-rules'
// The Facebook Ads lens. SNAPSHOT/RUNS are a point-in-time pull that lives in a
// file, not in `records` — without this import Jarvis has no way to see a single
// ad number. readMarketing() is the SAME calculation the Head of Marketing agent
// uses, shared on purpose so the bot and the agent can never disagree.
import { SNAPSHOT, COMPETITORS } from './ads-snapshot'
import { getAds } from './ads-data'
import { verdict, alerts } from './ads-verdict'
import { readMarketing } from '@/agents/head-marketing/definition'
import { getItems, getMoves, stockState, unitCosts, costOfUse } from './stock-data'
import { fmtQty } from './stock-items'
import { getMeals, getBudget, kcalOn, latestMeal, correctMeal, logMeal, costTyped } from './meals'
import { isSalesRow, salesDayOf } from './sales'

// 🔒 Don't edit — this keeps your robot safe.
// The Jarvis bot's HANDS. Instead of dumping your whole table into the prompt,
// Claude picks ONE of these small tools, the server runs it against your records,
// and the result comes back grounded. This IS the foundational agent loop:
//   Claude decides → the server runs the tool → Claude reads the result → answers.
// Cheaper (no full-table dumps), and money answers are always grounded in a real
// query, never guessed.
//
// Every tool here is READ-ONLY. None of them writes a row, sends a message, or
// moves money — Jarvis answers questions; it never acts. (Acting is the HITL
// engine's job, behind an approval.)

// The tool schema handed to Claude. `escalate` is the human escape hatch: Claude
// calls it (instead of guessing) when the user is stuck, frustrated, or asks for
// something outside these read tools.
export const BOT_TOOLS = [
  {
    name: 'get_cash_summary',
    description:
      'Get cash in, cash out, net, and how much is still owed to the owner, for a time window. ' +
      'Use this for ANY money total question ("how much cash in this week?", "what\'s my net this month?", "who owes me?").',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['week', 'month', 'all'],
          description: 'week = last 7 days, month = last 30 days, all = everything. Default all.',
        },
      },
    },
  },
  {
    name: 'list_overdue',
    description:
      'List everything past its due date and not yet done/paid — overdue invoices, tasks, follow-ups.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_funnel',
    description:
      'The whole-business funnel/pipeline: Views → Leads → Appointments → Closed → Nurture, with ' +
      'stage-to-stage conversion %, plus total open-pipeline RM value. Use for "how\'s my pipeline?", ' +
      '"pipeline value?", "how many leads / appointments?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'list_leads',
    description:
      'List leads, optionally filtered by stage. Each lead has a deal value (RM), stage, and next step. ' +
      'Use for "show me open leads", "who\'s at appointment stage?", "what did we close?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        stage: {
          type: 'string',
          enum: ['new', 'contacted', 'appointment', 'closed', 'nurture', 'open'],
          description: 'Optional. "open" = still in play (new/contacted/appointment). Omit for all.',
        },
      },
    },
  },
  {
    name: 'list_owed',
    description:
      'List unpaid money owed TO the owner (unpaid cash_in / invoices), each with how many days ' +
      'past due, plus the total outstanding. Use for "who owes me?", "total outstanding?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'list_overdue_invoices',
    description:
      'Only the OVERDUE invoices (unpaid cash_in already past its due date), sorted most-late first, ' +
      'each flagged with how many days late. Use for "overdue invoices", "who\'s late paying me?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'tasks_due',
    description:
      'Open tasks, optionally within a time window, sorted by deadline, with the owner from meta. ' +
      'Covers BOTH ops to-dos and Facebook Ads playbook tasks — each result says which it is. ' +
      'Use for "what\'s due this week?", "what tasks are open?", "what\'s due today?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        window: {
          type: 'string',
          enum: ['today', 'week', 'all'],
          description: 'today = due on/before today, week = next 7 days, all = every open task. Default week.',
        },
      },
    },
  },
  {
    name: 'content_status',
    description:
      'Content pipeline: what is posted, scheduled, or still a draft — with platform/format and ' +
      '(for posted) views. Use for "what\'s scheduled?", "what content is coming up?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'who_to_followup',
    description:
      'People (customers + quiet leads) who have gone silent, ranked by how long since last contact, ' +
      'with their next step. Use for "who do I need to follow up with?", "who should I chase?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'pending_vs_won',
    description:
      'Money split: RM already won (closed leads + paid cash_in) vs RM still pending (open pipeline + ' +
      'unpaid invoices), with counts. Use for "how much is pending vs won?", "what\'s in the pipeline value?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'attention_today',
    description:
      'The daily triage in one call: overdue invoices + tasks due today + proposals waiting for a YES. ' +
      'Use for "what needs my attention today?", "what should I look at?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'draft_followup',
    description:
      'Pull one person\'s context (last contact, company, deal, next step) so you can COMPOSE a short, ' +
      'friendly follow-up message for the OWNER to copy and send themselves. Use for "draft a follow-up ' +
      'for <name>", "write <name> a nudge". You draft the text in your reply — you NEVER send it, and you ' +
      'must never claim it was sent.',
    input_schema: {
      type: 'object' as const,
      properties: { name: { type: 'string', description: 'The person / customer / lead name to draft for.' } },
      required: ['name'],
    },
  },
  {
    name: 'get_ad_performance',
    description:
      'Facebook/Meta ads performance: spend, impressions, reach, CTR, CPC, CPM, WhatsApp conversations ' +
      'started, cost per conversation, chat depth, placements, and a comparison across every past ' +
      'campaign run. Use for ANY question about ads, Facebook, Meta, Instagram, ad spend, CTR, reach, ' +
      'cost per lead/conversation, which placement works, or how this campaign compares to earlier ones. ' +
      'Also covers the competitor set from the Meta Ad Library.',
    input_schema: {
      type: 'object' as const,
      properties: {
        focus: {
          type: 'string',
          enum: ['summary', 'placements', 'runs', 'competitors'],
          description:
            'summary = headline numbers for the current run (default). placements = which placement is ' +
            'cheapest. runs = every campaign run compared. competitors = who else is advertising.',
        },
      },
    },
  },
  {
    name: 'get_stock',
    description:
      'Kitchen stock and daily sales: how much of each tracked ingredient is on hand (chicken breast, ' +
      'leg quarters, beef, tongue, shrimp, udang galah, crab, squid, mussels, lala, siakap, eggs, rice), ' +
      'days left at the current pace, what is running low, when it was last counted, and the recent ' +
      "days' sales with food cost % by recipe. Use for \"how much shrimp is left?\", \"what's running low?\", " +
      '"what do I need to buy?", "how were sales yesterday?", "what is my food cost?". Only proteins, eggs ' +
      'and rice are tracked -- say so if asked about veg, sauces or drinks.',
    input_schema: {
      type: 'object' as const,
      properties: { item: { type: 'string', description: 'Optional: one ingredient, e.g. "shrimp".' } },
    },
  },
  {
    name: 'get_food_today',
    description:
      "The owner's OWN food diary (private, never mentioned in the group): what he has eaten today, " +
      'the calories of each meal, his daily budget and what is left. Use for "what have I eaten?", ' +
      '"how many calories left?", "how did I do this week?". Read-only.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'log_food',
    description:
      'Log a meal the owner TYPED (no photo): "I ate nasi lemak", "had two roti canai". ' +
      'Costs it from his own recipe book first, then a table of common dishes. ' +
      'Returns what was logged. NEVER claim a meal was logged without calling this.',
    input_schema: {
      type: 'object' as const,
      properties: {
        what: { type: 'string', description: 'The dish as he said it, e.g. "nasi lemak ayam".' },
        portions: { type: 'number', description: 'How many servings. Default 1. Half a plate = 0.5.' },
        kcal: { type: 'number', description: 'Only if HE gave the calories himself.' },
      },
      required: ['what'],
    },
  },
  {
    name: 'fix_last_meal',
    description:
      'Change the calories of the meal just logged, when he says it was a different amount: ' +
      '"quarter of that", "half", "I only ate a third", "two plates", "make it 600". ' +
      'Give EITHER share (0.25 for a quarter, 0.5 for half, 2 for double) OR kcal, never both. ' +
      'This is the ONLY way to change a meal -- never state a new number without calling it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        share: { type: 'number', description: 'Fraction of what was logged: 0.25, 0.5, 2 …' },
        kcal: { type: 'number', description: 'An exact calorie figure instead.' },
        why: { type: 'string', description: 'His words, e.g. "quarter of the pizza".' },
      },
    },
  },
  {
    name: 'get_ad_tasks',
    description:
      'The Facebook Ads playbook board: what is overdue, what is due today, what to do first, how many ' +
      'are done, and the on-time completion rate. Use for "what is overdue on the ads?", "what should I ' +
      'do first for marketing?", "how is the ads playbook going?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'list_supplier_rules',
    description:
      'List what the owner has taught the robot about how specific shops lay out their receipts. ' +
      'Use for "what do you know about 99 speed mart?", "what have I taught you?", or before ' +
      'teaching something, to check whether a note already exists for that supplier.',
    input_schema: {
      type: 'object' as const,
      properties: {
        supplier: { type: 'string', description: 'Optional: only the note for this shop.' },
      },
    },
  },
  {
    name: 'search_records',
    description:
      'Find records whose title, notes, or details match a search word. Optionally filter to one ' +
      'category (cash_in, cash_out, lead, customer, content, task, doc, ad_task). ' +
      'ad_task = the Facebook Ads playbook tasks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The word or name to look for.' },
        category: {
          type: 'string',
          enum: ['cash_in', 'cash_out', 'lead', 'customer', 'content', 'task', 'doc', 'ad_task'],
          description: 'Optional — restrict the search to one category.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'escalate',
    description:
      'Flag the human owner and stop. Use this — instead of guessing — when the user is frustrated, ' +
      'asks to talk to a human, wants something these read tools cannot do, or you have already tried ' +
      'twice and failed. Never invent an answer for a money question you cannot ground in a tool result.',
    input_schema: {
      type: 'object' as const,
      properties: { reason: { type: 'string', description: 'One short line on why you are escalating.' } },
      required: ['reason'],
    },
  },
]

const sum = (rows: Rec[]) => rows.reduce((s, r) => s + Number(r.amount || 0), 0)
const PAID = new Set(['paid', 'done', 'closed', 'reversed'])
// A lead that has left the open pipeline (won or dropped) — excluded from pipeline value.
const CLOSED_LOST = new Set(['closed', 'nurture', 'lost', 'reversed'])
// Whole days a due date is past today (>=0).
const daysLate = (due: string, today: string) =>
  Math.max(0, Math.floor((Date.parse(today) - Date.parse(due)) / 86_400_000))

// ------------------------------------------------------------
// runBotTool() — execute ONE tool against the already-fetched records. Returns a
// compact JSON string (the caller wraps it in <<<DATA…DATA>>> as untrusted data).
// `escalate` returns a sentinel the loop watches for. Never throws.
// ------------------------------------------------------------
export async function runBotTool(name: string, input: any, rows: Rec[]): Promise<string> {
  try {
    if (name === 'escalate') {
      return JSON.stringify({ escalated: true, reason: String(input?.reason || 'flagged') })
    }

    if (name === 'get_cash_summary') {
      const period: 'week' | 'month' | 'all' =
        input?.period === 'week' || input?.period === 'month' ? input.period : 'all'
      const days = period === 'week' ? 7 : period === 'month' ? 30 : Infinity
      const since = Date.now() - days * 86_400_000
      const inWindow = (r: Rec) =>
        !Number.isFinite(days) || new Date(r.created_at).getTime() >= since

      const cashIn = sum(rows.filter(r => r.category === 'cash_in' && inWindow(r)))
      const outRows = rows.filter(r => r.category === 'cash_out' && inWindow(r))
      const cashOut = sum(outRows)
      // Owner drawings leave the bank, so they stay in cash_out and in `net` (which
      // is CASH). But they are not business spending, so they are split out --
      // otherwise "how much did the business spend?" quietly includes the owner's
      // own purchases.
      const drawings = outRows.reduce((t, r) => {
        const split = r.meta?.type_split as Record<string, number> | undefined
        if (split && typeof split.owner_drawings === 'number') return t + split.owner_drawings
        return r.meta?.expense_type === 'owner_drawings' ? t + Number(r.amount || 0) : t
      }, 0)
      // "Who owes me" = cash_in still unpaid — outstanding regardless of the window.
      const owed = sum(rows.filter(r => r.category === 'cash_in' && !PAID.has((r.status || '').toLowerCase())))
      return JSON.stringify({
        period,
        cash_in: cashIn,
        cash_out: cashOut,
        business_spending: cashOut - drawings,
        owner_drawings: drawings,
        net: cashIn - cashOut,
        owed_to_you: owed,
        display: {
          cash_in: rm(cashIn),
          cash_out: rm(cashOut),
          business_spending: rm(cashOut - drawings),
          owner_drawings: rm(drawings),
          net: rm(cashIn - cashOut),
          owed_to_you: rm(owed),
        },
      })
    }

    if (name === 'list_overdue') {
      const today = todayISO()
      const overdue = rows
        .filter(r => r.due_date && r.due_date < today && !PAID.has((r.status || '').toLowerCase()))
        .map(r => ({
          title: r.title,
          category: r.category,
          amount: r.amount,
          due_date: r.due_date,
          status: r.status,
        }))
      return JSON.stringify({ count: overdue.length, overdue })
    }

    if (name === 'list_supplier_rules') {
      const who = String(input?.supplier || '').trim()
      const all = rows.filter(r => r.category === 'supplier_rule')
      const hits = who ? all.filter(r => sameSupplier(r.title, who)) : all
      if (hits.length === 0) {
        return JSON.stringify({
          count: 0,
          message: who ? `Nothing taught yet for "${who}".` : 'Nothing taught yet.',
          tell_user: 'Say nothing is stored for that shop, and that they can teach one by describing the quirk.',
        })
      }
      return JSON.stringify({
        count: hits.length,
        // `id` matters: it is how teach_supplier names a note to replace and how
        // forget_supplier_rule names one to switch off. A supplier can have several.
        rules: hits.map(r => ({
          id: r.id,
          supplier: r.title,
          rule: r.notes,
          applies: r.status !== 'off',
          taught: r.meta?.taught_at ?? null,
        })),
        tell_user:
          'Anything marked applies:false is switched off and is NOT used when reading receipts. ' +
          'A supplier can have SEVERAL notes and they all apply together — list them all, do not ' +
          'present one as "the" rule.',
      })
    }

    if (name === 'search_records') {
      const q = String(input?.query || '').toLowerCase().trim()
      const cat = input?.category
      const hits = rows
        .filter(r => (cat ? r.category === cat : true))
        .filter(r => {
          if (!q) return true
          const hay = `${r.title} ${r.notes || ''} ${JSON.stringify(r.meta || {})}`.toLowerCase()
          return hay.includes(q)
        })
        .slice(0, 25)
        .map(r => ({
          title: r.title,
          category: r.category,
          status: r.status,
          amount: r.amount,
          due_date: r.due_date,
          ...r.meta,
        }))
      return JSON.stringify({ count: hits.length, results: hits })
    }

    if (name === 'get_funnel') {
      const f = getFunnel(rows)
      const openLeads = rows.filter(r => r.category === 'lead' && !CLOSED_LOST.has((r.status || '').toLowerCase()))
      const pipelineValue = sum(openLeads)
      return JSON.stringify({
        funnel: {
          views: f.views, leads: f.leads, appointments: f.appointments,
          closed: f.closed, nurture: f.nurture,
        },
        conversion_pct: f.pct,
        open_pipeline_value: pipelineValue,
        display: { open_pipeline_value: rm(pipelineValue) },
      })
    }

    if (name === 'list_leads') {
      const stage = String(input?.stage || '').toLowerCase()
      const leads = rows.filter(r => r.category === 'lead')
      const pick =
        stage === 'open'
          ? leads.filter(r => ['new', 'contacted', 'appointment'].includes((r.status || '').toLowerCase()))
          : stage
            ? leads.filter(r => (r.status || '').toLowerCase() === stage)
            : leads
      const out = pick
        .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
        .map(r => ({
          name: r.meta?.customer || r.title,
          stage: r.status,
          value: r.amount,
          value_display: rm(r.amount),
          next: r.meta?.next || null,
          due_date: r.due_date,
        }))
      return JSON.stringify({ count: out.length, total_value: rm(sum(pick)), leads: out })
    }

    if (name === 'list_owed' || name === 'list_overdue_invoices') {
      const today = todayISO()
      const onlyOverdue = name === 'list_overdue_invoices'
      const unpaid = rows.filter(
        r => r.category === 'cash_in' && !PAID.has((r.status || '').toLowerCase()),
      )
      const picked = onlyOverdue ? unpaid.filter(r => r.due_date && r.due_date < today) : unpaid
      const out = picked
        .map(r => ({
          who: r.meta?.customer || r.title,
          title: r.title,
          amount: r.amount,
          amount_display: rm(r.amount),
          due_date: r.due_date,
          days_late: r.due_date && r.due_date < today ? daysLate(r.due_date, today) : 0,
        }))
        .sort((a, b) => b.days_late - a.days_late)
      return JSON.stringify({
        count: out.length,
        total_outstanding: rm(sum(picked)),
        [onlyOverdue ? 'overdue_invoices' : 'owed']: out,
      })
    }

    if (name === 'tasks_due') {
      const today = todayISO()
      const window: 'today' | 'week' | 'all' =
        input?.window === 'today' || input?.window === 'all' ? input.window : 'week'
      const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
      // Both lanes: ops to-dos ('task') AND the ads playbook ('ad_task'). They keep
      // separate categories so ad work can't pollute the ops numbers, but the owner
      // asking "what's due?" means everything, so both are returned and labelled.
      // 'declined' is an ad-task-only status and counts as resolved, not open.
      const openTasks = rows.filter(
        r =>
          (r.category === 'task' || r.category === 'ad_task') &&
          !PAID.has((r.status || '').toLowerCase()) &&
          (r.status || '').toLowerCase() !== 'declined',
      )
      const picked = openTasks.filter(r => {
        if (window === 'all') return true
        if (!r.due_date) return false // undated tasks only show in the 'all' window
        if (window === 'today') return r.due_date <= today
        return r.due_date <= weekAhead
      })
      const out = picked
        .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
        .map(r => ({
          task: r.title,
          due_date: r.due_date,
          owner: r.meta?.owner || null,
          status: r.status,
          lane: r.category === 'ad_task' ? 'facebook_ads' : 'ops',
          // Ads habits carry a start-by date, not a deadline — say so rather than
          // letting Jarvis call a weekly habit "overdue".
          recurring: r.category === 'ad_task' && r.meta?.phase === 'ongoing' ? true : undefined,
        }))
      return JSON.stringify({ window, count: out.length, tasks: out })
    }

    if (name === 'content_status') {
      const content = rows.filter(r => r.category === 'content')
      const byState = (s: string) =>
        content
          .filter(r => (r.status || '').toLowerCase() === s)
          .map(r => ({
            title: r.title,
            platform: r.meta?.platform || null,
            format: r.meta?.format || null,
            views: r.meta?.views ?? null,
            scheduled_for: r.due_date,
          }))
      return JSON.stringify({
        posted: byState('posted'),
        scheduled: byState('scheduled'),
        draft: byState('draft'),
      })
    }

    if (name === 'who_to_followup') {
      const today = Date.parse(todayISO())
      const people = rows.filter(
        r =>
          r.category === 'customer' ||
          (r.category === 'lead' && ['contacted', 'nurture'].includes((r.status || '').toLowerCase())),
      )
      const out = people
        .map(r => {
          // Accept either meta key — last_contact (new) or last_touch (V1/real data).
          const last = r.meta?.last_contact || r.meta?.last_touch || r.created_at?.slice(0, 10) || null
          const days = last ? Math.floor((today - Date.parse(last)) / 86_400_000) : 999
          return {
            name: r.meta?.customer || r.title,
            company: r.meta?.company || null,
            last_contact: last,
            days_since_contact: days,
            next: r.meta?.next || null,
          }
        })
        .sort((a, b) => b.days_since_contact - a.days_since_contact)
        .slice(0, 15)
      return JSON.stringify({ count: out.length, follow_up: out })
    }

    if (name === 'pending_vs_won') {
      const wonLeads = sum(rows.filter(r => r.category === 'lead' && (r.status || '').toLowerCase() === 'closed'))
      const paidIn = sum(rows.filter(r => r.category === 'cash_in' && PAID.has((r.status || '').toLowerCase())))
      const openPipe = sum(
        rows.filter(r => r.category === 'lead' && !CLOSED_LOST.has((r.status || '').toLowerCase())),
      )
      const unpaidIn = sum(rows.filter(r => r.category === 'cash_in' && !PAID.has((r.status || '').toLowerCase())))
      const won = wonLeads + paidIn
      const pending = openPipe + unpaidIn
      return JSON.stringify({
        won, pending,
        display: { won: rm(won), pending: rm(pending) },
        breakdown: {
          won: { closed_leads: rm(wonLeads), paid_invoices: rm(paidIn) },
          pending: { open_pipeline: rm(openPipe), unpaid_invoices: rm(unpaidIn) },
        },
      })
    }

    if (name === 'attention_today') {
      const today = todayISO()
      const overdueInv = rows
        .filter(r => r.category === 'cash_in' && !PAID.has((r.status || '').toLowerCase()) && r.due_date && r.due_date < today)
        .map(r => ({ what: r.title, who: r.meta?.customer || null, amount: rm(r.amount), days_late: daysLate(r.due_date!, today) }))
      const tasksToday = rows
        .filter(r => r.category === 'task' && !PAID.has((r.status || '').toLowerCase()) && r.due_date && r.due_date <= today)
        .map(r => ({ task: r.title, owner: r.meta?.owner || null, due_date: r.due_date }))
      return JSON.stringify({
        overdue_invoices: overdueInv,
        tasks_due_today: tasksToday,
        // waiting_approvals is filled by the caller (needs an async DB read); the
        // owner also sees them in the app + the morning brief.
        note: 'Proposals waiting for your YES are in the Approvals tab and your morning brief.',
        summary_counts: { overdue_invoices: overdueInv.length, tasks_due_today: tasksToday.length },
      })
    }

    if (name === 'draft_followup') {
      const q = String(input?.name || '').toLowerCase().trim()
      const person = rows.find(
        r =>
          (r.category === 'customer' || r.category === 'lead') &&
          (`${r.title} ${r.meta?.customer || ''} ${r.meta?.company || ''}`.toLowerCase().includes(q)),
      )
      if (!person) {
        return JSON.stringify({ found: false, note: `No customer or lead matching "${input?.name}". Ask the owner who they mean.` })
      }
      return JSON.stringify({
        found: true,
        name: person.meta?.customer || person.title,
        company: person.meta?.company || null,
        stage_or_status: person.status,
        deal_value: person.category === 'lead' ? rm(person.amount) : null,
        last_contact: person.meta?.last_contact || null,
        next_step: person.meta?.next || null,
        instruction:
          'Compose a SHORT, warm follow-up message (2-3 sentences) for the OWNER to copy and send. ' +
          'Do not include placeholders they must fill. NEVER say it has been sent — end your reply making clear ' +
          'it is a draft for them to send themselves.',
      })
    }

    // ---- the owner's food diary. Private: these never run for anyone else,
    // and nothing about them is ever said in the staff group.
    if (name === 'get_food_today') {
      const [meals, budget] = await Promise.all([getMeals(8), getBudget()])
      const today = todayISO()
      const day = meals.filter(m => m.day === today)
      const eaten = kcalOn(meals, today)
      return JSON.stringify({
        budget: budget.target,
        eaten,
        left: budget.target - eaten,
        meals: day.map(m => ({ id: m.id, title: m.title, kcal: m.kcal, at: m.eaten_at.slice(11, 16), working: m.working })),
        week: [...new Set(meals.map(m => m.day))].map(d => ({ day: d, kcal: kcalOn(meals, d) })),
        note: 'Calories only, by his choice. Never mention this in a group chat.',
      })
    }

    if (name === 'log_food') {
      const what = String(input?.what || '').trim()
      if (!what) return JSON.stringify({ ok: false, say: 'Tell me what you ate.' })
      const portions = Number(input?.portions) > 0 ? Number(input.portions) : 1
      const given = Number(input?.kcal)
      const cost = given > 0
        ? { title: what, kcal: given, working: 'You gave the calories yourself.', confidence: 'high' as const, lines: [], source: 'typed' as const }
        : await costTyped(what, portions)
      if (!cost) {
        return JSON.stringify({
          ok: false,
          say: `I do not know "${what}" yet. Send a photo of it, or tell me the calories and I will take your number.`,
        })
      }
      const meal = await logMeal({ ...cost, source: cost.source, items: cost.lines })
      if (!meal) return JSON.stringify({ ok: false, say: 'That one is already logged.' })
      const [budget, meals] = await Promise.all([getBudget(), getMeals(2)])
      const eaten = kcalOn(meals, todayISO())
      return JSON.stringify({
        ok: true, logged: { id: meal.id, title: meal.title, kcal: meal.kcal, working: meal.working },
        eaten, left: budget.target - eaten, budget: budget.target,
      })
    }

    if (name === 'fix_last_meal') {
      const last = await latestMeal()
      if (!last) return JSON.stringify({ ok: false, say: 'Nothing is logged yet today.' })
      const share = Number(input?.share)
      const exact = Number(input?.kcal)
      const kcal = exact > 0 ? exact : share > 0 ? last.kcal * share : NaN
      if (!Number.isFinite(kcal)) {
        return JSON.stringify({ ok: false, say: 'Tell me the share (half, a quarter) or the calories.' })
      }
      const why = String(input?.why || '').slice(0, 80) || (share > 0 ? `${share} of it` : 'corrected')
      const fixed = await correctMeal(last.id, kcal, why)
      if (!fixed) return JSON.stringify({ ok: false, say: 'That meal is gone.' })
      const [budget, meals] = await Promise.all([getBudget(), getMeals(2)])
      const eaten = kcalOn(meals, todayISO())
      return JSON.stringify({
        ok: true, was: last.kcal, now: fixed.kcal, title: fixed.title, why,
        eaten, left: budget.target - eaten, budget: budget.target,
      })
    }

    if (name === 'get_stock') {
      const [items, moves] = await Promise.all([getItems(), getMoves()])
      const costs = unitCosts(moves, items)
      const q = String(input?.item || '').toLowerCase().trim()
      const state = stockState(items, moves).filter(s => !q || s.name.toLowerCase().includes(q) || s.key.includes(q))
      const days = rows.filter(isSalesRow).sort((a, b) => salesDayOf(b).localeCompare(salesDayOf(a))).slice(0, 7)
      return JSON.stringify({
        note: 'On-hand is counted automatically: receipts add what they say, the day of sales takes off what the ' +
          'recipes used. Staff only type a number when a receipt did not print an amount, or to correct a figure. ' +
          'A negative figure means stock was there before the app started, or a receipt amount is missing -- ' +
          'say that, do not tell them to do a full stocktake.',
        stock: state.map(s => ({
          item: s.name, on_hand: fmtQty(s.onHand, s.unit), counted: s.counted, last_count: s.lastCount,
          used_per_day: s.perDay ? fmtQty(s.perDay, s.unit) : null,
          days_left: s.daysLeft === null ? null : Math.round(s.daysLeft * 10) / 10, running_low: s.low,
        })),
        recent_sales: days.map(r => {
          const food = costOfUse(r.meta?.usage, costs)
          const sales = Number(r.amount || 0)
          return { date: salesDayOf(r), sales, food_cost_by_recipe: Math.round(food * 100) / 100,
            food_cost_pct: sales ? Math.round((food / sales) * 1000) / 10 : null, sets_sold: r.meta?.sets_sold ?? 0,
            dishes_without_recipe: (r.meta?.unmatched ?? []).length }
        }),
        target_food_cost_pct: 35,
      })
    }

    if (name === 'get_ad_performance') {
      // The SAME numbers the Facebook Ads pages show: the newest good daily pull,
      // else the hand-pulled snapshot. Jarvis and the pages can never disagree.
      const { n: d, ageDays, lastError } = await getAds()
      const t = d.totals
      const cur = d.runs.at(-1)!
      const focus = ['placements', 'runs', 'competitors'].includes(input?.focus) ? input.focus : 'summary'
      const r2 = (x: number) => Math.round(x * 100) / 100
      const cpa = (spend: number, convos: number) => (convos > 0 ? r2(spend / convos) : null)
      const freshness = {
        pulled_at: d.pulledAt,
        age_days: ageDays,
        source: d.source === 'live' ? 'daily pull from Meta' : 'hand-pulled snapshot',
        ...(lastError ? { last_refresh_failed: lastError } : {}),
        tell_user: ageDays > 7
          ? `These numbers are ${ageDays} days old. Say so plainly before quoting any of them.`
          : 'Mention how recent the numbers are if they ask about "now".',
      }

      if (focus === 'placements') {
        return JSON.stringify({
          note: 'Cost per WhatsApp conversation by placement, cheapest first. Currency MYR.',
          run: `${cur.id} (${cur.since} to ${cur.until})`,
          freshness,
          placements: [...d.placements]
            .sort((x, y) => (cpa(x.spend, x.convos) ?? 1e9) - (cpa(y.spend, y.convos) ?? 1e9))
            .map(p => ({
              placement: p.label, spend: r2(p.spend), ctr_pct: p.ctr,
              conversations: p.convos, cost_per_conversation: cpa(p.spend, p.convos),
            })),
        })
      }

      if (focus === 'runs') {
        return JSON.stringify({
          note:
            'Every campaign run. Delivery is stop-start, so compare RUNS not calendar weeks. ' +
            'cost_per_engaged_chat = spend divided by conversations that reached a 2nd message ' +
            '— the quality-adjusted number. A cheap run with a bad depth rate is NOT a good run.',
          freshness,
          runs: d.runs.map(r => ({
            run: r.id, label: r.label, dates: `${r.since} to ${r.until}`, days: r.days,
            spend: r2(r.spend), reach: r.reach, ctr_pct: r2(r.ctr), cpm: r2(r.cpm),
            conversations: r.convos, cost_per_conversation: cpa(r.spend, r.convos),
            reached_msg_2_pct: r.convos ? r2((r.depth2 / r.convos) * 100) : null,
            cost_per_engaged_chat: cpa(r.spend, r.depth2),
            current: !!r.current,
          })),
        })
      }

      if (focus === 'competitors') {
        return JSON.stringify({
          note:
            'From the public Meta Ad Library, checked by hand. It shows what rivals RUN — creative, copy, ' +
            'CTA, and how long an ad has been live. It does NOT show their spend, CTR or cost per result: ' +
            'that is private and unobtainable. Never claim to know a competitor’s numbers.',
          checked: SNAPSHOT.pulledAt,
          competitors: COMPETITORS.map(c => ({
            name: c.name, where: c.where, advertising: c.status,
            ads: c.adCount, leads_with: c.leadsWith, cta: c.cta, threat: c.threat,
          })),
          our_position: `We are the only one in the set leading with a discount (${SNAPSHOT.offer.price} set).`,
        })
      }

      const v = verdict(d)
      return JSON.stringify({
        note:
          'Meta Ads for the CURRENT run only. Delivery is stop-start — this is a campaign run, not a ' +
          'calendar window. Currency MYR. Ask again with focus=runs to compare against past campaigns.',
        account: SNAPSHOT.account.name,
        run: `${cur.id} — ${cur.label}`,
        period: `${cur.since} to ${cur.until}`,
        freshness,
        verdict: { status: v.label, sentence: v.sentence },
        watch_outs: alerts(d, { offer: SNAPSHOT.offer, creative: SNAPSHOT.liveCreative }).map(a => a.text),
        spend: r2(t.spend), impressions: t.impressions, reach: t.reach, frequency: r2(t.frequency),
        clicks: t.clicks, ctr_pct: r2(t.ctr), cpc: r2(t.cpc), cpm: r2(t.cpm),
        whatsapp_conversations: t.convos,
        cost_per_conversation: cpa(t.spend, t.convos),
        reached_msg_2: t.depth2,
        reached_msg_2_pct: t.convos ? r2((t.depth2 / t.convos) * 100) : null,
        cost_per_engaged_chat: cpa(t.spend, t.depth2),
        break_even_conversion_pct: t.convos ? r2((t.spend / t.convos / SNAPSHOT.offer.price) * 100) : null,
        break_even_note: `That share of conversations must become a ${SNAPSHOT.offer.price} set just to cover ad spend, before food cost.`,
      })
    }

    if (name === 'get_ad_tasks') {
      const read = readMarketing(rows, todayISO())
      if (read.openCount === 0 && read.doneCount === 0) {
        return JSON.stringify({
          tracked: false,
          note: 'The ads playbook board has not been set up yet. Tell the owner to open the Playbook tab and turn tracking on.',
        })
      }
      return JSON.stringify({
        tracked: true,
        today: read.today,
        do_this_first: read.topPriority
          ? { task: read.topPriority.title, due: read.topPriority.due_date, priority: read.topPriority.meta?.priority ?? null }
          : null,
        overdue: read.overdue.length,
        overdue_tasks: read.overdue.slice(0, 5).map(r => ({ task: r.title, due: r.due_date })),
        due_today: read.dueToday.length,
        due_within_3_days: read.dueSoon.length,
        open: read.openCount,
        done: read.doneCount,
        declined: read.declinedCount,
        on_time_pct: read.onTimePct,
        on_time_note:
          read.onTimePct === null
            ? 'Nothing finished yet, so there is no on-time rate to report.'
            : `${read.onTime} finished on time, ${read.late} late.`,
        days_to_promo_end: read.daysToPromoEnd,
        content_scheduled: read.contentScheduled,
        note:
          'Recurring habits carry a start-by date, not a deadline, and are never counted overdue. ' +
          'The owner updates status on the Playbook tab — you cannot change anything, only report it.',
      })
    }

    return JSON.stringify({ error: `unknown tool "${name}"` })
  } catch (e: any) {
    // A tool must never crash the bot — degrade to a calm, grounded "couldn't run".
    console.error('[CFO] bot tool failed:', e)
    return JSON.stringify({ error: 'that lookup failed — try rephrasing' })
  }
}
