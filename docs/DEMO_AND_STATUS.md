# Fairwork — Demo Guide & Status (Phases 19–20)

**Date:** 2026-10-10  
**Phases:** 19 (AI Assessment + Deadline Notifications) · 20 (E2E / demo readiness)

## 1. Environment variables

### Backend (`backend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection (compose maps host `5434` → `5432`) |
| `JWT_SECRET` | yes | Sign access tokens |
| `JWT_EXPIRES_IN` | no | Default `7d` |
| `PORT` | no | Default `4000` |
| `CORS_ORIGIN` | no | Default `http://localhost:5173` |
| `STORAGE_PRIVATE_DIR` | no | Private deliverable/evidence root (default under `backend/storage`) |
| `MAX_UPLOAD_BYTES` | no | Default 10 MiB |
| `CHAIN_ID` | for payments | e.g. `31337` Hardhat |
| `RPC_URL` | for payments | e.g. `http://127.0.0.1:8545` |
| `ESCROW_CONTRACT_ADDRESS` | for payments | From `deploy-local.js` |
| `TOKEN_DECIMALS` | no | Default `6` (app cents ↔ token base) |
| `AI_ENABLED` | no | Default `true`; set `false` to skip model calls |
| `OLLAMA_BASE_URL` | no | Default `http://127.0.0.1:11434` |
| `OLLAMA_TIMEOUT_MS` | no | Default `60000` |
| `AI_MODEL_CODE` | no | Default `qwen2.5-coder:1.5b` |
| `AI_MODEL_TEXT` | no | Default `qwen3:1.7b,gemma3:1b` |
| `AI_MODEL_VISUAL` | no | Default `qwen2.5vl:3b,gemma3:4b` |
| `AI_COMPARE_ON_LOW_CONFIDENCE` | no | Dual-candidate compare for TEXT/VISUAL when useful |
| `AI_LOW_CONFIDENCE_THRESHOLD` | no | Default `0.55` |
| `NOTIFICATION_JOB_ENABLED` | no | Default `true` (scheduler in `npm run dev`) |
| `NOTIFICATION_JOB_INTERVAL_MS` | no | Default `300000` (5 min) |
| `DEADLINE_WARN_DAYS` | no | Default `3` |
| `INACTIVITY_DAYS` | no | Default `7` |

Leave blockchain vars blank to disable payment verification. **Do not** auto-pull Ollama models from the app — install only with explicit human approval (`AGENTS.md`).

### Frontend (`frontend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | yes | Backend origin, no trailing slash (`http://localhost:4000`) |

## 2. Local setup checklist

1. `cd backend && docker compose up -d` — wait until healthy.
2. `cp .env.example .env` — set a strong `JWT_SECRET`.
3. `npm install && npm run migrate && npm run dev`.
4. `cd frontend && cp .env.example .env && npm install && npm run dev`.
5. (Optional payments) start Hardhat node, deploy escrow, set `ESCROW_CONTRACT_ADDRESS` / `RPC_URL` / `CHAIN_ID`, restart API.
6. (Optional AI) run Ollama locally and install approved shortlist models only if a human approved the pull. Without models, assessments return `MODEL_UNAVAILABLE`.

## 3. Demo script (UI)

### Happy path

1. Open `http://localhost:5173` — landing uses Stitch-derived tokens (`#EFEDE8` base, `#FF5A1F` accent).
2. Register **Client** → create project → copy invitation link.
3. Register **Freelancer** (other session) → open invite → accept.
4. Client opens Agreement → create terms (summary + milestones with amounts in **cents**) → both accept until status is active.
5. Progress → create/start milestone → Freelancer submit link/file → Client approve or request revision.
6. Payments → after funding on local chain, paste tx hash → sync; badges show **Testnet / local**.

### Dispute path

