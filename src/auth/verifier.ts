import { createRemoteJWKSet, jwtVerify } from 'jose'
import { env } from '../env'
import { supabaseAuth } from '../lib/supabase'

/** Normalized identity derived from a verified Supabase JWT. */
export type AuthUser = {
  id: string
  email: string | null
}

export class AuthError extends Error {
  constructor(message = 'Invalid token') {
    super(message)
    this.name = 'AuthError'
  }
}

type Verifier = (token: string) => Promise<AuthUser>

const asEmail = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Strategy `getuser`: ask Supabase to validate the token (network round-trip). */
const getuser: Verifier = async (token) => {
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data.user) throw new AuthError(error?.message)
  return { id: data.user.id, email: data.user.email ?? null }
}

/** Strategy `jwks`: verify the ES256 signature locally against Supabase's JWKS. */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
const verifyJwks: Verifier = async (token) => {
  jwks ??= createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `${env.SUPABASE_URL}/auth/v1`,
  })
  if (!payload.sub) throw new AuthError('Token missing subject')
  return { id: payload.sub, email: asEmail(payload.email) }
}

/** Strategy `hs256`: verify against the legacy shared JWT secret. */
const verifyHs256: Verifier = async (token) => {
  if (!env.SUPABASE_JWT_SECRET) throw new AuthError('SUPABASE_JWT_SECRET not configured')
  const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
  const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
  if (!payload.sub) throw new AuthError('Token missing subject')
  return { id: payload.sub, email: asEmail(payload.email) }
}

const strategies: Record<typeof env.AUTH_VERIFY_STRATEGY, Verifier> = {
  getuser,
  jwks: verifyJwks,
  hs256: verifyHs256,
}

/** The active verifier, selected by AUTH_VERIFY_STRATEGY (default `getuser`). */
export const verifyToken: Verifier = strategies[env.AUTH_VERIFY_STRATEGY]
