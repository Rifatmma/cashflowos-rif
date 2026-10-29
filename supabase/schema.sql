-- ============================================================
-- CASHFLOWOS AI AGENTS — your Money Robot's database.
-- Paste this WHOLE block into the Supabase SQL Editor (your own free project)
-- and click Run once. Safe to re-run: it never duplicates or deletes your rows
-- (create-if-not-exists · add-column-if-not-exists · seeds guarded by NOT EXISTS).
-- ============================================================

-- ------------------------------------------------------------
-- 1) records — the business spine. One row = one thing you track.
--    Categories: cash_in | cash_out | lead | customer | content | task | doc
-- ------------------------------------------------------------
create table if not exists records (
  id          bigint generated always as identity primary key,
  title       text        not null,
  status      text        not null default 'open',   -- free text; leads use the funnel stages
  amount      numeric     default 0,                 -- RM value if money-related, else 0
  category    text,                                  -- cash_in | cash_out | lead | customer | content | task | doc
  due_date    date,
  notes       text,
  meta        jsonb       not null default '{}'::jsonb, -- extra per-tab fields (platform, format, views, next...)
  created_at  timestamptz not null default now()
);
alter table records add column if not exists meta jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------
-- 2) agent_actions — the proposals/approvals table. THE HITL HEART.
--    A robot's wish is written here ONCE, a human (or the autopilot dial) decides,
--    then it's claimed + executed exactly once. Never fold this into records.
-- ------------------------------------------------------------
create table if not exists agent_actions (
  id                bigint generated always as identity primary key,
  agent_key         text        not null,
  idempotency_key   text        not null unique,      -- dedupe: one wish per event
  payload           jsonb       not null,             -- written once, immutable
  status            text        not null default 'proposed',
                    -- proposed | approved | rejected | expired | executing | executed | failed
  proposed_at       timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '24 hours'),
  decided_at        timestamptz,
  executed_at       timestamptz,
  approver_chat_id  bigint,                            -- null = decided by the robot (autopilot)
  result            jsonb,
  error             text,
  notify_chat_id    bigint,                            -- captured from sendWithButtons()...
  notify_message_id bigint                             -- ...so the in-app approve path can strip the buttons
);
-- add-column-if-not-exists guards, in case an older version of this file ran first
alter table agent_actions add column if not exists notify_chat_id    bigint;
alter table agent_actions add column if not exists notify_message_id bigint;
alter table agent_actions add column if not exists result            jsonb;
alter table agent_actions add column if not exists error             text;

-- ------------------------------------------------------------
-- 3) agent_runs — one row per agent invocation. Feeds the Activity view.
-- ------------------------------------------------------------
create table if not exists agent_runs (
  id          bigint generated always as identity primary key,
  agent_key   text        not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  outcome     text,                                    -- ok | escalated | failed | noop ...
  detail      jsonb       not null default '{}'::jsonb
);

-- ------------------------------------------------------------
-- 4) vault_files — uploaded receipts/docs. The dedupe constraint lives HERE
--    (sha256 unique), not in a jsonb expression index.
-- ------------------------------------------------------------
create table if not exists vault_files (
  id                   bigint generated always as identity primary key,
  sha256               text        not null unique,     -- same file twice = same hash = skip
  storage_path         text,
  mime                 text,
  size_bytes           bigint,
  uploaded_by_chat_id  bigint,
  record_id            bigint,                           -- links to the records row it created
  created_at           timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5) bot_memory — the bot's short-term memory + per-chat daily counters
