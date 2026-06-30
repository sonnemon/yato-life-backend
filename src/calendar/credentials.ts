import { supabaseAdmin } from '../lib/supabase.js'
import { type CalendarProvider, isOAuthProvider, type ProviderContext, type ProviderId, type TokenSet } from './provider.js'

const TABLE = 'calendar_credentials'
// Refresh a bit early so a token doesn't expire mid-request.
const EXPIRY_SKEW_MS = 60_000

/** A row of public.calendar_credentials (only the columns we read). */
export type CredentialRow = {
  id: string
  user_id: string
  provider: ProviderId
  account_email: string | null
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
  scope: string | null
  extra: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** Token-free view of a connected account, safe to return to the client. */
export type Connection = {
  id: string
  provider: ProviderId
  accountEmail: string | null
  scope: string | null
  expiresAt: string | null
  createdAt: string
}

function toConnection(row: CredentialRow): Connection {
  return {
    id: row.id,
    provider: row.provider,
    accountEmail: row.account_email,
    scope: row.scope,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

/** Upsert tokens for (user, provider, account). Returns the stored row. */
export async function upsertCredential(args: {
  userId: string
  provider: ProviderId
  tokens: TokenSet
}): Promise<CredentialRow> {
  const { userId, provider, tokens } = args
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        provider,
        account_email: tokens.accountEmail ?? null,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken ?? null,
        expires_at: tokens.expiresAt ?? null,
        scope: tokens.scope ?? null,
      },
      { onConflict: 'user_id,provider,account_email' },
    )
    .select('*')
    .single()
  if (error) throw error
  return data as CredentialRow
}

/** All of a user's connected accounts (no tokens). */
export async function listConnections(userId: string): Promise<Connection[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as CredentialRow[]).map(toConnection)
}

/** One credential row (with tokens), scoped to the owning user. */
export async function getCredential(userId: string, id: string): Promise<CredentialRow | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as CredentialRow | null) ?? null
}

/** Delete a connection. Returns whether a row was removed. */
export async function deleteConnection(userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

/**
 * Produce a ready-to-use ProviderContext for a credential, refreshing the
 * access token (and persisting it) when it's missing or about to expire.
 */
export async function resolveContext(
  provider: CalendarProvider,
  credential: CredentialRow,
): Promise<ProviderContext> {
  const expired =
    !!credential.expires_at &&
    new Date(credential.expires_at).getTime() - EXPIRY_SKEW_MS < Date.now()

  if (credential.access_token && !expired) {
    return { accessToken: credential.access_token }
  }

  if (!isOAuthProvider(provider)) {
    if (!credential.access_token) {
      throw new Error('No access token stored for this connection')
    }
    return { accessToken: credential.access_token }
  }

  if (!credential.refresh_token) {
    throw new Error('Access token expired and no refresh token available; reconnect required')
  }

  const refreshed = await provider.refresh(credential.refresh_token)
  await supabaseAdmin
    .from(TABLE)
    .update({
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt ?? null,
      scope: refreshed.scope ?? credential.scope,
      // Google rarely returns a new refresh token — keep the existing one.
      refresh_token: refreshed.refreshToken ?? credential.refresh_token,
    })
    .eq('id', credential.id)

  return { accessToken: refreshed.accessToken }
}
