import { describe, expect, it } from 'vitest'
import { ethers } from 'ethers'
import {
  createEscrowVerifier,
  assertTxHash,
} from '../../src/modules/blockchain/escrowVerifier.js'
import { milestoneEscrowAbi } from '../../src/modules/blockchain/escrowAbi.js'
import { AppError } from '../../src/utils/errors.js'

const ESCROW = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const TX =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function mockProvider({ chainId = 31337n, receipt = null } = {}) {
  return {
    async getNetwork() {
      return { chainId }
    },
    async getTransactionReceipt() {
      return receipt
    },
  }
}

function fundedReceipt({
  escrow = ESCROW,
  amount = 250_000_000n,
  agreementId = 0n,
  milestoneId = 0n,
  status = 1,
} = {}) {
  const iface = new ethers.Interface(milestoneEscrowAbi)
  const log = iface.encodeEventLog(
    iface.getEvent('MilestoneFunded'),
    [agreementId, milestoneId, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', amount],
  )
  return {
    status,
    blockNumber: 12n,
    logs: [
      {
        address: escrow,
        topics: log.topics,
        data: log.data,
      },
    ],
  }
}

describe('assertTxHash', () => {
  it('accepts lowercase 32-byte hashes', () => {
    expect(assertTxHash(TX)).toBe(TX)
  })

  it('rejects invalid hashes', () => {
    expect(() => assertTxHash('0x123')).toThrow(AppError)
  })
})

describe('createEscrowVerifier', () => {
  const config = {
    chainId: 31337,
    rpcUrl: 'http://127.0.0.1:8545',
    escrowAddress: ESCROW,
    tokenDecimals: 6,
  }

  it('returns PENDING when receipt is missing', async () => {
    const verifier = createEscrowVerifier({
      provider: mockProvider({ receipt: null }),
      config,
    })
    const result = await verifier.verifyTransaction(TX)
    expect(result.status).toBe('PENDING')
    expect(result.pending).toBe(true)
    expect(result.ok).toBe(false)
  })

  it('returns FAILED on chain id mismatch', async () => {
    const verifier = createEscrowVerifier({
      provider: mockProvider({ chainId: 1n, receipt: fundedReceipt() }),
      config,
    })
    const result = await verifier.verifyTransaction(TX)
    expect(result.status).toBe('FAILED')
    expect(result.failureReason).to.match(/Chain ID mismatch/)
  })

  it('returns FAILED when transaction reverted', async () => {
    const verifier = createEscrowVerifier({
      provider: mockProvider({
        receipt: fundedReceipt({ status: 0 }),
      }),
      config,
    })
    const result = await verifier.verifyTransaction(TX)
    expect(result.status).toBe('FAILED')
    expect(result.failureReason).to.match(/reverted|failed/i)
  })

  it('returns FAILED when logs are not from configured escrow', async () => {
    const verifier = createEscrowVerifier({
      provider: mockProvider({
        receipt: fundedReceipt({
          escrow: '0x0000000000000000000000000000000000000001',
        }),
      }),
      config,
    })
    const result = await verifier.verifyTransaction(TX)
    expect(result.status).toBe('FAILED')
    expect(result.failureReason).to.match(/No MilestoneEscrow events/)
  })

  it('confirms MilestoneFunded and checks amount', async () => {
    const verifier = createEscrowVerifier({
      provider: mockProvider({ receipt: fundedReceipt() }),
      config,
    })
    const result = await verifier.verifyTransaction(TX, {
      expectedAppAmount: 25000,
    })
    expect(result.ok).toBe(true)
    expect(result.status).toBe('CONFIRMED')
    expect(result.eventName).toBe('MilestoneFunded')
    expect(result.amountTokenBase).toBe('250000000')
    expect(result.isTestNetwork).toBe(true)
  })

  it('fails when funded amount does not match milestone', async () => {
    const verifier = createEscrowVerifier({
      provider: mockProvider({
        receipt: fundedReceipt({ amount: 1n }),
      }),
      config,
    })
    const result = await verifier.verifyTransaction(TX, {
      expectedAppAmount: 25000,
    })
    expect(result.status).toBe('FAILED')
    expect(result.failureReason).to.match(/does not match/)
  })

  it('throws when blockchain env is not configured and no provider', async () => {
    const verifier = createEscrowVerifier({
      config: { chainId: 0, rpcUrl: '', escrowAddress: '', tokenDecimals: 6 },
    })
    await expect(verifier.verifyTransaction(TX)).rejects.toThrow(AppError)
  })
})
