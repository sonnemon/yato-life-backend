import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware.js'
import { renderCallbackPage } from '../calendar/callback-page.js'
import {
  deleteConnection,
  listConnections,
  resolveContext,
  upsertCredential,
} from '../calendar/credentials.js'
import {
  type CalendarEvent,
  type CalendarEventInput,
  isOAuthProvider,
} from '../calendar/provider.js'
import { getProvider, listProviders } from '../calendar/registry.js'
import { signState, verifyState } from '../calendar/state.js'
import { env } from '../env.js'
import type { AppEnv } from '../types.js'
import { REASON_TEXT } from './utils/callback.js'
import { resolveConnection } from './utils/connection.js'
import { BULK_CONCURRENCY, BULK_MAX, parseEventInput, parseEventPatch } from './utils/events.js'
import { isProviderId, redirectUriFor } from './utils/providers.js'

export const calendar = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// OAuth callback — the ONLY unauthenticated route. It's registered BEFORE the
// auth middleware below, so requireAuth never runs for it; trust comes from the
// signed `state` instead. The provider redirects the user's browser here.
// ---------------------------------------------------------------------------
calendar.get('/:provider/callback', async (c) => {
  const provider = c.req.param('provider')
  const code = c.req.query('code')
  const state = c.req.query('state')
  const oauthError = c.req.query('error')

  const deepLink = new URL(env.OAUTH_SUCCESS_DEEP_LINK)
  const fail = (reason: string) => {
    deepLink.searchParams.set('status', 'error')
    deepLink.searchParams.set('reason', reason)
    return c.html(
      renderCallbackPage({
        ok: false,
        deepLink: deepLink.toString(),
        title: 'No se pudo conectar',
        message: REASON_TEXT[reason] ?? `Motivo: ${reason}`,
      }),
    )
  }

  if (oauthError) return fail(oauthError)
  if (!code || !state || !isProviderId(provider)) return fail('invalid_callback')

  // State must verify (signature + expiry) before we trust anything about it.
  let claims
  try {
    claims = await verifyState(state)
  } catch {
    return fail('invalid_state')
  }
  if (claims.provider !== provider) return fail('state_mismatch')

  const prov = getProvider(provider)
  if (!prov || !isOAuthProvider(prov)) return fail('provider_unavailable')

  const redirectUri = redirectUriFor(provider)
  if (!redirectUri) return fail('redirect_not_configured')

  try {
    const tokens = await prov.exchangeCode({ code, redirectUri })
    // user_id comes from the signed state, never from the request.
    await upsertCredential({ userId: claims.uid, provider, tokens })

    deepLink.searchParams.set('status', 'connected')
    deepLink.searchParams.set('provider', provider)
    if (tokens.accountEmail) deepLink.searchParams.set('account', tokens.accountEmail)
    return c.html(
      renderCallbackPage({
        ok: true,
        deepLink: deepLink.toString(),
        title: 'Cuenta conectada',
        message: tokens.accountEmail
          ? `Conectaste ${tokens.accountEmail}.`
          : `Conectaste tu cuenta de ${provider}.`,
      }),
    )
  } catch (err) {
    console.error('OAuth callback failed:', err)
    return fail('oauth_failed')
  }
})

// ---------------------------------------------------------------------------
// Everything below requires a valid Supabase bearer token.
// ---------------------------------------------------------------------------
calendar.use('*', requireAuth)

// What providers exist and whether they're wired up.
calendar.get('/providers', (c) =>
  c.json({
    providers: listProviders().map((p) => ({
      id: p.id,
      authKind: p.authKind,
      implemented: p.implemented,
    })),
  }),
)

// Start an OAuth connect flow → returns the URL the client should open in a browser.
calendar.get('/:provider/connect', async (c) => {
  const provider = c.req.param('provider')
  if (!isProviderId(provider)) return c.json({ error: 'Unknown provider' }, 404)

  const prov = getProvider(provider)
  if (!prov || !prov.implemented || !isOAuthProvider(prov)) {
    return c.json({ error: `Provider "${provider}" is not available yet` }, 501)
  }
  const redirectUri = redirectUriFor(provider)
  if (!redirectUri) return c.json({ error: 'Redirect URI not configured for this provider' }, 500)
  if (!env.OAUTH_STATE_SECRET) return c.json({ error: 'OAUTH_STATE_SECRET not configured' }, 500)

  const user = c.get('user')
  const state = await signState({ uid: user.id, provider })
  return c.json({ url: prov.buildAuthUrl({ state, redirectUri }) })
})

