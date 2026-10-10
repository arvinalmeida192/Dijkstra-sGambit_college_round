import { createApp } from './app.js'
import { env } from './config/env.js'
import { pool } from './db/pool.js'

async function main() {
  // Fail fast if DB is unreachable
  await pool.query('SELECT 1')

  const app = createApp()
  app.listen(env.port, () => {
    console.log(`Fairwork API listening on http://localhost:${env.port}`)
    console.log(`Health: GET /health`)
    console.log(`Auth:   POST /api/v1/auth/register | /login | GET /me`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err.message)
  process.exit(1)
})
