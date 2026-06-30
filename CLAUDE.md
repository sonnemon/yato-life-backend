# Yato Life — Backend API

Trusted backend for the **Yato Life** desktop app (Electron + React + Supabase).
The Electron renderer is public, so secrets (Supabase `service_role`, OAuth
`client_secret`s) live here, server-side only.

## Stack

- **Bun** runtime + **Hono** web framework
- **@supabase/supabase-js** for all data access (no ORM)
- **jose** for local JWT verification strategies

## What this backend does (and doesn't)

- **Does:** verify the Supabase JWT → derive a trusted `user_id`; perform
  privileged ops with the `service_role` key (always scoped to the JWT's
  `user_id`, never a body value); host multi-provider calendar integrations.
- **Doesn't:** proxy the `tasks` / `timers` / `events` / `groups` tables —
  Electron touches those directly via Supabase RLS (`user_id = auth.uid()`).

## Architecture

- `src/env.ts` — env parsed & validated once at startup.
- `src/lib/supabase.ts` — `supabaseAdmin` (service_role, bypasses RLS) and
  `supabaseAuth` (anon, for the `getuser` verifier).
- `src/auth/verifier.ts` — **swappable** JWT verification via
  `AUTH_VERIFY_STRATEGY`: `getuser` (default), `jwks` (ES256 local), `hs256`.
  Add a strategy here without touching middleware or routes.
- `src/auth/middleware.ts` — `requireAuth` bearer guard; sets `c.get('user')`.
- `src/calendar/` — auth-agnostic `CalendarProvider` interface + registry.
  Providers are **pure** (never touch Supabase); persistence + per-user authz
  live in the route/service layer. Google is the priority impl; Microsoft &
  Apple are stubs.
- `src/routes/` — `health`, `me`, `calendar`.
- `db/schema.sql` — backend-owned tables (`oauth_states`,
  `calendar_credentials`), RLS-deny so only `service_role` reaches them.

## Conventions

- Default to Bun: `bun <file>`, `bun test`, `bun install`, `bunx`. Bun
  auto-loads `.env` — don't add `dotenv`.
- Data access goes through `@supabase/supabase-js` (HTTP), not a raw Postgres
  driver. Don't reintroduce an ORM or `Bun.sql` without asking.
- OAuth callbacks are **server-handled**: `GOOGLE_REDIRECT_URI` points at this
  API; after the code exchange we `302` to a `yato://` deep link to refocus
  Electron. Tokens/verifier never reach the client.
