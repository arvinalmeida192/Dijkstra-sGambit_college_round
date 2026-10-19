import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ethers } from 'ethers'
import {
  computeFrozenCriteriaHash,
  normalizeVerificationCriteria,
  VERIFICATION_METHODS,
} from '../../src/modules/verification/verification.criteria.js'
import { runSandboxedJsTests } from '../../src/modules/verification/verification.sandbox.js'
import { executeMilestoneVerification } from '../../src/modules/verification/verification.runner.js'
import {
  signVerificationAttestation,
  verifyAttestationSignature,
} from '../../src/modules/verification/verification.attestation.js'
import { createEscrowVerifier } from '../../src/modules/blockchain/escrowVerifier.js'
import { milestoneEscrowAbi } from '../../src/modules/blockchain/escrowAbi.js'

const TEST_SIGNER_PK =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const TEST_WALLET = new ethers.Wallet(TEST_SIGNER_PK)
const TEST_SIGNER_ADDRESS = TEST_WALLET.address
const ESCROW_ADDR = '0x5FbDB2315678afecb367f032d93F642f64180aa3'

describe('verification.criteria', () => {
  it('normalizes verification criteria and computes deterministic frozen criteria hash', () => {
    expect(VERIFICATION_METHODS).toContain('AUTOMATED_CHECK')
    expect(VERIFICATION_METHODS).toContain('EVIDENCE_INTEGRITY_CHECK')
    expect(VERIFICATION_METHODS).toContain('HUMAN_REVIEWED')

    const c1 = normalizeVerificationCriteria(
      {
        acceptanceCriteria: ['Must contain OpenAPI 3.0 version', 'Must pass tests'],
        requiredEvidence: { requireFile: true, minSizeBytes: 10 },
        automatedChecks: [
          {
            id: 'check-1',
            type: 'JSON_ASSERTIONS',
            name: 'OpenAPI version check',
            config: {
              rules: [{ path: 'openapi', equals: '3.0.0' }],
            },
          },
        ],
      },
      'AUTOMATED_CHECK',
    )

    const hashA = computeFrozenCriteriaHash({
      agreementVersion: 1,
      milestoneNumber: 1,
      title: 'API Spec',
      deliverableDescription: 'Deliver REST API specification',
      amount: 50000,
      verificationMethod: 'AUTOMATED_CHECK',
      verificationCriteria: c1,
    })
    const hashB = computeFrozenCriteriaHash({
      agreementVersion: 1,
      milestoneNumber: 1,
      title: 'API Spec',
      deliverableDescription: 'Deliver REST API specification',
      amount: 50000,
      verificationMethod: 'AUTOMATED_CHECK',
      verificationCriteria: c1,
    })

    expect(hashA).toBe(hashB)
    expect(hashA).toMatch(/^0x[0-9a-f]{64}$/)

    const hashChangedVersion = computeFrozenCriteriaHash({
      agreementVersion: 2,
      milestoneNumber: 1,
      title: 'API Spec',
      deliverableDescription: 'Deliver REST API specification',
      amount: 50000,
      verificationMethod: 'AUTOMATED_CHECK',
      verificationCriteria: c1,
    })
    expect(hashChangedVersion).not.toBe(hashA)
  })
})

describe('verification.sandbox (isolated child process + VM)', () => {
  it('executes valid deterministic JS deliverable and passes assertions', async () => {
    const deliverable = `
      module.exports = {
        calculateMilestoneFee(amount, bps) {
          return Math.floor((amount * bps) / 10000);
        }
      };
    `
    const res = await runSandboxedJsTests({
      code: deliverable,
      assertions: [
        {
          name: 'calculateMilestoneFee(10000, 250) === 250',
          fn: 'calculateMilestoneFee',
          args: [10000, 250],
          expected: 250,
        },
      ],
      timeoutMs: 1500,
    })
    expect(res.passed).toBe(true)
    expect(res.results).toHaveLength(1)
    expect(res.results[0].passed).toBe(true)
  })

  it('fails cleanly when deliverable fails test assertions', async () => {
    const deliverable = `module.exports = { sum: (a, b) => a - b };`
    const res = await runSandboxedJsTests({
      code: deliverable,
      assertions: [
        {
          name: 'sum(2,3) must equal 5',
          fn: 'sum',
          args: [2, 3],
          expected: 5,
        },
      ],
      timeoutMs: 1500,
    })
    expect(res.passed).toBe(false)
    expect(res.results[0].passed).toBe(false)
  })

  it('blocks access to process.env, require("fs"), and require("child_process")', async () => {
    const maliciousDeliverable = `
      const fs = require('fs');
      module.exports = { leak: () => fs.readFileSync('/etc/passwd', 'utf8') };
    `
    const res = await runSandboxedJsTests({
      code: maliciousDeliverable,
      assertions: [{ name: 'attempt leak', fn: 'leak', args: [], expected: '' }],
      timeoutMs: 1500,
    })
    expect(res.passed).toBe(false)
    expect(res.error).toMatch(/require is not defined/)
  })

  it('terminates infinite loops within timeout budget', async () => {
    const infiniteLoop = `while (true) {}`
    const res = await runSandboxedJsTests({
      code: infiniteLoop,
      assertions: [{ name: 'loop check', fn: 'noop', args: [], expected: null }],
      timeoutMs: 400,
    })
    expect(res.passed).toBe(false)
    expect(res.error || '').toMatch(/timed out/i)
  })
})

