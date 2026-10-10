import { PayoutProvider } from './payout.provider.js'

/**
 * Razorpay Route / Linked Account payout provider stub.
 * Explicitly unconfigured for sandbox demonstration.
 */
export class RazorpayRoutePayoutProvider extends PayoutProvider {
  async createPayout() {
    throw new Error(
      'Razorpay Route live payouts are not configured. This is a sandbox demonstration using simulated payouts.',
    )
  }
}

