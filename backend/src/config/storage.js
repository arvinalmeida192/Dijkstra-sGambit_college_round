import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultRoot = path.resolve(__dirname, '../../storage/private')

/**
 * Private evidence/deliverable storage root.
 * Files under this path must never be served as static public assets.
 */
export const storageConfig = {
  privateRoot: env.storagePrivateDir || defaultRoot,
  maxUploadBytes: env.maxUploadBytes,
  allowedMimeTypes: [
    'application/pdf',
    'application/zip',
    'application/json',
    'application/javascript',
    'application/x-javascript',
    'text/javascript',
    'text/plain',
    'text/markdown',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ],
}
