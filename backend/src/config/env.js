import dotenv from 'dotenv'

dotenv.config()

function required(name, fallback) {
  const value = process.env[name] ?? fallback
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required(
    'DATABASE_URL',
    'postgres://fairwork:fairwork@127.0.0.1:5434/fairwork',
  ),
  jwtSecret: required('JWT_SECRET', 'dev-only-change-me-fairwork-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  isTest: process.env.NODE_ENV === 'test',
  /** Absolute or relative path for private deliverable/evidence files. */
  storagePrivateDir: process.env.STORAGE_PRIVATE_DIR ?? '',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
  /** Local/test EVM — leave unset to disable payment verification. */
  chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 0,
  rpcUrl: process.env.RPC_URL ?? '',
  escrowContractAddress: process.env.ESCROW_CONTRACT_ADDRESS ?? '',
  /**
   * Optional local/test operator key for scheduled auto-release / reclaim.
   * Never use a mainnet key. Leave unset to keep money moves UI-reported only.
   */
  escrowOperatorPrivateKey: process.env.ESCROW_OPERATOR_PRIVATE_KEY ?? '',
  /**
   * Optional independent verifier signing key (EIP-712 MilestoneVerificationAttestation).
   * Keep outside source control; never commit real keys.
   */
  verifierPrivateKey: process.env.VERIFIER_PRIVATE_KEY ?? '',
  verifierAttestationTtlSeconds: Number(
    process.env.VERIFIER_ATTESTATION_TTL_SECONDS ?? 86_400,
  ),
  /** ERC-20 decimals for amount mapping (app cents → token base). */
  tokenDecimals: Number(process.env.TOKEN_DECIMALS ?? 6),

  /** Deterministic notification job. */
  notificationJobEnabled:
    (process.env.NOTIFICATION_JOB_ENABLED ?? 'true').toLowerCase() !== 'false',
  notificationJobIntervalMs: Number(
    process.env.NOTIFICATION_JOB_INTERVAL_MS ?? 300_000,
  ),
  deadlineWarnDays: Number(process.env.DEADLINE_WARN_DAYS ?? 3),
  inactivityDays: Number(process.env.INACTIVITY_DAYS ?? 7),

  /** Phase 21 — Gateway Payments (Razorpay Sandbox) */
  gatewayPaymentsEnabled:
    (process.env.GATEWAY_PAYMENTS_ENABLED ?? 'false').toLowerCase() === 'true',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  payoutMode: process.env.PAYOUT_MODE ?? 'simulated',
  processingFeeRate: Number(process.env.PROCESSING_FEE_RATE ?? 0.02), // default 2%
}

