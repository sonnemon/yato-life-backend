import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { CalendarApiError, NotImplementedError } from './calendar/provider'
import { env } from './env'
import { calendar } from './routes/calendar'
import { health } from './routes/health'
import { me } from './routes/me'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.use('*', logger())
app.use('*', cors())

app.route('/health', health)
app.route('/me', me)
app.route('/calendar', calendar)

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

console.log(`🚀 Yato Life backend listening on http://localhost:${env.PORT}`)

export default {
  port: env.PORT,
  fetch: app.fetch,
}
