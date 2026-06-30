/**
 * Validated, typed environment. Parsed once at startup — the process exits
 * with a readable error if anything required is missing.
 *
 * Data access goes through the Supabase SDK (see src/lib/supabase.ts), so we
 * only need the project URL + keys here, not a raw Postgres connection string.
 */

type Strategy = 'getuser' | 'jwks' | 'hs256'
const STRATEGIES: readonly Strategy[] = ['getuser', 'jwks', 'hs256']

const missing: string[] = []

function required(name: string): string {
  const value = Bun.env[name]
  if (!value) {
    missing.push(name)
    return ''
  }
  return value
}

function optional(name: string): string | undefined {
  return Bun.env[name] || undefined
}

const rawStrategy = Bun.env.AUTH_VERIFY_STRATEGY ?? 'getuser'
if (!STRATEGIES.includes(rawStrategy as Strategy)) {
  console.error(
    `❌ AUTH_VERIFY_STRATEGY must be one of ${STRATEGIES.join(', ')} (got "${rawStrategy}")`,
  )
  process.exit(1)
}

export const env = {
  NODE_ENV: Bun.env.NODE_ENV ?? 'development',
  PORT: Number(Bun.env.PORT ?? 3000),

  // Supabase project credentials — server-side only, never shipped to Electron.
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_JWT_SECRET: optional('SUPABASE_JWT_SECRET'), // only for the `hs256` strategy

  // How incoming Supabase JWTs are verified. See src/auth/verifier.ts.
  AUTH_VERIFY_STRATEGY: rawStrategy as Strategy,

  // Secret used to sign the short-lived OAuth `state` JWT (CSRF + user binding).
  OAUTH_STATE_SECRET: optional('OAUTH_STATE_SECRET'),

  // Google Calendar OAuth — the callback is handled by THIS API, not Electron.
  GOOGLE_CLIENT_ID: optional('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: optional('GOOGLE_CLIENT_SECRET'),
  GOOGLE_REDIRECT_URI: optional('GOOGLE_REDIRECT_URI'),

  // Deep link Electron is 302'd to after the OAuth dance, just to refocus it.
  OAUTH_SUCCESS_DEEP_LINK: Bun.env.OAUTH_SUCCESS_DEEP_LINK ?? 'yato://oauth/callback',
} as const

if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`)
  process.exit(1)
}

export type Env = typeof env

// ---------------------------------------------------------------------------
// Config readiness — used by GET /health/ready. Reports whether every env var
// the app needs has a value. "Required" is contextual: SUPABASE_JWT_SECRET only
// matters for the hs256 strategy, vars with defaults are always present.
// Never exposes secret VALUES, only whether each is set.
// ---------------------------------------------------------------------------
export type ConfigStatus = 'ok' | 'missing' | 'skipped'
export type ConfigCheck = { name: string; status: ConfigStatus; note?: string }

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

export function configReport(): { ok: boolean; missing: string[]; checks: ConfigCheck[] } {
  const checks: ConfigCheck[] = []

  const must = (name: string, value: unknown) => {
    checks.push({ name, status: hasValue(value) ? 'ok' : 'missing' })
  }
  const fixed = (name: string, value: unknown) => {
    // Has a default → always present; reported for completeness.
    checks.push({ name, status: hasValue(value) ? 'ok' : 'missing' })
  }
  const conditional = (name: string, value: unknown, required: boolean, note: string) => {
    if (required) checks.push({ name, status: hasValue(value) ? 'ok' : 'missing' })
    else checks.push({ name, status: hasValue(value) ? 'ok' : 'skipped', note })
  }

  fixed('NODE_ENV', env.NODE_ENV)
  fixed('PORT', env.PORT)
  fixed('AUTH_VERIFY_STRATEGY', env.AUTH_VERIFY_STRATEGY)
  fixed('OAUTH_SUCCESS_DEEP_LINK', env.OAUTH_SUCCESS_DEEP_LINK)

  must('SUPABASE_URL', env.SUPABASE_URL)
  must('SUPABASE_ANON_KEY', env.SUPABASE_ANON_KEY)
  must('SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY)

  conditional(
    'SUPABASE_JWT_SECRET',
    env.SUPABASE_JWT_SECRET,
    env.AUTH_VERIFY_STRATEGY === 'hs256',
    `not needed for the "${env.AUTH_VERIFY_STRATEGY}" strategy`,
  )

  must('OAUTH_STATE_SECRET', env.OAUTH_STATE_SECRET)
  must('GOOGLE_CLIENT_ID', env.GOOGLE_CLIENT_ID)
  must('GOOGLE_CLIENT_SECRET', env.GOOGLE_CLIENT_SECRET)
  must('GOOGLE_REDIRECT_URI', env.GOOGLE_REDIRECT_URI)

  const missingNames = checks.filter((c) => c.status === 'missing').map((c) => c.name)
  return { ok: missingNames.length === 0, missing: missingNames, checks }
}
