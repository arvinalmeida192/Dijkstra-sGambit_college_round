/**
 * Map Fairwork app amounts ↔ ERC-20 base units.
 *
 * App convention (milestones/agreements): integer cents (2 decimal places).
 * Token convention (Phase 16 MockERC20 / typical USDC-like): `tokenDecimals` (default 6).
 *
 * tokenBase = appCents * 10^(tokenDecimals - 2)
 */

export function appAmountToTokenBase(appAmount, tokenDecimals = 6) {
  const cents = BigInt(appAmount)
  const decimals = Number(tokenDecimals)
  if (!Number.isInteger(decimals) || decimals < 2) {
    throw new Error('tokenDecimals must be an integer >= 2')
  }
  return cents * 10n ** BigInt(decimals - 2)
}

export function tokenBaseToAppAmount(tokenBase, tokenDecimals = 6) {
  const base = typeof tokenBase === 'bigint' ? tokenBase : BigInt(tokenBase)
  const decimals = Number(tokenDecimals)
  if (!Number.isInteger(decimals) || decimals < 2) {
    throw new Error('tokenDecimals must be an integer >= 2')
  }
  return Number(base / 10n ** BigInt(decimals - 2))
}

export function tokenBaseEquals(a, b) {
  return BigInt(a) === BigInt(b)
}
