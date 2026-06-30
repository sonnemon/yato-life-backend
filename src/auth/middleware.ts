import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'
import { AuthError, verifyToken } from './verifier'

/**
 * Bearer guard. Verifies the `Authorization: Bearer <jwt>` header via the
 * active strategy and stashes the resolved user on the context as `user`.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing bearer token' }, 401)
  }

  try {
    const user = await verifyToken(header.slice(7))
    c.set('user', user)
  } catch (err) {
    const message = err instanceof AuthError ? err.message : 'Invalid token'
    return c.json({ error: message }, 401)
  }

  await next()
})
