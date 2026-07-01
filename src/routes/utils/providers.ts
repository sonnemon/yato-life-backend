import type { ProviderId } from '../../calendar/provider.js'
import { env } from '../../env.js'

const PROVIDER_IDS: readonly ProviderId[] = ['google', 'microsoft', 'apple']

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value)
}

/** The OAuth redirect URI registered with each provider (must match exactly). */
export function redirectUriFor(provider: ProviderId): string | undefined {
  if (provider === 'google') return env.GOOGLE_REDIRECT_URI
  return undefined
}
