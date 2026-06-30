-- Backend-relevant tables for the Yato Life API.
--
-- The full app schema (tasks, timers, events, groups, event_groups) is owned by
-- the client and lives in the main Supabase migration — Electron touches those
-- directly via RLS (user_id = auth.uid()). This backend only reads/writes the
-- table below, so we keep just it here for reference.
--
-- This backend does NOT use an oauth_states table: the OAuth `state` is a signed,
-- short-lived JWT (see src/calendar/state.ts), so there's nothing to persist.

-- ---------- CALENDAR_CREDENTIALS (multi-provider OAuth tokens) ----------
-- Google / Microsoft / Apple. RLS enabled with NO anon/authenticated policies:
-- only the service_role backend reads/writes these. The desktop client never
-- sees the tokens. The (user_id, provider, account_email) unique key allows
-- multiple accounts of the same provider per user.
create table if not exists public.calendar_credentials (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider      text not null check (provider in ('google', 'microsoft', 'apple')),
  account_email text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  scope         text,
  extra         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, provider, account_email)
);

alter table public.calendar_credentials enable row level security;
-- Intentionally no policies → the client (anon/authenticated) reads 0 rows.

-- updated_at trigger (shared set_updated_at() is created by the main migration).
drop trigger if exists calendar_credentials_set_updated_at on public.calendar_credentials;
create trigger calendar_credentials_set_updated_at
  before update on public.calendar_credentials
  for each row execute function public.set_updated_at();
