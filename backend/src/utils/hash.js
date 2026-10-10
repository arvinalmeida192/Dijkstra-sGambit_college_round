import crypto from 'node:crypto'

/**
 * SHA-256 hex digest of raw bytes. Always compute server-side —
 * never trust a client-supplied hash.
 *
 * @param {Buffer|Uint8Array|string} data
 * @returns {string} lowercase hex
 */
export function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}
