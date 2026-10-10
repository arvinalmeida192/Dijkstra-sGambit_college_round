const { expect } = require('chai')
const { ethers } = require('hardhat')

const DECIMALS = 6n
const ONE = 10n ** DECIMALS

async function deployFixture() {
  const [deployer, client, freelancer, arbitrator, outsider] =
    await ethers.getSigners()

  const MockERC20 = await ethers.getContractFactory('MockERC20')
  const token = await MockERC20.deploy('Fairwork Test USD', 'tUSD', 6)
  await token.waitForDeployment()

  const MilestoneEscrow = await ethers.getContractFactory('MilestoneEscrow')
  const escrow = await MilestoneEscrow.deploy()
  await escrow.waitForDeployment()

  await token.mint(client.address, 1_000_000n * ONE)

  return { deployer, client, freelancer, arbitrator, outsider, token, escrow }
}

async function createFundedMilestone(
  escrow,
  token,
  client,
  freelancer,
  arbitrator,
  amount = 100n * ONE,
) {
  const tx = await escrow.createAgreement(
    client.address,
    freelancer.address,
    arbitrator.address,
    await token.getAddress(),
  )
  const receipt = await tx.wait()
  const created = receipt.logs
    .map((log) => {
      try {
        return escrow.interface.parseLog(log)
      } catch {
        return null
      }
    })
    .find((e) => e && e.name === 'AgreementCreated')
  const agreementId = created.args.agreementId

  const addTx = await escrow.connect(client).addMilestone(agreementId, amount)
  const addReceipt = await addTx.wait()
  const added = addReceipt.logs
    .map((log) => {
      try {
        return escrow.interface.parseLog(log)
      } catch {
        return null
      }
    })
    .find((e) => e && e.name === 'MilestoneAdded')
  const milestoneId = added.args.milestoneId

  await token.connect(client).approve(await escrow.getAddress(), amount)
  await escrow.connect(client).fundMilestone(agreementId, milestoneId)

  return { agreementId, milestoneId, amount }
}

