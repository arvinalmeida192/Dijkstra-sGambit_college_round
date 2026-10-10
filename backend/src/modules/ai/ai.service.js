import { getAiConfig } from '../../config/ai.js'
import { conflict, forbidden, notFound } from '../../utils/errors.js'
import { findProjectById } from '../projects/project.repository.js'
import { assertParticipant } from '../projects/project.service.js'
import { findMilestoneById } from '../milestones/milestone.repository.js'
import {
  findSubmissionById,
  insertAuditLog,
} from '../submissions/submission.repository.js'
import {
  findDisputeById,
  listEvidenceForDispute,
} from '../disputes/dispute.repository.js'
import { getDefaultAdapter } from './ai.adapter.js'
import {
  buildAcceptanceSystemPrompt,
  buildDisputeSystemPrompt,
  prepareDisputeEvidence,
  prepareSubmissionEvidence,
} from './ai.evidence.js'
import {
  modelsForType,
  resolveDeliverableType,
} from './ai.routing.js'
import {
  assessmentsDisagreeMaterially,
  validateDisputeSummary,
  validateStructuredAssessment,
} from './ai.schema.js'
import {
  insertAssessment,
  latestAssessmentForDispute,
  latestAssessmentForSubmission,
  listAssessmentsForDispute,
  listAssessmentsForMilestone,
  listAssessmentsForSubmission,
  toPublicAssessment,
} from './ai.repository.js'

function storeFailure({
  kind,
  projectId,
  milestoneId = null,
  submissionId = null,
  disputeId = null,
  deliverableType = null,
  status,
  errorMessage,
  modelPrimary = null,
  modelSecondary = null,
  compareMode = false,
  createdBy,
  result = {},
}) {
  const config = getAiConfig()
  return insertAssessment({
    kind,
    status,
    projectId,
    milestoneId,
    submissionId,
    disputeId,
    deliverableType,
    provider: config.provider,
    modelPrimary,
    modelSecondary,
    compareMode,
    result,
    advisoryNotice: config.advisoryNotice,
    errorMessage,
    createdBy,
  })
}

async function runOneModel(adapter, { model, system, prompt, images }) {
  const gen = await adapter.generate({ model, system, prompt, images })
  if (!gen.ok) {
    return { ok: false, code: gen.code, error: gen.error, model }
  }
  return { ok: true, text: gen.text, model }
}

/**
 * Acceptance-criteria assessment for a submission.
 * Never mutates milestone/dispute/payment state.
 */
