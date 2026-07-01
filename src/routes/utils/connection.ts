import type { Context } from 'hono'
import { getCredential, type CredentialRow } from '../../calendar/credentials.js'
import type { CalendarProvider } from '../../calendar/provider.js'
import { getProvider } from '../../calendar/registry.js'
import type { AppEnv } from '../../types.js'

/** Load the credential + its provider, or return an error Response. */
export async function resolveConnection(
  c: Context<AppEnv>,
): Promise<{ cred: CredentialRow; prov: CalendarProvider } | Response> {
  const user = c.get('user')
  const id = c.req.param('id')
  const cred = id ? await getCredential(user.id, id) : null
  if (!cred) return c.json({ error: 'Connection not found' }, 404)
  const prov = getProvider(cred.provider)
  if (!prov || !prov.implemented) return c.json({ error: 'Provider not available' }, 501)
  return { cred, prov }
}
