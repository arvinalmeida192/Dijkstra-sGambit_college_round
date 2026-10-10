import { describe, expect, it } from 'vitest'
import {
  appAmountToTokenBase,
  tokenBaseToAppAmount,
  tokenBaseEquals,
} from '../../src/modules/blockchain/amounts.js'

describe('amount mapping', () => {
  it('maps app cents to 6-decimal token base units', () => {
    // $250.00 → 25000 cents → 25000 * 10^4 = 250_000_000 token base
    expect(appAmountToTokenBase(25000, 6)).toBe(250_000_000n)
    expect(tokenBaseToAppAmount(250_000_000n, 6)).toBe(25000)
  })

  it('round-trips and compares equality', () => {
    const base = appAmountToTokenBase(100, 6)
    expect(tokenBaseEquals(base, '1000000')).toBe(true)
    expect(tokenBaseEquals(base, 999999n)).toBe(false)
  })
})
