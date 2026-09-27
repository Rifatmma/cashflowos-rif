import 'server-only'
import { randomUUID } from 'crypto'
import type { Rec } from './records'
import { rm } from './records'
import { runAutopilot, proposeAndNotify } from './actions'
import { normaliseRule, sameSupplier, sameRuleText } from './supplier-rules'
// The ONE list of expense types. Jarvis's correction tool used to carry its own
// hand-typed copy, which silently fell behind when supplies_cleaning was added
// -- so the owner could not correct anything TO it. Derived, it cannot drift.
import { EXPENSE_TYPES } from './vision'
import { applyLineFix, describeLines, describeSplit, keepLineMoney } from './receipt-lines'
import { fixUrl } from './app-url'

// 🔒 Don't edit — this keeps your robot safe.
// The Jarvis bot's WRITE hands (V2). Where lib/bot-tools.ts only READS, these
// tools ACT — but every one of them goes through the SAME approval engine the
// photo pipeline uses (lib/actions.ts), so the autonomy dial applies exactly:
//   🟢 small + reversible (add a task/lead, a small expense) → autopilot: it runs
//      once, then tells you, with a /undo escape hatch.
//   🟡 money / pipeline truth (log income, mark an invoice paid, move a lead,
//      a big expense) → propose: Approve/Reject buttons go to Telegram; nothing
//      happens until you tap ✅.
//   🔴 message a customer / move money / delete → NOT a tool. It does not exist.
// Nothing here writes a row directly — it all funnels through runAutopilot /
// proposeAndNotify, which is the only once-only execution path.

