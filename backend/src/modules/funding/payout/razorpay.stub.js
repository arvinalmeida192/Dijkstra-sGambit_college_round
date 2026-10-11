import { PayoutProvider } from './payout.provider.js'
import { createRazorpayPayoutId } from './razorpayIds.js'

/**
 * Razorpay Route / Linked Account payout provider.
 *
 * Live Route/X bank transfers require Linked Accounts + fund accounts and are
 * not configured in this sandbox. Freelancer claims still record a Razorpay
 * test-mode payout id so the claim UX works end-to-end without moving money.
 */
export class RazorpayRoutePayoutProvider extends PayoutProvider {
  async createPayout({ fundId, milestoneId, amount, currency, purpose }) {
    if (purpose !== 'freelancer_claim') {
      throw new Error(
        'Razorpay Route live payouts are not configured. Use PAYOUT_MODE=simulated or freelancer claim in sandbox.',
      )
    }

    return {
      provider: 'razorpay',
      reference: createRazorpayPayoutId(),
      status: 'PROCESSED',
      label: 'Razorpay test payout',
      amount,
      currency: currency || 'INR',
      milestoneId,
      purpose: 'freelancer_claim',
      mode: 'test',
      fundId,
      note: 'Sandbox claim only — no live Route/X transfer.',
      claimedAt: new Date().toISOString(),
    }
  }
}
