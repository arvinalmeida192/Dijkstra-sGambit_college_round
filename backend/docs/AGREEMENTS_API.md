# Agreements API (Phase 10)

Base path: `/api/v1`  
Auth: `Authorization: Bearer <jwt>` on all routes.  
Errors: `{ "error": "<CODE>", "message": "<human text>", "details"?: [...] }`

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid body/path |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Agreement or project missing |
| `CONFLICT` | 409 | Duplicate acceptance, invalid status transition, etc. |

## Status model

| Status | Meaning |
|---|---|
| `PROPOSED` | Awaiting required acceptances; **not** binding |
| `ACTIVE` | Current accepted terms for the project |
| `SUPERSEDED` | Previously active; replaced by a newer accepted version |
| `WITHDRAWN` | Open proposal replaced by a newer proposal |

A proposed version never becomes `ACTIVE` until **both** the project client and assigned freelancer have accepted it. Creating a proposal does **not** change the current `ACTIVE` version.

Acceptance is **application-level**. An optional `signatureRef` may be stored for future wallet flows; it does not prove a cryptographic signature by itself.

## Terms payload

```json
{
  "summary": "Brand redesign — two milestones",
  "milestones": [
    {
      "title": "Discovery",
      "deliverables": "Research report + sitemap",
      "acceptanceCriteria": "Client written approval of sitemap",
      "amount": 50000,
      "dueDate": "2026-11-01",
      "reviewWindowDays": 5
    }
  ],
  "notes": "Amounts are integer base units (e.g. cents)."
}
```

## Endpoints

### `GET /projects/:id/agreements`

List versions for a project (newest version first), with acceptances.

```json
{
  "agreements": [ /* ... */ ],
  "activeAgreementId": "<uuid|null>",
  "proposedAgreementId": "<uuid|null>"
}
```

### `POST /projects/:id/agreements` — create v1 (CLIENT)

Body: `{ "terms": { ... } }`

- Only when the project has no agreement versions yet.
- Response `201`: `{ "agreement": { ..., "status": "PROPOSED" } }`
- Later revisions use `propose-change`.

### `GET /agreements/:id`

Single version + acceptances (project participants / arbitrator).

### `POST /agreements/:id/accept`

Body (optional): `{ "signatureRef": "..." }`

- Caller must be the project client or freelancer.
- Duplicate acceptance → `409 CONFLICT`.
- When both parties have accepted a `PROPOSED` version → status becomes `ACTIVE`; any previous `ACTIVE` becomes `SUPERSEDED`.

### `POST /agreements/:id/propose-change`

Body: `{ "terms": { ... } }`

- Client or freelancer participant.
- Withdraws any existing `PROPOSED` version on the project.
- Creates the next version number as `PROPOSED`.
- Leaves the current `ACTIVE` version unchanged until the new proposal is fully accepted.