// The tool schemas handed to Claude alongside the read tools. Claude picks one
// when the owner asks to add/log/mark/update something.
export const BOT_ACTION_TOOLS = [
  {
    name: 'log_expense',
    description:
      'Record a business expense (cash out) from what the owner typed (no photo). At or under the ' +
      'auto-file threshold it files itself (🟢, undoable); over it, it asks the owner to approve (🟡). ' +
      'Use for "log RM45 Grab", "I spent 1200 on Facebook ads".',
    input_schema: {
      type: 'object' as const,
      properties: {
        merchant: { type: 'string', description: 'Who it was paid to (Grab, Adobe, Maybank…).' },
        amount: { type: 'number', description: 'Amount in RM.' },
        category: { type: 'string', description: 'Optional label (Meals, Software, Ads…).' },
      },
      required: ['merchant', 'amount'],
    },
  },
  {
    name: 'log_drawing',
    description:
      'Record business money the owner took or spent for THEMSELVES, with no receipt to photograph ' +
      '- "took RM200 from the till", "paid RM50 for my own dinner from the shop account". It is ' +
      'recorded as owner drawings: money out of the business, but NOT a business expense and never ' +
      'counted against profit. Only use when the owner says it was personal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        amount: { type: 'number', description: 'Amount in RM.' },
        description: { type: 'string', description: 'What it was, in the owner\'s words (e.g. "cash from till").' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'add_task',
    description:
      'Add an open task/to-do. Reversible, so it just does it (🟢) and gives an /undo. ' +
      'Use for "add task: chase supplier Friday", "remind me to call the printer".',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'What the task is.' },
        due_date: { type: 'string', description: 'Optional YYYY-MM-DD deadline.' },
        owner: { type: 'string', description: 'Optional person responsible.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_lead',
    description:
      'Add a new lead to the pipeline. Reversible, so it just does it (🟢) with an /undo. ' +
      'Use for "add lead Angela, RM8000, ig", "new lead: Koperasi ABC".',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Lead / person / company name.' },
        value: { type: 'number', description: 'Optional deal value in RM.' },
        stage: {
          type: 'string',
          enum: ['new', 'contacted', 'appointment', 'closed', 'nurture'],
          description: 'Optional starting stage. Default new.',
        },
        source: { type: 'string', description: 'Optional where it came from (ig, referral, ad).' },
      },
      required: ['name'],
    },
  },
  {
    name: 'log_cash_in',
    description:
      'Record money coming IN / an invoice raised. Because it changes the money picture it always ' +
      'asks first (🟡 Approve). Use for "log RM5000 from Koochester", "invoice ABC 3200".',
    input_schema: {
      type: 'object' as const,
      properties: {
        source: { type: 'string', description: 'Who it is from / what it is for.' },
        amount: { type: 'number', description: 'Amount in RM.' },
        customer: { type: 'string', description: 'Optional customer name.' },
      },
      required: ['source', 'amount'],
    },
  },
  {
    name: 'mark_invoice_paid',
    description:
      'Mark an existing unpaid invoice (cash_in) as PAID. Money truth → asks first (🟡 Approve). ' +
      'Give the customer name or invoice title; if it is unclear which one, I will list the matches. ' +
      'Use for "mark Angela\'s invoice paid", "the ABC invoice is settled".',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice: { type: 'string', description: 'Customer name or invoice title to match.' },
      },
      required: ['invoice'],
    },
  },
  {
    name: 'update_lead_status',
    description:
      'Move a lead to a new pipeline stage. Pipeline truth → asks first (🟡 Approve). ' +
      'Use for "move Angela to appointment", "mark Koochester closed".',
    input_schema: {
      type: 'object' as const,
      properties: {
        lead: { type: 'string', description: 'Lead / customer name to match.' },
        stage: {
          type: 'string',
          enum: ['new', 'contacted', 'appointment', 'closed', 'nurture'],
          description: 'The stage to move them to.',
        },
      },
      required: ['lead', 'stage'],
    },
  },
  {
    name: 'correct_receipt',
    description:
      'Fix what was read off a receipt that is ALREADY filed - wrong quantity, wrong unit price, ' +
      'wrong expense type. Use when the owner says something like "the rice was 2 at 45.90 not 6 at ' +
      '15.30" or "that Speed Mart one is food not packaging". Changing only the items or the expense ' +
      'type leaves the money untouched, so it just does it; changing the TOTAL asks first. ' +
      'When only SOME lines are the wrong type ("line 3 should be food"), use line_types -- the prices ' +
      'are already on the receipt, so NEVER ask the owner for them. Report back only the lines and split ' +
      'this tool returns; never describe a split it did not return. ' +
      'AFTER a successful correction you MUST ask whether to remember it as a standing rule for that ' +
      'supplier, and only call teach_supplier if they say yes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        record_id: { type: 'number', description: 'The record number, when you know it (e.g. 156). Picks the receipt exactly. NOT the /undo code.' },
        receipt: { type: 'string', description: 'Supplier name or what to match the filed receipt on (e.g. "99 speed mart", "the rice one"), or "#156".' },
        amount: { type: 'number', description: 'Optional: the receipt total, to pick the right one when several match.' },
        merchant: { type: 'string', description: 'Set or fix WHO it was paid to. Use when a receipt was filed with no shop name (a typed list, a market stall), e.g. "Pasar Borong Selangor".' },
        items: {
          type: 'array',
          description:
            'Only to REWRITE the whole receipt: every line, in order. To fix one or two lines use line_fixes ' +
            'instead. A list shorter than the receipt is refused unless remove_lines says which go.',
          items: {
            type: 'object' as const,
            properties: {
              name: { type: 'string', description: 'Item name as printed.' },
              qty: { type: 'number', description: 'How many units.' },
              unit: { type: 'string', description: 'kg, g, l, ml, pcs, pkt, bottle...' },
              unit_price: { type: 'number', description: 'RM for ONE unit, as printed.' },
              line_total: {
                type: 'number',
                description:
                  'RM for the whole line, when the owner states it ("RM 43.2 for 90 eggs"). The unit price is ' +
                  'then worked out. If the owner only corrects a QUANTITY, the money on the line stays: pass the ' +
                  'existing line total here, not the old unit price.',
              },
              expense_type: { type: 'string', enum: [...EXPENSE_TYPES], description: 'What this line is for. Leave out to keep what it was.' },
            },
            required: ['name', 'qty'],
          },
        },
        line_fixes: {
          type: 'array',
          description:
            'PREFERRED way to fix a misread line: patch lines BY NUMBER, leaving every other line as it is. ' +
            'e.g. "line 8 is 4.08 kg at RM 22, RM 89.76" -> [{line: 8, qty: 4.08, unit: "kg", line_total: 89.76}]. ' +
            'Give only what the owner said; a quantity-only fix keeps the money on the line.',
          items: {
            type: 'object' as const,
            properties: {
              line: { type: 'number', description: 'Line number, from 1, as on the receipt card.' },
              qty: { type: 'number' },
              unit: { type: 'string' },
              unit_price: { type: 'number' },
              line_total: { type: 'number' },
              name: { type: 'string', description: 'Only if the item name itself was misread.' },
            },
            required: ['line'],
          },
        },
        line_types: {
          type: 'array',
          description:
            'Re-type individual lines without retyping the receipt, e.g. [{line: 3, expense_type: "cogs_food"}]. ' +
            'Lines are numbered from 1, as shown on the receipt card. Lines not named keep their type.',
          items: {
            type: 'object' as const,
            properties: {
              line: { type: 'number', description: 'Line number, from 1.' },
              expense_type: { type: 'string', enum: [...EXPENSE_TYPES] },
            },
            required: ['line', 'expense_type'],
          },
        },
        expense_type: {
          type: 'string',
          enum: [...EXPENSE_TYPES],
          description:
            'The WHOLE receipt is this type -- every line is set to it. For some lines only, use ' +
            'line_types instead. Use owner_drawings when the owner says it was ' +
            'personal - it stays recorded as money out but is not a business expense.',
        },
        remove_lines: {
          type: 'array',
          items: { type: 'number' },
          description: 'Line numbers the owner explicitly said are NOT on the receipt. Never guess these.',
        },
        new_total: {
          type: 'number',
          description:
            'ONLY when the owner says the receipt TOTAL itself was printed/read wrong, in so many words. ' +
            'NEVER work it out from a corrected line: a line fix is a misread, not more money spent, so ' +
            'the total stays. Ignored when sent together with items or line_types. This asks for approval.',
        },
      },
    },
  },
  {
    name: 'fix_in_app',
    description:
      'The owner will correct a filed receipt THEMSELVES in the app: "I\'ll fix it in the app", "leave it, ' +
      'I\'ll correct it on CashFlowOS", "file it, I\'ll sort the lines later". The receipt stays filed exactly ' +
      'as it is (the total and books are untouched); it is put on the To check list on Cash Out and you get ' +
      'the link to its correction page, which shows the photo and every line. Use this INSTEAD of correcting ' +
      'it by chat once they say this -- do not keep asking about the lines.',
    input_schema: {
      type: 'object' as const,
      properties: {
        record_id: { type: 'number', description: 'The record number, when known (e.g. 174). NOT the /undo code.' },
        receipt: { type: 'string', description: 'Otherwise the shop name, or "#174".' },
        amount: { type: 'number', description: 'Optional: the receipt total, to pick the right one.' },
        note: { type: 'string', description: 'Optional: what they said is wrong, in their words, e.g. "straws and chicken promo".' },
      },
    },
  },
  {
    name: 'teach_supplier',
    description:
      'Remember how a specific shop lays out its receipts, so every FUTURE photo from them is read ' +
      'correctly. Use for "for 99 speed mart the first number is a shelf code not the quantity". ' +
      'Only call this once the owner has said yes to remembering it - never straight off the back of ' +
      'a one-off correction. ' +
      'This ADDS a note. A supplier can have several and they all apply together; teaching a new one ' +
      'NEVER erases an older one. If the new note looks like it contradicts one already stored, do ' +
      'NOT decide for the owner: show them the existing note, ask whether to keep both or replace, ' +
      'and only then call this with replaces set.',
    input_schema: {
      type: 'object' as const,
      properties: {
        supplier: { type: 'string', description: 'The shop name as printed on its receipts.' },
        rule: { type: 'string', description: 'Plain English, one or two sentences, describing the layout quirk and what to do about it.' },
        replaces: {
          type: 'number',
          description:
            'ONLY when the owner has explicitly said the new note should replace an existing one: the ' +
            'id of the note to switch off (from list_supplier_rules). Omit to add alongside, which is ' +
            'the default and the right answer unless they said otherwise.',
        },
        example: { type: 'string', description: 'Optional: the correction that prompted this, kept for the record.' },
      },
      required: ['supplier', 'rule'],
    },
  },
  {
    name: 'forget_supplier_rule',
    description:
      'Stop applying a supplier note that turned out to be wrong. Use for "forget what I told you ' +
      'about 99 speed mart". The note stops affecting future reads immediately.',
    input_schema: {
      type: 'object' as const,
      properties: {
        supplier: { type: 'string', description: 'The shop whose note should stop applying.' },
        note_id: {
          type: 'number',
          description:
            'Which note, when the supplier has more than one (from list_supplier_rules). Required ' +
            'once the tool has told you it is ambiguous — never pick one yourself.',
        },
      },
      required: ['supplier'],
    },
  },
]

