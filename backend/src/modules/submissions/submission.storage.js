import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { storageConfig } from '../../config/storage.js'
import { badRequest } from '../../utils/errors.js'
import { sha256Hex } from '../../utils/hash.js'

function assertSafeRelativeKey(fileRef) {
  if (!fileRef || typeof fileRef !== 'string') {
    throw badRequest('Invalid file reference.')
  }
  if (
    fileRef.includes('..') ||
    fileRef.startsWith('/') ||
    path.isAbsolute(fileRef)
  ) {
    throw badRequest('Invalid file reference.')
  }
  return fileRef
}

export function absolutePrivatePath(fileRef) {
  const safe = assertSafeRelativeKey(fileRef)
  const root = path.resolve(storageConfig.privateRoot)
  const absolute = path.resolve(root, safe)
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    throw badRequest('Invalid file reference.')
  }
  return absolute
}

/**
 * Persist uploaded bytes under the private root. Returns metadata —
 * never exposes the absolute filesystem path to API clients.
 */
export async function storePrivateFile({
  buffer,
  milestoneId,
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
  const safeName = sanitizeFilename(originalFilename ?? 'upload.bin')
  const relativeKey = path.posix.join(milestoneId, id, safeName)
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

export async function readPrivateFile(fileRef) {
  const absolute = absolutePrivatePath(fileRef)
  return fs.readFile(absolute)
}

export async function deletePrivateFile(fileRef) {
  if (!fileRef) return
  try {
    await fs.unlink(absolutePrivatePath(fileRef))
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err
  }
}

function sanitizeFilename(name) {
  const base = path.basename(String(name)).replace(/[^\w.\-()+ ]+/g, '_')
  const trimmed = base.trim().slice(0, 180)
  return trimmed || 'upload.bin'
}
