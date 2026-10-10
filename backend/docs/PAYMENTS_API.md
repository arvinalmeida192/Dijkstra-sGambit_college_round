# Payments & Chain Verification API (Phase 17)

Base path: `/api/v1`  
Auth: `Authorization: Bearer <jwt>` on all routes.  
Errors: `{ "error": "<CODE>", "message": "<human text>", "details"?: [...] }`

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid body / tx hash |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Not a project participant |
| `NOT_FOUND` | 404 | Payment / milestone / project missing |
| `CONFLICT` | 409 | Blockchain not configured / tx already bound |

## Honesty model

- PostgreSQL is an **index** of verified settlement events — **not** proof of funds by itself.
- Status is derived **only** after checking chain ID, configured escrow address, receipt status, and escrow events.
- Client-supplied payment status is **ignored**.
- Responses include `isTestNetwork: true` (local/test tokens only).

## Amount mapping

- App milestone `amount` = integer cents (2 dp).
- On-chain ERC-20 base = `cents * 10^(TOKEN_DECIMALS - 2)` (default 6 → `cents * 10^4`).

## Env

| Variable | Purpose |
|---|---|
| `CHAIN_ID` | Expected chain (e.g. `31337` Hardhat) |
| `RPC_URL` | JSON-RPC endpoint |
| `ESCROW_CONTRACT_ADDRESS` | Deployed `MilestoneEscrow` |
| `TOKEN_DECIMALS` | Token decimals for amount checks (default 6) |

## Statuses

| Status | Meaning |
|---|---|
| `PENDING` | No receipt yet / awaiting confirmation |
| `CONFIRMED` | `MilestoneFunded` verified |
| `RELEASED` | `MilestoneReleased` or dispute resolve with funds to freelancer |
| `REFUNDED` | `MilestoneRefunded` or dispute resolve with full refund |
| `DISPUTED` | `DisputeOpened` verified |
| `FAILED` | Reverted tx, wrong chain/contract, amount mismatch, or no escrow events |

## Endpoints

### `GET /projects/:id/payments`

List payments for a project (participants).

### `GET /milestones/:id/payments`

List payments for a milestone.

### `POST /milestones/:id/payments`

Body: `{ "txHash": "0x…" }`

Reports a hash, creates a row (idempotent on `txHash`), then verifies on-chain.  
Does **not** accept a client `status` field.

### `GET /payments/:id`

Fetch one payment.

### `POST /payments/:id/sync`

Re-fetch receipt/events and update status. Safe to retry; duplicate processing of the same hash does not create a second row.
