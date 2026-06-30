import { Hono } from 'hono'
import { configReport } from '../env.js'

export const health = new Hono()

// Liveness — the process is up.
health.get('/', (c) => c.json({ status: 'ok', uptime: process.uptime() }))

// Readiness — every env var the app needs has a value. 200 when ok, 503 when
// something required is missing. Reports presence only, never secret values.
health.get('/ready', (c) => {
  const report = configReport()
  return c.json(report, report.ok ? 200 : 503)
})
