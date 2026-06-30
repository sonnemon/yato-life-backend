import { Hono } from 'hono'
import { requireAuth } from '../auth/middleware'
import type { AppEnv } from '../types'

export const me = new Hono<AppEnv>()

me.use('*', requireAuth)

// Returns the identity derived from the verified Supabase JWT.
me.get('/', (c) => c.json({ user: c.get('user') }))
