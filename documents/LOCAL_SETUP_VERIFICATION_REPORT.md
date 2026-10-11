# Fairwork — Local Setup Verification Report

**Date:** 2026-10-11  
**Host:** Linux (Node `v24.5.0`, npm `9.2.0`, Docker `29.1.3`, Ollama `0.24.0`)  
**Branch:** `arvin` (post-pull Phases 0–20 + integration)  
**Operator constraint:** Preserve existing models, caches, DB volume; no Git state changes; Razorpay **test-mode checkout** enabled; payouts remain **simulated** (no real bank transfers).

---

## 1. Verdict

Local stack is configured and verified end-to-end:

| Layer | Status |
|---|---|
| PostgreSQL (Docker `:5434`) | **Healthy** (existing volume reused; not reset) |
| Backend API (`:4000`) | **Running** — `GET /health` → `{"status":"ok","service":"fairwork-api"}` |
| Frontend Vite (`:5173`) | **Running** — HTTP 200 |
| Ollama (`:11434`) | **Running** — live assessment **COMPLETED** via API |
| Hardhat local chain (`:8545`) | **Running** — escrow deployed; code present at configured address |
| Gateway / payouts | **Enabled (Razorpay test mode)** — `GATEWAY_PAYMENTS_ENABLED=true`, `PAYOUT_MODE=simulated` |

---

## 2. Setup changes made (minimal)

1. **Started** existing `fairwork-postgres` container via `docker compose up -d` (volume `backend_fairwork_pg_data` preserved; no `-v` wipe).
2. **Configured** Phase 21 gateway in `backend/.env` (existing Razorpay **test** keys preserved; no live/prod keys):
   - `GATEWAY_PAYMENTS_ENABLED=true`
   - `RAZORPAY_KEY_ID=rzp_test_…` (test key present; not stub placeholder)
   - `RAZORPAY_KEY_SECRET` set (redacted)
   - `RAZORPAY_WEBHOOK_SECRET` set to local demo value (was placeholder)
   - `PAYOUT_MODE=simulated`
   - `PROCESSING_FEE_RATE=0.02`
3. **Synced** npm dependencies (`backend`, `frontend`, `contracts`) — all already present / up to date.
4. **Applied** migrations `001`–`012` (schema was empty inside the preserved volume; no app tables existed before migrate).
5. **Deployed** local Hardhat escrow and set `ESCROW_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` in `backend/.env` (local/test only).
6. **Restarted** backend so gateway + escrow env was loaded.

**Not done (by design):**
- No Ollama model re-downloads / pulls.
- No DB volume delete or `TRUNCATE` outside of what `npm test` itself performs.
- No live/production Razorpay keys; no real payouts (`PAYOUT_MODE=simulated` only).
- No Git commits, pushes, or branch switches.
- JWT secret left as already present in `.env` (still the example placeholder string — see blockers).

---

## 3. Environment check (secrets redacted)

### Backend `backend/.env`

| Variable | Observed |
|---|---|
| `PORT` | `4000` |
| `NODE_ENV` | `development` |
| `DATABASE_URL` | `postgres://fairwork:***@127.0.0.1:5434/fairwork` |
| `JWT_SECRET` | set (length 33; **still example `replace-with-…` placeholder**) |
| `CORS_ORIGIN` | `http://localhost:5173` |
| `AI_ENABLED` | `true` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` |
| `AI_MODEL_CODE` | `qwen2.5-coder:1.5b` |
| `AI_MODEL_TEXT` | `qwen3:1.7b,gemma3:1b` |
| `AI_MODEL_VISUAL` | `qwen2.5vl:3b,gemma3:4b` |
| `CHAIN_ID` / `RPC_URL` | `31337` / `http://127.0.0.1:8545` |
| `ESCROW_CONTRACT_ADDRESS` | set to local Hardhat deploy |
| `GATEWAY_PAYMENTS_ENABLED` | `true` |
| `RAZORPAY_KEY_ID` | `rzp_test_…` (test mode; length 23) |
| `RAZORPAY_KEY_SECRET` | set (redacted) |
| `RAZORPAY_WEBHOOK_SECRET` | set (local demo; redacted) |
| `PAYOUT_MODE` | `simulated` |
| `PROCESSING_FEE_RATE` | `0.02` |

### Frontend `frontend/.env`

