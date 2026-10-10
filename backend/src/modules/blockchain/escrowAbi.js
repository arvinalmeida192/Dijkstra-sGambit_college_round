import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const artifact = JSON.parse(
  readFileSync(path.join(__dirname, 'abi/MilestoneEscrow.json'), 'utf8'),
)

/** Minimal MilestoneEscrow ABI (events + read helpers) for verification. */
export const milestoneEscrowAbi = artifact.abi
