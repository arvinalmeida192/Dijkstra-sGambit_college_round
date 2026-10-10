import { describe, expect, it } from 'vitest'
import {
  createSubmissionSchema,
  parseBody,
  reviewSubmissionSchema,
} from '../../src/modules/submissions/submission.validation.js'
import { AppError } from '../../src/utils/errors.js'

describe('submission validation', () => {
  it('accepts notes and https externalUrl', () => {
    const parsed = parseBody(createSubmissionSchema, {
      notes: 'Done',
      externalUrl: 'https://example.com/work',
    })
    expect(parsed.externalUrl).toBe('https://example.com/work')
  })

  it('rejects non-http externalUrl', () => {
    expect(() =>
      parseBody(createSubmissionSchema, {
        externalUrl: 'ftp://example.com/file',
      }),
    ).toThrow(AppError)
  })

  it('requires feedback for REVISION_REQUESTED', () => {
    expect(() =>
      parseBody(reviewSubmissionSchema, { decision: 'REVISION_REQUESTED' }),
    ).toThrow(AppError)

    const ok = parseBody(reviewSubmissionSchema, {
      decision: 'REVISION_REQUESTED',
      feedback: 'Please fix spacing',
    })
    expect(ok.feedback).toBe('Please fix spacing')
  })

  it('allows APPROVED without feedback', () => {
    const ok = parseBody(reviewSubmissionSchema, { decision: 'APPROVED' })
    expect(ok.decision).toBe('APPROVED')
  })
})
