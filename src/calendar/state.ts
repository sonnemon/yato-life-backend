import { jwtVerify, SignJWT } from 'jose'
import { env } from '../env'
import type { ProviderId } from './provider'

/**
 * OAuth `state` is a short-lived signed JWT instead of a DB row. It binds the
 * callback to the user who started the flow and to the provider, and can't be
 * forged without OAUTH_STATE_SECRET. No `oauth_states` table needed.
 *
 * (We rely on a confidential client + client_secret for code-exchange security;
 *  if DB-backed PKCE is wanted later, add an oauth_states table and swap this.)
 */
export type OAuthState = { uid: string; provider: ProviderId }

function secret(): Uint8Array {
  if (!env.OAUTH_STATE_SECRET) {
    throw new Error('OAUTH_STATE_SECRET is not configured')
  }
  return new TextEncoder().encode(env.OAUTH_STATE_SECRET)
}

export function signState(payload: OAuthState): Promise<string> {
  return new SignJWT({ provider: payload.provider })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.uid)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret())
}

export async function verifyState(token: string): Promise<OAuthState> {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] })
  const uid = payload.sub
  const provider = payload.provider
  if (typeof uid !== 'string' || typeof provider !== 'string') {
    throw new Error('Invalid OAuth state')
  }
  return { uid, provider: provider as ProviderId }
}
