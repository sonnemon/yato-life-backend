import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import app from '../src/app.js'

// Use the Node.js runtime (supabase-js, jose and fetch all work there).
export const config = { runtime: 'nodejs' }

// Vercel serves functions under `/api/*`, so mount the root app there. The public
// API base on Vercel is therefore `https://<project>.vercel.app/api`.
const vercelApp = new Hono().route('/api', app)

export default handle(vercelApp)
