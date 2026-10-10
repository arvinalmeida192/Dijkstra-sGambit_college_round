/**
 * Local-only deploy helper for Hardhat network / localhost.
 * Does NOT target public networks. Do not use with real funds.
 *
 * Usage: npx hardhat run scripts/deploy-local.js
 */
const hre = require('hardhat')

async function main() {
  const [deployer, client, freelancer, arbitrator] = await hre.ethers.getSigners()

  const MockERC20 = await hre.ethers.getContractFactory('MockERC20')
  const token = await MockERC20.deploy('Fairwork Test USD', 'tUSD', 6)
  await token.waitForDeployment()

  const MilestoneEscrow = await hre.ethers.getContractFactory('MilestoneEscrow')
  const escrow = await MilestoneEscrow.deploy()
  await escrow.waitForDeployment()

  const mintAmount = 1_000_000n * 10n ** 6n
  await (await token.mint(client.address, mintAmount)).wait()

  console.log(
    JSON.stringify(
      {
        network: hre.network.name,
        chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
        note: 'TEST TOKENS / LOCAL CHAIN ONLY — not real funds',
        addresses: {
          deployer: deployer.address,
          client: client.address,
          freelancer: freelancer.address,
          arbitrator: arbitrator.address,
          mockToken: await token.getAddress(),
          milestoneEscrow: await escrow.getAddress(),
        },
        token: { name: 'Fairwork Test USD', symbol: 'tUSD', decimals: 6 },
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
