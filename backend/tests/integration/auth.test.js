import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'

const app = createApp()

async function resetUsers() {
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')
}

beforeAll(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await resetUsers()
})

afterAll(async () => {
  await pool.end()
})

describe('POST /api/v1/auth/register', () => {
  it('creates a CLIENT account and returns a session', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Casey Client',
      email: 'casey@example.com',
      password: 'password123',
      role: 'CLIENT',
    })

    expect(res.status).toBe(201)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user).toMatchObject({
      name: 'Casey Client',
      email: 'casey@example.com',
      role: 'CLIENT',
    })
    expect(res.body.user).not.toHaveProperty('password')
    expect(res.body.user).not.toHaveProperty('password_hash')
  })

  it('creates a FREELANCER account', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Fran Freelancer',
      email: 'fran@example.com',
      password: 'password123',
      role: 'FREELANCER',
    })

    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('FREELANCER')
  })

  it('rejects ARBITRATOR self-registration', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Arb',
      email: 'arb@example.com',
      password: 'password123',
      role: 'ARBITRATOR',
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
  })

  it('rejects duplicate email', async () => {
    const payload = {
      name: 'Casey Client',
      email: 'dup@example.com',
      password: 'password123',
      role: 'CLIENT',
    }
    await request(app).post('/api/v1/auth/register').send(payload)
    const res = await request(app).post('/api/v1/auth/register').send(payload)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('CONFLICT')
  })

  it('rejects invalid bodies', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'A',
      email: 'not-an-email',
      password: 'short',
      role: 'CLIENT',
    })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION_ERROR')
    expect(res.body.details?.length).toBeGreaterThan(0)
  })
})

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/register').send({
      name: 'Casey Client',
      email: 'casey@example.com',
      password: 'password123',
      role: 'CLIENT',
    })
  })

  it('returns a session for valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'casey@example.com',
      password: 'password123',
    })

    expect(res.status).toBe(200)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user.email).toBe('casey@example.com')
  })

  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'casey@example.com',
      password: 'wrong-password',
    })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('rejects unknown email', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'nobody@example.com',
      password: 'password123',
    })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })
})

describe('GET /api/v1/auth/me', () => {
  let token

  beforeEach(async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Casey Client',
      email: 'casey@example.com',
      password: 'password123',
      role: 'CLIENT',
    })
    token = res.body.token
  })

  it('returns the authenticated user', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({
      email: 'casey@example.com',
      role: 'CLIENT',
    })
  })

  it('rejects missing token', async () => {
    const res = await request(app).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })

  it('rejects invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHORIZED')
  })
})
