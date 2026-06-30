import type { CalendarProvider, ProviderId } from './provider'
import { appleCalendarProvider } from './providers/apple'
import { googleCalendarProvider } from './providers/google'
import { microsoftCalendarProvider } from './providers/microsoft'

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