export async function assessSubmission(
  user,
  submissionId,
  input = {},
  { adapter = getDefaultAdapter() } = {},
) {
  const submission = await findSubmissionById(submissionId)
  if (!submission) throw notFound('Submission not found.')

  const milestone = await findMilestoneById(submission.milestone_id)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await findProjectById(submission.project_id)
  assertParticipant(project, user)

  const config = getAiConfig()
  if (!config.enabled) {
    const row = await storeFailure({
      kind: 'ACCEPTANCE_CRITERIA',
      projectId: submission.project_id,
      milestoneId: submission.milestone_id,
      submissionId: submission.id,
      status: 'SKIPPED',
      errorMessage: 'AI_ENABLED is false.',
      createdBy: user.id,
    })
    return {
      assessment: toPublicAssessment(row),
      notice: config.advisoryNotice,
    }
  }

  const deliverableType = resolveDeliverableType({
    deliverableType: input.deliverableType,
    contentType: submission.content_type,
    originalFilename: submission.original_filename,
    externalUrl: submission.external_url,
    notes: submission.notes,
  })
  const models = modelsForType(config, deliverableType)
  const primary = models[0]
  const secondary = models[1] ?? null

  const evidence = await prepareSubmissionEvidence({
    submission,
    milestone,
    deliverableType,
  })
  const system = buildAcceptanceSystemPrompt()
  const prompt = [
    evidence.promptContext,
    '',
    'Produce the JSON assessment now.',
  ].join('\n')

  const first = await runOneModel(adapter, {
    model: primary,
    system,
    prompt,
    images: evidence.imagesBase64,
  })

  if (!first.ok) {
    const status =
      first.code === 'SKIPPED'
        ? 'SKIPPED'
        : first.code === 'INVALID_OUTPUT'
          ? 'INVALID_OUTPUT'
          : 'MODEL_UNAVAILABLE'
    const row = await storeFailure({
      kind: 'ACCEPTANCE_CRITERIA',
      projectId: submission.project_id,
      milestoneId: submission.milestone_id,
      submissionId: submission.id,
      deliverableType,
      status,
      errorMessage: first.error,
      modelPrimary: primary,
      createdBy: user.id,
    })
    await insertAuditLog({
      actorId: user.id,
      projectId: submission.project_id,
      milestoneId: submission.milestone_id,
      submissionId: submission.id,
      action: 'AI_ASSESSMENT_FAILED',
      metadata: { status, error: first.error, model: primary },
    })
    return {
      assessment: toPublicAssessment(row),
      notice: config.advisoryNotice,
    }
  }

  const validated = validateStructuredAssessment(first.text)
  if (!validated.ok) {
    const row = await storeFailure({
      kind: 'ACCEPTANCE_CRITERIA',
      projectId: submission.project_id,
      milestoneId: submission.milestone_id,
      submissionId: submission.id,
      deliverableType,
      status: 'INVALID_OUTPUT',
      errorMessage: validated.error,
      modelPrimary: primary,
      createdBy: user.id,
      result: { rawPreview: String(first.text).slice(0, 500) },
    })
    return {
      assessment: toPublicAssessment(row),
      notice: config.advisoryNotice,
    }
  }

  // Merge known evidence refs from prep so provenance is never empty by model omission.
  const assessmentValue = {
    ...validated.value,
    evidenceReferences: [
      ...new Set([
        ...(validated.value.evidenceReferences ?? []),
        ...evidence.evidenceReferences,
      ]),
    ],
  }

  const confidence =
    typeof assessmentValue.confidence === 'number'
      ? assessmentValue.confidence
      : null
  const forceCompare = Boolean(input.compare)
  const shouldCompare =
    Boolean(secondary) &&
    (forceCompare ||
      (config.compareOnLowConfidence &&
        (confidence == null ||
          confidence < config.lowConfidenceThreshold ||
          (assessmentValue.uncertainty?.length ?? 0) > 0))) &&
    (deliverableType === 'TEXT' ||
      deliverableType === 'VISUAL' ||
      forceCompare)

  let compareMode = false
  let modelSecondary = null
  let status = 'COMPLETED'
  let errorMessage = null
  let resultPayload = {
    assessment: assessmentValue,
    modelsRun: [primary],
  }

  if (shouldCompare) {
    compareMode = true
    modelSecondary = secondary
    const second = await runOneModel(adapter, {
      model: secondary,
      system,
      prompt,
      images: evidence.imagesBase64,
    })
    if (!second.ok) {
      status = 'NEEDS_HUMAN_REVIEW'
      errorMessage = `Primary model returned output but secondary compare failed: ${second.error}`
      resultPayload.compareError = second.error
    } else {
      const validated2 = validateStructuredAssessment(second.text)
      if (!validated2.ok) {
        status = 'NEEDS_HUMAN_REVIEW'
        errorMessage = `Secondary model output invalid: ${validated2.error}`
      } else {
        resultPayload.modelsRun.push(secondary)
        resultPayload.secondaryAssessment = validated2.value
        if (assessmentsDisagreeMaterially(assessmentValue, validated2.value)) {
          status = 'MODEL_DISAGREEMENT'
          errorMessage =
            'Models disagreed materially on criterion status. Human review required.'
        }
      }
    }
  }

  // CODE path: never auto-prefer a model; single run unless compare forced.
  if (deliverableType === 'CODE' && !forceCompare) {
    compareMode = false
  }

  const row = await insertAssessment({
    kind: 'ACCEPTANCE_CRITERIA',
    status,
    projectId: submission.project_id,
    milestoneId: submission.milestone_id,
    submissionId: submission.id,
    deliverableType,
    provider: config.provider,
    modelPrimary: primary,
    modelSecondary,
    compareMode,
    result: resultPayload,
    advisoryNotice: config.advisoryNotice,
    errorMessage,
    createdBy: user.id,
  })

  await insertAuditLog({
    actorId: user.id,
    projectId: submission.project_id,
    milestoneId: submission.milestone_id,
    submissionId: submission.id,
    action: 'AI_ASSESSMENT_CREATED',
    metadata: {
      assessmentId: row.id,
      status,
      deliverableType,
      models: resultPayload.modelsRun,
      advisoryOnly: true,
    },
  })

  return {
    assessment: toPublicAssessment(row),
    notice: config.advisoryNotice,
  }
}

