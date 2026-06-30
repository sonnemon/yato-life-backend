import { createClient } from '@supabase/supabase-js'
import { env } from '../env'

/**
 * Privileged client — uses the service_role key and BYPASSES RLS.
 * Every query made through it MUST be scoped to a JWT-derived user_id,
 * never to a value taken from the request body.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Anon client — used only by the `getuser` verification strategy. */
export const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
