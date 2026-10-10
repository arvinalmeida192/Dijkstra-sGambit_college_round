# Fairwork — Local Development Environment Guide

This guide details how to manually set up, run, and troubleshoot the Fairwork backend and frontend on your local Linux system.

---

## 1. Prerequisites & Status

| Requirement | Project Requirement | Detected on System | Status |
|---|---|---|---|
| **Node.js** | `>= 20` | `v22.23.2` | **Verified** |
| **npm** | `>= 10` | `10.9.8` | **Verified** |
| **Ports** | `4000` (API), `5173` (UI), `5434` (DB) | All ports free | **Verified** |
| **PostgreSQL** | PostgreSQL 16 (via Docker/Podman or Native) | Not currently running | **Action Required** (see Step 1) |

---

## 2. Prepared Environment Files

Local environment configuration files have been prepared and verified to be properly ignored by Git (`.gitignore`):

### Backend: `backend/.env`
- `PORT=4000` — Port for the Express API.
- `NODE_ENV=development` — Local development mode.
- `DATABASE_URL=postgres://fairwork:fairwork@127.0.0.1:5434/fairwork` — PostgreSQL connection string (defaults to docker-compose port `5434`).
- `JWT_SECRET=[Configured]` — Cryptographically secure development secret generated and configured.
- `JWT_EXPIRES_IN=7d` — Auth token expiration window.
- `CORS_ORIGIN=http://localhost:5173` — Allowed frontend development origin.
- `STORAGE_PRIVATE_DIR=` — Private submission/evidence storage directory (defaults to `backend/storage/private`).
- `MAX_UPLOAD_BYTES=10485760` — 10 MiB upload limit.
- `AI_ENABLED=true` — Advisory AI assessment enabled. If local Ollama is offline or models are unpulled, requests return explicit `MODEL_UNAVAILABLE` without breaking the app or fabricating results.
- `NOTIFICATION_JOB_ENABLED=true` — Rule-based deadline and inactivity alert scheduler enabled.
- `CHAIN_ID=31337`, `RPC_URL=http://127.0.0.1:8545`, `ESCROW_CONTRACT_ADDRESS=` — Optional Hardhat payment verification (disabled until contract address is set).

### Frontend: `frontend/.env`
- `VITE_API_BASE_URL=http://localhost:4000` — Points Vite client to the local backend API without a trailing slash.

*(Note: Secrets are never committed or exposed in version control.)*

---

## 3. Values to Configure Manually (If Applicable)

1. **Native PostgreSQL Users:** If you run PostgreSQL natively on port `5432` rather than via Docker Compose, update `DATABASE_URL` in `backend/.env`:
   ```env
   DATABASE_URL=postgres://<username>:<password>@127.0.0.1:5432/<database_name>
   ```
2. **Optional On-Chain Payments:** If deploying local Hardhat escrow contracts, update `ESCROW_CONTRACT_ADDRESS` in `backend/.env` after deployment.
3. **Optional Ollama AI:** If using Phase 19 AI evaluations, ensure Ollama is running at `http://127.0.0.1:11434` with approved models pulled. Otherwise, leave as-is (assessments safely return `MODEL_UNAVAILABLE`).

---

## 4. Step-by-Step Manual Execution Order

Execute each command from the specified directory in the following sequence:

### Step 1: Start PostgreSQL

Choose **Option A** (Docker/Podman) or **Option B** (Native PostgreSQL):

#### Option A: Docker / Podman (Recommended by repository)
If you have Docker or Podman installed:
```bash
cd /home/brendan09/Desktop/Projects/Dijkstra-sGambit_college_round/backend
docker compose up -d
```
*(Or `podman compose up -d`)*

Verify the container is healthy:
```bash
docker ps
```
The container exposes port `5434` on the host, matching the preconfigured `DATABASE_URL`.