describe('verification.runner', () => {
  it('verifies EVIDENCE_INTEGRITY_CHECK and detects corrupted file bytes', async () => {
    const content = Buffer.from(JSON.stringify({ status: 'ok', items: [1, 2, 3] }), 'utf8')
    const validSha = crypto.createHash('sha256').update(content).digest('hex')

    const passRun = await executeMilestoneVerification({
      milestone: {
        verification_method: 'EVIDENCE_INTEGRITY_CHECK',
        verification_criteria: {
          requiredEvidence: {
            requireFile: true,
            expectedSha256: validSha,
          },
        },
      },
      submission: {
        id: '22222222-2222-2222-2222-222222222222',
        notes: 'Valid artifact',
        file_ref: 'artifact.json',
        original_filename: 'artifact.json',
        content_type: 'application/json',
        sha256_hash: validSha,
      },
      readFileFn: async () => content,
    })
    expect(passRun.outcome).toBe('PASSED')

    const tamperedBuffer = Buffer.from(JSON.stringify({ status: 'tampered' }), 'utf8')
    const failRun = await executeMilestoneVerification({
      milestone: {
        verification_method: 'EVIDENCE_INTEGRITY_CHECK',
        verification_criteria: {
          requiredEvidence: {
            requireFile: true,
          },
        },
      },
      submission: {
        id: '22222222-2222-2222-2222-222222222222',
        notes: 'Tampered artifact',
        file_ref: 'artifact.json',
        original_filename: 'artifact.json',
        content_type: 'application/json',
        sha256_hash: validSha,
      },
      readFileFn: async () => tamperedBuffer,
    })
    expect(failRun.outcome).toBe('FAILED')
    expect(failRun.summary).toMatch(/does not match recorded submission hash/i)
  })

  it('executes AUTOMATED_CHECK with JSON_ASSERTIONS and TEXT_PATTERNS', async () => {
    const payload = Buffer.from(
      JSON.stringify({
        version: '1.2.0',
        coverage: 94,
        endpoints: ['/api/v1/health', '/api/v1/verify'],
      }),
      'utf8',
    )
    const sha = crypto.createHash('sha256').update(payload).digest('hex')

    const result = await executeMilestoneVerification({
      milestone: {
        verification_method: 'AUTOMATED_CHECK',
        verification_criteria: {
          requiredEvidence: { requireFile: true, allowedContentTypes: ['application/json'] },
          automatedChecks: [
            {
              id: 'json-check',
              type: 'JSON_ASSERTIONS',
              name: 'Validate JSON structure and test coverage >= 90',
              config: {
                requiredKeys: ['version', 'coverage', 'endpoints'],
                rules: [
                  { path: 'version', equals: '1.2.0' },
                  { path: 'coverage', type: 'number', min: 90 },
                  { path: 'endpoints', type: 'array', minLength: 2 },
                ],
              },
            },
            {
              id: 'text-check',
              type: 'TEXT_PATTERNS',
              name: 'Contains /api/v1/verify endpoint',
              config: {
                mustContain: ['/api/v1/verify'],
                mustNotContain: ['TODO', 'FIXME'],
              },
            },
          ],
        },
      },
      submission: {
        id: '33333333-3333-3333-3333-333333333333',
        notes: 'Completed API manifest',
        file_ref: 'manifest.json',
        original_filename: 'manifest.json',
        content_type: 'application/json',
        sha256_hash: sha,
      },
      readFileFn: async () => payload,
    })

    expect(result.outcome).toBe('PASSED')
    expect(result.checksExecuted.length).toBeGreaterThanOrEqual(4)
  })

  it('routes HUMAN_REVIEWED criteria to NEEDS_HUMAN_REVIEW without inventing a pass/fail verdict', async () => {
    const content = Buffer.from(' Subjective UX wireframes and brand narrative ', 'utf8')
    const sha = crypto.createHash('sha256').update(content).digest('hex')

    const result = await executeMilestoneVerification({
      milestone: {
        verification_method: 'HUMAN_REVIEWED',
        verification_criteria: {
          acceptanceCriteria: ['Tone matches brand guidelines'],
          requiredEvidence: { requireFile: true },
        },
      },
      submission: {
        id: '44444444-4444-4444-4444-444444444444',
        notes: 'Brand narrative attached',
        file_ref: 'narrative.txt',
        original_filename: 'narrative.txt',
        content_type: 'text/plain',
        sha256_hash: sha,
      },
      readFileFn: async () => content,
    })

    expect(result.outcome).toBe('NEEDS_HUMAN_REVIEW')
  })
})

