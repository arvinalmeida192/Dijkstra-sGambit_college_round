import { apiBlobRequest, apiFormRequest, apiRequest } from './client'
import type { Milestone } from './milestones'
import type {
  VerificationAttestation,
  VerificationRun,
} from './verification'

export type ReviewDecision =
  | 'START_REVIEW'
  | 'APPROVED'
  | 'REVISION_REQUESTED'

export type SubmissionReview = {
  id: string
  submissionId: string
  milestoneId: string
  reviewerId: string
  decision: ReviewDecision
  feedback: string | null
  unmetCriteria?: string[]
  createdAt: string
}

export type Submission = {
  id: string
  milestoneId: string
  projectId: string
  agreementId: string | null
  submittedBy: string
  revision: number
  notes: string | null
  externalUrl: string | null
  hasFile: boolean
  originalFilename: string | null
  contentType: string | null
  byteSize: number | null
  sha256Hash: string | null
  submittedAt: string
  createdAt: string
  reviews?: SubmissionReview[]
  verificationRuns?: VerificationRun[]
  latestVerificationRun?: VerificationRun | null
  latestAttestation?: VerificationAttestation | null
}

export type SubmissionInput = {
  notes?: string | null
  externalUrl?: string | null
  agreementId?: string | null
  file?: File | null
}

function auth(token: string) {
  return { token }
}

export function listSubmissions(token: string, milestoneId: string) {
  return apiRequest<{
    milestone: Milestone
    submissions: Submission[]
    latestVerificationRun?: VerificationRun | null
    latestAttestation?: VerificationAttestation | null
  }>(`/api/v1/milestones/${milestoneId}/submissions`, {
    ...auth(token),
    method: 'GET',
  })
}

export function getSubmission(token: string, submissionId: string) {
  return apiRequest<{ submission: Submission }>(
    `/api/v1/submissions/${submissionId}`,
    {
      ...auth(token),
      method: 'GET',
    },
  )
}

export function createSubmission(
  token: string,
  milestoneId: string,
  input: SubmissionInput,
) {
  const hasFile = Boolean(input.file)

  if (hasFile && input.file) {
    const form = new FormData()
    form.append('file', input.file)
    if (input.notes?.trim()) form.append('notes', input.notes.trim())
    if (input.externalUrl?.trim()) {
      form.append('externalUrl', input.externalUrl.trim())
    }
    if (input.agreementId) form.append('agreementId', input.agreementId)

    return apiFormRequest<{
      submission: Submission
      milestone: Milestone
      verificationRun?: VerificationRun | null
      attestation?: VerificationAttestation | null
    }>(`/api/v1/milestones/${milestoneId}/submissions`, {
      ...auth(token),
      method: 'POST',
      formData: form,
    })
  }

  return apiRequest<{
    submission: Submission
    milestone: Milestone
    verificationRun?: VerificationRun | null
    attestation?: VerificationAttestation | null
  }>(`/api/v1/milestones/${milestoneId}/submissions`, {
    ...auth(token),
    method: 'POST',
    body: {
      notes: input.notes?.trim() || null,
      externalUrl: input.externalUrl?.trim() || null,
      agreementId: input.agreementId ?? null,
    },
  })
}

export function reviewSubmission(
  token: string,
  submissionId: string,
  input: {
    decision: ReviewDecision
    feedback?: string | null
    unmetCriteria?: string[]
  },
) {
  return apiRequest<{
    review: SubmissionReview
    submission: Submission
    milestone: Milestone
  }>(`/api/v1/submissions/${submissionId}/review`, {
    ...auth(token),
    method: 'POST',
    body: {
      decision: input.decision,
      feedback: input.feedback?.trim() || null,
      unmetCriteria: input.unmetCriteria ?? [],
    },
  })
}

export async function downloadSubmissionFile(
  token: string,
  submission: Pick<Submission, 'id' | 'originalFilename'>,
) {
  const { blob, headers } = await apiBlobRequest(
    `/api/v1/submissions/${submission.id}/file`,
    auth(token),
  )
  const sha = headers.get('X-Content-SHA256')
  const filename =
    submission.originalFilename ||
    parseFilename(headers.get('Content-Disposition')) ||
    'deliverable'

  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }

  return { sha256Hash: sha }
}

function parseFilename(disposition: string | null): string | null {
  if (!disposition) return null
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)"?/i.exec(disposition)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
