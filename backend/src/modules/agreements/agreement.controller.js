import { asyncHandler } from '../../utils/asyncHandler.js'
import * as agreementService from './agreement.service.js'
import {
  acceptAgreementSchema,
  assertUuid,
  createAgreementSchema,
  parseBody,
  proposeChangeSchema,
} from './agreement.validation.js'

export const listForProject = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'project id')
  const result = await agreementService.listAgreements(req.user, req.params.id)
  res.status(200).json(result)
})

export const createForProject = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'project id')
  const input = parseBody(createAgreementSchema, req.body)
  const agreement = await agreementService.createAgreement(
    req.user,
    req.params.id,
    input,
  )
  res.status(201).json({ agreement })
})

export const getById = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'agreement id')
  const agreement = await agreementService.getAgreement(req.user, req.params.id)
  res.status(200).json({ agreement })
})

export const accept = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'agreement id')
  const input = parseBody(acceptAgreementSchema, req.body)
  const agreement = await agreementService.acceptAgreement(
    req.user,
    req.params.id,
    input,
  )
  res.status(200).json({ agreement })
})

export const proposeChange = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'agreement id')
  const input = parseBody(proposeChangeSchema, req.body)
  const agreement = await agreementService.proposeChange(
    req.user,
    req.params.id,
    input,
  )
  res.status(201).json({ agreement })
})