// List the user's connected accounts (no tokens).
calendar.get('/connections', async (c) => {
  const user = c.get('user')
  return c.json({ connections: await listConnections(user.id) })
})

// Disconnect an account.
calendar.delete('/connections/:id', async (c) => {
  const user = c.get('user')
  const removed = await deleteConnection(user.id, c.req.param('id'))
  if (!removed) return c.json({ error: 'Connection not found' }, 404)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Events, scoped to one connection (a specific provider account).
// ---------------------------------------------------------------------------

// List events from a connection.
calendar.get('/connections/:id/events', async (c) => {
  const resolved = await resolveConnection(c)
  if (resolved instanceof Response) return resolved
  const { cred, prov } = resolved

  const ctx = await resolveContext(prov, cred)
  const max = c.req.query('max')
  const events = await prov.listEvents(ctx, {
    from: c.req.query('from'),
    to: c.req.query('to'),
    max: max ? Number(max) : undefined,
  })
  return c.json({ events })
})

// Create an event on a connection.
calendar.post('/connections/:id/events', async (c) => {
  const resolved = await resolveConnection(c)
  if (resolved instanceof Response) return resolved
  const { cred, prov } = resolved

  const parsed = parseEventInput(await c.req.json().catch(() => null))
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)

  const ctx = await resolveContext(prov, cred)
  const event = await prov.createEvent(ctx, parsed.value)
  return c.json({ event }, 201)
})

// Bulk-create events on a connection. Fans out to individual creates with
// bounded concurrency and reports per-item results (partial success is normal).
// Validation is all-or-nothing.
calendar.post('/connections/:id/events/bulk', async (c) => {
  const resolved = await resolveConnection(c)
  if (resolved instanceof Response) return resolved
  const { cred, prov } = resolved

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !Array.isArray((body as { events?: unknown }).events)) {
    return c.json({ error: 'Body must be { "events": [ ... ] }' }, 400)
  }
  const rawEvents = (body as { events: unknown[] }).events
  if (rawEvents.length === 0) return c.json({ error: '"events" must not be empty' }, 400)
  if (rawEvents.length > BULK_MAX) {
    return c.json({ error: `"events" exceeds the max of ${BULK_MAX} per request` }, 400)
  }

  // Validate every item up front — reject the whole request on any bad item.
  const inputs: CalendarEventInput[] = []
  const invalid: Array<{ index: number; error: string }> = []
  rawEvents.forEach((raw, index) => {
    const parsed = parseEventInput(raw)
    if (parsed.ok) inputs.push(parsed.value)
    else invalid.push({ index, error: parsed.error })
  })
  if (invalid.length > 0) return c.json({ error: 'Invalid events', invalid }, 400)

  const ctx = await resolveContext(prov, cred)
  const created: Array<{ index: number; event: CalendarEvent }> = []
  const failed: Array<{ index: number; error: string }> = []

  for (let offset = 0; offset < inputs.length; offset += BULK_CONCURRENCY) {
    const batch = inputs.slice(offset, offset + BULK_CONCURRENCY)
    const results = await Promise.allSettled(batch.map((input) => prov.createEvent(ctx, input)))
    results.forEach((res, i) => {
      const index = offset + i
      if (res.status === 'fulfilled') created.push({ index, event: res.value })
      else failed.push({ index, error: res.reason instanceof Error ? res.reason.message : 'create failed' })
    })
  }

  const status = failed.length === 0 ? 201 : 207
  return c.json(
    {
      summary: { total: inputs.length, created: created.length, failed: failed.length },
      created,
      failed,
    },
    status,
  )
})

// Update an event on a connection.
calendar.patch('/connections/:id/events/:eventId', async (c) => {
  const resolved = await resolveConnection(c)
  if (resolved instanceof Response) return resolved
  const { cred, prov } = resolved

  const parsed = parseEventPatch(await c.req.json().catch(() => null))
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)

  const ctx = await resolveContext(prov, cred)
  const event = await prov.updateEvent(ctx, c.req.param('eventId'), parsed.value)
  return c.json({ event })
})

// Delete an event on a connection.
calendar.delete('/connections/:id/events/:eventId', async (c) => {
  const resolved = await resolveConnection(c)
  if (resolved instanceof Response) return resolved
  const { cred, prov } = resolved

  const ctx = await resolveContext(prov, cred)
  await prov.deleteEvent(ctx, c.req.param('eventId'))
  return c.json({ ok: true })
})
