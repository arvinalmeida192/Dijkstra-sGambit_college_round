import { assertUuid } from '../milestones/milestone.validation.js'
import {
  executeVerifiedMilestoneRelease,
  getMilestoneVerificationDetails,
  triggerSubmissionVerification,
  updateVerifierKey,
} from './verification.service.js'

export async function getMilestoneVerificationHandler(req, res, next) {
  try {
    const milestoneId = assertUuid(req.params.milestoneId, 'milestoneId')
    const data = await getMilestoneVerificationDetails(req.user, milestoneId)
    res.json(data)
  } catch (err) {
    next(err)
  }
}

export async function triggerSubmissionVerificationHandler(req, res, next) {
  try {
    const submissionId = assertUuid(req.params.submissionId, 'submissionId')
    const result = await triggerSubmissionVerification(req.user, submissionId)
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
}

export async function executeVerifiedReleaseHandler(req, res, next) {
  try {
    const milestoneId = assertUuid(req.params.milestoneId, 'milestoneId')
    const { onChainAgreementId, onChainMilestoneId } = req.body ?? {}
    const result = await executeVerifiedMilestoneRelease(req.user, milestoneId, {
      onChainAgreementId,
      onChainMilestoneId,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function updateVerifierKeyHandler(req, res, next) {
  try {
    const { verifierAddress, status, label } = req.body ?? {}
    const key = await updateVerifierKey(req.user, {
      verifierAddress,
      status,
      label,
    })
    res.json({ verifierKey: key })
  } catch (err) {
    next(err)
  }
}
