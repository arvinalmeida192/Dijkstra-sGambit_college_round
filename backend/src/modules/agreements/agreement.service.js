import {
  conflict,
  forbidden,
  notFound,
} from '../../utils/errors.js'
import { insertMilestone } from '../milestones/milestone.repository.js'
import { findProjectById } from '../projects/project.repository.js'
import { assertParticipant } from '../projects/project.service.js'
import {
  activateAgreement,
  findActiveAgreement,
  findAgreementById,
  findProposedAgreement,
  insertAcceptance,
  insertAgreement,
  listAcceptances,
  listAcceptancesForAgreements,
  listAgreementsForProject,
  nextVersionNumber,
  toPublicAgreement,
  withTransaction,
  withdrawProposedAgreements,
} from './agreement.repository.js'

function assertClientOwner(project, user) {
  assertParticipant(project, user)
  if (project.client_id !== user.id) {
    throw forbidden('Only the project client can perform this action.')
  }
}

function assertCanAccept(project, user) {
  assertParticipant(project, user)
  const isClient = project.client_id === user.id
  const isFreelancer = project.freelancer_id === user.id
  if (!isClient && !isFreelancer) {
    throw forbidden('Only the project client or freelancer can accept agreements.')
  }
}

/** Both client and freelancer must be on the project and have accepted. */
function hasAllRequiredAcceptances(project, acceptanceRows) {
  if (!project.freelancer_id) return false
  const accepted = new Set(acceptanceRows.map((row) => row.user_id))
  return (
    accepted.has(project.client_id) && accepted.has(project.freelancer_id)
  )
}

async function loadAgreementPublic(agreementRow) {
  const acceptances = await listAcceptances(agreementRow.id)
  return toPublicAgreement(agreementRow, acceptances)
}

export async function listAgreements(user, projectId) {
  const project = await findProjectById(projectId)
  assertParticipant(project, user)

  const rows = await listAgreementsForProject(projectId)
  const acceptances = await listAcceptancesForAgreements(rows.map((r) => r.id))
  const byAgreement = new Map()
  for (const row of acceptances) {
    const list = byAgreement.get(row.agreement_id) ?? []
    list.push(row)
    byAgreement.set(row.agreement_id, list)
  }

  return {
    agreements: rows.map((row) =>
      toPublicAgreement(row, byAgreement.get(row.id) ?? []),
    ),
    activeAgreementId:
      rows.find((row) => row.status === 'ACTIVE')?.id ?? null,
    proposedAgreementId:
      rows.find((row) => row.status === 'PROPOSED')?.id ?? null,
  }
}

export async function getAgreement(user, agreementId) {
  const agreement = await findAgreementById(agreementId)
  if (!agreement) throw notFound('Agreement not found.')

  const project = await findProjectById(agreement.project_id)
  assertParticipant(project, user)

  return loadAgreementPublic(agreement)
}