export const ACTION_TOOL_NAMES = new Set(BOT_ACTION_TOOLS.map(t => t.name))

export type BotActionCtx = { chatId: number; thresholdRM: number; rows: Rec[] }

// Which filed receipt the owner means: a record number exactly, else a unique
// total, else the shop name. Returns the row, or the JSON reply to send back.
function findFiledReceipt(rows: Rec[], input: any, tool: string): Rec | string {
  const q = String(input?.receipt || '').trim()
  // A record number picks the receipt exactly. The fuzzy match below cannot:
  // "#156" is not a shop name, so a correction by number came back not_found
  // and Jarvis told the owner a filed receipt was missing (27 Sep 2026).
  const idAsked = Number(input?.record_id ?? q.match(/^#?\s*(\d+)$/)?.[1])
  if (!q && !Number.isFinite(idAsked)) return JSON.stringify({ status: 'error', message: 'Which receipt?' })
  const byId = Number.isFinite(idAsked) ? rows.find(r => Number(r.id) === idAsked && r.category === 'cash_out') : undefined
  if (Number.isFinite(idAsked) && !byId && !q.replace(/^#?\s*\d+$/, '')) {
    return JSON.stringify({
      status: 'not_found',
      message: `No filed receipt is record #${idAsked}. If that number came after /undo-, it is an undo code, not a record number -- match on the shop and total instead.`,
    })
  }

  const wanted = Number(input?.amount)
  const byAmount = Number.isFinite(wanted)
    ? rows.filter(r => r.category === 'cash_out' && Math.abs(Number(r.amount) - wanted) <= 0.01)
    : []
  // An exact, unique amount IS the identification -- needed for a receipt filed
  // with no shop name, where there is no name to match on.
  const candidates = byId ? [byId] : byAmount.length === 1 ? byAmount : (Number.isFinite(wanted) ? byAmount : rows).filter(r => {
    if (r.category !== 'cash_out') return false
    const hay = `${r.title} ${r.meta?.merchant || ''}`.toLowerCase()
    return sameSupplier(q, String(r.meta?.merchant || r.title)) || hay.includes(q.toLowerCase())
  })
  if (candidates.length === 0) return JSON.stringify({ status: 'not_found', message: `No filed receipt matching "${q}".` })
  if (candidates.length > 1) {
    return JSON.stringify({
      status: 'ambiguous',
      message: 'Which one?',
      candidates: candidates.slice(0, 5).map(r => ({ id: r.id, what: r.title, amount: rm(Number(r.amount)), date: r.due_date })),
      tell_user: `Ask which receipt they mean, then call ${tool} again with the record number.`,
    })
  }
  return candidates[0]
}


// Find at most a few candidate rows by fuzzy name/title match within a category.
function matchRows(rows: Rec[], category: string, q: string, unpaidOnly = false): Rec[] {
  const needle = q.toLowerCase().trim()
  return rows.filter(r => {
    if (r.category !== category) return false
    if (unpaidOnly && ['paid', 'done', 'closed', 'reversed'].includes((r.status || '').toLowerCase())) return false
    const hay = `${r.title} ${r.meta?.customer || ''} ${r.meta?.company || ''}`.toLowerCase()
    return needle ? hay.includes(needle) : false
  })
}

// ------------------------------------------------------------
// runBotAction — execute ONE action tool. Returns a compact JSON string the loop
// feeds back to Claude (so Claude can phrase the final reply, including any /undo
// id or "tap Approve above"). Every write goes through the CAS engine; a duplicate
// or lost race degrades to a calm status. Never throws.
// ------------------------------------------------------------
export async function runBotAction(name: string, input: any, ctx: BotActionCtx): Promise<string> {
  const { chatId, thresholdRM, rows } = ctx
  try {
    // ---- 🟢/🟡 log_expense — mirrors the photo pipeline's dial, text-first. ----
    if (name === 'log_expense') {
      const amount = Number(input?.amount)
      const merchant = String(input?.merchant || '').trim()
      if (!Number.isFinite(amount) || amount <= 0) return JSON.stringify({ status: 'error', message: 'I need a positive amount to log.' })
      const payload = {
        kind: 'receipt', amount, merchant,
        category: input?.category || undefined,
        note: 'Logged via Jarvis (typed, no photo)',
        idempotencyKey: randomUUID(),
      }
      if (amount <= thresholdRM) {
        const done = await runAutopilot('expense', { ...payload, auto: true })
        if (!done) return JSON.stringify({ status: 'noop', message: 'That looked already handled — nothing double-filed.' })
        return JSON.stringify({
          status: 'filed', zone: 'green', record_id: done.result?.record_id ?? null,
          filed: `${rm(done.result.amount)} · ${done.result.category || 'expense'}${merchant ? ' · ' + merchant : ''}`,
          undo: `/undo-${done.row.id}`,
          tell_user: 'Filed automatically because it is at/under the auto-file limit. Call it record #<record_id>; the /undo number is a separate code, never call that the record number. Offer the /undo id.',
        })
      }
      const row = await proposeAndNotify({
        agentKey: 'expense', idempotencyKey: payload.idempotencyKey, payload, chatId,
        text: `🧾 Log expense <b>${rm(amount)}</b>${merchant ? ` · ${merchant}` : ''}? That is over your RM${thresholdRM} auto-file limit.`,
      })
      return JSON.stringify(
        row
          ? { status: 'proposed', zone: 'yellow', sent_buttons: true, tell_user: `Proposed a ${rm(amount)} expense — Approve/Reject buttons sent. Tell them to tap ✅.` }
          : { status: 'noop', message: 'Already waiting on your YES for this one.' },
      )
    }

    // ---- log_drawing — the same dial as log_expense, filed as owner drawings. ----
    // Same threshold on purpose: drawings are still real money leaving the business,
    // so a large one gets the same second look as a large expense.
    if (name === 'log_drawing') {
      const amount = Number(input?.amount)
      if (!Number.isFinite(amount) || amount <= 0) return JSON.stringify({ status: 'error', message: 'I need a positive amount.' })
      const what = String(input?.description || '').trim().slice(0, 80) || 'Owner drawings'
      const payload = {
        kind: 'receipt', amount, merchant: what,
        category: "Owner's drawings",
        expense_type: 'owner_drawings',
        note: 'Owner drawings, logged via Jarvis (no receipt)',
        idempotencyKey: randomUUID(),
      }
      if (amount <= thresholdRM) {
        const done = await runAutopilot('expense', { ...payload, auto: true })
        if (!done) return JSON.stringify({ status: 'noop', message: 'Already recorded.' })
        return JSON.stringify({
          status: 'filed', zone: 'green', record_id: done.result?.record_id ?? null,
          filed: `${rm(amount)} · owner drawings · ${what}`,
          undo: `/undo-${done.row.id}`,
          tell_user: 'Say it is recorded as owner drawings - money out, but not a business expense and not counted against profit. Offer the /undo id.',
        })
      }
      const row = await proposeAndNotify({
        agentKey: 'expense', idempotencyKey: payload.idempotencyKey, payload, chatId,
        text: `👤 Record <b>${rm(amount)}</b> as owner drawings (${what})? Over your RM${thresholdRM} limit, so I'm asking.`,
      })
      return JSON.stringify(
        row
          ? { status: 'proposed', zone: 'yellow', sent_buttons: true, tell_user: 'Over the limit, so buttons were sent. Tell them to tap Approve.' }
          : { status: 'noop', message: 'Already waiting on your YES for this one.' },
      )
    }

    // ---- 🟢 add_task — reversible → autopilot. ----
    if (name === 'add_task') {
      const title = String(input?.title || '').trim()
      if (!title) return JSON.stringify({ status: 'error', message: 'What is the task?' })
      const done = await runAutopilot('add-task', {
        op: 'insert', category: 'task', title, status: 'open',
        due_date: input?.due_date || null,
        meta: { owner: input?.owner || undefined },
        idempotencyKey: randomUUID(),
      })
      if (!done) return JSON.stringify({ status: 'noop', message: 'Already added.' })
      return JSON.stringify({
        status: 'added', zone: 'green', record_id: done.result?.record_id ?? null, task: title,
        due_date: input?.due_date || null, undo: `/undo-${done.row.id}`,
        tell_user: 'Added it (autopilot, reversible). Offer the /undo id.',
      })
    }

    // ---- 🟢 add_lead — reversible → autopilot. ----
    if (name === 'add_lead') {
      const nm = String(input?.name || '').trim()
      if (!nm) return JSON.stringify({ status: 'error', message: 'What is the lead name?' })
      const value = Number(input?.value)
      const done = await runAutopilot('add-lead', {
        op: 'insert', category: 'lead', title: nm,
        amount: Number.isFinite(value) ? value : 0,
        status: input?.stage || 'new',
        meta: { customer: nm, source: input?.source || undefined },
        idempotencyKey: randomUUID(),
      })
      if (!done) return JSON.stringify({ status: 'noop', message: 'Already added.' })
      return JSON.stringify({
        status: 'added', zone: 'green', record_id: done.result?.record_id ?? null, lead: nm,
        value: Number.isFinite(value) ? rm(value) : null, stage: input?.stage || 'new',
        undo: `/undo-${done.row.id}`, tell_user: 'Added the lead (autopilot). Offer the /undo id.',
      })
    }

    // ---- 🟡 log_cash_in — money → ask first. ----
    if (name === 'log_cash_in') {
      const amount = Number(input?.amount)
      const source = String(input?.source || '').trim()
      if (!Number.isFinite(amount) || amount <= 0) return JSON.stringify({ status: 'error', message: 'I need a positive amount.' })
      const row = await proposeAndNotify({
        agentKey: 'log-cash-in',
        idempotencyKey: randomUUID(),
        payload: { op: 'insert', category: 'cash_in', title: source || 'Income', amount, status: 'pending', meta: { customer: input?.customer || undefined } },
        chatId,
        text: `💰 Log income <b>${rm(amount)}</b>${source ? ` from ${source}` : ''}? (Approve to add to Cash In.)`,
      })
      return JSON.stringify(
        row
          ? { status: 'proposed', zone: 'yellow', sent_buttons: true, tell_user: `Proposed ${rm(amount)} income — buttons sent. Tell them to tap ✅.` }
          : { status: 'noop', message: 'Already proposed.' },
      )
    }

    // ---- 🟡 mark_invoice_paid — resolve, then ask first. ----
    if (name === 'mark_invoice_paid') {
      const matches = matchRows(rows, 'cash_in', String(input?.invoice || ''), true)
      if (matches.length === 0) return JSON.stringify({ status: 'not_found', message: `No unpaid invoice matching "${input?.invoice}".` })
      if (matches.length > 1) {
        return JSON.stringify({ status: 'ambiguous', message: 'Which one?', candidates: matches.slice(0, 5).map(r => ({ id: r.id, title: r.title, who: r.meta?.customer || null, amount: rm(r.amount) })) })
      }
      const inv = matches[0]
      const row = await proposeAndNotify({
        agentKey: 'mark-paid',
        idempotencyKey: randomUUID(),
        payload: { op: 'update', record_id: inv.id, status: 'paid' },
        chatId,
        text: `💰 Mark <b>${inv.title}</b> (${rm(inv.amount)}) as <b>PAID</b>? (Approve to confirm.)`,
      })
      return JSON.stringify(
        row
          ? { status: 'proposed', zone: 'yellow', sent_buttons: true, record_id: inv.id, tell_user: `Proposed marking "${inv.title}" paid — buttons sent. Tell them to tap ✅.` }
          : { status: 'noop', message: 'Already proposed.' },
      )
    }

    // ---- 🟡 update_lead_status — resolve, then ask first. ----
    if (name === 'update_lead_status') {
      const stage = String(input?.stage || '').toLowerCase()
      const valid = ['new', 'contacted', 'appointment', 'closed', 'nurture']
      if (!valid.includes(stage)) return JSON.stringify({ status: 'error', message: `Stage must be one of ${valid.join(', ')}.` })
      const matches = matchRows(rows, 'lead', String(input?.lead || ''))
      if (matches.length === 0) return JSON.stringify({ status: 'not_found', message: `No lead matching "${input?.lead}".` })
      if (matches.length > 1) {
        return JSON.stringify({ status: 'ambiguous', message: 'Which lead?', candidates: matches.slice(0, 5).map(r => ({ id: r.id, name: r.meta?.customer || r.title, stage: r.status })) })
      }
      const lead = matches[0]
      const row = await proposeAndNotify({
        agentKey: 'lead-status',
        idempotencyKey: randomUUID(),
        payload: { op: 'update', record_id: lead.id, status: stage },
        chatId,
        text: `🎯 Move <b>${lead.meta?.customer || lead.title}</b> to <b>${stage}</b>? (Approve to update the pipeline.)`,
      })
      return JSON.stringify(
        row
          ? { status: 'proposed', zone: 'yellow', sent_buttons: true, record_id: lead.id, tell_user: `Proposed moving "${lead.meta?.customer || lead.title}" to ${stage} — buttons sent. Tell them to tap ✅.` }
          : { status: 'noop', message: 'Already proposed.' },
      )
    }

    // ---- correct_receipt -----------------------------------------------------
    // The owner is ground truth about their own receipt, so a correction that
    // leaves the TOTAL alone is metadata, not money: it just runs. A correction
    // that changes the total IS money truth and asks first.
    //
    // There is deliberately no /undo offered here: /undo posts a reversing ROW,
    // which is right for "you filed something you shouldn't have" and wrong for
    // "you read the lines wrong". The previous lines are kept in meta.prev_items
    // instead, so the change stays recoverable.
    if (name === 'correct_receipt') {
      const found = findFiledReceipt(rows, input, 'correct_receipt')
      if (typeof found === 'string') return found
      const target = found

      // Rebuild the lines from what the owner said: a line total they state, or
      // qty x unit price. A quantity-only fix keeps the line's money (keepLineMoney).
      const rawItems = Array.isArray(input?.items) ? input.items : null
      const prevLines: any[] = Array.isArray(target.meta?.items) ? target.meta.items : []
      let items = rawItems
        ? (rawItems.map((i: any) => {
            const qty = Number(i?.qty)
            // "RM 43.20 for 90" -- a line total the owner states wins, and the
            // unit price is worked out from it.
            const lineTotal = Number(i?.line_total)
            const price = Number.isFinite(lineTotal) && lineTotal >= 0 && qty > 0 ? lineTotal / qty : Number(i?.unit_price)
            if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) return null
            const name = String(i?.name || '').trim().slice(0, 80) || 'Item'
            // Same line, same product: keep what identifies it for stock and prices.
            const old = prevLines.find(p => String(p?.name ?? '').trim().toLowerCase() === name.toLowerCase())
            return {
              ...(old ? { key: old.key, group: old.group, pack_size: old.pack_size, pack_unit: old.pack_unit } : {}),
              name,
              qty: Math.round(qty * 1000) / 1000,
              unit: String(i?.unit || 'unit').toLowerCase().slice(0, 12),
              unit_price: Math.round(price * 10000) / 10000,
              line_total: Number.isFinite(lineTotal) && lineTotal >= 0 ? Math.round(lineTotal * 100) / 100 : Math.round(qty * price * 100) / 100,
              expense_type: i?.expense_type,
            }
          }).filter(Boolean) as any[])
        : undefined
      // Patch lines by number. Resending all sixteen lines to fix one is how
      // six of Sri Ternak #174's lines -- and its chicken breast stock -- were
      // lost (27 Sep 2026); a patch cannot drop what it does not mention.
      const fixes = Array.isArray(input?.line_fixes) ? input.line_fixes : null
      if (fixes?.length) {
        if (items?.length) return JSON.stringify({ status: 'error', message: 'Send line_fixes OR items, not both.' })
        const patched = prevLines.map(i => ({ ...i }))
        for (const f of fixes) {
          const n = Number(f?.line)
          const it = patched[n - 1]
          if (!it) return JSON.stringify({ status: 'error', message: `This receipt has ${patched.length} lines; there is no line ${f?.line}.` })
          const qty = Number(f?.qty)
          if (Number.isFinite(qty) && qty > 0) it.qty = Math.round(qty * 1000) / 1000
          if (typeof f?.unit === 'string' && f.unit.trim()) it.unit = f.unit.trim().toLowerCase().slice(0, 12)
          if (typeof f?.name === 'string' && f.name.trim()) it.name = f.name.trim().slice(0, 80)
          const lt = Number(f?.line_total)
          const up = Number(f?.unit_price)
          if (Number.isFinite(lt) && lt >= 0) { it.line_total = Math.round(lt * 100) / 100; it.unit_price = Math.round((lt / it.qty) * 10000) / 10000 }
          else if (Number.isFinite(up) && up >= 0) { it.unit_price = up; it.line_total = Math.round(it.qty * up * 100) / 100 }
          else it.line_total = Math.round(it.qty * Number(it.unit_price) * 100) / 100
          // Derived from the old quantity -- re-derived on the next read.
          delete it.base_qty; delete it.price_per_base
          if (it.unit === 'kg' || it.unit === 'l') { it.base_qty = it.qty; it.base_unit = it.unit; it.price_per_base = Math.round((it.line_total / it.qty) * 100) / 100 }
        }
        items = patched
      } else if (items?.length && items.length < prevLines.length) {
        const removing = new Set((Array.isArray(input?.remove_lines) ? input.remove_lines : []).map(Number))
        if (prevLines.length - items.length !== removing.size) {
          return JSON.stringify({
            status: 'error',
            message:
              `This receipt has ${prevLines.length} lines and you sent ${items.length}. To fix a line, use ` +
              'line_fixes with its number; nothing else changes. Only drop lines the owner said are not on the receipt, via remove_lines.',
          })
        }
      }
      if (items?.length) {
        items = keepLineMoney(items, prevLines, Number(target.amount))
      }

      // A LINE correction never moves the money. Jarvis read "line 8 is 4.08 kg,
      // RM 89.76 not RM 29.76" as RM 60 more spent and proposed RM 265.10 ->
      // RM 325.10; the owner had to refuse it twice and the line fix was lost
      // with it (#174, 27 Sep 2026). So a total sent alongside lines is dropped:
      // the lines are fixed now, and a total change must be asked for on its own.
      const linesSent = !!(rawItems?.length || fixes?.length || (Array.isArray(input?.line_types) && input.line_types.length))
      const newTotal = linesSent ? NaN : Number(input?.new_total)
      const totalIgnored = linesSent && Number.isFinite(Number(input?.new_total)) &&
        Math.abs(Number(input.new_total) - Number(target.amount)) > 0.01
      const totalChanges =
        Number.isFinite(newTotal) && newTotal > 0 && Math.abs(newTotal - Number(target.amount)) > 0.01
      const expenseType = typeof input?.expense_type === 'string' ? input.expense_type : undefined
      const lineTypes = Array.isArray(input?.line_types) ? input.line_types : undefined
      const merchantFix = String(input?.merchant || '').trim().slice(0, 120)
      if (!items?.length && !expenseType && !lineTypes?.length && !totalChanges && !merchantFix) {
        return JSON.stringify({ status: 'error', message: 'Nothing to correct -- tell me the lines, the shop, the expense type, or the total.' })
      }

      const meta: any = {
        ...(target.meta || {}),
        corrected_by: 'owner',
        corrected_at: new Date().toISOString().slice(0, 10),
      }
      if (merchantFix) meta.merchant = merchantFix
      // A new correction is judged afresh: an earlier "it's correct" no longer vouches for it.
      delete meta.checked_ok; delete meta.fixed_note

      // Lines and types move together, and the split is rebuilt from them, so
      // the receipt can never say one thing in its lines and another in its split.
      const prevItems = Array.isArray(target.meta?.items) ? target.meta.items : []
      let fix: ReturnType<typeof applyLineFix> | undefined
      if (items?.length || lineTypes?.length || (expenseType && prevItems.length)) {
        fix = applyLineFix({
          prevItems, items, lineTypes, wholeType: expenseType,
          amount: totalChanges ? newTotal : Number(target.amount),
        })
        if (!fix.ok) return JSON.stringify({ status: 'error', message: fix.message })
        if (fix.changed) {
          meta.prev_items = prevItems
          meta.items = fix.items
          if (items?.length) delete meta.items_note
        }
        if (fix.type_split) meta.type_split = fix.type_split
        else delete meta.type_split
        if (fix.expense_type) meta.expense_type = fix.expense_type
      } else if (expenseType) {
        // No lines to carry it: the receipt-level type is all there is.
        meta.expense_type = expenseType
        delete meta.type_split
      }

      // The total moved -- money truth, so it goes to the buttons.
      if (totalChanges) {
        const row = await proposeAndNotify({
          agentKey: 'correct-receipt',
          idempotencyKey: randomUUID(),
          payload: { op: 'update', record_id: target.id, meta, amount: newTotal },
          chatId,
          text: `\u270f\ufe0f Change <b>${target.title}</b> from <b>${rm(Number(target.amount))}</b> to <b>${rm(newTotal)}</b>? That moves the money, so I am asking first.`,
        })
        return JSON.stringify(
          row
            ? { status: 'proposed', zone: 'yellow', sent_buttons: true, tell_user: 'The total changes, so I sent Approve/Reject buttons. Tell them to tap the tick.' }
            : { status: 'noop', message: 'Already waiting on your YES for that one.' },
        )
      }

      // Lines / type only -- the money is untouched, so just do it.
      const done = await runAutopilot('correct-receipt', {
        op: 'update', record_id: target.id, meta, idempotencyKey: randomUUID(),
        // Naming the shop renames the row too, so Cash Out stops saying "Receipt".
        ...(merchantFix ? { title: `${merchantFix} — ${String(target.title).split(' — ').slice(1).join(' — ') || 'expense'}` } : {}),
      })
      if (!done) return JSON.stringify({ status: 'noop', message: 'Already corrected.' })
      return JSON.stringify({
        status: 'corrected',
        zone: 'green',
        record_id: target.id,
        receipt: target.title,
        total_unchanged: rm(Number(target.amount)),
        ...(totalIgnored ? { total_not_changed: `The total stays ${rm(Number(target.amount))}: fixing a line never changes what was paid.` } : {}),
        // What was SAVED, line by line -- Jarvis repeats this, not the request.
        lines: describeLines(meta.items ?? []),
        split: describeSplit(meta.type_split) ?? null,
        expense_type: meta.expense_type,
        // The stock is redone from the corrected lines (agents/registry.ts), so
        // say what went on the shelf -- never "stock only updates at first filing".
        // Said out loud, never smoothed over: lines that don't add up to the total.
        lines_mismatch: (() => {
          const sum = Math.round((meta.items ?? []).reduce((t: number, i: any) => t + (Number(i.line_total) || 0), 0) * 100) / 100
          return Math.abs(sum - Number(target.amount)) > 0.05 ? `Lines add to ${rm(sum)} but the receipt total is ${rm(Number(target.amount))}.` : null
        })(),
        stock_added: (done.result as any)?.stock_added ?? [],
        stock_unsized: (done.result as any)?.stock_unsized ?? [],
        tell_user:
          `Confirm what it now says for record #${target.id}, listing every line exactly as in "lines" ` +
          '(each one says what it is filed as) and the "split" if there is one. ' +
          'If "lines_mismatch" is set, say it plainly and ask the owner which line is wrong -- do NOT ' +
          'claim the receipt is right. ' +
          'Then say what the stock now has from this receipt, from "stock_added" (item and qty); if it is ' +
          'empty, say none of these lines are stock items. Name anything in "stock_unsized" as needing a ' +
          'weight on the Stock page. ' +
          'Then ASK whether to remember this as a standing rule for this ' +
          'supplier so future receipts read correctly, and only call teach_supplier if they say yes. ' +
          'Do not mention /undo -- say they can just tell you if it is still wrong.',
      })
    }

    // ---- teach_supplier ------------------------------------------------------
    // Reversible, visible on the Cash Out tab, and Jarvis has already asked in the
    // conversation -- so this runs rather than sending a second set of buttons.
    //
    // It ADDS. A supplier accumulates notes and they all apply together, because
    // the owner may have told us several true things about the same shop. An older
    // note is only ever switched off when they have explicitly said to replace it
    // (`replaces`), never because this code guessed the two were in conflict --
    // guessing that is how you silently throw away something they said.
    // ---- fix_in_app -----------------------------------------------------------
    // "I'll correct it in the app" (owner, 27 Sep 2026): after a chat correction
    // went round in circles on a 16-line bill, the owner wanted a way to say
    // "stop, it's filed, I'll fix it with the photo". Only a flag moves -- no
    // money, no lines -- so it just runs. The correction page clears it on save.
    if (name === 'fix_in_app') {
      const found = findFiledReceipt(rows, input, 'fix_in_app')
      if (typeof found === 'string') return found
      const note = String(input?.note || '').trim().slice(0, 160)
      const meta: any = { ...(found.meta || {}), fix_later: true, ...(note ? { fix_later_note: note } : {}) }
      const done = await runAutopilot('fix-in-app', { op: 'update', record_id: found.id, meta, idempotencyKey: randomUUID() })
      if (!done) return JSON.stringify({ status: 'noop', message: 'Already on the To check list.' })
      const url = fixUrl(found.id)
      return JSON.stringify({
        status: 'parked',
        zone: 'green',
        record_id: found.id,
        receipt: found.title,
        total_unchanged: rm(Number(found.amount)),
        link: url || null,
        tell_user:
          `Say record #${found.id} (${found.title}, ${rm(Number(found.amount))}) is filed as it is and is on the ` +
          'To check list on Cash Out' + (url ? `, and give this link to fix it with the photo: ${url}` : '') +
          '. Keep it to two lines. Do not ask about the lines again.',
      })
    }

    if (name === 'teach_supplier') {
      const rule = normaliseRule(String(input?.supplier || ''), String(input?.rule || ''))
      if (!rule) return JSON.stringify({ status: 'error', message: 'I need both a supplier and what to remember about their receipts.' })

      const forSupplier = rows.filter(r => r.category === 'supplier_rule' && sameSupplier(r.title, rule.supplier))
      const active = forSupplier.filter(r => r.status !== 'off')

      // An exact repeat of something already stored is a no-op, not a second copy.
      const dupe = active.find(r => sameRuleText(String(r.notes || ''), rule.rule))
      if (dupe) {
        return JSON.stringify({
          status: 'already_known', supplier: rule.supplier, rule: rule.rule,
          tell_user: 'Say you already have that exact note for them, so nothing changed.',
        })
      }

      // Only switch an old note off when the owner named it.
      const replaceId = Number(input?.replaces)
      let replaced: string | null = null
      if (Number.isFinite(replaceId)) {
        const victim = forSupplier.find(r => r.id === replaceId)
        if (!victim) {
          return JSON.stringify({
            status: 'error',
            message: `I have no note #${replaceId} for ${rule.supplier} to replace.`,
            tell_user: 'Ask them which existing note they meant, using list_supplier_rules.',
          })
        }
        await runAutopilot('teach-supplier', {
          op: 'update', record_id: victim.id, status: 'off',
          meta: { ...(victim.meta || {}), replaced_at: new Date().toISOString().slice(0, 10) },
          idempotencyKey: randomUUID(),
        })
        replaced = String(victim.notes || '')
      }

      const done = await runAutopilot('teach-supplier', {
        op: 'insert',
        category: 'supplier_rule',
        title: rule.supplier,
        status: 'active',
        note: rule.rule,
        meta: {
          supplier_key: rule.key,
          taught_at: new Date().toISOString().slice(0, 10),
          taught_via: 'jarvis',
          example: String(input?.example || '').trim().slice(0, 200) || undefined,
        },
        idempotencyKey: randomUUID(),
      })
      if (!done) return JSON.stringify({ status: 'noop', message: 'Already saved that one.' })

      return JSON.stringify({
        status: replaced ? 'rule_replaced' : 'rule_added',
        zone: 'green',
        supplier: rule.supplier,
        rule: rule.rule,
        replaced,
        now_applying: active.filter(r => r.id !== replaceId).map(r => r.notes).concat(rule.rule),
        tell_user:
          'Confirm it is saved and say it applies from the NEXT photo of that supplier onwards, not ' +
          'to receipts already filed. If now_applying has more than one entry, say plainly that this ' +
          'was ADDED to what they told you before and list what is now applied, so they can see ' +
          'nothing was lost. Mention they can see and switch off any of them on the Cash Out tab.',
      })
    }

    // ---- forget_supplier_rule ------------------------------------------------
    // Switched off, not deleted: the owner should still be able to see what was
    // once being applied, and when it stopped.
    if (name === 'forget_supplier_rule') {
      const who = String(input?.supplier || '').trim()
      const noteId = Number(input?.note_id)
      if (!who && !Number.isFinite(noteId)) return JSON.stringify({ status: 'error', message: 'Forget the note for which supplier?' })

      const live = rows.filter(r => r.category === 'supplier_rule' && r.status !== 'off' &&
        (Number.isFinite(noteId) ? r.id === noteId : sameSupplier(r.title, who)))
      if (live.length === 0) return JSON.stringify({ status: 'not_found', message: `I have no active note for "${who}".` })
      // A supplier can have several notes. Forgetting the wrong one loses something
      // they told us, so when it is not obvious we ask instead of picking.
      if (live.length > 1) {
        return JSON.stringify({
          status: 'ambiguous',
          message: `${live.length} notes are stored for ${live[0].title}.`,
          candidates: live.map(r => ({ id: r.id, rule: r.notes })),
          tell_user: 'List them and ask WHICH note to forget, then call again with note_id. Do not guess.',
        })
      }
      const hit = live[0]
      const done = await runAutopilot('teach-supplier', {
        op: 'update',
        record_id: hit.id,
        status: 'off',
        meta: { ...(hit.meta || {}), forgotten_at: new Date().toISOString().slice(0, 10) },
        idempotencyKey: randomUUID(),
      })
      if (!done) return JSON.stringify({ status: 'noop', message: 'Already forgotten.' })
      return JSON.stringify({
        status: 'rule_off',
        zone: 'green',
        supplier: hit.title,
        was: hit.notes,
        tell_user: 'Say it will no longer be applied, and that it is still listed (switched off) on the Cash Out tab.',
      })
    }

    return JSON.stringify({ status: 'error', message: `unknown action "${name}"` })
  } catch (e: any) {
    console.error('[CFO] bot action failed:', e)
    return JSON.stringify({ status: 'error', message: 'that action failed — try again or do it in the app' })
  }
}
