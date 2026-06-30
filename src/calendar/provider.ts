export type ProviderId = 'google' | 'microsoft' | 'apple'
export type AuthKind = 'oauth' | 'caldav'

export type CalendarEventInput = {
  title: string
  description?: string
  location?: string
  start: string // ISO 8601 datetime
  end: string // ISO 8601 datetime
}

export type CalendarEvent = CalendarEventInput & {
  id: string
  providerId: ProviderId
  htmlLink?: string
}

export type EventRange = {
  from?: string // ISO 8601 — lower bound (inclusive)
  to?: string // ISO 8601 — upper bound (exclusive)
  max?: number
}

/** Resolved, ready-to-use access for a single provider call. */
export type ProviderContext = {
  accessToken: string
}

/** Tokens returned by an OAuth code exchange or refresh. */
export type TokenSet = {
  accessToken: string
  refreshToken?: string | null
  scope?: string | null
  expiresAt?: string | null // ISO 8601
  accountEmail?: string | null
}

/**
 * Event CRUD for one calendar provider. Implementations are PURE: they receive
 * already-resolved credentials (ProviderContext) and never touch Supabase or
 * persistence. Token storage + per-user authorization live in the route/service
 * layer (see src/calendar/credentials.ts, src/routes/calendar.ts).
 */
export interface CalendarProvider {
  readonly id: ProviderId
  readonly authKind: AuthKind
  readonly implemented: boolean
  listEvents(ctx: ProviderContext, range?: EventRange): Promise<CalendarEvent[]>
  createEvent(ctx: ProviderContext, input: CalendarEventInput): Promise<CalendarEvent>
  updateEvent(
    ctx: ProviderContext,
    id: string,
    input: Partial<CalendarEventInput>,
  ): Promise<CalendarEvent>
  deleteEvent(ctx: ProviderContext, id: string): Promise<void>
}

/** Providers that authenticate via an OAuth2 authorization-code redirect. */
export interface OAuthCalendarProvider extends CalendarProvider {
  readonly authKind: 'oauth'
  /** Authorization URL the user is sent to in order to grant access. */
  buildAuthUrl(opts: { state: string; redirectUri: string }): string
  /** Exchange an authorization code for tokens (and the account email). */
  exchangeCode(opts: { code: string; redirectUri: string }): Promise<TokenSet>
  /** Trade a refresh token for a fresh access token. */
  refresh(refreshToken: string): Promise<TokenSet>
}

export function isOAuthProvider(p: CalendarProvider): p is OAuthCalendarProvider {
  return p.authKind === 'oauth' && typeof (p as OAuthCalendarProvider).buildAuthUrl === 'function'
}

export class NotImplementedError extends Error {
  constructor(providerId: string, op: string) {
    super(`Provider "${providerId}" does not implement "${op}" yet`)
    this.name = 'NotImplementedError'
  }
}

/** A failure talking to a provider's API (status mirrors the upstream response). */
export class CalendarApiError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'CalendarApiError'
  }
}

/** A provider placeholder: every operation throws until the real one lands. */
export function createStubProvider(id: ProviderId, authKind: AuthKind): CalendarProvider {
  const fail = (op: string): never => {
    throw new NotImplementedError(id, op)
  }
  return {
    id,
    authKind,
    implemented: false,
    async listEvents() {
      return fail('listEvents')
    },
    async createEvent() {
      return fail('createEvent')
    },
    async updateEvent() {
      return fail('updateEvent')
    },
    async deleteEvent() {
      return fail('deleteEvent')
    },
  }
}
