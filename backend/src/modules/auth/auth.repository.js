import { query } from '../../db/pool.js'

const PUBLIC_COLUMNS = `id, name, email, role, wallet_address, created_at, updated_at`

export async function findUserByEmail(email) {
  const { rows } = await query(
    `SELECT id, name, email, password_hash, role, wallet_address, created_at, updated_at
     FROM users WHERE lower(email) = lower($1)`,
    [email],
  )
  return rows[0] ?? null
}

export async function findUserById(id) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function createUser({ name, email, passwordHash, role }) {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, lower($2), $3, $4)
     RETURNING ${PUBLIC_COLUMNS}`,
    [name, email, passwordHash, role],
  )
  return rows[0]
}

export function toPublicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    walletAddress: row.wallet_address ?? null,
  }
}
