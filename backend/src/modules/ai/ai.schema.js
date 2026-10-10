import { z } from 'zod'

const criterionStatus = z.enum([
  'MET',
  'PARTIAL',
  'MISSING',
  'UNVERIFIED',
])

export const structuredAssessmentSchema = z
  .object({
    criteria: z
      .array(
        z.object({
          criterion: z.string().trim().min(1).max(2000),
          status: criterionStatus,
          evidenceRefs: z.array(z.string().trim().max(500)).max(20).default([]),
          notes: z.string().trim().max(2000).optional().default(''),
        }),
      )
      .max(50)
      .default([]),
    outstandingWork: z.array(z.string().trim().max(2000)).max(30).default([]),
    uncertainty: z.array(z.string().trim().max(2000)).max(30).default([]),
    evidenceReferences: z
      .array(z.string().trim().max(500))
      .max(40)
      .default([]),
    summary: z.string().trim().max(4000).optional().default(''),
    /** Model-reported confidence 0–1; treated as untrusted metadata only. */
    confidence: z.number().min(0).max(1).optional().nullable(),
    /** Forbidden claims — strip if present rather than accept as truth. */
    claimedHoursWorked: z.null().optional(),
    claimedAuthorship: z.null().optional(),
    claimedEffortPercent: z.null().optional(),
  })
  .strict()

export const disputeSummarySchema = z
  .object({
    claims: z
      .array(
        z.object({
          party: z.string().trim().max(100).optional().default(''),
          claim: z.string().trim().min(1).max(2000),
          supportingEvidence: z
            .array(z.string().trim().max(500))
            .max(20)
            .default([]),
        }),
      )
      .max(20)
      .default([]),
    contradictions: z.array(z.string().trim().max(2000)).max(20).default([]),
    missingInformation: z
      .array(z.string().trim().max(2000))
      .max(20)
      .default([]),
    evidenceReferences: z
      .array(z.string().trim().max(500))
      .max(40)
      .default([]),
    summary: z.string().trim().max(4000).optional().default(''),
    confidence: z.number().min(0).max(1).optional().nullable(),
    recommendedDecision: z.null().optional(),
  })
  .strict()

export function parseJsonFromModelText(raw) {
  if (raw == null) return null
  let text = String(raw).trim()
  if (!text) return null

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1)
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function validateStructuredAssessment(raw) {
  const parsed = parseJsonFromModelText(raw)
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Model output was not valid JSON.' }
  }
  // Strip forbidden fabricated claims rather than failing solely for extras.
  const cleaned = { ...parsed }
  delete cleaned.claimedHoursWorked
  delete cleaned.claimedAuthorship
  delete cleaned.claimedEffortPercent
  delete cleaned.hoursWorked
  delete cleaned.authorship
  delete cleaned.effortPercent

  const result = structuredAssessmentSchema.safeParse(cleaned)
  if (!result.success) {
    return {
      ok: false,
      error: 'Model output failed schema validation.',
      details: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    }
  }
  return { ok: true, value: result.data }
}

export function validateDisputeSummary(raw) {
  const parsed = parseJsonFromModelText(raw)
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Model output was not valid JSON.' }
  }
  const cleaned = { ...parsed }
  delete cleaned.recommendedDecision
  delete cleaned.winner
  delete cleaned.shouldRelease
  delete cleaned.shouldRefund

  const result = disputeSummarySchema.safeParse(cleaned)
  if (!result.success) {
    return {
      ok: false,
      error: 'Model output failed schema validation.',
      details: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    }
  }
  return { ok: true, value: result.data }
}

/** Heuristic: material disagreement between two structured assessments. */
export function assessmentsDisagreeMaterially(a, b) {
  if (!a || !b) return true
  const mapA = new Map(
    (a.criteria ?? []).map((c) => [c.criterion.toLowerCase().trim(), c.status]),
  )
  const mapB = new Map(
    (b.criteria ?? []).map((c) => [c.criterion.toLowerCase().trim(), c.status]),
  )
  const keys = new Set([...mapA.keys(), ...mapB.keys()])
  let conflicts = 0
  for (const key of keys) {
    const sa = mapA.get(key)
    const sb = mapB.get(key)
    if (!sa || !sb) continue
    const opposed =
      (sa === 'MET' && (sb === 'MISSING' || sb === 'UNVERIFIED')) ||
      (sb === 'MET' && (sa === 'MISSING' || sa === 'UNVERIFIED'))
    if (opposed) conflicts += 1
  }
  return conflicts >= 1
}
