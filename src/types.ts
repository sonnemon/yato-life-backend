import type { AuthUser } from './auth/verifier.js'

/** Shared Hono environment: variables set by middleware on the request context. */
export type AppEnv = {
  Variables: {
    user: AuthUser
  }
}
