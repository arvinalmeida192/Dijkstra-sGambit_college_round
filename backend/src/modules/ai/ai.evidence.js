import fs from 'node:fs/promises'
import {
  absolutePrivatePath,
  readPrivateFile,
} from '../submissions/submission.storage.js'

const MAX_TEXT_CHARS = 12_000
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

/**
 * Build a bounded evidence pack for the model. Never invents missing content.
 */
export async function prepareSubmissionEvidence({
  submission,
  milestone,
  deliverableType,
}) {
  const refs = []
  const parts = []

  parts.push(`Milestone title: ${milestone.title}`)
  parts.push(`Deliverables: ${milestone.deliverables}`)
  parts.push(`Acceptance criteria:\n${milestone.acceptance_criteria}`)
  refs.push(`milestone:${milestone.id}:acceptance_criteria`)

  if (submission.notes) {
    parts.push(`Submission notes:\n${submission.notes}`)
    refs.push(`submission:${submission.id}:notes`)
  }
  if (submission.external_url) {
    parts.push(`External URL: ${submission.external_url}`)
    refs.push(`submission:${submission.id}:external_url`)
  }
  if (submission.sha256_hash) {
    parts.push(
      `Uploaded file: ${submission.original_filename ?? 'file'} (${submission.content_type ?? 'unknown'}, ${submission.byte_size ?? '?'} bytes, sha256=${submission.sha256_hash})`,
    )
    refs.push(`submission:${submission.id}:file:${submission.sha256_hash}`)
  }

  let fileText = null
  let imagesBase64 = []

  if (submission.file_ref) {
    try {
      if (
        deliverableType === 'CODE' ||
        deliverableType === 'TEXT' ||
        (submission.content_type &&
          /^(text\/|application\/(json|javascript|typescript|xml))/i.test(
            submission.content_type,
          ))
      ) {
        const buf = await readPrivateFile(submission.file_ref)
        fileText = buf.toString('utf8').slice(0, MAX_TEXT_CHARS)
        if (fileText.trim()) {
          parts.push(`File contents (truncated):\n${fileText}`)
          refs.push(`submission:${submission.id}:file_text`)
        }
      } else if (
        deliverableType === 'VISUAL' ||
        (submission.content_type &&
          /^image\//i.test(submission.content_type))
      ) {
        const abs = absolutePrivatePath(submission.file_ref)
        const stat = await fs.stat(abs)
        if (stat.size <= MAX_IMAGE_BYTES) {
          const buf = await readPrivateFile(submission.file_ref)
          imagesBase64 = [buf.toString('base64')]
          parts.push(
            'An image file is attached for visual inspection (see images).',
          )
          refs.push(`submission:${submission.id}:image`)
        } else {
          parts.push(
            `Visual file present but too large to inline (${stat.size} bytes). Metadata only.`,
          )
          refs.push(`submission:${submission.id}:image_metadata_only`)
        }
      }
    } catch {
      parts.push(
        'Uploaded file could not be read for assessment; treat file-dependent criteria as UNVERIFIED.',
      )
      refs.push(`submission:${submission.id}:file_unreadable`)
    }
  }

  // Objective placeholders for code — we do not invent git/test results.
  if (deliverableType === 'CODE') {
    parts.push(
      [
        'Objective evidence policy:',
        '- Do NOT invent git diffs, commit history, or test results.',
        '- If git/test evidence is not provided in notes/URL/file, mark related criteria UNVERIFIED.',
        '- Never claim hours worked, authorship, or effort percentage.',
      ].join('\n'),
    )
  }

  return {
    promptContext: parts.join('\n\n'),
    evidenceReferences: refs,
    imagesBase64,
  }
}

export function prepareDisputeEvidence({ dispute, evidenceRows, milestone }) {
  const refs = []
  const parts = []

  parts.push(`Dispute reason: ${dispute.reason}`)
  refs.push(`dispute:${dispute.id}:reason`)
  if (dispute.claim_summary) {
    parts.push(`Claim summary: ${dispute.claim_summary}`)
    refs.push(`dispute:${dispute.id}:claim_summary`)
  }
  if (milestone) {
    parts.push(
      `Milestone: ${milestone.title}\nAcceptance criteria:\n${milestone.acceptance_criteria}`,
    )
    refs.push(`milestone:${milestone.id}:acceptance_criteria`)
  }

  for (const row of evidenceRows) {
    const bits = [`Evidence ${row.id}`]
    if (row.notes) bits.push(`notes: ${row.notes}`)
    if (row.external_url) bits.push(`url: ${row.external_url}`)
    if (row.original_filename) {
      bits.push(
        `file: ${row.original_filename} (${row.content_type ?? 'unknown'}, sha256=${row.sha256_hash ?? 'n/a'})`,
      )
    }
    parts.push(bits.join(' | '))
    refs.push(`dispute_evidence:${row.id}`)
  }

  parts.push(
    [
      'Rules:',
      '- Organize claims and evidence for a human reviewer.',
      '- Do NOT recommend release, refund, or a winner.',
      '- Do NOT invent missing evidence.',
      '- Set recommendedDecision to null always.',
    ].join('\n'),
  )

  return {
    promptContext: parts.join('\n\n'),
    evidenceReferences: refs,
  }
}

export function buildAcceptanceSystemPrompt() {
  return [
    'You are an advisory assistant for Fairwork milestone acceptance criteria.',
    'Return ONLY JSON matching this shape:',
    '{"criteria":[{"criterion":"...","status":"MET|PARTIAL|MISSING|UNVERIFIED","evidenceRefs":[],"notes":""}],"outstandingWork":[],"uncertainty":[],"evidenceReferences":[],"summary":"","confidence":0.0}',
    'Status meanings: MET=clearly supported by provided evidence; PARTIAL=some support; MISSING=clearly absent; UNVERIFIED=cannot confirm from provided evidence.',
    'Never claim hours worked, authorship, or effort percentage.',
    'Never approve payment or dispute outcomes.',
    'If evidence is insufficient, use UNVERIFIED and list uncertainty.',
  ].join(' ')
}

export function buildDisputeSystemPrompt() {
  return [
    'You are an advisory assistant summarizing dispute evidence for a human arbitrator.',
    'Return ONLY JSON matching this shape:',
    '{"claims":[{"party":"","claim":"...","supportingEvidence":[]}],"contradictions":[],"missingInformation":[],"evidenceReferences":[],"summary":"","confidence":0.0,"recommendedDecision":null}',
    'Do not decide the dispute. recommendedDecision must be null.',
    'Do not invent evidence. Flag gaps in missingInformation.',
  ].join(' ')
}
