import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'
import { sha256Hex } from '../../src/utils/hash.js'

const app = createApp()

const sampleMilestone = {
  title: 'Design',
  deliverables: 'Figma file',
  acceptanceCriteria: 'Approved mockups',
  amount: 25000,
  dueDate: '2026-11-15',
  reviewWindowDays: 5,
}

async function resetDb() {
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')
}

async function register(role, overrides = {}) {
  const email =
    overrides.email ??
    `${role.toLowerCase()}-${Math.random().toString(16).slice(2)}@example.com`
  const res = await request(app).post('/api/v1/auth/register').send({
    name: overrides.name ?? `${role} User`,
    email,
    password: 'password123',
    role,
  })
  expect(res.status).toBe(201)
  return { token: res.body.token, user: res.body.user, email }
}

async function createProjectWithFreelancer() {
  const client = await register('CLIENT')
  const freelancer = await register('FREELANCER')

  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${client.token}`)
    .send({ title: 'Submission project', description: 'Work items' })
  expect(projectRes.status).toBe(201)
  const projectId = projectRes.body.project.id

  const inviteRes = await request(app)
    .post(`/api/v1/projects/${projectId}/invitations`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({})
  expect(inviteRes.status).toBe(201)

  const acceptRes = await request(app)
    .post(`/api/v1/invitations/${inviteRes.body.invitation.token}/accept`)
    .set('Authorization', `Bearer ${freelancer.token}`)
  expect(acceptRes.status).toBe(200)

  return { client, freelancer, projectId }
}

async function createMilestone(token, projectId, body = sampleMilestone) {
  const res = await request(app)
    .post(`/api/v1/projects/${projectId}/milestones`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
  expect(res.status).toBe(201)
  return res.body.milestone
}

async function setStatus(token, milestoneId, status, note) {
  return request(app)
    .patch(`/api/v1/milestones/${milestoneId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send(note ? { status, note } : { status })
}

async function readyMilestone(clientToken, freelancerToken, projectId) {
  const m = await createMilestone(clientToken, projectId)
  let res = await setStatus(freelancerToken, m.id, 'IN_PROGRESS')
  expect(res.status).toBe(200)
  return res.body.milestone
}

beforeAll(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await pool.end()
})

