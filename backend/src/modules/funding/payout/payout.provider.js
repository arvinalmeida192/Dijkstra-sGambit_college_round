/**
 * Payout provider base interface.
 */
export class PayoutProvider {
  /**
   * Execute payout for a milestone fund.
   *
   * @param {object} params
   * @param {string} params.fundId
   * @param {string} params.milestoneId
   * @param {number} params.amount - in app cents
   * @param {string} params.currency
   * @param {string} [params.recipientId]
   * @returns {Promise<{ provider: string, reference: string, status: string, label: string }>}
   */
  async createPayout(params) {
    void params
    throw new Error('createPayout must be implemented by subclass')
  }
}

