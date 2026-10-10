import { describe, expect, it } from 'vitest'
import {
  acceptAgreementSchema,
  createAgreementSchema,
  parseBody,
  proposeChangeSchema,
} from '../../src/modules/agreements/agreement.validation.js'

const validTerms = {
  summary: 'Website rebuild',
  milestones: [
    {
      title: 'Phase 1',
      deliverables: 'Wireframes',
      acceptanceCriteria: 'Client sign-off',
      amount: 10000,
      dueDate: '2026-12-01',
      reviewWindowDays: 7,
    },
  ],
  notes: '',
}

describe('createAgreementSchema', () => {
  it('accepts valid terms', () => {
    const data = parseBody(createAgreementSchema, { terms: validTerms })
    expect(data.terms.summary).toBe('Website rebuild')
    expect(data.terms.milestones).toHaveLength(1)
    expect(data.terms.milestones[0].amount).toBe(10000)
  })

  it('rejects empty milestones', () => {
    expect(() =>
      parseBody(createAgreementSchema, {
        terms: { ...validTerms, milestones: [] },
      }),
    ).toThrow()
  })

  it('rejects non-integer amounts', () => {
    expect(() =>
      parseBody(createAgreementSchema, {
        terms: {
          ...validTerms,
          milestones: [{ ...validTerms.milestones[0], amount: 10.5 }],
        },
      }),
    ).toThrow()
  })
})

describe('proposeChangeSchema', () => {
  it('requires terms', () => {
    expect(() => parseBody(proposeChangeSchema, {})).toThrow()
  })
})

describe('acceptAgreementSchema', () => {
  it('allows empty body', () => {
    expect(parseBody(acceptAgreementSchema, {})).toEqual({
      signatureRef: undefined,
    })
  })

  it('keeps optional signatureRef', () => {
    expect(
      parseBody(acceptAgreementSchema, { signatureRef: 'wallet:abc' }),
    ).toEqual({ signatureRef: 'wallet:abc' })
  })
})