describe('verification.attestation (EIP-712 signing & verification)', () => {
  const criteriaHash = ethers.keccak256(ethers.toUtf8Bytes('frozen-criteria-v1'))
  const artifactHash = `0x${'a'.repeat(64)}`
  const nonce = ethers.hexlify(ethers.randomBytes(32))

  it('signs a PASSED verification result and verifies EIP-712 signature & domain', async () => {
    const signed = await signVerificationAttestation({
      verificationOutcome: 'PASSED',
      chainId: 31337,
      escrowAddress: ESCROW_ADDR,
      onChainAgreementId: 0,
      onChainMilestoneId: 0,
      agreementVersion: 1,
      criteriaHash,
      artifactHash,
      nonce,
      wallet: TEST_WALLET,
    })

    expect(signed.verifierAddress.toLowerCase()).toBe(TEST_SIGNER_ADDRESS.toLowerCase())
    expect(signed.signature).toMatch(/^0x[0-9a-f]{130}$/i)

    const verified = verifyAttestationSignature({
      attestation: signed,
      signature: signed.signature,
      expectedChainId: 31337,
      expectedEscrowAddress: ESCROW_ADDR,
      expectedCriteriaHash: criteriaHash,
      expectedAgreementVersion: 1,
      expectedArtifactHash: artifactHash,
      authorizedVerifiers: [TEST_SIGNER_ADDRESS],
    })
    expect(verified.valid).toBe(true)

    // Cross-chain replay must fail signature validation
    const crossChain = verifyAttestationSignature({
      attestation: signed,
      signature: signed.signature,
      expectedChainId: 1,
      expectedEscrowAddress: ESCROW_ADDR,
      authorizedVerifiers: [TEST_SIGNER_ADDRESS],
    })
    expect(crossChain.valid).toBe(false)

    // Revoked / unauthorized signer must fail validation
    const unauthorized = verifyAttestationSignature({
      attestation: signed,
      signature: signed.signature,
      expectedChainId: 31337,
      expectedEscrowAddress: ESCROW_ADDR,
      authorizedVerifiers: ['0x000000000000000000000000000000000000dead'],
    })
    expect(unauthorized.valid).toBe(false)
  })

  it('refuses to sign an attestation when verification outcome is not PASSED', async () => {
    await expect(
      signVerificationAttestation({
        verificationOutcome: 'FAILED',
        chainId: 31337,
        escrowAddress: ESCROW_ADDR,
        onChainAgreementId: 0,
        onChainMilestoneId: 0,
        agreementVersion: 1,
        criteriaHash,
        artifactHash,
        nonce,
        wallet: TEST_WALLET,
      }),
    ).rejects.toThrow(/PASSED/i)
  })
})

describe('escrowVerifier VerifiedMilestoneReleased event parsing', () => {
  it('verifies VerifiedMilestoneReleased receipt and maps to RELEASED with submissionHash & nonce', async () => {
    const iface = new ethers.Interface(milestoneEscrowAbi)
    const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('submission-1'))
    const nonce = ethers.keccak256(ethers.toUtf8Bytes('nonce-1'))
    const log = iface.encodeEventLog(
      iface.getEvent('VerifiedMilestoneReleased'),
      [
        0n,
        0n,
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        150_000_000n,
        submissionHash,
        nonce,
      ],
    )
    const verifier = createEscrowVerifier({
      provider: {
        async getNetwork() {
          return { chainId: 31337n }
        },
        async getTransactionReceipt() {
          return {
            status: 1,
            blockNumber: 42n,
            logs: [{ address: ESCROW_ADDR, topics: log.topics, data: log.data }],
          }
        },
      },
      config: {
        chainId: 31337,
        rpcUrl: 'http://127.0.0.1:8545',
        escrowAddress: ESCROW_ADDR,
        tokenDecimals: 6,
      },
    })

    const res = await verifier.verifyTransaction(
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      { expectedAppAmount: 15000 },
    )
    expect(res.ok).toBe(true)
    expect(res.status).toBe('RELEASED')
    expect(res.eventName).toBe('VerifiedMilestoneReleased')
    expect(res.reconciliation.submissionHash).toBe(submissionHash)
    expect(res.reconciliation.attestationNonce).toBe(nonce)
  })
})
