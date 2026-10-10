import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../../src/utils/hash.js'

describe('sha256Hex', () => {
  it('hashes known bytes', () => {
    expect(sha256Hex(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('is stable for the same input and differs for changed bytes', () => {
    const a = sha256Hex(Buffer.from('deliverable-v1'))
    const b = sha256Hex(Buffer.from('deliverable-v1'))
    const c = sha256Hex(Buffer.from('deliverable-v2'))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })
})
