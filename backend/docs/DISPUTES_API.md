# Disputes API (Phase 18)

Base path: `/api/v1`  
Auth: `Authorization: Bearer <jwt>` on all routes.  
Errors: `{ "error": "<CODE>", "message": "<human text>", "details"?: [...] }`

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid body / id |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Not allowed for this role |
| `NOT_FOUND` | 404 | Dispute / evidence / milestone missing |
| `CONFLICT` | 409 | Duplicate open dispute / invalid state |

## Honesty model

- Dispute **decisions are application records** attributed to an authorized **human arbitrator**.
- A decision **does not move escrow funds**. Responses include `fundsMovedByDecision: false`.
- On-chain lock / release / refund still requires a verified escrow transaction via the **payments** API.
- Evidence files are stored privately and served only to project participants / arbitrators (never a public URL).

## Statuses

| Status | Meaning |
|---|---|
| `OPEN` | Opened by client or freelancer |
| `UNDER_REVIEW` | Claimed by an arbitrator |
| `RESOLVED` | Human decision recorded |

## Decisions

| Decision | Milestone follow-up (when still `DISPUTED`) |
|---|---|
| `RELEASE_TO_FREELANCER` | → `APPROVED` |
| `REFUND_TO_CLIENT` | → `REVISION_REQUESTED` |
| `SPLIT` | → `IN_REVIEW` (split cents stored; funds still on-chain) |

## Endpoints

### `GET /projects/:id/disputes`

List disputes for a project (participants / arbitrators).

### `POST /milestones/:id/disputes`

Body: `{ "reason": "…", "claimSummary"?: "…", "openPaymentId"?: "<uuid>" }`

Client or freelancer opens a dispute. Also moves the milestone to `DISPUTED` when allowed.

### `GET /disputes/:id`

Fetch one dispute with evidence metadata (no raw file bytes).

### `POST /disputes/:id/claim`

Arbitrator claims the case (`OPEN` → `UNDER_REVIEW`).

### `POST /disputes/:id/decide`

Body: `{ "decision": "RELEASE_TO_FREELANCER"|"REFUND_TO_CLIENT"|"SPLIT", "rationale": "…", "splitReleaseToFreelancer"?: <cents>, "resolvePaymentId"?: "<uuid>" }`

Records the human decision. Does **not** transfer tokens.

### `POST /disputes/:id/evidence`

Multipart (`file` + optional `notes` / `externalUrl`) or JSON with notes/URL.

### `GET /disputes/evidence/:evidenceId/file`

Authorized private download (`Cache-Control: private, no-store`).