--    (e.g. the vision-call cost cap). Read/written by lib/bot-memory.ts.
-- ------------------------------------------------------------
create table if not exists bot_memory (
  chat_id     bigint      primary key,
  turns       jsonb       not null default '[]'::jsonb,
  counters    jsonb       not null default '{}'::jsonb,  -- {"vision:2026-07-23": 3}
  updated_at  timestamptz not null default now()
);
alter table bot_memory add column if not exists counters jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------
-- 6) tg_updates — Telegram delivery dedupe. Telegram RETRIES un-acked webhooks;
--    inserting the update_id here 'on conflict do nothing' means a retry of an
--    in-flight update is a 0-row no-op → we never double-process a photo.
-- ------------------------------------------------------------
create table if not exists tg_updates (
  update_id   bigint      primary key,
  received_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Security: server-side only. Your Next.js server uses the SERVICE_ROLE key,
-- which bypasses RLS. Enabling RLS with NO policies means anon/public gets
-- nothing — exactly what we want. Never expose these rows via a public route.
-- ------------------------------------------------------------
alter table records       enable row level security;
alter table agent_actions enable row level security;
alter table agent_runs    enable row level security;
alter table vault_files   enable row level security;
alter table bot_memory    enable row level security;
alter table tg_updates    enable row level security;

-- ------------------------------------------------------------
-- Private storage bucket for uploaded photos/PDFs. public=false → the UI can only
-- reach files through short-lived server-generated signed URLs.
-- If your Supabase blocks this insert, create a bucket named "vault" (Public =
-- OFF) in the dashboard Storage tab — 2 clicks. The app shows a calm banner if
-- the bucket is missing.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;

-- ============================================================
-- SEED ROWS — so EVERY tab + EVERY funnel stage shows something on minute one.
-- Guarded by "where not exists (select 1 from records)" → re-running is SAFE.
-- Day 2: clear these and import your own real data.
-- ============================================================
insert into records (title, status, amount, category, due_date, notes, meta)
select * from (values
  -- ---- Cash In (paid vs waiting; the overdue one = "who owes me") ----
  ('Payment — Acme retainer',   'paid',    5000, 'cash_in',  current_date - 3,  'Received via bank transfer',         '{}'::jsonb),
  ('Invoice #014 — Lai Holdings','waiting', 2400, 'cash_in',  current_date - 5,  'OVERDUE — chase payment',            '{"customer":"Lai Holdings"}'::jsonb),
  ('Invoice #015 — Cendana',     'waiting', 3200, 'cash_in',  current_date + 9,  'Sent, due next week',                '{"customer":"Cendana Group"}'::jsonb),
  -- ---- Cash Out (incl. an auto-filed receipt) ----
  ('Meta Ads — June',            'paid',     450, 'cash_out', current_date - 2,  'Monthly ad spend',                   '{}'::jsonb),
  ('Lunch meeting — client',     'filed',     45, 'cash_out', current_date,      'Auto-filed by the Vault 🟢',         '{"merchant":"Nasi Kandar","auto_filed":true,"category":"Meals"}'::jsonb),
  ('Software — Notion',          'paid',      38, 'cash_out', current_date - 8,  'Annual plan',                        '{"category":"Software"}'::jsonb),
  -- ---- Leads: ONE at EVERY funnel stage so the Dashboard funnel is non-empty ----
  ('Daniel Tan — Tan F&B',       'new',       4500, 'lead',   current_date + 5,  'From IG ad',                         '{"next":"qualify","potential":4500}'::jsonb),
  ('Aisha Rahman — Acme',        'contacted', 5000, 'lead',   current_date + 3,  'Warm inbound, replied',              '{"next":"book demo","potential":5000}'::jsonb),
  ('Keith Lim — Cendana',        'appointment',6000,'lead',   current_date + 2,  'Demo booked Thursday 3pm',           '{"next":"run demo","potential":6000}'::jsonb),
  ('Beta Trading',               'closed',    3200, 'lead',   null,              'Won — moving to onboarding',         '{"next":"onboard","potential":3200}'::jsonb),
  ('Mei Wong — cold',            'nurture',   2000, 'lead',   current_date + 20, 'Went quiet — long-term nurture',     '{"next":"monthly check-in","potential":2000}'::jsonb),
  -- ---- Customers ----
  ('Beta Trading',               'active',       0, 'customer', null,            'Onboarding this week',               '{"owes":0,"company":"Beta Trading","last_touch":"2026-07-20","next":"kickoff call"}'::jsonb),
  ('Caremetic Sdn Bhd',          'active',    1500, 'customer', current_date + 7,'Retainer client',                    '{"owes":1500,"company":"Caremetic Sdn Bhd","last_touch":"2026-07-18","next":"send report"}'::jsonb),
  -- ---- Content (marketing calendar; meta.views drives the funnel's Views) ----
  ('Reel: 3 ways AI saves time', 'posted',       0, 'content', current_date - 2, 'Best performer',                     '{"platform":"IG","format":"reel","views":12000}'::jsonb),
  ('Case study carousel',        'scheduled',    0, 'content', current_date + 3, 'For LinkedIn',                       '{"platform":"LinkedIn","format":"carousel","views":0}'::jsonb),
  ('Promo ad — workshop',        'draft',        0, 'content', current_date + 5, 'Paid ad creative',                   '{"platform":"IG","format":"ad","views":0}'::jsonb),
  -- ---- Tasks (one overdue → flagged) ----
  ('Follow up Keith',            'open',         0, 'task',    current_date + 2,  'Send proposal recap',                '{}'::jsonb),
  ('Send July invoices',         'open',         0, 'task',    current_date - 1,  'OVERDUE',                            '{}'::jsonb),
  -- ---- Doc ----
  ('SSM registration cert',      'filed',        0, 'doc',     null,              'Company docs',                       '{"kind":"doc"}'::jsonb),
  -- ---- Leads (more): full funnel spread, deal values RM3,000-RM15,000 ----
  ('Farah Ismail — Ismail Consulting', 'new',          4500, 'lead', current_date + 6,  'From IG DM',                           '{"customer":"Farah Ismail","next":"qualify","source":"ig"}'::jsonb),
  ('Danial Haikal — Haikal Motors',    'new',          3000, 'lead', current_date + 4,  'Referred by Aisha',                    '{"customer":"Danial Haikal","next":"send info pack","source":"referral"}'::jsonb),
  ('Farid Hassan — Hassan Logistics',  'contacted',    7500, 'lead', current_date + 8,  'Replied to follow-up, wants pricing',  '{"customer":"Farid Hassan","next":"send quote","source":"ad"}'::jsonb),
  ('Priya Nair — Nair Dental',         'appointment',  9000, 'lead', current_date + 3,  'Demo booked Tuesday 11am',             '{"customer":"Priya Nair","next":"run demo","source":"referral"}'::jsonb),
  ('Chong Wei Jian — CWJ Auto',        'appointment', 12000, 'lead', current_date + 5,  'Discovery call scheduled',             '{"customer":"Chong Wei Jian","next":"discovery call","source":"ig"}'::jsonb),
  ('Rajesh Kumar — Kumar Textiles',    'closed',      15000, 'lead', current_date - 2,  'Signed — biggest deal this month',     '{"customer":"Rajesh Kumar","next":"onboard","source":"ad"}'::jsonb),
  ('Siti Aminah — Aminah Boutique',    'nurture',      3500, 'lead', current_date + 30, 'Not ready yet, check back next month', '{"customer":"Siti Aminah","next":"monthly check-in","source":"referral"}'::jsonb),
  -- ---- Cash In (more): 2 overdue + 2 paid, so "who owes me" always has real answers ----
  ('Invoice #021 — Zul Hardware', 'pending', 1800, 'cash_in', current_date - 5,  'OVERDUE — 5 days, send reminder',  '{"customer":"Zul Hardware"}'::jsonb),
  ('Invoice #022 — Nur Trading',  'pending', 4200, 'cash_in', current_date - 12, 'OVERDUE — 12 days, call urgently', '{"customer":"Nur Trading"}'::jsonb),
  ('Invoice #023 — Sunrise Cafe', 'paid',    2600, 'cash_in', current_date - 4,  'Paid on time',                     '{"customer":"Sunrise Cafe"}'::jsonb),
  ('Invoice #024 — Bina Jaya',    'paid',    3900, 'cash_in', current_date - 10, 'Settled via bank transfer',        '{"customer":"Bina Jaya"}'::jsonb),
  -- ---- Tasks (more): today / this week / next week, so "what's due" always has all three ----
  ('Call Farah Ismail — confirm scope', 'open', 0, 'task', current_date,      'Due today',     '{"owner":"Kingsley"}'::jsonb),
  ('Prep workshop slides',              'open', 0, 'task', current_date + 3,  'Due this week', '{"owner":"Amirah"}'::jsonb),
  ('Quarterly review — Caremetic',      'open', 0, 'task', current_date + 10, 'Due next week', '{"owner":"Kingsley"}'::jsonb),
  -- ---- Content (more): posted / scheduled / draft, exact meta shape the bot reads ----
  ('Reel — client testimonial',    'posted',    0, 'content', current_date - 4, 'Posted to IG',        '{"platform":"instagram","format":"reel","views":4200}'::jsonb),
  ('TikTok — quick tip video',     'scheduled', 0, 'content', current_date + 2, 'Queued for TikTok',    '{"platform":"tiktok","format":"video"}'::jsonb),
  ('Carousel — pricing breakdown', 'draft',     0, 'content', null,             'Still drafting copy', '{"platform":"instagram","format":"carousel"}'::jsonb),
  -- ---- Customers (more): gone quiet, so "who's gone cold" always has real answers ----
  -- NOTE: last_contact is a HARDCODED ISO date string (jsonb can't do date math inline) —
  -- set ~12-20 days before a typical class/demo date of 2026-07-28. Refresh if reused later.
  ('Nurul Trading Co',  'active', 1200, 'customer', current_date + 2, 'Gone quiet — no reply in weeks',  '{"company":"Nurul Trading Co","last_contact":"2026-07-16","next":"send check-in message"}'::jsonb),
  ('Zaidi Enterprises', 'active',  800, 'customer', current_date + 5, 'No response since last invoice', '{"company":"Zaidi Enterprises","last_contact":"2026-07-08","next":"call to re-engage"}'::jsonb)
) as seed(title, status, amount, category, due_date, notes, meta)
where not exists (select 1 from records);

-- The starter kit used to seed one PENDING demo proposal (Office Depot RM269) here,
-- so the Approvals tab wasn't empty on minute one. REMOVED 23 Sep 2026: this is a
-- live business now, and that row -- plus the chase messages the overdue-invoice
-- agent wrote against the demo "Nur Trading" invoice -- kept showing up in the
-- owner's brief as bills he had never sent. Demo data must never ask him anything.
-- The records seed below is already guarded by "no records exist", so it is inert.

-- ── Moving Walls marketing dashboard (/mw) ─────────────────────────────────
-- One jsonb snapshot per pull; /mw always reads the newest. The daily job
-- inserts a row — it never edits markup or chart coordinates.
create table if not exists mw_snapshots (
  id          bigint generated always as identity primary key,
  pulled_at   timestamptz not null default now(),
  source      text        not null default 'daily',   -- daily | manual
  data        jsonb       not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists mw_snapshots_pulled_at_idx on mw_snapshots (pulled_at desc);

-- The recommendation list. The daily job updates status/evidence here.
-- Ids are stable forever because decisions hang off them.
create table if not exists mw_actions (
  id            text        primary key,              -- a01, a02 … never reused
  channel       text        not null,                 -- paid | seo
  status        text        not null default 'not',   -- done | part | not
  title         text        not null,
  sub           text,
  evidence      text,
  impact        text        not null default 'medium',
  cross_channel boolean     not null default false,
  sort          int         not null default 100,
  active        boolean     not null default true,    -- retire by marking done
  updated_at    timestamptz not null default now()
);
create index if not exists mw_actions_channel_idx on mw_actions (channel, sort);

-- The team's answers. The daily job must NEVER write here.
create table if not exists mw_decisions (
  action_id   text        primary key references mw_actions(id) on delete cascade,
  choice      text        not null,                   -- accept | reject | done
  reason      text,
  decided_by  text,
  updated_at  timestamptz not null default now()
);

-- Targets set by hand (CPA ceiling, monthly budget, lead goal).
create table if not exists mw_settings (
  key         text        primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now()
);

-- SEO planner card on /mw/seo, and the inbox Claude Code picks work up from.
-- Plan CONTENT lives in lib/mw-seo-plan.ts; only progress is stored. Steps
-- linked to mw_actions are derived and never written here. (20 Oct 2026)
create table if not exists mw_seo_step_state (
  step_id     text primary key,
  stage       text not null default 'not_started'
              check (stage in ('not_started','in_progress','done','declined')),
  reason      text,
  assignee    text,
  updated_by  text not null,
  updated_at  timestamptz not null default now()
);

create table if not exists mw_claude_inbox (
  id               bigserial primary key,
  step_id          text,
  prompt           text not null check (length(prompt) between 1 and 4000),
  context          jsonb not null default '{}'::jsonb,   -- frozen context pack
  context_version  int not null default 1,
  status           text not null default 'queued'
                   check (status in ('queued','claimed','done','failed','cancelled')),
  result           text check (result is null or length(result) <= 8000),
  result_links     jsonb,                                -- {files, proposals, docs, next:[{label,prompt}]}
  error            text,
  created_by       text not null,                        -- 'owner' | 'telegram:<chat id>'
  source           text not null check (source in ('web','telegram')),
  telegram_chat_id bigint,
  idempotency_key  text unique,
  parent_id        bigint references mw_claude_inbox(id), -- a follow-up's previous job
  claimed_by       text,
  claimed_at       timestamptz,
  finished_at      timestamptz,
  notified_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists mw_claude_inbox_status on mw_claude_inbox (status, created_at);
create index if not exists mw_claude_inbox_step on mw_claude_inbox (step_id, created_at desc);
alter table mw_seo_step_state enable row level security;
alter table mw_claude_inbox   enable row level security;

-- "My week" (lib/mw-week.ts): the few finished cards each person gets on
-- Monday — numbered steps, links, done-when. Selection is code; the words are
-- written by the Monday run (.claude/skills/mw-week-build). 26 Oct 2026.
create table if not exists mw_week_tasks (
  id          text primary key,                 -- '<ISO week>:<queue id>', or '<lead card>:publish'
  week        text not null,                    -- '2026-W44'
  owner       text not null,                    -- person name (lib/mw-people.ts)
  kind        text not null check (kind in ('content-new','content-improve','publish','tech','paid-apply','facts','check')),
  market      text,
  title       text not null,
  why         text not null default '',
  steps       jsonb not null default '[]'::jsonb,  -- numbered, imperative; a card with none is not shown
  links       jsonb not null default '[]'::jsonb,  -- [{label,url}]
  done_when   text not null default '',
  due         date not null,
  value       numeric not null default 0,
  state       text not null default 'todo' check (state in ('todo','submitted','done','cant')),
  reason      text,
  payload     jsonb,                            -- doc, page, Google Ads operations
  source_id   text,                             -- the queue candidate it came from
  carried     int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists mw_week_tasks_week_owner on mw_week_tasks (week, owner);
create index if not exists mw_week_tasks_open on mw_week_tasks (state) where state in ('todo');

-- What the data showed this week, written by the Monday run. The To do page lists
-- these first and hangs each card under the finding it fixes (owner, 28 Oct 2026).
create table if not exists mw_week_findings (
  id          text primary key,                 -- '<ISO week>:f:<slug>' or '<ISO week>:i:<slug>'
  week        text not null,
  rank        int not null default 0,           -- 1.. for actions, 10+ for info
  title       text not null,                    -- what is true, not what to do
  evidence    text not null default '',         -- the numbers, pages and searches
  source      text not null default '',         -- 'Google Search Console, last 28 days'
  value       numeric not null default 0,       -- summed value of its cards
  market      text,
  kind        text not null default 'action' check (kind in ('action','info')),
  links       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mw_week_findings_week on mw_week_findings (week, rank);
alter table mw_week_findings enable row level security;
alter table mw_week_tasks add column if not exists finding_id text references mw_week_findings(id) on delete set null;
alter table mw_week_tasks enable row level security;


-- Search Console one ISO week at a time (lib/mw-gsc-week.ts, scripts/gsc-week.mts).
create table if not exists mw_gsc_qweek (
  week text not null, country text not null, query text not null, page text not null,
  clicks int not null default 0, impr int not null default 0, pos numeric not null default 0,
  primary key (week, country, query, page)
);
create index if not exists mw_gsc_qweek_page on mw_gsc_qweek (page, week);
create index if not exists mw_gsc_qweek_query on mw_gsc_qweek (query, week);
alter table mw_gsc_qweek enable row level security;
create table if not exists mw_gsc_pweek (
  week text not null, page text not null,
  clicks int not null default 0, impr int not null default 0, pos numeric not null default 0,
  primary key (week, page)
);
alter table mw_gsc_pweek enable row level security;

-- The money searches each market is judged on (scripts/buyer-searches.mts).
create table if not exists mw_buyer_searches (
  market text not null, query text not null, country text,
  added_at timestamptz not null default now(), why text not null default '',
  primary key (market, query)
);
alter table mw_buyer_searches enable row level security;
