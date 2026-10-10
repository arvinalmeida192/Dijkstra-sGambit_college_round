import { ethers } from 'ethers'
import { env } from '../../config/env.js'
import { badRequest, conflict } from '../../utils/errors.js'
import { milestoneEscrowAbi } from './escrowAbi.js'
import { appAmountToTokenBase, tokenBaseEquals } from './amounts.js'

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/

const EVENT_STATUS = {
  MilestoneFunded: 'CONFIRMED',
  MilestoneReleased: 'RELEASED',
  MilestoneRefunded: 'REFUNDED',
  DisputeOpened: 'DISPUTED',
}

/**
 * @typedef {object} BlockchainConfig
 * @property {number} chainId
 * @property {string} rpcUrl
 * @property {string} escrowAddress
 * @property {number} tokenDecimals
 * @property {boolean} configured
 * @property {boolean} isTestNetwork
 */

export function getBlockchainConfig(overrides = {}) {
  // Prefer live process.env so tests / runtime can configure without reload.
  const chainId = Number(
    overrides.chainId ?? process.env.CHAIN_ID ?? env.chainId ?? 0,
  )
  const rpcUrl = String(
    overrides.rpcUrl ?? process.env.RPC_URL ?? env.rpcUrl ?? '',
  ).trim()
  const escrowAddress = String(
    overrides.escrowAddress ??
      process.env.ESCROW_CONTRACT_ADDRESS ??
      env.escrowContractAddress ??
      '',
  )
    .trim()
    .toLowerCase()
  const tokenDecimals = Number(
    overrides.tokenDecimals ??
      process.env.TOKEN_DECIMALS ??
      env.tokenDecimals ??
      6,
  )
  const configured = Boolean(chainId && rpcUrl && escrowAddress)

  return {
    chainId,
    rpcUrl,
    escrowAddress,
    tokenDecimals,
    configured,
    isTestNetwork: true, // Fairwork MVP: local/test tokens only
  }
}

export function assertTxHash(txHash) {
  if (!txHash || typeof txHash !== 'string' || !TX_HASH_RE.test(txHash)) {
    throw badRequest('txHash must be a 0x-prefixed 32-byte hex string.')
  }
  return txHash.toLowerCase()
}

/**
 * Create a verifier. Inject `provider` in tests — never trust client status.
 */
