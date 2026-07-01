import type { CalendarEventInput } from '../../calendar/provider.js'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export function parseEventInput(body: unknown): ParseResult<CalendarEventInput> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object' }
  const b = body as Record<string, unknown>
  if (typeof b.title !== 'string' || !b.title.trim()) return { ok: false, error: '"title" is required' }
  if (!isIsoDateTime(b.start)) return { ok: false, error: '"start" must be an ISO 8601 datetime' }
  if (!isIsoDateTime(b.end)) return { ok: false, error: '"end" must be an ISO 8601 datetime' }
  const value: CalendarEventInput = { title: b.title, start: b.start, end: b.end }
  if (typeof b.description === 'string') value.description = b.description
  if (typeof b.location === 'string') value.location = b.location
  return { ok: true, value }
}

export function parseEventPatch(body: unknown): ParseResult<Partial<CalendarEventInput>> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object' }
  const b = body as Record<string, unknown>
  const value: Partial<CalendarEventInput> = {}
  if (b.title !== undefined) {
    if (typeof b.title !== 'string' || !b.title.trim()) return { ok: false, error: '"title" must be a non-empty string' }
    value.title = b.title
  }
  if (b.start !== undefined) {
    if (!isIsoDateTime(b.start)) return { ok: false, error: '"start" must be an ISO 8601 datetime' }
    value.start = b.start
  }
  if (b.end !== undefined) {
    if (!isIsoDateTime(b.end)) return { ok: false, error: '"end" must be an ISO 8601 datetime' }
    value.end = b.end
  }
  if (b.description !== undefined) {
    if (typeof b.description !== 'string') return { ok: false, error: '"description" must be a string' }
    value.description = b.description
  }
  if (b.location !== undefined) {
    if (typeof b.location !== 'string') return { ok: false, error: '"location" must be a string' }
    value.location = b.location
  }
  return { ok: true, value }
}

// Bulk-create limits. Google has no native bulk insert, so the route fans out to
// individual creates with bounded concurrency.
export const BULK_MAX = 50
export const BULK_CONCURRENCY = 5
