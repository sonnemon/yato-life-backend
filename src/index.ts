import app from './app.js'
import { env } from './env.js'

// Local entry — `bun run src/index.ts`. Bun reads the default export and serves it.
console.log(`🚀 Yato Life backend (Bun) listening on http://localhost:${env.PORT}`)

export default {
  port: env.PORT,
  fetch: app.fetch,
}
