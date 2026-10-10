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
}