export async function summarizeDispute(
  user,
  disputeId,
  { adapter = getDefaultAdapter() } = {},
) {
  const dispute = await findDisputeById(disputeId)
  if (!dispute) throw notFound('Dispute not found.')

  const project = await findProjectById(dispute.project_id)
  const access = assertParticipant(project, user)
  if (
    !access.isClient &&
    !access.isFreelancer &&
    !access.isArbitrator &&
    user.role !== 'ARBITRATOR'
  ) {
    throw forbidden('You do not have access to this dispute.')
  }

  const config = getAiConfig()
  const milestone = dispute.milestone_id
    ? await findMilestoneById(dispute.milestone_id)
    : null
  const evidenceRows = await listEvidenceForDispute(disputeId)

  if (!config.enabled) {
    const row = await storeFailure({
      kind: 'DISPUTE_EVIDENCE_SUMMARY',
      projectId: dispute.project_id,
      milestoneId: dispute.milestone_id,
      disputeId: dispute.id,
      status: 'SKIPPED',
      errorMessage: 'AI_ENABLED is false.',
      createdBy: user.id,
    })
    return {
      assessment: toPublicAssessment(row),
      notice: config.advisoryNotice,
    }
  }

  // Dispute summaries use TEXT routing by default.
  const models = modelsForType(config, 'TEXT')
  const primary = models[0]
  const pack = prepareDisputeEvidence({
    dispute,
    evidenceRows,
    milestone,
  })
  const gen = await runOneModel(adapter, {
    model: primary,
    system: buildDisputeSystemPrompt(),
    prompt: `${pack.promptContext}\n\nProduce the JSON summary now.`,
  })

  if (!gen.ok) {
    const status =
      gen.code === 'SKIPPED'
        ? 'SKIPPED'
        : gen.code === 'INVALID_OUTPUT'
          ? 'INVALID_OUTPUT'
          : 'MODEL_UNAVAILABLE'
    const row = await storeFailure({
      kind: 'DISPUTE_EVIDENCE_SUMMARY',
      projectId: dispute.project_id,
      milestoneId: dispute.milestone_id,
      disputeId: dispute.id,
      deliverableType: 'TEXT',
      status,
      errorMessage: gen.error,
      modelPrimary: primary,
      createdBy: user.id,
    })
    return {
      assessment: toPublicAssessment(row),
      notice: config.advisoryNotice,
    }
  }

  const validated = validateDisputeSummary(gen.text)
  if (!validated.ok) {
    const row = await storeFailure({
      kind: 'DISPUTE_EVIDENCE_SUMMARY',
      projectId: dispute.project_id,
      milestoneId: dispute.milestone_id,
      disputeId: dispute.id,
      deliverableType: 'TEXT',
      status: 'INVALID_OUTPUT',
      errorMessage: validated.error,
      modelPrimary: primary,
      createdBy: user.id,
    })
    return {
      assessment: toPublicAssessment(row),
      notice: config.advisoryNotice,
    }
  }

  const summary = {
    ...validated.value,
    evidenceReferences: [
      ...new Set([
        ...(validated.value.evidenceReferences ?? []),
        ...pack.evidenceReferences,
      ]),
    ],
    recommendedDecision: null,
  }

  const row = await insertAssessment({
    kind: 'DISPUTE_EVIDENCE_SUMMARY',
    status: 'COMPLETED',
    projectId: dispute.project_id,
    milestoneId: dispute.milestone_id,
    disputeId: dispute.id,
    deliverableType: 'TEXT',
    provider: config.provider,
    modelPrimary: primary,
    compareMode: false,
    result: { summary, modelsRun: [primary] },
    advisoryNotice: config.advisoryNotice,
    createdBy: user.id,
  })

  await insertAuditLog({
    actorId: user.id,
    projectId: dispute.project_id,
    milestoneId: dispute.milestone_id,
    action: 'AI_DISPUTE_SUMMARY_CREATED',
    metadata: {
      assessmentId: row.id,
      disputeId: dispute.id,
      advisoryOnly: true,
    },
  })

  return {
    assessment: toPublicAssessment(row),
    notice: config.advisoryNotice,
  }
}