export function createEscrowVerifier({
  provider: injectedProvider,
  config: configOverrides,
} = {}) {
  const config = getBlockchainConfig(configOverrides)

  function getProvider() {
    if (injectedProvider) return injectedProvider
    if (!config.configured) {
      throw conflict(
        'Blockchain is not configured. Set CHAIN_ID, RPC_URL, and ESCROW_CONTRACT_ADDRESS.',
      )
    }
    return new ethers.JsonRpcProvider(config.rpcUrl, config.chainId)
  }

  /**
   * Verify a transaction against the configured escrow contract.
   * Status is derived only from receipt + events — never from the caller.
   *
   * @returns {Promise<object>} verification result
   */
  async function verifyTransaction(txHash, { expectedAppAmount } = {}) {
    const hash = assertTxHash(txHash)

    if (!config.configured && !injectedProvider) {
      throw conflict(
        'Blockchain is not configured. Set CHAIN_ID, RPC_URL, and ESCROW_CONTRACT_ADDRESS.',
      )
    }

    const provider = getProvider()
    const network = await provider.getNetwork()
    const networkChainId = Number(network.chainId)

    if (networkChainId !== config.chainId) {
      return {
        ok: false,
        status: 'FAILED',
        txHash: hash,
        failureReason: `Chain ID mismatch: expected ${config.chainId}, got ${networkChainId}.`,
        chainId: networkChainId,
        escrowAddress: config.escrowAddress,
        isTestNetwork: config.isTestNetwork,
      }
    }

    const receipt = await provider.getTransactionReceipt(hash)

    if (!receipt) {
      return {
        ok: false,
        pending: true,
        status: 'PENDING',
        txHash: hash,
        failureReason: null,
        chainId: networkChainId,
        escrowAddress: config.escrowAddress,
        isTestNetwork: config.isTestNetwork,
      }
    }

    if (Number(receipt.status) !== 1) {
      return {
        ok: false,
        status: 'FAILED',
        txHash: hash,
        failureReason: 'Transaction reverted or failed on-chain.',
        chainId: networkChainId,
        blockNumber: Number(receipt.blockNumber),
        escrowAddress: config.escrowAddress,
        isTestNetwork: config.isTestNetwork,
      }
    }

    const iface = new ethers.Interface(milestoneEscrowAbi)
    const escrow = config.escrowAddress
    const parsedEvents = []

    for (const log of receipt.logs ?? []) {
      if (String(log.address).toLowerCase() !== escrow) continue
      try {
        const parsed = iface.parseLog({
          topics: log.topics,
          data: log.data,
        })
        if (parsed) {
          parsedEvents.push({
            name: parsed.name,
            args: parsed.args,
          })
        }
      } catch {
        // Non-matching / non-escrow fragment — ignore
      }
    }

    if (parsedEvents.length === 0) {
      return {
        ok: false,
        status: 'FAILED',
        txHash: hash,
        failureReason:
          'No MilestoneEscrow events from the configured contract address in this receipt.',
        chainId: networkChainId,
        blockNumber: Number(receipt.blockNumber),
        escrowAddress: config.escrowAddress,
        isTestNetwork: config.isTestNetwork,
      }
    }

    // Prefer settlement / state events over AgreementCreated / MilestoneAdded.
    const priority = [
      'DisputeResolved',
      'DisputeOpened',
      'MilestoneReleased',
      'MilestoneRefunded',
      'MilestoneFunded',
      'MilestoneAdded',
      'AgreementCreated',
    ]
    parsedEvents.sort(
      (a, b) => priority.indexOf(a.name) - priority.indexOf(b.name),
    )
    const primary = parsedEvents[0]

    let status = EVENT_STATUS[primary.name] ?? null
    let amountTokenBase = null
    let onChainAgreementId = null
    let onChainMilestoneId = null
    let tokenAddress = null
    const reconciliation = {
      events: parsedEvents.map((e) => e.name),
      primaryEvent: primary.name,
    }

    if (
      primary.name === 'MilestoneFunded' ||
      primary.name === 'MilestoneReleased' ||
      primary.name === 'MilestoneRefunded'
    ) {
      onChainAgreementId = primary.args.agreementId.toString()
      onChainMilestoneId = primary.args.milestoneId.toString()
      amountTokenBase = primary.args.amount.toString()
    } else if (primary.name === 'DisputeOpened') {
      onChainAgreementId = primary.args.agreementId.toString()
      onChainMilestoneId = primary.args.milestoneId.toString()
    } else if (primary.name === 'DisputeResolved') {
      onChainAgreementId = primary.args.agreementId.toString()
      onChainMilestoneId = primary.args.milestoneId.toString()
      const toFreelancer = BigInt(primary.args.releaseToFreelancer)
      const toClient = BigInt(primary.args.refundToClient)
      amountTokenBase = (toFreelancer + toClient).toString()
      reconciliation.releaseToFreelancer = toFreelancer.toString()
      reconciliation.refundToClient = toClient.toString()
      reconciliation.split = toFreelancer > 0n && toClient > 0n
      if (toFreelancer === 0n) status = 'REFUNDED'
      else status = 'RELEASED'
    } else if (primary.name === 'MilestoneAdded') {
      onChainAgreementId = primary.args.agreementId.toString()
      onChainMilestoneId = primary.args.milestoneId.toString()
      amountTokenBase = primary.args.amount.toString()
      status = 'PENDING'
    } else if (primary.name === 'AgreementCreated') {
      onChainAgreementId = primary.args.agreementId.toString()
      tokenAddress = String(primary.args.token).toLowerCase()
      status = 'PENDING'
    }

    if (expectedAppAmount != null && amountTokenBase != null) {
      const expected = appAmountToTokenBase(
        expectedAppAmount,
        config.tokenDecimals,
      )
      if (!tokenBaseEquals(amountTokenBase, expected)) {
        return {
          ok: false,
          status: 'FAILED',
          txHash: hash,
          failureReason: `On-chain amount ${amountTokenBase} does not match milestone amount (expected token base ${expected.toString()}).`,
          chainId: networkChainId,
          blockNumber: Number(receipt.blockNumber),
          escrowAddress: config.escrowAddress,
          eventName: primary.name,
          amountTokenBase,
          onChainAgreementId,
          onChainMilestoneId,
          reconciliation,
          isTestNetwork: config.isTestNetwork,
        }
      }
    }

    if (!status) {
      return {
        ok: false,
        status: 'FAILED',
        txHash: hash,
        failureReason: `Unrecognized escrow event: ${primary.name}`,
        chainId: networkChainId,
        blockNumber: Number(receipt.blockNumber),
        escrowAddress: config.escrowAddress,
        isTestNetwork: config.isTestNetwork,
      }
    }

    return {
      ok: true,
      status,
      txHash: hash,
      failureReason: null,
      chainId: networkChainId,
      blockNumber: Number(receipt.blockNumber),
      escrowAddress: config.escrowAddress,
      tokenAddress,
      eventName: primary.name,
      amountTokenBase,
      onChainAgreementId,
      onChainMilestoneId,
      reconciliation,
      isTestNetwork: config.isTestNetwork,
    }
  }

  return {
    config,
    verifyTransaction,
  }
}

/** Default singleton used by the payments service. */
let defaultVerifier = null

export function getDefaultVerifier() {
  if (!defaultVerifier) {
    defaultVerifier = createEscrowVerifier()
  }
  return defaultVerifier
}

/** Test helper — replace the singleton. */
export function setDefaultVerifier(verifier) {
  defaultVerifier = verifier
}
