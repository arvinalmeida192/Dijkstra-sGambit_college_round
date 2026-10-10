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
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  isTest: process.env.NODE_ENV === 'test',
  /** Absolute or relative path for private deliverable/evidence files. */
  storagePrivateDir: process.env.STORAGE_PRIVATE_DIR ?? '',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
  /** Local/test EVM — leave unset to disable payment verification. */
  chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 0,
  rpcUrl: process.env.RPC_URL ?? '',
  escrowContractAddress: process.env.ESCROW_CONTRACT_ADDRESS ?? '',
  /** ERC-20 decimals for amount mapping (app cents → token base). */
  tokenDecimals: Number(process.env.TOKEN_DECIMALS ?? 6),

  /** Phase 19 — Ollama AI (local only; no weight downloads from app code). */
  aiEnabled: (process.env.AI_ENABLED ?? 'true').toLowerCase() !== 'false',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 60_000),
  aiModelCode: process.env.AI_MODEL_CODE ?? 'qwen2.5-coder:1.5b',
  aiModelText: process.env.AI_MODEL_TEXT ?? 'qwen3:1.7b,gemma3:1b',
  aiModelVisual: process.env.AI_MODEL_VISUAL ?? 'qwen2.5vl:3b,gemma3:4b',
  aiCompareOnLowConfidence:
    (process.env.AI_COMPARE_ON_LOW_CONFIDENCE ?? 'true').toLowerCase() !==
    'false',
  aiLowConfidenceThreshold: Number(
    process.env.AI_LOW_CONFIDENCE_THRESHOLD ?? 0.55,
  ),

  /** Deterministic notification job (independent of AI). */
  notificationJobEnabled:
    (process.env.NOTIFICATION_JOB_ENABLED ?? 'true').toLowerCase() !== 'false',
  notificationJobIntervalMs: Number(
    process.env.NOTIFICATION_JOB_INTERVAL_MS ?? 300_000,
  ),
  deadlineWarnDays: Number(process.env.DEADLINE_WARN_DAYS ?? 3),
  inactivityDays: Number(process.env.INACTIVITY_DAYS ?? 7),
}
