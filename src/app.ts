import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { CalendarApiError, NotImplementedError } from './calendar/provider.js'
import { calendar } from './routes/calendar.js'
import { health } from './routes/health.js'
import { me } from './routes/me.js'
import type { AppEnv } from './types.js'

// Business routes, grouped so they can all be mounted under a single base path.
const api = new Hono<AppEnv>()
api.route('/health', health)
api.route('/me', me)
api.route('/calendar', calendar)

/**
 * The Hono application — runtime-agnostic. The Bun entry (`src/index.ts`) wraps
 * this to serve locally; on Vercel the native Hono preset picks up this default
 * export directly (zero-config, no `api/` handler).
 *
 * Everything is served under `/api` (both locally and on Vercel), so the public
 * base is `<host>/api`. Cross-cutting middleware and the error/notFound handlers
 * live here on the top-level app — Hono ignores those on sub-apps mounted via
 * `.route()`.
 */
const app = new Hono<AppEnv>()

app.use('*', logger())
app.use('*', cors())

app.route('/api', api)

app.notFound((c) => c.json({ error: 'Not Found' }, 404))
app.onError((err, c) => {
  if (err instanceof NotImplementedError) {
    return c.json({ error: err.message }, 501)
  }
  if (err instanceof CalendarApiError) {
    const status = (err.status >= 400 && err.status <= 599 ? err.status : 502) as ContentfulStatusCode
    return c.json({ error: err.message, provider: err.providerId }, status)
  }
  console.error(err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

export default app