#### Option B: Native PostgreSQL
If running PostgreSQL natively:
- **Fedora:**
  ```bash
  sudo dnf install -y postgresql-server postgresql-contrib
  sudo postgresql-setup --initdb
  sudo systemctl enable --now postgresql
  ```
- **Ubuntu/Debian:**
  ```bash
  sudo apt update && sudo apt install -y postgresql postgresql-contrib
  sudo systemctl enable --now postgresql
  ```

Create the user and database:
```bash
sudo -u postgres psql -c "CREATE USER fairwork WITH PASSWORD 'fairwork';"
sudo -u postgres psql -c "CREATE DATABASE fairwork OWNER fairwork;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE fairwork TO fairwork;"
```
*(If using port 5432, ensure `backend/.env` has `DATABASE_URL=postgres://fairwork:fairwork@127.0.0.1:5432/fairwork`)*

---

### Step 2: Install Backend Dependencies & Run Migrations

From the `backend` directory:
```bash
cd /home/brendan09/Desktop/Projects/Dijkstra-sGambit_college_round/backend
npm install
npm run migrate
```
This runs migrations `001_users.sql` through `008_ai_notifications.sql`.

---

### Step 3: Start the Backend Server

From the `backend` directory:
```bash
cd /home/brendan09/Desktop/Projects/Dijkstra-sGambit_college_round/backend
npm run dev
```
The backend will listen on **`http://localhost:4000`**.  
Verify health by visiting or curling:
```bash
curl http://localhost:4000/health
```

---

### Step 4: Install Frontend Dependencies & Start Frontend Server

Open a **separate terminal window** and run:
```bash
cd /home/brendan09/Desktop/Projects/Dijkstra-sGambit_college_round/frontend
npm install
npm run dev
```
The frontend will start with Vite on **`http://localhost:5173`**.

---

## 5. Local Access URLs

- **Frontend Web UI:** `http://localhost:5173`
- **Backend API:** `http://localhost:4000`
- **API Health Check:** `http://localhost:4000/health`
- **PostgreSQL Database:** `127.0.0.1:5434` (Docker Compose) or `127.0.0.1:5432` (Native)

---

## 6. Stopping the Servers

- To stop the backend or frontend: Press `Ctrl + C` in the respective terminal window.
- To stop the Docker database container:
  ```bash
  cd /home/brendan09/Desktop/Projects/Dijkstra-sGambit_college_round/backend
  docker compose down
  ```

---

## 7. Troubleshooting & Common Issues

| Issue | Cause | Resolution |
|---|---|---|
| `connect ECONNREFUSED 127.0.0.1:5434` | PostgreSQL container is not running | Run `docker compose up -d` in `backend/` and verify container health with `docker ps`. |
| `connect ECONNREFUSED 127.0.0.1:5432` | Native PostgreSQL service is inactive | Run `sudo systemctl status postgresql` and start it with `sudo systemctl start postgresql`. |
| `API is not configured (VITE_API_BASE_URL missing)` | Vite didn't pick up `frontend/.env` | Restart the Vite dev server (`Ctrl+C` then `npm run dev`). |
| `MODEL_UNAVAILABLE` on AI Assessment | Ollama is offline or model weights not pulled | Expected behavior when local Ollama is not active. The app will continue working normally. AI assessments are purely advisory. |
| Port 4000 or 5173 already in use | Another process is holding the port | Check listening ports with `ss -tulpn \| grep -E '4000\|5173'` and stop the conflicting process. |

---

## 8. Verification Status Summary

- **Verified Configuration:**
  - Node.js runtime (`v22.23.2`) and npm (`10.9.8`) are compatible.
  - Environment variables and files created (`backend/.env`, `frontend/.env`).
  - `.gitignore` prevents secret exposure.
  - Ports `4000`, `5173`, and `5434` are available.
  - Backend and frontend scripts verified in `package.json`.
- **Unverified Connectivity (Requires Service Startup):**
  - Database connectivity and migration execution (PostgreSQL service not yet running).
  - Live HTTP communication between frontend and backend (servers deliberately not started per task objective).