describe('MilestoneEscrow', function () {
  describe('createAgreement / addMilestone', function () {
    it('creates an agreement and adds a pending milestone', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()

      await expect(
        escrow.createAgreement(
          client.address,
          freelancer.address,
          arbitrator.address,
          await token.getAddress(),
        ),
      )
        .to.emit(escrow, 'AgreementCreated')
        .withArgs(
          0n,
          client.address,
          freelancer.address,
          arbitrator.address,
          await token.getAddress(),
        )

      await expect(escrow.connect(client).addMilestone(0n, 50n * ONE))
        .to.emit(escrow, 'MilestoneAdded')
        .withArgs(0n, 0n, 50n * ONE)

      const m = await escrow.getMilestone(0n, 0n)
      expect(m.amount).to.equal(50n * ONE)
      expect(m.state).to.equal(1n) // Pending
    })

    it('rejects zero addresses and duplicate roles', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      const tokenAddr = await token.getAddress()

      await expect(
        escrow.createAgreement(
          ethers.ZeroAddress,
          freelancer.address,
          arbitrator.address,
          tokenAddr,
        ),
      ).to.be.revertedWithCustomError(escrow, 'InvalidAddress')

      await expect(
        escrow.createAgreement(
          client.address,
          client.address,
          arbitrator.address,
          tokenAddr,
        ),
      ).to.be.revertedWithCustomError(escrow, 'RolesMustDiffer')
    })

    it('only client may add milestones; amount must be > 0', async function () {
      const { client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      await escrow.createAgreement(
        client.address,
        freelancer.address,
        arbitrator.address,
        await token.getAddress(),
      )

      await expect(
        escrow.connect(outsider).addMilestone(0n, 10n * ONE),
      ).to.be.revertedWithCustomError(escrow, 'Unauthorized')

      await expect(
        escrow.connect(client).addMilestone(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, 'InvalidAmount')
    })
  })

  describe('funding', function () {
    it('funds a pending milestone and emits MilestoneFunded', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      await escrow.createAgreement(
        client.address,
        freelancer.address,
        arbitrator.address,
        await token.getAddress(),
      )
      await escrow.connect(client).addMilestone(0n, 25n * ONE)
      await token.connect(client).approve(await escrow.getAddress(), 25n * ONE)

      await expect(escrow.connect(client).fundMilestone(0n, 0n))
        .to.emit(escrow, 'MilestoneFunded')
        .withArgs(0n, 0n, client.address, 25n * ONE)

      expect(await token.balanceOf(await escrow.getAddress())).to.equal(
        25n * ONE,
      )
      expect((await escrow.getMilestone(0n, 0n)).state).to.equal(2n) // Funded
    })

    it('rejects funding by non-client and duplicate fund', async function () {
      const { client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      await escrow.createAgreement(
        client.address,
        freelancer.address,
        arbitrator.address,
        await token.getAddress(),
      )
      await escrow.connect(client).addMilestone(0n, 10n * ONE)
      await token.connect(client).approve(await escrow.getAddress(), 10n * ONE)

      await expect(
        escrow.connect(outsider).fundMilestone(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, 'Unauthorized')

      await escrow.connect(client).fundMilestone(0n, 0n)

      await expect(
        escrow.connect(client).fundMilestone(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')
    })
  })

  describe('release and refund', function () {
    it('client releases funded milestone to freelancer once', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId, amount } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      const before = await token.balanceOf(freelancer.address)
      await expect(
        escrow.connect(client).releaseMilestone(agreementId, milestoneId),
      )
        .to.emit(escrow, 'MilestoneReleased')
        .withArgs(agreementId, milestoneId, freelancer.address, amount)

      expect(await token.balanceOf(freelancer.address)).to.equal(
        before + amount,
      )
      expect(
        (await escrow.getMilestone(agreementId, milestoneId)).state,
      ).to.equal(3n) // Released

      await expect(
        escrow.connect(client).releaseMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')
    })

    it('client refunds funded milestone to self once', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId, amount } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      const before = await token.balanceOf(client.address)
      await expect(
        escrow.connect(client).refundMilestone(agreementId, milestoneId),
      )
        .to.emit(escrow, 'MilestoneRefunded')
        .withArgs(agreementId, milestoneId, client.address, amount)

      expect(await token.balanceOf(client.address)).to.equal(before + amount)
      expect(
        (await escrow.getMilestone(agreementId, milestoneId)).state,
      ).to.equal(4n) // Refunded

      await expect(
        escrow.connect(client).refundMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')
    })

    it('rejects unauthorized release/refund', async function () {
      const { client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      await expect(
        escrow.connect(freelancer).releaseMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'Unauthorized')

      await expect(
        escrow.connect(outsider).refundMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'Unauthorized')
    })
  })

  describe('dispute protection', function () {
    it('blocks ordinary release/refund while disputed', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      await expect(
        escrow.connect(freelancer).openDispute(agreementId, milestoneId),
      )
        .to.emit(escrow, 'DisputeOpened')
        .withArgs(agreementId, milestoneId, freelancer.address)

      expect(
        (await escrow.getMilestone(agreementId, milestoneId)).state,
      ).to.equal(5n) // Disputed

      await expect(
        escrow.connect(client).releaseMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')

      await expect(
        escrow.connect(client).refundMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')
    })

    it('rejects outsider opening dispute and duplicate open', async function () {
      const { client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      await expect(
        escrow.connect(outsider).openDispute(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'Unauthorized')

      await escrow.connect(client).openDispute(agreementId, milestoneId)

      await expect(
        escrow.connect(client).openDispute(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')
    })

    it('arbitrator can fully release disputed funds', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId, amount } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )
      await escrow.connect(client).openDispute(agreementId, milestoneId)

      const before = await token.balanceOf(freelancer.address)
      await expect(
        escrow
          .connect(arbitrator)
          .resolveDispute(agreementId, milestoneId, amount),
      )
        .to.emit(escrow, 'DisputeResolved')
        .withArgs(agreementId, milestoneId, arbitrator.address, amount, 0n)

      expect(await token.balanceOf(freelancer.address)).to.equal(
        before + amount,
      )
      expect(
        (await escrow.getMilestone(agreementId, milestoneId)).state,
      ).to.equal(3n) // Released
    })

    it('arbitrator can fully refund disputed funds', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId, amount } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )
      await escrow.connect(client).openDispute(agreementId, milestoneId)

      const before = await token.balanceOf(client.address)
      await expect(
        escrow.connect(arbitrator).resolveDispute(agreementId, milestoneId, 0n),
      )
        .to.emit(escrow, 'DisputeResolved')
        .withArgs(agreementId, milestoneId, arbitrator.address, 0n, amount)

      expect(await token.balanceOf(client.address)).to.equal(before + amount)
      expect(
        (await escrow.getMilestone(agreementId, milestoneId)).state,
      ).to.equal(4n) // Refunded
    })

    it('arbitrator can split; non-arbitrator cannot resolve; no double resolve', async function () {
      const { client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      const amount = 100n * ONE
      const { agreementId, milestoneId } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
        amount,
      )
      await escrow.connect(client).openDispute(agreementId, milestoneId)

      await expect(
        escrow.connect(client).resolveDispute(agreementId, milestoneId, 40n * ONE),
      ).to.be.revertedWithCustomError(escrow, 'Unauthorized')

      await expect(
        escrow
          .connect(outsider)
          .resolveDispute(agreementId, milestoneId, 40n * ONE),
      ).to.be.revertedWithCustomError(escrow, 'Unauthorized')

      await expect(
        escrow
          .connect(arbitrator)
          .resolveDispute(agreementId, milestoneId, amount + 1n),
      ).to.be.revertedWithCustomError(escrow, 'InvalidAmount')

      const freeBefore = await token.balanceOf(freelancer.address)
      const clientBefore = await token.balanceOf(client.address)
      const toFreelancer = 40n * ONE
      const toClient = amount - toFreelancer

      await expect(
        escrow
          .connect(arbitrator)
          .resolveDispute(agreementId, milestoneId, toFreelancer),
      )
        .to.emit(escrow, 'DisputeResolved')
        .withArgs(
          agreementId,
          milestoneId,
          arbitrator.address,
          toFreelancer,
          toClient,
        )

      expect(await token.balanceOf(freelancer.address)).to.equal(
        freeBefore + toFreelancer,
      )
      expect(await token.balanceOf(client.address)).to.equal(
        clientBefore + toClient,
      )

      await expect(
        escrow
          .connect(arbitrator)
          .resolveDispute(agreementId, milestoneId, toFreelancer),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')
    })
  })

  describe('edge cases', function () {
    it('reverts on missing agreement / milestone', async function () {
      const { client, escrow } = await deployFixture()

      await expect(
        escrow.connect(client).addMilestone(99n, 1n),
      ).to.be.revertedWithCustomError(escrow, 'AgreementMissing')

      await expect(
        escrow.connect(client).fundMilestone(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, 'AgreementMissing')
    })

    it('cannot release unfunded pending milestone', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      await escrow.createAgreement(
        client.address,
        freelancer.address,
        arbitrator.address,
        await token.getAddress(),
      )
      await escrow.connect(client).addMilestone(0n, 10n * ONE)

      await expect(
        escrow.connect(client).releaseMilestone(0n, 0n),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')
    })
  })

  describe('participant protection (deadlines, auto-release, dispute freeze)', function () {
    it('auto-releases to freelancer after review window expires', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId, amount } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      const latestBlock = await ethers.provider.getBlock('latest')
      const reviewDueAt = BigInt(latestBlock.timestamp) + 100n

      await escrow
        .connect(client)
        .setMilestoneProtection(agreementId, milestoneId, 0n, reviewDueAt)

      // Before expiry: reverts
      await expect(
        escrow.autoReleaseMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'ReviewWindowNotExpired')

      // Advance time past review window
      await ethers.provider.send('evm_increaseTime', [150])
      await ethers.provider.send('evm_mine')

      const freelancerBefore = await token.balanceOf(freelancer.address)
      await expect(
        escrow.autoReleaseMilestone(agreementId, milestoneId),
      )
        .to.emit(escrow, 'MilestoneReleased')
        .withArgs(agreementId, milestoneId, freelancer.address, amount)
        .to.emit(escrow, 'MilestoneAutoReleased')
        .withArgs(agreementId, milestoneId, freelancer.address, amount)

      expect(await token.balanceOf(freelancer.address)).to.equal(
        freelancerBefore + amount,
      )
      expect((await escrow.getMilestone(agreementId, milestoneId)).state).to.equal(3n) // Released
    })

    it('blocks auto-release when milestone is disputed', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      const latestBlock = await ethers.provider.getBlock('latest')
      const reviewDueAt = BigInt(latestBlock.timestamp) + 100n
      await escrow
        .connect(client)
        .setMilestoneProtection(agreementId, milestoneId, 0n, reviewDueAt)

      // Open dispute
      await escrow.connect(client).openDispute(agreementId, milestoneId)

      // Advance time past review window
      await ethers.provider.send('evm_increaseTime', [200])
      await ethers.provider.send('evm_mine')

      // Auto-release must revert because state is Disputed
      await expect(
        escrow.autoReleaseMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')
    })

    it('reclaims undelivered funds to client after deadline with grace passes', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId, amount } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      const latestBlock = await ethers.provider.getBlock('latest')
      const deadlineWithGrace = BigInt(latestBlock.timestamp) + 200n

      await escrow
        .connect(client)
        .setMilestoneProtection(agreementId, milestoneId, deadlineWithGrace, 0n)

      // Before deadline: reverts
      await expect(
        escrow.connect(client).reclaimUndeliveredMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'DeadlineNotPassed')

      // Advance time past deadline + grace
      await ethers.provider.send('evm_increaseTime', [250])
      await ethers.provider.send('evm_mine')

      const clientBefore = await token.balanceOf(client.address)
      await expect(
        escrow.connect(client).reclaimUndeliveredMilestone(agreementId, milestoneId),
      )
        .to.emit(escrow, 'MilestoneRefunded')
        .withArgs(agreementId, milestoneId, client.address, amount)
        .to.emit(escrow, 'MilestoneReclaimed')
        .withArgs(agreementId, milestoneId, client.address, amount)

      expect(await token.balanceOf(client.address)).to.equal(clientBefore + amount)
      expect((await escrow.getMilestone(agreementId, milestoneId)).state).to.equal(4n) // Refunded
    })

    it('blocks reclaim when milestone is disputed', async function () {
      const { client, freelancer, arbitrator, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      const latestBlock = await ethers.provider.getBlock('latest')
      const deadlineWithGrace = BigInt(latestBlock.timestamp) + 100n
      await escrow
        .connect(client)
        .setMilestoneProtection(agreementId, milestoneId, deadlineWithGrace, 0n)

      // Freelancer opens dispute
      await escrow.connect(freelancer).openDispute(agreementId, milestoneId)

      // Advance time past deadline
      await ethers.provider.send('evm_increaseTime', [200])
      await ethers.provider.send('evm_mine')

      // Reclaim must revert because state is Disputed
      await expect(
        escrow.connect(client).reclaimUndeliveredMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')
    })

    it('allows protection operator to configure and reclaim', async function () {
      const { deployer, client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId, amount } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      await expect(escrow.connect(deployer).setProtectionOperator(outsider.address))
        .to.emit(escrow, 'ProtectionOperatorUpdated')
        .withArgs(ethers.ZeroAddress, outsider.address)

      const latestBlock = await ethers.provider.getBlock('latest')
      const deadlineWithGrace = BigInt(latestBlock.timestamp) + 50n
      await escrow
        .connect(outsider)
        .setMilestoneProtection(agreementId, milestoneId, deadlineWithGrace, 0n)

      await ethers.provider.send('evm_increaseTime', [80])
      await ethers.provider.send('evm_mine')

      const clientBefore = await token.balanceOf(client.address)
      await expect(
        escrow.connect(outsider).reclaimUndeliveredMilestone(agreementId, milestoneId),
      )
        .to.emit(escrow, 'MilestoneReclaimed')
        .withArgs(agreementId, milestoneId, client.address, amount)

      expect(await token.balanceOf(client.address)).to.equal(clientBefore + amount)
    })

    it('rejects outsider configure/reclaim without operator role', async function () {
      const { client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      const { agreementId, milestoneId } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      await expect(
        escrow
          .connect(outsider)
          .setMilestoneProtection(agreementId, milestoneId, 1n, 0n),
      ).to.be.revertedWithCustomError(escrow, 'Unauthorized')
    })
  })
})
