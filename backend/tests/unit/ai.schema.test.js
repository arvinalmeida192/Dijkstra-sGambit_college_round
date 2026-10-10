import { describe, expect, it } from 'vitest'
import {
  assessmentsDisagreeMaterially,
  validateDisputeSummary,
  validateStructuredAssessment,
} from '../../src/modules/ai/ai.schema.js'

describe('validateStructuredAssessment', () => {
  it('accepts valid JSON and strips forbidden claims', () => {
    const raw = JSON.stringify({
      criteria: [
        {
          criterion: 'Has login',
          status: 'MET',
          evidenceRefs: ['submission:1:notes'],
        },
      ],
      outstandingWork: [],
      uncertainty: ['No test log provided'],
      evidenceReferences: ['submission:1:notes'],
      summary: 'Looks present',
      confidence: 0.4,
      claimedHoursWorked: 40,
      authorship: 'Alice',
    })
    const result = validateStructuredAssessment(raw)
    expect(result.ok).toBe(true)
    expect(result.value.criteria[0].status).toBe('MET')
    expect(result.value.claimedHoursWorked).toBeUndefined()
  })

  it('rejects invalid output', () => {
    expect(validateStructuredAssessment('not json').ok).toBe(false)
    expect(
      validateStructuredAssessment(
        JSON.stringify({ criteria: [{ criterion: 'x', status: 'YES' }] }),
      ).ok,
    ).toBe(false)
  })
})

describe('validateDisputeSummary', () => {
  it('forces no decision fields', () => {
    const raw = JSON.stringify({
      claims: [{ claim: 'Late delivery', supportingEvidence: [] }],
      contradictions: [],
      missingInformation: ['No screenshots'],
      evidenceReferences: [],
      summary: 'Needs human review',
      recommendedDecision: 'RELEASE_TO_FREELANCER',
      winner: 'freelancer',
    })
    const result = validateDisputeSummary(raw)
    expect(result.ok).toBe(true)
    expect(result.value.recommendedDecision).toBeUndefined()
  })
})

describe('assessmentsDisagreeMaterially', () => {
  it('detects MET vs MISSING conflict', () => {
    const a = {
      criteria: [{ criterion: 'Login page', status: 'MET' }],
    }
    const b = {
      criteria: [{ criterion: 'Login page', status: 'MISSING' }],
    }
    expect(assessmentsDisagreeMaterially(a, b)).toBe(true)
  })

  it('allows aligned statuses', () => {
    const a = {
      criteria: [{ criterion: 'Login page', status: 'PARTIAL' }],
    }
    const b = {
      criteria: [{ criterion: 'Login page', status: 'PARTIAL' }],
    }
    expect(assessmentsDisagreeMaterially(a, b)).toBe(false)
  })
})
