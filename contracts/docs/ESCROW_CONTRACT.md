# Milestone Escrow Contract (Phase 16)

Local / test-token escrow only. **Not** mainnet. **Not** real funds.

## Package

`contracts/` — Hardhat 2 + Solidity 0.8.20 + OpenZeppelin ERC-20 helpers.

## Contracts

| Contract | Role |
|---|---|
| `MilestoneEscrow` | Multi-agreement escrow: fund, release, refund, dispute, resolve |
| `MockERC20` | Mintable test ERC-20 (default demo: 6 decimals, `tUSD`) |

## Roles (per agreement)

- **Client** — adds milestones, funds, ordinary release/refund, may open dispute
- **Freelancer** — receives releases; may open dispute
- **Arbitrator** — sole resolver of disputed milestones (release / refund / split)

Client, freelancer, and arbitrator addresses must be distinct.

## Milestone states

`None` → `Pending` → `Funded` → `Released` | `Refunded` | `Disputed` → (arbitrator) `Released` | `Refunded`

While `Disputed`, ordinary `releaseMilestone` / `refundMilestone` revert. Only `resolveDispute` may move funds.

## Amounts

All amounts are **raw ERC-20 base units** (token decimals). The app’s display cents (`amount / 100`) are a separate off-chain convention — Phase 17 maps them when integrating.

## Events (for backend indexing)

- `AgreementCreated`
- `MilestoneAdded`
- `MilestoneFunded`
- `MilestoneReleased`
- `MilestoneRefunded`
- `DisputeOpened`
- `DisputeResolved`

## Commands

```bash
cd contracts
npm test
npx hardhat compile
npx hardhat run scripts/deploy-local.js   # local Hardhat network only
```

Do **not** deploy to a public network or use real funds without explicit human approval.

## What this does *not* claim

- No claim that production USDC or mainnet custody is live.
- No AI / backend path can bypass these checks; the contract enforces transfers.
- A PostgreSQL status update is still not proof of an on-chain payment (Phase 17 verifies receipts).
