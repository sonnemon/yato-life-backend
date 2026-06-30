import type { CalendarProvider, ProviderId } from './provider.js'
import { appleCalendarProvider } from './providers/apple.js'
import { googleCalendarProvider } from './providers/google.js'
import { microsoftCalendarProvider } from './providers/microsoft.js'

const providers = new Map<ProviderId, CalendarProvider>(
  [googleCalendarProvider, microsoftCalendarProvider, appleCalendarProvider].map((p) => [p.id, p]),
)

/** Resolve a provider by id, or `undefined` if unknown. */
export function getProvider(id: ProviderId): CalendarProvider | undefined {
  return providers.get(id)
}

/** All registered providers. */
export function listProviders(): CalendarProvider[] {
  return [...providers.values()]
}
