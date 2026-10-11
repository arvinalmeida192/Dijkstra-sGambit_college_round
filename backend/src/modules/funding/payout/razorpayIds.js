import crypto from 'crypto'

/** Razorpay-style payout id: `pout_` + 14 alphanumeric chars. */
export function createRazorpayPayoutId() {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(14)
  let id = 'pout_'
  for (let i = 0; i < 14; i += 1) {
    id += alphabet[bytes[i] % alphabet.length]
  }
  return id
}
