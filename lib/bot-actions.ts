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
      'AFTER a successful correction you MUST ask whether to remember it as a standing rule for that ' +
      'supplier, and only call teach_supplier if they say yes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        receipt: { type: 'string', description: 'Supplier name or what to match the filed receipt on (e.g. "99 speed mart", "the rice one").' },
        amount: { type: 'number', description: 'Optional: the receipt total, to pick the right one when several match.' },
        items: {
          type: 'array',
          description: 'The corrected lines. Give ALL lines for the receipt, not just the changed one.',
          items: {
            type: 'object' as const,
            properties: {
              name: { type: 'string', description: 'Item name as printed.' },
              qty: { type: 'number', description: 'How many units.' },
              unit: { type: 'string', description: 'kg, g, l, ml, pcs, pkt, bottle...' },
              unit_price: { type: 'number', description: 'RM for ONE unit, as printed.' },
            },
            required: ['name', 'qty', 'unit_price'],
          },
        },
        expense_type: {
          type: 'string',
          enum: [...EXPENSE_TYPES],
          description:
            'Optional corrected expense type. Use owner_drawings when the owner says it was ' +
            'personal - it stays recorded as money out but is not a business expense.',
        },
        new_total: { type: 'number', description: 'Only if the TOTAL itself was read wrong. This asks for approval.' },
      },
      required: ['receipt'],
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
          status: 'filed', zone: 'green', record_id: done.row.id,
          filed: `${rm(done.result.amount)} · ${done.result.category || 'expense'}${merchant ? ' · ' + merchant : ''}`,
          undo: `/undo-${done.row.id}`,
          tell_user: 'Filed automatically because it is at/under the auto-file limit. Offer the /undo id.',
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
          status: 'filed', zone: 'green', record_id: done.row.id,
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
        status: 'added', zone: 'green', record_id: done.row.id, task: title,
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
        status: 'added', zone: 'green', record_id: done.row.id, lead: nm,
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
      const q = String(input?.receipt || '').trim()
      if (!q) return JSON.stringify({ status: 'error', message: 'Which receipt?' })

      const wanted = Number(input?.amount)
      const candidates = rows.filter(r => {
        if (r.category !== 'cash_out') return false
        if (Number.isFinite(wanted) && Math.abs(Number(r.amount) - wanted) > 0.01) return false
        const hay = `${r.title} ${r.meta?.merchant || ''}`.toLowerCase()
        return sameSupplier(q, String(r.meta?.merchant || r.title)) || hay.includes(q.toLowerCase())
      })
      if (candidates.length === 0) return JSON.stringify({ status: 'not_found', message: `No filed receipt matching "${q}".` })
      if (candidates.length > 1) {
        return JSON.stringify({
          status: 'ambiguous',
          message: 'Which one?',
          candidates: candidates.slice(0, 5).map(r => ({ id: r.id, what: r.title, amount: rm(Number(r.amount)), date: r.due_date })),
          tell_user: 'Ask which receipt they mean, then call correct_receipt again with the amount.',
        })
      }
      const target = candidates[0]

      // Rebuild the lines from what the owner said. qty x unit_price is the truth
      // here, so we compute the line total rather than asking for one they never
      // mentioned -- the same rule the photo path uses.
      const rawItems = Array.isArray(input?.items) ? input.items : null
      const items = rawItems
        ? (rawItems.map((i: any) => {
            const qty = Number(i?.qty)
            const price = Number(i?.unit_price)
            if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) return null
            return {
              name: String(i?.name || '').trim().slice(0, 80) || 'Item',
              qty: Math.round(qty * 1000) / 1000,
              unit: String(i?.unit || 'unit').toLowerCase().slice(0, 12),
              unit_price: Math.round(price * 100) / 100,
              line_total: Math.round(qty * price * 100) / 100,
            }
          }).filter(Boolean) as any[])
        : undefined

      const newTotal = Number(input?.new_total)
      const totalChanges =
        Number.isFinite(newTotal) && newTotal > 0 && Math.abs(newTotal - Number(target.amount)) > 0.01
      const expenseType = typeof input?.expense_type === 'string' ? input.expense_type : undefined
      if (!items?.length && !expenseType && !totalChanges) {
        return JSON.stringify({ status: 'error', message: 'Nothing to correct -- tell me the lines, the expense type, or the total.' })
      }

      const meta: any = {
        ...(target.meta || {}),
        corrected_by: 'owner',
        corrected_at: new Date().toISOString().slice(0, 10),
      }
      if (items?.length) {
        if (target.meta?.items) meta.prev_items = target.meta.items
        meta.items = items
        delete meta.items_note
      }
      if (expenseType) meta.expense_type = expenseType

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
      })
      if (!done) return JSON.stringify({ status: 'noop', message: 'Already corrected.' })
      return JSON.stringify({
        status: 'corrected',
        zone: 'green',
        record_id: target.id,
        receipt: target.title,
        total_unchanged: rm(Number(target.amount)),
        items: items?.map(i => `${i.qty} ${i.unit} ${i.name} @ ${rm(i.unit_price)}`),
        expense_type: expenseType ?? target.meta?.expense_type,
        tell_user:
          'Confirm what it now says. Then ASK whether to remember this as a standing rule for this ' +
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