export async function createAgreement(user, projectId, input) {
  const project = await findProjectById(projectId)
  assertClientOwner(project, user)

  if (project.status === 'CANCELLED' || project.status === 'COMPLETED') {
    throw conflict(
      `Cannot create an agreement on a ${project.status.toLowerCase()} project.`,
    )
  }

  const existing = await listAgreementsForProject(projectId)
  if (existing.length > 0) {
    throw conflict(
      'This project already has agreement versions. Use propose-change to revise terms.',
    )
  }

  const row = await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM milestones WHERE project_id = $1 AND agreement_id IS NULL AND status = 'PENDING'`,
      [projectId],
    )

    const agreement = await insertAgreement(
      {
        projectId,
        version: 1,
        terms: input.terms,
        createdBy: user.id,
        status: 'PROPOSED',
      },
      client,
    )

    if (Array.isArray(input.terms?.milestones)) {
      for (let i = 0; i < input.terms.milestones.length; i++) {
        const m = input.terms.milestones[i]
        await insertMilestone(
          {
            projectId,
            agreementId: agreement.id,
            title: m.title,
            description: m.description ?? m.deliverables ?? '',
            deliverables: m.deliverables ?? m.description ?? '',
            acceptanceCriteria:
              m.acceptanceCriteria ??
              m.description ??
              m.deliverables ??
              'Deliverable accepted',
            amount: m.amount,
            dueDate: m.dueDate ?? null,
            reviewWindowDays: m.reviewWindowDays ?? null,
            sortOrder: i,
            createdBy: user.id,
            status: 'PENDING',
          },
          client,
        )
      }
    }

    return agreement
  })

  return loadAgreementPublic(row)
}

export async function proposeChange(user, agreementId, input) {
  const base = await findAgreementById(agreementId)
  if (!base) throw notFound('Agreement not found.')

  const project = await findProjectById(base.project_id)
  assertParticipant(project, user)

  const isClient = project.client_id === user.id
  const isFreelancer = project.freelancer_id === user.id
  if (!isClient && !isFreelancer) {
    throw forbidden('Only project participants can propose agreement changes.')
  }

  if (project.status === 'CANCELLED' || project.status === 'COMPLETED') {
    throw conflict(
      `Cannot propose changes on a ${project.status.toLowerCase()} project.`,
    )
  }

  // Prefer proposing against the active version; allow propose from an older
  // version only as a convenience but still chain from current tip.
  const active = await findActiveAgreement(project.id)
  const supersedesId = active?.id ?? base.id

  const row = await withTransaction(async (client) => {
    await withdrawProposedAgreements(project.id, client)
    const version = await nextVersionNumber(project.id, client)
    return insertAgreement(
      {
        projectId: project.id,
        version,
        terms: input.terms,
        createdBy: user.id,
        supersedesId,
        status: 'PROPOSED',
      },
      client,
    )
  })

  return loadAgreementPublic(row)
}

export async function acceptAgreement(user, agreementId, input = {}) {
  const agreement = await findAgreementById(agreementId)
  if (!agreement) throw notFound('Agreement not found.')

  const project = await findProjectById(agreement.project_id)
  assertCanAccept(project, user)

  if (agreement.status !== 'PROPOSED') {
    throw conflict(
      `Only proposed agreements can be accepted (current status: ${agreement.status}).`,
    )
  }

  // Ensure this is still the open proposal (not a stale withdrawn race).
  const open = await findProposedAgreement(project.id)
  if (!open || open.id !== agreement.id) {
    throw conflict('This proposal is no longer open.')
  }

  try {
    await insertAcceptance({
      agreementId: agreement.id,
      userId: user.id,
      signatureRef: input.signatureRef ?? null,
    })
  } catch (err) {
    if (err?.code === '23505') {
      throw conflict('You have already accepted this agreement version.')
    }
    throw err
  }

  let acceptances = await listAcceptances(agreement.id)
  let current = agreement

  if (hasAllRequiredAcceptances(project, acceptances)) {
    current = await withTransaction(async (client) => {
      const { rows: activeRows } = await client.query(
        `SELECT id FROM agreements
         WHERE project_id = $1 AND status = 'ACTIVE'
         LIMIT 1`,
        [project.id],
      )
      const previousActiveId = activeRows[0]?.id ?? null
      const activated = await activateAgreement(
        agreement.id,
        previousActiveId,
        client,
      )
      if (!activated) {
        throw conflict('Agreement could not be activated.')
      }

      if (previousActiveId && Array.isArray(agreement.terms?.milestones)) {
        await syncAgreementMilestones(project.id, agreement, client)
      }

      return activated
    })
    acceptances = await listAcceptances(current.id)
  }

  return toPublicAgreement(current, acceptances)
}

async function syncAgreementMilestones(projectId, agreement, client) {
  const { rows: existing } = await client.query(
    `SELECT * FROM milestones WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [projectId],
  )
  const termsMilestones = agreement.terms?.milestones ?? []

  for (let i = 0; i < termsMilestones.length; i++) {
    const m = termsMilestones[i]
    if (existing[i]) {
      if (existing[i].status === 'PENDING') {
        await client.query(
          `UPDATE milestones
           SET agreement_id = $1,
               title = $2,
               description = $3,
               deliverables = $4,
               acceptance_criteria = $5,
               amount = $6,
               due_date = $7,
               review_window_days = $8,
               sort_order = $9,
               updated_at = NOW()
           WHERE id = $10`,
          [
            agreement.id,
            m.title,
            m.description ?? m.deliverables ?? '',
            m.deliverables ?? m.description ?? '',
            m.acceptanceCriteria ??
              m.description ??
              m.deliverables ??
              'Deliverable accepted',
            m.amount,
            m.dueDate ?? null,
            m.reviewWindowDays ?? null,
            i,
            existing[i].id,
          ],
        )
      } else {
        await client.query(
          `UPDATE milestones SET agreement_id = $1, updated_at = NOW() WHERE id = $2`,
          [agreement.id, existing[i].id],
        )
      }
    } else {
      await insertMilestone(
        {
          projectId,
          agreementId: agreement.id,
          title: m.title,
          description: m.description ?? m.deliverables ?? '',
          deliverables: m.deliverables ?? m.description ?? '',
          acceptanceCriteria:
            m.acceptanceCriteria ??
            m.description ??
            m.deliverables ??
            'Deliverable accepted',
          amount: m.amount,
          dueDate: m.dueDate ?? null,
          reviewWindowDays: m.reviewWindowDays ?? null,
          sortOrder: i,
          createdBy: agreement.created_by,
          status: 'PENDING',
        },
        client,
      )
    }
  }

  if (existing.length > termsMilestones.length) {
    for (let i = termsMilestones.length; i < existing.length; i++) {
      if (existing[i].status === 'PENDING') {
        await client.query(`DELETE FROM milestones WHERE id = $1`, [
          existing[i].id,
        ])
      }
    }
  }
}