1. On an `IN_PROGRESS` (or allowed) milestone, open dispute with a reason.
2. Upload private evidence (auth-gated download; no public URL).
3. Optionally run **AI evidence summary** on the dispute detail — advisory only; never recommends a winner.
4. Seed an `ARBITRATOR` user in Postgres (role not self-registerable), log in, claim case, record decision.
5. UI states that the decision does **not** move funds; report resolve/release/refund tx on Payments if using the contract.

### AI assessment (Phase 19)

1. On Progress, after a submission exists, use **Run assessment** (optional type override: CODE / TEXT / VISUAL).
2. Routing uses the configured Ollama shortlist; TEXT/VISUAL may compare two candidates when confidence is low.
3. Panel shows structured criteria, outstanding work, uncertainty, model identity, and status. Failures (`MODEL_UNAVAILABLE`, `INVALID_OUTPUT`, `MODEL_DISAGREEMENT`) are explicit — never silent success.
4. Header **bell** lists deterministic deadline / inactivity alerts (independent of AI).

## 4. Automated verification

| Check | Command | Result (2026-10-10) |
|---|---|---|
| Migrations | `backend: npm run migrate` | PASS (001–008) |
| Backend tests | `backend: npm test` | PASS **103/103** (20 files; includes AI + notification tests) |
| Frontend lint | `frontend: npm run lint` | PASS (warnings only; exit 0) |
| Frontend build | `frontend: npm run build` | PASS |
| Contract tests | `contracts: npm test` | PASS **15/15** |
| Contract compile | `contracts: npx hardhat compile` | PASS |

## 5. Security review notes

**In place**

- Helmet + CORS origin lock + JSON body limit.
- JWT auth on protected routes; role gates (`CLIENT` / `FREELANCER` / `ARBITRATOR`).
- Project participant checks (`assertParticipant`); outsiders get 403.
- Private storage for submissions and dispute evidence; downloads require auth.
- Payment status derived from chain receipts/events, not client-claimed status.
- Dispute decide sets `fundsMovedByDecision: false`; AI cannot authorize payments.
- AI assessments persist advisory flags (`canApproveMilestone` / `canDecideDispute` / `canAuthorizePayment` always false).
- Passwords hashed (bcrypt); no plaintext secrets in repo templates.
- Notification jobs are idempotent via `(user_id, kind, subject_key)`.

**Known gaps / deferred**

- `express-rate-limit` is a dependency but not wired on auth routes yet.
- Approved Ollama shortlist models may not be installed on a given machine — assessments fail closed.
- Arbitrator accounts must be seeded manually.
- No browser Playwright/Cypress suite; API integration + smoke cover the lifecycle.
- Stitch export is a **landing page** only; app shells follow approved tokens/components.

## 6. Stitch UI alignment

| Area | Status |
|---|---|
| Design tokens (base/surface/dark/accent/status) | Matched in `frontend/src/styles/tokens.css` |
| Landing composition | Implemented from Stitch sections |
| App pages | Functional Fairwork UI using shared kit |
| Simulated wallet / deploy in Stitch HTML | **Not** product truth — real auth is email/password API |

## 7. Mocked / incomplete features (label honestly in demos)

| Feature | State |
|---|---|
| AI assessment / dispute AI summary | Implemented; advisory; live inference ready for installed models |
| Deadline / inactivity notifications | Implemented (deterministic jobs + UI bell) |
| Ollama shortlist (as of install) | Installed: `qwen2.5-coder:1.5b`, `qwen3:1.7b`, `qwen2.5vl:3b`. Blocked: `gemma3:1b` / `gemma3:4b` need a newer Ollama than 0.24.0 (upgrade requires sudo) |
| Mainnet / real USDC | Out of scope — local/test only |
| Self-serve arbitrator registration | By design blocked |
| Wallet-based auth signatures | Optional `signatureRef` only; not cryptographic proof |

## 8. Package scripts reference

```bash
# backend
npm run dev | start | migrate | test | test:watch

# frontend
npm run dev | build | lint | preview

# contracts
npm test | npm run compile | npm run deploy:local
```
