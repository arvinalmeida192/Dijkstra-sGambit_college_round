import { sha256Hex } from '../../utils/hash.js'
import { readPrivateFile } from '../submissions/submission.storage.js'
import { normalizeVerificationCriteria } from './verification.criteria.js'
import { runSandboxedJsTests } from './verification.sandbox.js'

function getByPath(obj, dotPath) {
  if (!dotPath || typeof dotPath !== 'string') return obj
  const parts = dotPath.split('.').filter(Boolean)
  let cur = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

function evaluateJsonAssertions(textContent, config = {}) {
  let parsed
  try {
    parsed = JSON.parse(textContent)
  } catch (err) {
    return {
      passed: false,
      detail: `Submitted artifact is not valid JSON: ${err.message}`,
      subchecks: [],
    }
  }

  const rules = Array.isArray(config.rules) ? config.rules : []
  const requiredKeys = Array.isArray(config.requiredKeys) ? config.requiredKeys : []
  const subchecks = []
  let allPassed = true

  for (const key of requiredKeys) {
    const val = getByPath(parsed, key)
    const ok = val !== undefined && val !== null
    if (!ok) allPassed = false
    subchecks.push({
      rule: `requiredKey:${key}`,
      passed: ok,
      detail: ok ? `Key "${key}" is present.` : `Missing required key "${key}".`,
    })
  }

  for (const rule of rules) {
    const pathKey = String(rule.path ?? '').trim()
    const val = getByPath(parsed, pathKey)
    let ok = true
    const reasons = []

    if (rule.required !== false && (val === undefined || val === null)) {
      ok = false
      reasons.push(`Path "${pathKey}" is missing or null`)
    } else if (val !== undefined && val !== null) {
      if (rule.type) {
        const actualType = Array.isArray(val) ? 'array' : typeof val
        if (actualType !== rule.type) {
          ok = false
          reasons.push(`Expected type "${rule.type}" at "${pathKey}", got "${actualType}"`)
        }
      }
      if (rule.equals !== undefined && JSON.stringify(val) !== JSON.stringify(rule.equals)) {
        ok = false
        reasons.push(
          `Expected "${pathKey}" to equal ${JSON.stringify(rule.equals)}, got ${JSON.stringify(val)}`,
        )
      }
      if (rule.minLength != null && (typeof val === 'string' || Array.isArray(val))) {
        if (val.length < Number(rule.minLength)) {
          ok = false
          reasons.push(
            `Expected "${pathKey}" length >= ${rule.minLength}, got ${val.length}`,
          )
        }
      }
      if (rule.min != null && typeof val === 'number') {
        if (val < Number(rule.min)) {
          ok = false
          reasons.push(`Expected "${pathKey}" >= ${rule.min}, got ${val}`)
        }
      }
      if (rule.max != null && typeof val === 'number') {
        if (val > Number(rule.max)) {
          ok = false
          reasons.push(`Expected "${pathKey}" <= ${rule.max}, got ${val}`)
        }
      }
    }

    if (!ok) allPassed = false
    subchecks.push({
      rule: `jsonAssertion:${pathKey || 'root'}`,
      passed: ok,
      detail: ok ? `Assertion passed for "${pathKey || 'root'}".` : reasons.join('; '),
    })
  }

  return {
    passed: allPassed,
    detail: allPassed
      ? `All JSON schema/value assertions passed (${subchecks.length} rules).`
      : 'One or more JSON assertions failed.',
    subchecks,
  }
}

function evaluateTextPatterns(textContent, config = {}) {
  const mustContain = Array.isArray(config.mustContain) ? config.mustContain : []
  const mustNotContain = Array.isArray(config.mustNotContain)
    ? config.mustNotContain
    : []
  const subchecks = []
  let allPassed = true

  for (const pattern of mustContain) {
    const str = String(pattern)
    const ok = textContent.includes(str)
    if (!ok) allPassed = false
    subchecks.push({
      rule: `mustContain:${str}`,
      passed: ok,
      detail: ok
        ? `Required pattern "${str}" found.`
        : `Missing required pattern "${str}".`,
    })
  }

  for (const pattern of mustNotContain) {
    const str = String(pattern)
    const ok = !textContent.includes(str)
    if (!ok) allPassed = false
    subchecks.push({
      rule: `mustNotContain:${str}`,
      passed: ok,
      detail: ok
        ? `Disallowed pattern "${str}" is absent.`
        : `Found disallowed pattern "${str}".`,
    })
  }

  if (config.minLines != null) {
    const lineCount = textContent.split(/\r?\n/).length
    const ok = lineCount >= Number(config.minLines)
    if (!ok) allPassed = false
    subchecks.push({
      rule: `minLines:${config.minLines}`,
      passed: ok,
      detail: `Line count ${lineCount} (minimum ${config.minLines}).`,
    })
  }

  return {
    passed: allPassed,
    detail: allPassed
      ? `All text/source pattern checks passed (${subchecks.length} rules).`
      : 'One or more text pattern checks failed.',
    subchecks,
  }
}

/**
 * Execute deterministic verification for a milestone submission against frozen verification criteria.
 *
 * Returns:
 * - outcome: 'PASSED' | 'FAILED' | 'NEEDS_HUMAN_REVIEW'
 * - artifactHash: 0x-prefixed 32-byte SHA-256 digest of the verified submission artifact/evidence
 * - checksExecuted: array of structured check results
 * - summary: human-readable summary
 * - errorDetails: null or failure explanation
 * - durationMs: execution time in ms
 */
export async function executeMilestoneVerification({
  milestone,
  submission,
  readFileFn = readPrivateFile,
}) {
  const startMs = Date.now()
  const method = milestone.verification_method || 'HUMAN_REVIEWED'
  const criteria = normalizeVerificationCriteria(
    milestone.verification_criteria || {},
    method,
  )
  const checksExecuted = []
  let failed = false
  const failureReasons = []

  // 1. Evidence presence check
  const reqEv = criteria.requiredEvidence
  const hasFile = Boolean(submission.file_ref)
  const hasUrl = Boolean(submission.external_url && String(submission.external_url).trim())

  if (reqEv.requireFile && !hasFile) {
    failed = true
    const msg = 'Required deliverable file attachment is missing.'
    failureReasons.push(msg)
    checksExecuted.push({
      id: 'evidence-file-presence',
      name: 'Required File Evidence Presence',
      type: 'EVIDENCE_INTEGRITY',
      passed: false,
      detail: msg,
    })
  } else if (hasFile || reqEv.requireFile) {
    checksExecuted.push({
      id: 'evidence-file-presence',
      name: 'Required File Evidence Presence',
      type: 'EVIDENCE_INTEGRITY',
      passed: true,
      detail: `Deliverable file "${submission.original_filename || 'artifact'}" is attached.`,
    })
  }

  if (reqEv.requireUrl && !hasUrl) {
    failed = true
    const msg = 'Required external URL evidence is missing.'
    failureReasons.push(msg)
    checksExecuted.push({
      id: 'evidence-url-presence',
      name: 'Required External URL Presence',
      type: 'EVIDENCE_INTEGRITY',
      passed: false,
      detail: msg,
    })
  } else if (reqEv.requireUrl) {
    checksExecuted.push({
      id: 'evidence-url-presence',
      name: 'Required External URL Presence',
      type: 'EVIDENCE_INTEGRITY',
      passed: true,
      detail: `External URL "${submission.external_url}" is provided.`,
    })
  }

  // 2. Cryptographic SHA-256 byte integrity & file constraints check
  let fileBuffer = null
  let computedSha256 = null

  if (hasFile) {
    try {
      fileBuffer = await readFileFn(submission.file_ref)
      computedSha256 = sha256Hex(fileBuffer).toLowerCase()
      const recordedSha256 = String(submission.sha256_hash ?? '')
        .trim()
        .toLowerCase()
        .replace(/^0x/, '')

      const hashMatchesRecorded =
        Boolean(recordedSha256) && computedSha256 === recordedSha256
      if (!hashMatchesRecorded) {
        failed = true
        const msg = `Stored artifact SHA-256 (${computedSha256}) does not match recorded submission hash (${recordedSha256 || 'none'}).`
        failureReasons.push(msg)
        checksExecuted.push({
          id: 'evidence-sha256-integrity',
          name: 'Cryptographic SHA-256 Artifact Integrity',
          type: 'EVIDENCE_INTEGRITY',
          passed: false,
          detail: msg,
        })
      } else {
        checksExecuted.push({
          id: 'evidence-sha256-integrity',
          name: 'Cryptographic SHA-256 Artifact Integrity',
          type: 'EVIDENCE_INTEGRITY',
          passed: true,
          detail: `Verified SHA-256 digest (${computedSha256}) matches stored artifact bytes (${fileBuffer.length} bytes). Note: Hash integrity proves non-tampering of bytes, not functional quality.`,
        })
      }

      if (reqEv.expectedSha256) {
        const matchesExpected = computedSha256 === reqEv.expectedSha256
        if (!matchesExpected) {
          failed = true
          const msg = `Submitted artifact SHA-256 (${computedSha256}) does not match pre-agreed expectedSha256 (${reqEv.expectedSha256}).`
          failureReasons.push(msg)
        }
        checksExecuted.push({
          id: 'evidence-expected-sha256',
          name: 'Pre-agreed Expected Artifact Hash Match',
          type: 'EVIDENCE_INTEGRITY',
          passed: matchesExpected,
          detail: matchesExpected
            ? `Artifact SHA-256 matches pre-agreed expected digest (${reqEv.expectedSha256}).`
            : `Artifact SHA-256 (${computedSha256}) does not match expected digest (${reqEv.expectedSha256}).`,
        })
      }

      if (
        Array.isArray(reqEv.allowedContentTypes) &&
        reqEv.allowedContentTypes.length > 0
      ) {
        const actualMime = String(submission.content_type ?? '')
          .trim()
          .toLowerCase()
        const mimeOk = reqEv.allowedContentTypes.includes(actualMime)
        if (!mimeOk) {
          failed = true
          const msg = `Content type "${actualMime}" is not in allowedContentTypes (${reqEv.allowedContentTypes.join(', ')}).`
          failureReasons.push(msg)
        }
        checksExecuted.push({
          id: 'evidence-content-type',
          name: 'Allowed Content Type Check',
          type: 'EVIDENCE_INTEGRITY',
          passed: mimeOk,
          detail: mimeOk
            ? `Content type "${actualMime}" is permitted.`
            : `Content type "${actualMime}" is not allowed.`,
        })
      }

      if (reqEv.minSizeBytes != null) {
        const minOk = fileBuffer.length >= reqEv.minSizeBytes
        if (!minOk) {
          failed = true
          failureReasons.push(
            `Artifact size ${fileBuffer.length}B is below minimum ${reqEv.minSizeBytes}B.`,
          )
        }
        checksExecuted.push({
          id: 'evidence-min-size',
          name: 'Minimum Artifact Byte Size',
          type: 'EVIDENCE_INTEGRITY',
          passed: minOk,
          detail: `Artifact size ${fileBuffer.length}B (min ${reqEv.minSizeBytes}B).`,
        })
      }

      if (reqEv.maxSizeBytes != null) {
        const maxOk = fileBuffer.length <= reqEv.maxSizeBytes
        if (!maxOk) {
          failed = true
          failureReasons.push(
            `Artifact size ${fileBuffer.length}B exceeds maximum ${reqEv.maxSizeBytes}B.`,
          )
        }
        checksExecuted.push({
          id: 'evidence-max-size',
          name: 'Maximum Artifact Byte Size',
          type: 'EVIDENCE_INTEGRITY',
          passed: maxOk,
          detail: `Artifact size ${fileBuffer.length}B (max ${reqEv.maxSizeBytes}B).`,
        })
      }
    } catch (err) {
      failed = true
      const msg = `Failed to read submitted artifact for integrity verification: ${err.message}`
      failureReasons.push(msg)
      checksExecuted.push({
        id: 'evidence-sha256-integrity',
        name: 'Cryptographic SHA-256 Artifact Integrity',
        type: 'EVIDENCE_INTEGRITY',
        passed: false,
        detail: msg,
      })
    }
  }

  const rawArtifactHash =
    computedSha256 ||
    String(submission.sha256_hash || '').replace(/^0x/, '') ||
    sha256Hex(
      Buffer.from(
        `${submission.id}:${submission.external_url || ''}:${submission.notes || ''}`,
        'utf8',
      ),
    )
  const artifactHash = `0x${rawArtifactHash.toLowerCase()}`

  // If evidence integrity failed, immediately fail any verification method
  if (failed) {
    return {
      outcome: 'FAILED',
      artifactHash,
      checksExecuted,
      summary: `Verification failed on evidence integrity: ${failureReasons.join(' ')}`,
      errorDetails: failureReasons.join('\n'),
      durationMs: Math.max(1, Date.now() - startMs),
    }
  }

  // 3. Method-specific verification
  if (method === 'HUMAN_REVIEWED') {
    checksExecuted.push({
      id: 'human-review-routing',
      name: 'Subjective Criteria Human Review Routing',
      type: 'HUMAN_REVIEWED',
      passed: true,
      detail:
        'Milestone involves subjective acceptance criteria that cannot be automatically judged; routed to explicit human review and bounded dispute resolution.',
    })

    return {
      outcome: 'NEEDS_HUMAN_REVIEW',
      artifactHash,
      checksExecuted,
      summary:
        'Required evidence verified. Subjective milestone criteria require human review or dispute arbitration.',
      errorDetails: null,
      durationMs: Math.max(1, Date.now() - startMs),
    }
  }

  if (method === 'EVIDENCE_INTEGRITY_CHECK') {
    return {
      outcome: 'PASSED',
      artifactHash,
      checksExecuted,
      summary:
        'All pre-agreed evidence presence and cryptographic SHA-256 integrity checks passed.',
      errorDetails: null,
      durationMs: Math.max(1, Date.now() - startMs),
    }
  }

  // AUTOMATED_CHECK
  const textContent = fileBuffer ? fileBuffer.toString('utf8') : ''
  const automatedChecks = criteria.automatedChecks || []

  if (automatedChecks.length === 0) {
    // Even if no sub-checks array was provided, ensure at least non-empty deliverable file exists
    if (!fileBuffer || fileBuffer.length === 0) {
      return {
        outcome: 'FAILED',
        artifactHash,
        checksExecuted,
        summary: 'Automated verification failed: no deliverable file content to evaluate.',
        errorDetails: 'Deliverable file is required for AUTOMATED_CHECK.',
        durationMs: Math.max(1, Date.now() - startMs),
      }
    }
  }

  for (const check of automatedChecks) {
    if (check.type === 'JSON_ASSERTIONS') {
      const res = evaluateJsonAssertions(textContent, check.config)
      if (!res.passed) {
        failed = true
        failureReasons.push(`${check.name}: ${res.detail}`)
      }
      checksExecuted.push({
        id: check.id,
        name: check.name,
        type: check.type,
        passed: res.passed,
        detail: res.detail,
        subchecks: res.subchecks,
      })
    } else if (check.type === 'TEXT_PATTERNS') {
      const res = evaluateTextPatterns(textContent, check.config)
      if (!res.passed) {
        failed = true
        failureReasons.push(`${check.name}: ${res.detail}`)
      }
      checksExecuted.push({
        id: check.id,
        name: check.name,
        type: check.type,
        passed: res.passed,
        detail: res.detail,
        subchecks: res.subchecks,
      })
    } else if (check.type === 'SANDBOX_JS_TEST') {
      const assertions = Array.isArray(check.config?.assertions)
        ? check.config.assertions
        : []
      const sandboxRes = await runSandboxedJsTests({
        code: textContent,
        assertions,
        timeoutMs: Number(check.config?.timeoutMs) || 2500,
      })
      if (!sandboxRes.passed) {
        failed = true
        const msg =
          sandboxRes.error ||
          sandboxRes.results
            .filter((r) => !r.passed)
            .map((r) => `${r.name}: ${r.error}`)
            .join('; ') ||
          'Sandbox test assertions failed.'
        failureReasons.push(`${check.name}: ${msg}`)
      }
      checksExecuted.push({
        id: check.id,
        name: check.name,
        type: check.type,
        passed: sandboxRes.passed,
        detail: sandboxRes.passed
          ? `All ${sandboxRes.results.length} sandboxed JavaScript test assertions passed.`
          : sandboxRes.error || 'One or more sandboxed JavaScript test assertions failed.',
        subchecks: sandboxRes.results,
      })
    }
  }

  const outcome = failed ? 'FAILED' : 'PASSED'
  return {
    outcome,
    artifactHash,
    checksExecuted,
    summary: failed
      ? `Automated verification failed: ${failureReasons.join(' | ')}`
      : `All ${checksExecuted.length} objective verification checks passed.`,
    errorDetails: failed ? failureReasons.join('\n') : null,
    durationMs: Math.max(1, Date.now() - startMs),
  }
}
