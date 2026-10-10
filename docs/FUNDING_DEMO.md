# Fairwork — Sandbox "Fund Project" Payment Flow & Escrow Ledger

This document describes the design, configuration, testing, and operational demonstration of Fairwork's **Fund Project Payment Flow** with Razorpay test checkout, server-side escrow ledger, and simulated payouts.

---

## 1. Architecture Overview

### 1.1 Non-breaking Feature Flag
- Environment variable: `GATEWAY_PAYMENTS_ENABLED` (boolean, defaults to `false`).
- **When disabled (`false`)**:
  - All existing project agreements, milestones, submissions, disputes, and on-chain payments function exactly as before.
  - The milestone start-work endpoint (`PENDING` → `IN_PROGRESS`) operates without funding restrictions.
  - Funding status API returns `enabled: false, isFunded: false`.
- **When enabled (`true`)**:
  - Projects with an active agreement require client funding before any milestone can transition from `PENDING` to `IN_PROGRESS` (returns `409 Conflict` if unfunded).
  - All order amounts are strictly computed server-side from active milestone schedules.
  - Razorpay Checkout modal loads in test mode with UPI/Card/NetBanking simulation.
  - On verification, `project_funding` is marked `PAID` and `milestone_funds` records are created in status `HELD`.
  - Authorized clients can release funds for `APPROVED` milestones, generating a simulated payout reference (`SIM-PAYOUT-<fundId>`).

### 1.2 Monetary Precision & Unit Safety
- Fairwork stores milestone and agreement amounts in integer **app cents** (e.g. `5000` = ₹50.00).
- Razorpay expects amounts in integer **paise** (100 paise = 1 INR).
- Mapping: `1 app cent = 1 paisa`.
- Floating-point calculations are strictly forbidden. All additions, comparisons, and hashes use exact integer math.

---

## 2. Database Schema (Migration `011_gateway_funding.sql`)

### Tables
1. **`project_funding`**:
   - `id`: UUID PRIMARY KEY
   - `project_id`: UUID REFERENCES `projects(id)`
   - `agreement_id`: UUID REFERENCES `agreements(id)`
   - `client_id`: UUID REFERENCES `users(id)`
   - `amount`: BIGINT (total payment in integer units)
   - `currency`: VARCHAR(10) (default `'INR'`)
   - `status`: VARCHAR(20) (`'PENDING'`, `'PAID'`, `'FAILED'`, `'REFUNDED'`)
   - `gateway_provider`: VARCHAR(50) (`'razorpay'`)
   - `gateway_order_id`: VARCHAR(100)
   - `gateway_payment_id`: VARCHAR(100)
   - Unique partial index: `one_paid_per_agreement` WHERE `status = 'PAID'` (guarantees idempotency).

2. **`milestone_funds`**:
   - `id`: UUID PRIMARY KEY
   - `project_id`: UUID REFERENCES `projects(id)`
   - `milestone_id`: UUID UNIQUE REFERENCES `milestones(id)`
   - `funding_id`: UUID REFERENCES `project_funding(id)`
   - `amount`: BIGINT
   - `status`: VARCHAR(20) (`'HELD'`, `'RELEASED'`, `'REFUNDED'`)
   - `payout_reference`: VARCHAR(100)
   - `released_by`: UUID REFERENCES `users(id)`
   - `released_at`: TIMESTAMPTZ

3. **`gateway_events`**:
   - `provider`: VARCHAR(50)
   - `event_id`: VARCHAR(100)
   - `event_type`: VARCHAR(100)
   - `payload`: JSONB
   - Unique constraint: `(provider, event_id)` (prevents duplicate webhook replays).

4. **Enum additions**:
   - `audit_action`: added `'PROJECT_FUNDED'`, `'MILESTONE_FUNDS_RELEASED'`.
   - `notification_kind`: added `'PROJECT_FUNDED'`, `'MILESTONE_RELEASED'`.

---

## 3. Environment Configuration

In `backend/.env`:
```env
# Feature Flag
GATEWAY_PAYMENTS_ENABLED=true

# Razorpay Test Credentials
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=rzp_secret_placeholder
RAZORPAY_WEBHOOK_SECRET=rzp_webhook_secret_placeholder

# Payout Mode: simulated (default)
PAYOUT_MODE=simulated
```

---

## 4. API Specification

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/v1/projects/:id/funding/status` | GET | Participant | Returns funding status, keyId, total amount, and milestone ledger |
| `/api/v1/projects/:id/funding/order` | POST | Client | Generates server-side order (calls Razorpay or deterministic test fallback) |
| `/api/v1/projects/:id/funding/verify` | POST | Client | Verifies HMAC-SHA256 signature, marks `PAID`, initializes `milestone_funds` (`HELD`) |
| `/api/v1/projects/:id/funding/milestones/:mId/release` | POST | Client | Row-locks milestone fund, enforces `APPROVED` + non-disputed, generates simulated payout |
| `/api/v1/funding/webhook` | POST | Public | Raw-body webhook endpoint with HMAC signature check & deduplication |

---

## 5. End-to-End Walkthrough

1. **Agreement Activation**: Client and Freelancer both accept agreement v1 with ₹150 total (Milestone 1: ₹50, Milestone 2: ₹100).
2. **Start Work Attempt**:
   - Freelancer attempts to start Milestone 1 before funding.
   - Endpoint returns `409 Conflict`: *"Project must be funded before starting work."*
3. **Client Funding**:
   - Client navigates to **Escrow / Fund** tab (`/projects/:id/fund`).
   - Clicks **Pay ₹150.00 (Test Mode)**.
   - Razorpay test checkout opens (or simulates test payment ID and signature).
   - Backend verifies signature using `crypto.timingSafeEqual`.
   - Funding status becomes `PROJECT_FUNDED`. Milestone funds are recorded as `HELD`.
4. **Work Resumes & Milestone Approval**:
   - Freelancer starts work on Milestone 1 (`IN_PROGRESS`), submits deliverable.
   - Client reviews and approves milestone (`APPROVED`).
5. **Fund Release**:
   - Client clicks **Release Funds →** on the Escrow Ledger.
   - Server validates row lock, checks milestone is `APPROVED` and has no active disputes.
   - `SimulatedPayoutProvider` returns `SIM-PAYOUT-<fundId>`.
   - Milestone fund status transitions to `RELEASED`.
   - Audit log and notification (`MILESTONE_RELEASED`) recorded.
6. **Dispute Protection**:
   - If a dispute is opened on a milestone, any release attempt is immediately rejected with `409 Conflict: Disputed milestones remain held and cannot be released`.

---

## 6. Test Verification

Run all related test suites:
```bash
# In backend/
npx vitest run tests/integration/funding.test.js tests/integration/milestones.test.js tests/integration/disputes.test.js

# In frontend/
npm run build
```
Result: **All 18 integration tests pass. Frontend TypeScript build passes with zero errors.**