| Variable | Observed |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4000` |

---

## 4. Reproducible startup order

From repo root `/home/arvinalmeida/Dijkstra-sGambit_college_round`:

```bash
# 1) Database (preserves volume)
cd backend && docker compose up -d
# wait until: docker inspect -f '{{.State.Health.Status}}' fairwork-postgres  → healthy

# 2) Migrations (idempotent skips)
npm install
npm run migrate

# 3) Backend API
npm run dev
# → http://localhost:4000/health

# 4) Frontend (separate terminal)
cd ../frontend
npm install
npm run dev
# → http://localhost:5173

# 5) Ollama (already a system service here)
# ollama serve   # only if not already running
# Do NOT pull models that are already installed

# 6) Optional: local chain + escrow (separate terminals)
cd ../contracts
npx hardhat node
npx hardhat run scripts/deploy-local.js --network localhost
# copy milestoneEscrow address into backend/.env ESCROW_CONTRACT_ADDRESS, restart API

# 7) Gateway payments (already configured in backend/.env on this machine)
# GATEWAY_PAYMENTS_ENABLED=true
# RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET = Razorpay Dashboard test keys (rzp_test_…)
# PAYOUT_MODE=simulated
# PROCESSING_FEE_RATE=0.02
# Restart API after any .env change
```

**Access URLs**
- UI: `http://localhost:5173` (match `CORS_ORIGIN`; prefer `localhost` over `127.0.0.1` in the browser)
- API: `http://localhost:4000`
- Funding UI: project → Funding / Payments (Razorpay Checkout test mode)
- DB: `127.0.0.1:5434`
- Ollama: `127.0.0.1:11434`
- Hardhat RPC: `127.0.0.1:8545`

---

## 5. Service status at verification time

| Service | Endpoint / check | Result |
|---|---|---|
| Postgres | `pg_isready -h 127.0.0.1 -p 5434` + Docker health | accepting / **healthy** |
| Migrations | `schema_migrations` | **14 files applied** (`001`…`012`, including duplicate-numbered `010_*` / `011_*`) |
| Backend | `GET /health` | **200** `ok` |
| Frontend | `GET http://127.0.0.1:5173/` | **200** |
| CORS | `Origin: http://localhost:5173` | `Access-Control-Allow-Origin: http://localhost:5173` |
| Ollama tags | `/api/tags` | 6 local models listed |
| Hardhat | `eth_chainId` | `0x7a69` (31337) |
| Escrow bytecode | `eth_getCode(ESCROW…)` | **6019 bytes** |
| Gateway status | `GET /api/v1/projects/:id/funding/status` | **`enabled: true`**, fee estimate 2% surcharge |
| Razorpay order | `POST …/funding/order` | **Real test-mode order** created (`order_…`) |
| Verify + ledger | `POST …/funding/verify` | **`PAID`**, milestone funds **`HELD`** |
| Simulated payout | approve + release | fund **`RELEASED`** with `SIM-PAYOUT-…` |

---