export async function getLatestForSubmission(user, submissionId) {
  const submission = await findSubmissionById(submissionId)
  if (!submission) throw notFound('Submission not found.')
  const project = await findProjectById(submission.project_id)
  assertParticipant(project, user)
  const row = await latestAssessmentForSubmission(submissionId)
  return {
    assessment: row ? toPublicAssessment(row) : null,
    notice: getAiConfig().advisoryNotice,
  }
}

export async function listForSubmission(user, submissionId) {
  const submission = await findSubmissionById(submissionId)
  if (!submission) throw notFound('Submission not found.')
  const project = await findProjectById(submission.project_id)
  assertParticipant(project, user)
  const rows = await listAssessmentsForSubmission(submissionId)
  return { assessments: rows.map(toPublicAssessment) }
}

export async function listForMilestone(user, milestoneId) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')
  const project = await findProjectById(milestone.project_id)
  assertParticipant(project, user)
  const rows = await listAssessmentsForMilestone(milestoneId)
  return { assessments: rows.map(toPublicAssessment) }
}

export async function getLatestForDispute(user, disputeId) {
  const dispute = await findDisputeById(disputeId)
  if (!dispute) throw notFound('Dispute not found.')
  const project = await findProjectById(dispute.project_id)
  assertParticipant(project, user)
  const row = await latestAssessmentForDispute(disputeId)
  return {
    assessment: row ? toPublicAssessment(row) : null,
    notice: getAiConfig().advisoryNotice,
  }
}

export async function listForDispute(user, disputeId) {
  const dispute = await findDisputeById(disputeId)
  if (!dispute) throw notFound('Dispute not found.')
  const project = await findProjectById(dispute.project_id)
  assertParticipant(project, user)
  const rows = await listAssessmentsForDispute(disputeId)
  return { assessments: rows.map(toPublicAssessment) }
}

/**
 * Benchmark harness: runs fixtures against configured candidates.
 * Does NOT declare a preferred model — returns raw scores for human review.
 */
export async function benchmarkModels(
  user,
  input,
  { adapter = getDefaultAdapter() } = {},
) {
  if (user.role !== 'CLIENT' && user.role !== 'ARBITRATOR') {
    throw forbidden('Only clients or arbitrators may run benchmarks.')
  }
  const config = getAiConfig()
  if (!config.enabled) {
    throw conflict('AI is disabled.')
  }
  const models = modelsForType(config, input.deliverableType)
  const system = buildAcceptanceSystemPrompt()
  const results = []

  for (const model of models) {
    const perFixture = []
    for (const fixture of input.fixtures) {
      const gen = await runOneModel(adapter, {
        model,
        system,
        prompt: fixture.prompt,
      })
      if (!gen.ok) {
        perFixture.push({
          fixtureId: fixture.id,
          ok: false,
          error: gen.error,
          code: gen.code,
        })
        continue
      }
      const validated = validateStructuredAssessment(gen.text)
      perFixture.push({
        fixtureId: fixture.id,
        ok: validated.ok,
        error: validated.ok ? null : validated.error,
        assessment: validated.ok ? validated.value : null,
      })
    }
    results.push({
      model,
      fixtures: perFixture,
      note: 'Routing default only — not a declared preferred model.',
    })
  }

  return {
    deliverableType: input.deliverableType,
    preferredModelClaimed: false,
    results,
    notice:
      'Benchmark results are for human review. Do not claim a preferred model without reviewing outcomes.',
  }
}
