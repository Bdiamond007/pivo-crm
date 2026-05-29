-- ============================================================================
-- Aria Support Portal — Supabase / Postgres schema
-- Run in the Supabase SQL editor. Safe to re-run (IF NOT EXISTS).
-- ============================================================================

-- Existing CRM key-value store (kept for /crm).
create table if not exists kv_store (
  id          text primary key,
  value       text,
  updated_at  timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Conversations / tickets
-- A conversation IS the ticket. Messages are stored as JSONB for fast reads;
-- analytics-heavy deployments can normalise into a `messages` table later.
-- ---------------------------------------------------------------------------
create table if not exists conversations (
  id                  text primary key,
  customer_email      text,
  customer_name       text,
  shopify_customer_id text,
  status              text not null default 'open',     -- open|pending|escalated|resolved|closed
  priority            text not null default 'normal',   -- low|normal|high|urgent
  intent              text not null default 'unknown',
  sentiment           text not null default 'neutral',  -- positive|neutral|frustrated|angry
  confidence          numeric not null default 0.7,     -- 0..1 AI confidence
  summary             text default 'New conversation',
  human_takeover      boolean not null default false,
  assigned_agent      text,
  tags                text[] not null default '{}',
  messages            jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_conv_status      on conversations (status);
create index if not exists idx_conv_updated      on conversations (updated_at desc);
create index if not exists idx_conv_email        on conversations (customer_email);
create index if not exists idx_conv_sentiment    on conversations (sentiment);

-- ---------------------------------------------------------------------------
-- Refund approval queue (money never moves without a human)
-- ---------------------------------------------------------------------------
create table if not exists refund_requests (
  id              uuid primary key default gen_random_uuid(),
  conversation_id text references conversations(id) on delete set null,
  order_name      text not null,
  customer_email  text,
  amount          numeric,
  currency        text default 'USD',
  reason          text,
  status          text not null default 'pending',  -- pending|approved|denied|processed
  decided_by      text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
create index if not exists idx_refund_status on refund_requests (status);

-- ---------------------------------------------------------------------------
-- Support agents (admin operators)
-- ---------------------------------------------------------------------------
create table if not exists agents (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  name        text,
  role        text not null default 'agent',  -- agent|admin
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Realtime: push row changes to the admin dashboard + customer portal so the
-- UI updates instantly instead of polling. The app subscribes via the browser
-- anon key (lib/realtime.ts); if these statements aren't run it transparently
-- falls back to polling.
--
-- `add table ... if not exists` isn't supported, so guard against re-runs.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'refund_requests'
  ) then
    alter publication supabase_realtime add table refund_requests;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- For the demo the API uses the service role (bypasses RLS). If you expose the
-- anon key to the browser, lock these down to the authenticated customer.
--
-- IMPORTANT for production: Realtime postgres_changes respects RLS. With RLS
-- OFF (demo default) any anon subscriber receives all change events — fine for
-- an internal admin tool, NOT for the public customer portal. Before going
-- public, enable RLS + a per-customer policy and use Realtime authorization so
-- a customer only receives their own conversation's events.
-- ---------------------------------------------------------------------------
-- alter table conversations enable row level security;
-- create policy "customers read own conversations" on conversations
--   for select using (customer_email = auth.jwt() ->> 'email');