describe('Submissions API', () => {
  it('creates a link submission, hashes uploads server-side, and rejects client hashes', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()
    const milestone = await readyMilestone(
      client.token,
      freelancer.token,
      projectId,
    )

    const linkRes = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({
        notes: 'First pass',
        externalUrl: 'https://example.com/deliverable',
      })
    expect(linkRes.status).toBe(201)
    expect(linkRes.body.submission).toMatchObject({
      revision: 1,
      hasFile: false,
      sha256Hash: null,
      externalUrl: 'https://example.com/deliverable',
      notes: 'First pass',
    })
    expect(linkRes.body.submission.fileRef).toBeUndefined()
    expect(linkRes.body.milestone.status).toBe('SUBMITTED')

    // Reset path for file upload: request revision then resubmit with file.
    const revRes = await request(app)
      .post(`/api/v1/submissions/${linkRes.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        decision: 'REVISION_REQUESTED',
        feedback: 'Add the PDF',
        unmetCriteria: ['Approved mockups'],
      })
    expect(revRes.status).toBe(200)
    expect(revRes.body.milestone.status).toBe('REVISION_REQUESTED')

    const payload = Buffer.from('fairwork-deliverable-bytes')
    const expectedHash = sha256Hex(payload)

    const rejectHash = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .field('notes', 'with fake hash')
      .field('sha256Hash', 'a'.repeat(64))
      .attach('file', payload, {
        filename: 'work.txt',
        contentType: 'text/plain',
      })
    expect(rejectHash.status).toBe(409)
    expect(rejectHash.body.message).toMatch(/sha256Hash/i)

    const fileRes = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .field('notes', 'PDF attached')
      .attach('file', payload, {
        filename: 'work.txt',
        contentType: 'text/plain',
      })
    expect(fileRes.status).toBe(201)
    expect(fileRes.body.submission).toMatchObject({
      revision: 2,
      hasFile: true,
      sha256Hash: expectedHash,
      originalFilename: 'work.txt',
      contentType: 'text/plain',
      byteSize: payload.length,
    })
    expect(fileRes.body.milestone.status).toBe('SUBMITTED')

    const dl = await request(app)
      .get(`/api/v1/submissions/${fileRes.body.submission.id}/file`)
      .set('Authorization', `Bearer ${client.token}`)
      .buffer(true)
      .parse((res, fn) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => fn(null, Buffer.concat(chunks)))
      })
    expect(dl.status).toBe(200)
    expect(dl.headers['x-content-sha256']).toBe(expectedHash)
    expect(Buffer.isBuffer(dl.body)).toBe(true)
    expect(dl.body.equals(payload)).toBe(true)

    const outsider = await register('CLIENT')
    const denied = await request(app)
      .get(`/api/v1/submissions/${fileRes.body.submission.id}/file`)
      .set('Authorization', `Bearer ${outsider.token}`)
    expect(denied.status).toBe(403)
  })

  it('enforces permissions and review transitions on the latest revision', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()
    const milestone = await readyMilestone(
      client.token,
      freelancer.token,
      projectId,
    )

    const clientSubmit = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ notes: 'nope' })
    expect(clientSubmit.status).toBe(403)

    const created = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ notes: 'v1' })
    expect(created.status).toBe(201)
    const submissionId = created.body.submission.id

    const freelancerApprove = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ decision: 'APPROVED' })
    expect(freelancerApprove.status).toBe(403)

    const start = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ decision: 'START_REVIEW' })
    expect(start.status).toBe(200)
    expect(start.body.milestone.status).toBe('IN_REVIEW')
    expect(start.body.milestone.reviewStartedAt).toBeTruthy()
    expect(start.body.review.decision).toBe('START_REVIEW')

    const approve = await request(app)
      .post(`/api/v1/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ decision: 'APPROVED' })
    expect(approve.status).toBe(200)
    expect(approve.body.milestone.status).toBe('APPROVED')

    const list = await request(app)
      .get(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(list.status).toBe(200)
    expect(list.body.submissions).toHaveLength(1)
    expect(list.body.submissions[0].reviews.map((r) => r.decision)).toEqual([
      'START_REVIEW',
      'APPROVED',
    ])

    const audit = await pool.query(
      `SELECT action FROM audit_logs WHERE milestone_id = $1 ORDER BY created_at`,
      [milestone.id],
    )
    expect(audit.rows.map((r) => r.action)).toEqual([
      'SUBMISSION_CREATED',
      'VERIFICATION_NEEDS_HUMAN_REVIEW',
      'SUBMISSION_REVIEWED',
      'SUBMISSION_REVIEWED',
    ])
  })

  it('supports approve-from-SUBMITTED and revision cycles', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()
    const milestone = await readyMilestone(
      client.token,
      freelancer.token,
      projectId,
    )

    const v1 = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ notes: 'draft' })
    expect(v1.status).toBe(201)

    const revision = await request(app)
      .post(`/api/v1/submissions/${v1.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        decision: 'REVISION_REQUESTED',
        feedback: 'More detail',
        unmetCriteria: ['Approved mockups'],
      })
    expect(revision.status).toBe(200)
    expect(revision.body.milestone.status).toBe('REVISION_REQUESTED')

    const staleReview = await request(app)
      .post(`/api/v1/submissions/${v1.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ decision: 'APPROVED' })
    expect(staleReview.status).toBe(409)

    const v2 = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ notes: 'final', externalUrl: 'https://example.com/final' })
    expect(v2.status).toBe(201)
    expect(v2.body.submission.revision).toBe(2)

    const approve = await request(app)
      .post(`/api/v1/submissions/${v2.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ decision: 'APPROVED' })
    expect(approve.status).toBe(200)
    expect(approve.body.milestone.status).toBe('APPROVED')
    expect(approve.body.milestone.approvedAt).toBeTruthy()
  })

  it('blocks submission in the wrong milestone state', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()
    const m = await createMilestone(client.token, projectId)

    const pending = await request(app)
      .post(`/api/v1/milestones/${m.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ notes: 'too early' })
    expect(pending.status).toBe(409)
  })
})

describe('private storage path safety', () => {
  it('does not serve the storage directory as a static public route', async () => {
    const res = await request(app).get('/storage/private/anything')
    expect(res.status).toBe(404)
  })
})
