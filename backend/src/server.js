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
    console.log(`Projects: /api/v1/projects | /api/v1/invitations/:token`)
    console.log(`Agreements: /api/v1/projects/:id/agreements | /api/v1/agreements/:id`)
    console.log(`Milestones: /api/v1/projects/:id/milestones | /api/v1/milestones/:id`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err.message)
  process.exit(1)
})
