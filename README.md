# Fairwork (Dijkstra's Gambit)

Hackathon MVP: a project-protection layer for freelance work — agreements, milestones, private deliverables, escrow payment verification on a **local/test** chain, and human-authorized disputes.

**Team:** Arvin Almeida · Anto Oswald · Brendan Rodrigues · Cyrus Selvaraj

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind (`frontend/`) |
| Backend | Node.js + Express + PostgreSQL (`backend/`) |
| Contracts | Solidity + Hardhat (`contracts/`) — local/test tokens only |

## Quick start

### 1. Database

```bash
cd backend
docker compose up -d
cp .env.example .env   # if needed; set JWT_SECRET
npm install
npm run migrate
npm run dev            # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:4000
npm install
npm run dev            # http://localhost:5173
```

### 3. Contracts (optional — payments verification)

```bash
cd contracts
npm install
npx hardhat node       # terminal A — local chain :8545
npx hardhat run scripts/deploy-local.js --network localhost   # terminal B
```

Copy `milestoneEscrow` into `backend/.env` as `ESCROW_CONTRACT_ADDRESS`, keep `CHAIN_ID=31337` and `RPC_URL=http://127.0.0.1:8545`, restart the API.

## Test commands

```bash
# Backend (Postgres must be up)
cd backend && npm run migrate && npm test

# Frontend
cd frontend && npm run lint && npm run build

# Contracts
cd contracts && npm test
```

## Demo path (manual UI)

1. Register a **Client** and a **Freelancer** (separate browsers/profiles).
2. Client creates a project → invites freelancer → freelancer accepts invite.
3. Client drafts agreement terms → both parties accept → agreement activates.
4. Client creates milestones on Progress → freelancer starts work → submits evidence (link and/or private file).
5. Client reviews/approves (or requests revision). Freelancer cannot approve their own work.
6. **Payments (optional):** fund/release on the local Hardhat chain, then report the tx hash on Payments. Statuses come from verified receipts only; UI labels **testnet / local**.
7. **Disputes:** open a dispute from Progress or Disputes, upload private evidence. An **ARBITRATOR** (seeded DB user — not self-registerable) claims and records a decision. App decisions do **not** move escrow; report the on-chain resolve tx on Payments afterward.
8. **AI (Phase 19):** on Progress, run an advisory assessment against a submission (Ollama must be running with approved models installed). On Disputes, optional evidence summary. Header bell shows deterministic deadline/inactivity alerts. AI never approves milestones, decides disputes, or moves funds — if models are missing, status is `MODEL_UNAVAILABLE` (no fabricated success).

Detailed steps, env vars, security notes, and known limitations: [`docs/DEMO_AND_STATUS.md`](docs/DEMO_AND_STATUS.md).

## Spec documents

- `FAIRWORK_20_PHASE_AGENT_WORKFLOW.md` — phase operating manual
- `FAIRWORK_AGENTS_ENTRYPOINT.md` / `AGENTS.md` — agent rules + AI model shortlist
- `FAIRWORK_PROJECT_OVERVIEW.md`, `FAIRWORK_FRONTEND_FEATURES.md`, `FAIRWORK_BACKEND_ARCHITECTURE.md`
- `docs/FAIRWORK_DESIGN_INVENTORY.md` — Stitch export inventory
- `backend/docs/*_API.md`, `contracts/docs/ESCROW_CONTRACT.md`

## Honest labels

- Escrow demos use **testnet / local** funds only — never presented as real mainnet custody.
- A PostgreSQL status update is **not** proof of an on-chain payment.
- AI assessments are **advisory only**; missing Ollama/models yield explicit failure statuses, never invented success.
- Dispute decisions are human-authorized; they do not independently transfer escrow.
- Deadline/inactivity notifications are **rule-based**, not model judgment.
