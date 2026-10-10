import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { storageConfig } from '../../config/storage.js'
import { badRequest } from '../../utils/errors.js'
import { sha256Hex } from '../../utils/hash.js'
import {
  absolutePrivatePath,
  deletePrivateFile,
  readPrivateFile,
} from '../submissions/submission.storage.js'

/**
 * Store dispute evidence under private storage.
 * Path: disputes/{disputeId}/{uuid}/{filename} — never served statically.
 */
export async function storeDisputeEvidenceFile({
  buffer,
  disputeId,
  originalFilename,
  contentType,
}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw badRequest('Uploaded file is empty.')
  }
  if (buffer.length > storageConfig.maxUploadBytes) {
    throw badRequest(
      `File exceeds maximum size of ${storageConfig.maxUploadBytes} bytes.`,
    )
  }
  if (
    contentType &&
    !storageConfig.allowedMimeTypes.includes(contentType)
  ) {
    throw badRequest(`Unsupported content type: ${contentType}`)
  }

  const hash = sha256Hex(buffer)
  const id = crypto.randomUUID()
  const safeName = sanitizeFilename(originalFilename ?? 'evidence.bin')
  const relativeKey = path.posix.join('disputes', disputeId, id, safeName)
  const absolute = absolutePrivatePath(relativeKey)

  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, buffer, { flag: 'wx' })

  return {
    fileRef: relativeKey,
    sha256Hash: hash,
    byteSize: buffer.length,
    originalFilename: safeName,
    contentType: contentType || 'application/octet-stream',
  }
}

export { deletePrivateFile, readPrivateFile }

function sanitizeFilename(name) {
  const base = path.basename(String(name)).replace(/[^\w.\-()+ ]+/g, '_')
  const trimmed = base.trim().slice(0, 180)
  return trimmed || 'evidence.bin'
}
