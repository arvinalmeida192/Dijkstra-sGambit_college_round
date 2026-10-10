# Fairwork — Complete Razorpay Payment Integration & Escrow Ledger

This document describes the complete agreement-to-payment-to-milestone-release workflow in Fairwork, including Razorpay Checkout Test Mode, configurable surcharge fee calculation, server-side escrow ledger allocation, automated milestone payout releases, and dispute holds.

---

## 1. Important Disclaimers & Safety Principles

1. **Razorpay Test Mode Only**: Razorpay Checkout runs strictly with test credentials (`rzp_test_...`). Verification proves only that a test order/signature was processed in test mode.
2. **Internal Ledger is Not Escrow**: The milestone funds ledger is an internal Fairwork accounting record; it is not a bank escrow and does not prove real money is being held in a trust account.
3. **Simulated Payouts Only**: Milestone releases in this demonstration generate deterministic simulated payouts (`SIM-PAYOUT-<fundId>`). No real money is transferred to the freelancer's bank account.
4. **Future Production Requirements**: Any future production payout integration requires explicit Razorpay Route/X onboarding, eligibility verification, bank account KYC, and separate webhook confirmation.

---

## 2. Environment Configuration

In `backend/.env`:
```env
# Feature Flag
GATEWAY_PAYMENTS_ENABLED=true

# Razorpay Test Credentials (from Razorpay Dashboard > Settings > API Keys)
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=rzp_secret_placeholder
RAZORPAY_WEBHOOK_SECRET=rzp_webhook_secret_placeholder

# Payout Provider Mode: simulated (default for demo)
PAYOUT_MODE=simulated

# Processing Fee Surcharge Rate (default: 0.02 = 2%)
PROCESSING_FEE_RATE=0.02
```

---

## 3. Database Schema

- **Migration `011_gateway_funding.sql`**:
  - `project_funding`: Primary funding table with unique partial index `one_paid_per_agreement` WHERE `status = 'PAID'`.
  - `milestone_funds`: One-to-one ledger record per milestone (`status`: `'HELD'`, `'RELEASED'`, `'FAILED'`, `'REFUNDED'`).
  - `gateway_events`: Webhook deduplication log table unique on `(provider, event_id)`.
- **Migration `012_gateway_fees_and_payout_failures.sql`**:
  - Adds `fee_amount`, `total_payable`, `fee_rate`, `fee_status` to `project_funding`.
  - Adds `FAILED` enum status and `failure_reason` to `milestone_funds`.

---

## 4. End-to-End User Journey

1. **Agreement Creation & Exact Version Acceptance**:
   - The client creates an agreement with deliverables, milestone amounts, and dates.
   - The freelancer reviews and accepts.
   - Both parties must accept the **exact same agreement version** before terms become `ACTIVE`.
2. **Fee Calculation & Surcharge Transparency**:
   - Before checkout, the system computes the configured processing fee (`PROCESSING_FEE_RATE`, default 2%) using integer rounding.
   - The UI clearly displays:
     - **Agreed Project Deliverables**: `₹150.00`
     - **Estimated Processing Fee (2.0% surcharge)**: `+ ₹3.00`
     - **Total Payable at Checkout**: `₹153.00`
   - The surcharge is paid on top by the client; the freelancer's agreed compensation (`₹150.00`) remains intact.
3. **Razorpay Checkout & Server-Side Order**:
   - Client clicks **Pay Now / Fund Project**.
   - Backend derives the order amount strictly server-side from active milestone allocations.
   - Razorpay Checkout modal opens with test UPI, NetBanking, and Card options.
4. **Signature Verification & Escrow Ledger Allocation**:
   - The client submits `orderId`, `paymentId`, and `signature`.
   - Backend verifies HMAC-SHA256 signature using `crypto.timingSafeEqual`.
   - If verified, `project_funding` transitions to `PAID`.
   - Milestone funds are allocated in the internal ledger with status `HELD`.
   - Work is unblocked (`isProjectFunded` returns `true`).
5. **Work Execution & Milestone Submission**:
   - Freelancer starts work (`IN_PROGRESS`) and submits deliverable.
6. **Milestone Approval & Automated Payout Release**:
   - Client approves the milestone in the review panel.
   - Approval automatically triggers `releaseMilestone`.
   - A simulated payout is generated with a unique reference (`SIM-PAYOUT-<fundId>`).
   - Milestone fund status becomes `RELEASED`.
7. **Dispute Protection & Independent Releases**:
   - If a milestone is disputed, its release is blocked (`Disputed milestones remain held and cannot be released`).
   - Other eligible, undisputed milestones on the project proceed independently.
8. **Recoverable Payout Failures**:
   - If the payout provider fails, the milestone fund is marked `FAILED` with `failure_reason`.
   - Clients can click **Retry Release →** to re-attempt the payout without re-submitting work.

---

## 5. Verification Commands & Test Results

Run all test suites:
```bash
# In backend/
npx vitest run tests/integration/funding.test.js tests/integration/milestones.test.js tests/integration/disputes.test.js tests/integration/agreements.test.js tests/integration/payments.test.js

# In frontend/
npm run build
```

**Results**:
- Backend test suites: **33/33 tests passed** (including fee calculation, automated approval payout, recoverable failures, dispute holds, and webhook idempotency).
- Frontend production build: **Passed with zero errors**.