## 6. Automated test results (actual)

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd backend && npm test` | **PASS — 137/137** (26 files), ~97s |
| Funding suite | `npx vitest run tests/integration/funding.test.js` | **PASS — 6/6** |
| Frontend lint | `cd frontend && npm run lint` | **PASS (exit 0)** — 14 `react(set-state-in-effect)` / fast-refresh **warnings** |
| Frontend build | `cd frontend && npm run build` | **PASS** (Vite production build) |
| Contracts compile | `cd contracts && npx hardhat compile` | **PASS** |
| Contracts tests | `cd contracts && npm test` | **PASS — 21/21** |

---

## 7. AI inference verification (actual, not mocked)

### Installed shortlist models

| Model | Installed |
|---|---|
| `qwen2.5-coder:1.5b` | **Yes** |
| `qwen3:1.7b` | **Yes** |
| `qwen2.5vl:3b` | **Yes** |
| `gemma3:1b` | **No** (not pulled; known Ollama 0.24.0 limitation per prior docs) |
| `gemma3:4b` | **No** |

No model weights were downloaded during this setup.

### Adapter smoke (`OllamaAdapter`)

- `isAvailable()` → `true`
- `generate(qwen2.5-coder:1.5b)` → `ok: true`
- `generate(qwen2.5vl:3b)` → `ok: true`

### Live API assessment (real Ollama)

Path: register client + freelancer → project → invite accept → milestone → submission →  
`POST /api/v1/submissions/:id/assessments` with `{"deliverableType":"TEXT"}`

| Field | Observed |
|---|---|
| HTTP | **201** (~41s) |
| `status` | **COMPLETED** |
| `provider` | `ollama` |
| `result.modelsRun` | `["qwen3:1.7b"]` |
| `advisoryOnly` | `true` |
| `canApproveMilestone` / `canDecideDispute` / `canAuthorizePayment` | all **`false`** |
| Structured output | criteria + summary + confidence returned |

**Note (application quirk, not setup):** top-level `assessment.model` was `null` while `result.modelsRun` correctly listed `qwen3:1.7b`.

---

## 8. Blockchain verification (local only)

- Hardhat node running on `:8545`
- Deploy script output: `milestoneEscrow = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`
- Backend env updated to that address; API restarted
- Contract tests **21/21** passing
- **No mainnet / real funds / live payouts**

Hardhat state is ephemeral: restarting `hardhat node` clears chain state; re-deploy and update `ESCROW_CONTRACT_ADDRESS` again if needed.

---

## 8b. Gateway payment verification (Razorpay test mode)

Live smoke (API, not mocked):

1. Register client + freelancer → project → invite accept → agreement (both accept → `ACTIVE`)
2. `GET …/funding/status` → `enabled: true`, `feeEstimate` for ₹150.00 + 2% = ₹153.00 total
3. `POST …/funding/order` → Razorpay **test** order id (`order_…`), amount `15300` paise
4. `POST …/funding/verify` with HMAC signature → `funding.status=PAID`, milestone funds `HELD`
5. Freelancer submits → client `PATCH …/milestones/:id/status` to `APPROVED` → release → fund `RELEASED` with `SIM-PAYOUT-<fundId>`

UI: open `http://localhost:5173`, create/accept an agreement, then use Funding / Payments → **Pay Now** (Razorpay Checkout test cards/UPI).

Safety: checkout uses `rzp_test_…` only; milestone releases use `PAYOUT_MODE=simulated` (no real bank transfer).

---

## 9. Setup vs application issues

### Setup / config

| Item | Classification |
|---|---|
| Postgres container was stopped after reboot/exit | Setup — restarted |
| Phase 21 gateway initially disabled / incomplete webhook secret | Setup — enabled test gateway; webhook secret set for local demo |
| Schema empty inside preserved volume | Setup — migrations applied (data was already absent) |
| Escrow address blank | Setup — set after local deploy |
| API needed restart to load gateway env | Setup — restarted `npm run dev` |

### Application / product notes (not “fixed” as setup)

| Item | Notes |
|---|---|
| Frontend oxlint `set-state-in-effect` warnings | Lint warnings only; build still passes |
| `assessment.model` null while `modelsRun` populated | Observed on live TEXT assessment |
| Integration tests `TRUNCATE` users | Running `npm test` wipes app rows in the shared local DB |
| Duplicate migration filenames (`010_*`, `011_*`) | Works because ledger keys are full filenames; worth cleaning later |
| `JWT_SECRET` still example placeholder | Works locally; should be rotated for any shared/demo use |
| `gemma3:1b` / `gemma3:4b` missing | Dual-candidate TEXT/VISUAL compare fallback unavailable |

---

## 10. Remaining blockers / follow-ups

1. **Optional Gemma shortlist models** — blocked without Ollama upgrade / explicit human-approved pull (`gemma3:1b`, `gemma3:4b`). Primary models already work.
2. **Rotate `JWT_SECRET`** — replace example placeholder when convenient (invalidates existing sessions).
3. **Hardhat not persistent** — must re-run node + deploy after reboot.
4. **Avoid `npm test` on a DB you care about** — suite truncates tables; use a separate test DB if preserving demo data matters.
5. **Docs drift** — some guides still say migrations `001–008` / older test counts; current tree has through `012` and **137** backend / **21** contract tests.
6. **Production payouts** — still intentionally off (`PAYOUT_MODE=simulated`). Real Razorpay Route/X needs separate onboarding + approval.

---

## 11. Currently running processes (this session)

Keep these terminals/processes up for continued local use:

1. `fairwork-postgres` (Docker)
2. `backend`: `npm run dev` → `:4000`
3. `frontend`: `npm run dev` → `:5173`
4. `ollama serve` (system)
5. `npx hardhat node` → `:8545` (optional payments)

Stop DB only with `docker compose down` (**without** `-v`) to preserve the volume.
