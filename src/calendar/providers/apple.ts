import { createStubProvider } from '../provider.js'

/** Apple Calendar (CalDAV, app-specific password — not OAuth) — stub until implemented. */
export const appleCalendarProvider = createStubProvider('apple', 'caldav')
