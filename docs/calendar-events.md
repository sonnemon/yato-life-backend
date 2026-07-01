# Calendar events API

Read and write the events of a connected calendar account (currently **Google
Calendar**). These endpoints are provider-agnostic: the provider is inferred
from the connection.

## Common

- **Base URL:** your API origin **plus `/api`** (e.g. `https://yato-flow.com/api`,
  or the ngrok URL + `/api` in dev). All paths below are relative to that base.
- **Auth:** every request needs the Supabase access token:
  `Authorization: Bearer <supabase-jwt>`.
  (In dev over ngrok, also send `ngrok-skip-browser-warning: true`.)
- **Connection model:** a *connection* is one linked provider account, obtained
  from `GET /calendar/connections` (its `id`). Events are always addressed by a
  connection id, so a user can have several accounts of the same provider.
- **Tokens:** the provider access token is refreshed automatically server-side;
  the client never deals with Google tokens.

### Event object (returned)

```jsonc
{
  "id": "abc123",                 // provider event id
  "providerId": "google",
  "title": "Reunión de equipo",
  "start": "2026-07-01T10:00:00-05:00",  // ISO 8601
  "end": "2026-07-01T11:00:00-05:00",    // ISO 8601
  "description": "...",           // optional
  "location": "...",              // optional
  "htmlLink": "https://www.google.com/calendar/event?eid=..." // optional
}
```

### Event input (for create)

```jsonc
{
  "title": "string",   // required, non-empty
  "start": "string",   // required, ISO 8601 datetime (offset/zone recommended)
  "end":   "string",   // required, ISO 8601 datetime
  "description": "string", // optional
  "location": "string"     // optional
}
```

---

## List events

```
GET /calendar/connections/:id/events
```

Lists events from the connection's primary calendar. Recurring events are
expanded into individual instances and ordered by start time.

### Query parameters

| Param  | Type    | Default | Description                                  |
| ------ | ------- | ------- | -------------------------------------------- |
| `from` | ISO 8601 | —      | Lower bound (Google `timeMin`, inclusive).   |
| `to`   | ISO 8601 | —      | Upper bound (Google `timeMax`, exclusive).   |
| `max`  | integer | `50`    | Max number of events to return.              |

### Response `200`

```jsonc
{
  "events": [ /* Event object, see above */ ]
}
```

### Example

```bash
curl "$API/calendar/connections/$CONN/events?from=2026-07-01T00:00:00Z&to=2026-07-08T00:00:00Z&max=100" \
  -H "Authorization: Bearer $JWT"
```

### Errors

| Status | When                                                            |
| ------ | --------------------------------------------------------------- |
| `401`  | Missing/invalid Supabase token.                                 |
| `404`  | Connection not found or not owned by this user.                 |
| `501`  | Provider not implemented (e.g. Microsoft/Apple stub).           |
| `4xx`  | Upstream provider error, surfaced with a `provider` field.      |

---

## Bulk-create events

```
POST /calendar/connections/:id/events/bulk
```

Create many events in one request. Google has **no native bulk insert**, so the
backend fans out to individual creates with bounded concurrency and reports
**per-item results** — partial success is normal.

### Body

```jsonc
{
  "events": [ /* 1..50 Event input objects */ ]
}
```

- Between **1 and 50** events per request.
- **Validation is all-or-nothing:** if *any* item is structurally invalid, the
  whole request is rejected with `400` and nothing is created.

### Response

- `201 Created` — every event was created.
- `207 Multi-Status` — at least one event failed (partial success).

```jsonc
{
  "summary": { "total": 3, "created": 2, "failed": 1 },
  "created": [
    { "index": 0, "event": { /* Event object */ } },
    { "index": 2, "event": { /* Event object */ } }
  ],
  "failed": [
    { "index": 1, "error": "..." }
  ]
}
```

- `index` is the position of the item in the request `events` array, so the
  client can map each result back to its input.
- The endpoint is **not idempotent**: retrying re-creates events. If you retry
  after a partial failure, resend only the `failed` indices.

### Example

```bash
curl -X POST "$API/calendar/connections/$CONN/events/bulk" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      { "title": "Bloque foco",  "start": "2026-07-01T09:00:00-05:00", "end": "2026-07-01T10:30:00-05:00" },
      { "title": "Almuerzo",     "start": "2026-07-01T13:00:00-05:00", "end": "2026-07-01T14:00:00-05:00" },
      { "title": "1:1 con Ana",  "start": "2026-07-01T16:00:00-05:00", "end": "2026-07-01T16:30:00-05:00", "location": "Meet" }
    ]
  }'
```

### Errors (before execution)

| Status | When                                                            |
| ------ | --------------------------------------------------------------- |
| `400`  | Body is not `{ events: [...] }`, empty, > 50, or any invalid item (`{ error, invalid: [{ index, error }] }`). |
| `401`  | Missing/invalid Supabase token.                                 |
| `404`  | Connection not found or not owned by this user.                 |
| `501`  | Provider not implemented.                                       |

Once execution starts, per-item upstream failures are reported in `failed`
(with `207`), not as a top-level error.
