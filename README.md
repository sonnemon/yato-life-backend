# Yato Life — Backend API

Trusted backend for the Yato Life desktop app. Built with **Bun**, **Hono**, and
the **Supabase SDK**. Holds the server-side secrets the public Electron client
can't, verifies Supabase JWTs, and hosts multi-provider calendar integrations.

## Setup

```bash
bun install
cp .env.example .env   # then fill in your Supabase + OAuth values
```

Create the backend-owned tables in your Supabase project — run `db/schema.sql`
in the SQL editor (or via `supabase db push`).

## Run

```bash
bun run dev        # hot reload
bun run start      # plain
bun run typecheck
```

Local paths are at the root (`/health`, `/calendar/...`). On Vercel they live
under `/api` (see Deploy).

## Deploy (Vercel)

The same Hono app (`src/app.ts`) runs locally on Bun (`src/index.ts`) and on
Vercel as a serverless function (`api/[[...route]].ts`, via `hono/vercel`).
On Vercel every route is served under **`/api`** — the public API base is
`https://<project>.vercel.app/api`.

1. **Project settings:** Framework Preset = *Other*, Build Command = *(empty)*,
   Output Directory = *(empty)*. `vercel.json` already pins these. Install runs
   `bun install` (a `bun.lock` is present). Do **not** add a `tsc`/`bun build`
   step — Vercel bundles the function itself (that's what fixes the old
   `ERR_MODULE_NOT_FOUND`).
2. **Environment variables** (Vercel → Settings → Environment Variables): set the
   same keys as `.env.example` *except* `PORT`. In particular
   `GOOGLE_REDIRECT_URI = https://<project>.vercel.app/api/calendar/google/callback`.
3. **Google Console:** register that exact redirect URI.
4. **Client base URL:** point Electron at `https://<project>.vercel.app/api`.
5. **Verify:** `GET https://<project>.vercel.app/api/health` and `/api/health/ready`.

## Endpoints

| Method | Path                                       | Auth        | Description                               |
| ------ | ------------------------------------------ | ----------- | ----------------------------------------- |
| GET    | `/health`                                  | public      | liveness probe                            |
| GET    | `/health/ready`                            | public      | readiness — `ok` if all needed env vars are set (`200`/`503`) |
| GET    | `/me`                                      | bearer      | identity from the verified Supabase JWT   |
| GET    | `/calendar/providers`                      | bearer      | registered providers + impl status        |
| GET    | `/calendar/:provider/connect`              | bearer      | returns the OAuth URL to open in a browser |
| GET    | `/calendar/:provider/callback`             | signed state | OAuth redirect target (provider → here)   |
| GET    | `/calendar/connections`                    | bearer      | the user's connected accounts (no tokens) |
| DELETE | `/calendar/connections/:id`                | bearer      | disconnect an account                     |
| GET    | `/calendar/connections/:id/events`         | bearer      | list events (`?from&to&max`)              |
| POST   | `/calendar/connections/:id/events`         | bearer      | create an event                           |
| POST   | `/calendar/connections/:id/events/bulk`    | bearer      | create many events (partial success)      |
| PATCH  | `/calendar/connections/:id/events/:eventId`| bearer      | update an event                           |
| DELETE | `/calendar/connections/:id/events/:eventId`| bearer      | delete an event                           |

Event endpoints (list + bulk-create) are documented in detail in
[`docs/calendar-events.md`](docs/calendar-events.md).

Authenticated requests send the Supabase access token:

```bash
curl http://localhost:3000/me -H "Authorization: Bearer <supabase-jwt>"
```

## Calendar integrations

Multi-provider by design (`src/calendar/`): a `CalendarProvider` does event CRUD,
an `OAuthCalendarProvider` adds the connect/exchange/refresh dance. **Google** is
fully implemented (via `fetch`, no `googleapis` dep); **Microsoft** and **Apple**
(CalDAV) are stubs. A "connection" is one provider account
(`calendar_credentials` is keyed by `user_id, provider, account_email`, so a user
can link several accounts of the same provider); events are addressed by
connection id.

### Connect flow (server-handled OAuth)

1. Client (with its Supabase JWT) calls `GET /calendar/google/connect` → `{ url }`.
2. Client opens that URL in the system browser; the user consents.
3. Google redirects to `GET /calendar/google/callback` (this API). State is a
   signed JWT carrying the `user_id` — no `oauth_states` table. The API exchanges
   the code, stores tokens with `service_role`, and `302`s to the `yato://` deep
   link with `?status=connected&provider=google&account=…`.
4. Tokens are refreshed automatically when listing/creating events.

### Google Cloud setup

- Create an **OAuth 2.0 Client (Web application)**; set the redirect URI to your
  `GOOGLE_REDIRECT_URI` (e.g. `http://127.0.0.1:3000/calendar/google/callback`).
- Enable the **Google Calendar API**.
- Put the client id/secret in `.env`, and set `OAUTH_STATE_SECRET`
  (`openssl rand -hex 32`).

## JWT verification

`AUTH_VERIFY_STRATEGY` selects how tokens are checked (see
`src/auth/verifier.ts`):

- `getuser` (default) — `supabase.auth.getUser(token)`
- `jwks` — local ES256 verification against Supabase's JWKS
- `hs256` — legacy shared secret (`SUPABASE_JWT_SECRET`)

## Next steps

- Implement Microsoft (Graph) and Apple (CalDAV) providers following the same
  `CalendarProvider` / `OAuthCalendarProvider` shape.
- Optionally support multiple calendars per account (currently `primary`).
