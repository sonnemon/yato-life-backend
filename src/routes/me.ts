import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware.js'
import type { AppEnv } from '../types.js'

export const me = new Hono<AppEnv>()

me.use('*', requireAuth)

// Returns the identity derived from the verified Supabase JWT.
me.get('/', (c) => c.json({ user: c.get('user') }))
