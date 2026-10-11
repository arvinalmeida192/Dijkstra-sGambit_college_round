import { PayoutProvider } from './payout.provider.js'
import { createRazorpayPayoutId } from './razorpayIds.js'

/**
 * Default Simulated Payout Provider (Razorpay sandbox ledger).
 * Freelancer claims → Razorpay-style `pout_…` ids; client release → `SIM-PAYOUT-<fundId>`.
 * Records a sandbox release only; transfers no real money / bank payout.
 */
export class SimulatedPayoutProvider extends PayoutProvider {
  async createPayout({ fundId, milestoneId, amount, currency, purpose }) {
    const isClaim = purpose === 'freelancer_claim'
    const reference = isClaim ? createRazorpayPayoutId() : `SIM-PAYOUT-${fundId}`
    return {
      provider: isClaim ? 'razorpay' : 'simulated',
      reference,
      status: 'PROCESSED',
      label: isClaim ? 'Razorpay test payout' : 'Sandbox payout',
      amount,
      currency: currency || 'INR',
      milestoneId,
      purpose: purpose || 'release',
      mode: 'test',
      simulatedAt: new Date().toISOString(),
    }
  }
}
