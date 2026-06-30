import { env } from '../../env.js'
import {
  CalendarApiError,
  type CalendarEvent,
  type CalendarEventInput,
  type EventRange,
  type OAuthCalendarProvider,
  type ProviderContext,
  type TokenSet,
} from '../provider.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'
const CALENDAR_ID = 'primary'

// calendar = full read/write on events; openid+email = to label the connection.
const SCOPES = ['https://www.googleapis.com/auth/calendar', 'openid', 'email']

function requireCredential(name: 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'): string {
  const value = env[name]
  if (!value) throw new CalendarApiError('google', 500, `${name} is not configured`)
  return value
}

// --- Google wire types (only the fields we use) ---
type GoogleTokenResponse = {
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
  id_token?: string
}
type GoogleDate = { dateTime?: string; date?: string; timeZone?: string }
type GoogleEvent = {
  id: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  start?: GoogleDate
  end?: GoogleDate
}

function toTokenSet(json: GoogleTokenResponse): TokenSet {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    scope: json.scope ?? null,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
  }
}

function fromGoogleEvent(g: GoogleEvent): CalendarEvent {
  const event: CalendarEvent = {
    id: g.id,
    providerId: 'google',
    title: g.summary ?? '(untitled)',
    start: g.start?.dateTime ?? g.start?.date ?? '',
    end: g.end?.dateTime ?? g.end?.date ?? '',
  }
  if (g.description !== undefined) event.description = g.description
  if (g.location !== undefined) event.location = g.location
  if (g.htmlLink !== undefined) event.htmlLink = g.htmlLink
  return event
}

function toGoogleEvent(input: Partial<CalendarEventInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (input.title !== undefined) body.summary = input.title
  if (input.description !== undefined) body.description = input.description
  if (input.location !== undefined) body.location = input.location
  if (input.start !== undefined) body.start = { dateTime: input.start }
  if (input.end !== undefined) body.end = { dateTime: input.end }
  return body
}

async function postForm(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse & {
    error?: string
    error_description?: string
  }
  if (!res.ok) {
    throw new CalendarApiError('google', res.status, json.error_description ?? json.error ?? 'OAuth token request failed')
  }
  return toTokenSet(json)
}

async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const json = (await res.json().catch(() => ({}))) as { email?: string }
  return json.email ?? null
}

async function calendarFetch<T>(
  ctx: ProviderContext,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${CALENDAR_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new CalendarApiError('google', res.status, detail || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const googleCalendarProvider: OAuthCalendarProvider = {
  id: 'google',
  authKind: 'oauth',
  implemented: true,

  buildAuthUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: requireCredential('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline', // ask for a refresh token
      prompt: 'consent', // force refresh_token even on re-consent
      include_granted_scopes: 'true',
      state,
    })
    return `${AUTH_URL}?${params.toString()}`
  },

  async exchangeCode({ code, redirectUri }) {
    const tokens = await postForm({
      code,
      client_id: requireCredential('GOOGLE_CLIENT_ID'),
      client_secret: requireCredential('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })
    tokens.accountEmail = await fetchAccountEmail(tokens.accessToken)
    return tokens
  },

  async refresh(refreshToken) {
    // Google typically omits a new refresh_token here; the caller keeps the old one.
    return postForm({
      refresh_token: refreshToken,
      client_id: requireCredential('GOOGLE_CLIENT_ID'),
      client_secret: requireCredential('GOOGLE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    })
  },

  async listEvents(ctx, range?: EventRange) {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(range?.max ?? 50),
    })
    if (range?.from) params.set('timeMin', range.from)
    if (range?.to) params.set('timeMax', range.to)
    const data = await calendarFetch<{ items?: GoogleEvent[] }>(
      ctx,
      `/calendars/${CALENDAR_ID}/events?${params.toString()}`,
    )
    return (data.items ?? []).map(fromGoogleEvent)
  },

  async createEvent(ctx, input) {
    const data = await calendarFetch<GoogleEvent>(ctx, `/calendars/${CALENDAR_ID}/events`, {
      method: 'POST',
      body: toGoogleEvent(input),
    })
    return fromGoogleEvent(data)
  },

  async updateEvent(ctx, id, input) {
    const data = await calendarFetch<GoogleEvent>(
      ctx,
      `/calendars/${CALENDAR_ID}/events/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: toGoogleEvent(input) },
    )
    return fromGoogleEvent(data)
  },

  async deleteEvent(ctx, id) {
    await calendarFetch<void>(ctx, `/calendars/${CALENDAR_ID}/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
