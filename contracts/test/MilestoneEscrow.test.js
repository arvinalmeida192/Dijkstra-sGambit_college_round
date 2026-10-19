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

  describe('verifiable milestone fulfilment and signed attestations', function () {
    const ATTESTATION_TYPES = {
      MilestoneVerificationAttestation: [
        { name: 'agreementId', type: 'uint256' },
        { name: 'milestoneId', type: 'uint256' },
        { name: 'agreementVersion', type: 'uint256' },
        { name: 'criteriaHash', type: 'bytes32' },
        { name: 'submissionHash', type: 'bytes32' },
        { name: 'outcome', type: 'uint8' },
        { name: 'nonce', type: 'bytes32' },
        { name: 'issuedAt', type: 'uint256' },
        { name: 'expiresAt', type: 'uint256' },
      ],
    }

    async function buildSignedAttestation(escrow, signer, overrides = {}) {
      const latestBlock = await ethers.provider.getBlock('latest')
      const now = BigInt(latestBlock.timestamp)
      const network = await ethers.provider.getNetwork()
      const escrowAddress = await escrow.getAddress()

      const domain = overrides.domain || {
        name: 'FairworkMilestoneEscrow',
        version: '1',
        chainId: network.chainId,
        verifyingContract: escrowAddress,
      }

      const attestation = {
        agreementId: overrides.agreementId ?? 0n,
        milestoneId: overrides.milestoneId ?? 0n,
        agreementVersion: overrides.agreementVersion ?? 1n,
        criteriaHash:
          overrides.criteriaHash ??
          ethers.keccak256(ethers.toUtf8Bytes('frozen-criteria-v1')),
        submissionHash:
          overrides.submissionHash ??
          ethers.keccak256(ethers.toUtf8Bytes('deliverable-artifact-v1')),
        outcome: overrides.outcome ?? 1,
        nonce:
          overrides.nonce ??
          ethers.keccak256(ethers.toUtf8Bytes(`nonce-${now}-${Math.random()}`)),
        issuedAt: overrides.issuedAt ?? now,
        expiresAt: overrides.expiresAt ?? now + 3600n,
      }

      const signature = await signer.signTypedData(
        domain,
        ATTESTATION_TYPES,
        attestation,
      )

      return { attestation, signature }
    }

    it('releases escrow to freelancer on valid signed attestation without client approval (immediate when challengeWindow == 0)', async function () {
      const { deployer, client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      const verifier = outsider

      await expect(escrow.connect(deployer).setAuthorizedVerifier(verifier.address, true))
        .to.emit(escrow, 'VerifierUpdated')
        .withArgs(verifier.address, true)

      const criteriaHash = ethers.keccak256(ethers.toUtf8Bytes('criteria-json-v1'))
      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('artifact-bundle-v1'))
      const amount = 250_000_000n

      await escrow
        .connect(client)
        .createAgreement(
          client.address,
          freelancer.address,
          arbitrator.address,
          await token.getAddress(),
        )
      await escrow
        .connect(client)
        .addMilestoneWithCriteria(0n, amount, criteriaHash, 1n, 0n)
      await token.connect(client).approve(await escrow.getAddress(), amount)
      await escrow.connect(client).fundMilestone(0n, 0n)

      const { attestation, signature } = await buildSignedAttestation(
        escrow,
        verifier,
        {
          agreementId: 0n,
          milestoneId: 0n,
          agreementVersion: 1n,
          criteriaHash,
          submissionHash,
          outcome: 1,
        },
      )

      const freelancerBefore = await token.balanceOf(freelancer.address)

      // Freelancer triggers verifyAndReleaseMilestone directly — client never calls releaseMilestone
      await expect(
        escrow
          .connect(freelancer)
          .verifyAndReleaseMilestone(attestation, signature),
      )
        .to.emit(escrow, 'MilestoneVerified')
        .and.to.emit(escrow, 'VerifiedMilestoneReleased')
        .withArgs(
          0n,
          0n,
          freelancer.address,
          amount,
          submissionHash,
          attestation.nonce,
        )

      expect(await token.balanceOf(freelancer.address)).to.equal(
        freelancerBefore + amount,
      )
      const ms = await escrow.getMilestone(0n, 0n)
      expect(ms.state).to.equal(3n) // Released
    })

    it('enforces bounded challenge window before verified release and blocks client unilateral refund', async function () {
      const { deployer, client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      const verifier = outsider
      await escrow.connect(deployer).setAuthorizedVerifier(verifier.address, true)

      const criteriaHash = ethers.keccak256(ethers.toUtf8Bytes('criteria-window-v1'))
      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('artifact-window-v1'))
      const challengeWindowSeconds = 3600n

      const { agreementId, milestoneId, amount } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      await escrow
        .connect(client)
        .setMilestoneVerificationCriteria(
          agreementId,
          milestoneId,
          criteriaHash,
          1n,
          challengeWindowSeconds,
        )

      const { attestation, signature } = await buildSignedAttestation(
        escrow,
        verifier,
        {
          agreementId,
          milestoneId,
          agreementVersion: 1n,
          criteriaHash,
          submissionHash,
          outcome: 1,
        },
      )

      await expect(
        escrow
          .connect(freelancer)
          .submitVerificationAttestation(attestation, signature),
      ).to.emit(escrow, 'MilestoneVerified')

      // Client cannot unilaterally refund a verified milestone
      await expect(
        escrow.connect(client).refundMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')

      // Cannot release before challenge window expires
      await expect(
        escrow.connect(freelancer).releaseVerifiedMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'ChallengeWindowActive')

      // Advance time past challenge window
      await ethers.provider.send('evm_increaseTime', [3605])
      await ethers.provider.send('evm_mine')

      const freelancerBefore = await token.balanceOf(freelancer.address)
      await expect(
        escrow.connect(freelancer).releaseVerifiedMilestone(agreementId, milestoneId),
      )
        .to.emit(escrow, 'VerifiedMilestoneReleased')
        .withArgs(
          agreementId,
          milestoneId,
          freelancer.address,
          amount,
          submissionHash,
          attestation.nonce,
        )

      expect(await token.balanceOf(freelancer.address)).to.equal(
        freelancerBefore + amount,
      )
    })

    it('freezes verified release if client opens a dispute during challenge window until arbitrator resolves', async function () {
      const { deployer, client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      const verifier = outsider
      await escrow.connect(deployer).setAuthorizedVerifier(verifier.address, true)

      const criteriaHash = ethers.keccak256(ethers.toUtf8Bytes('criteria-dispute-v1'))
      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('artifact-dispute-v1'))

      const { agreementId, milestoneId, amount } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      await escrow
        .connect(client)
        .setMilestoneVerificationCriteria(
          agreementId,
          milestoneId,
          criteriaHash,
          1n,
          1800n,
        )

      const { attestation, signature } = await buildSignedAttestation(
        escrow,
        verifier,
        {
          agreementId,
          milestoneId,
          agreementVersion: 1n,
          criteriaHash,
          submissionHash,
          outcome: 1,
        },
      )

      await escrow
        .connect(freelancer)
        .submitVerificationAttestation(attestation, signature)

      // Client opens dispute during challenge window
      await escrow.connect(client).openDispute(agreementId, milestoneId)

      // Advance past challenge deadline
      await ethers.provider.send('evm_increaseTime', [2000])
      await ethers.provider.send('evm_mine')

      // Verified release is blocked while Disputed
      await expect(
        escrow.connect(freelancer).releaseVerifiedMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')

      // Arbitrator resolves in favour of freelancer
      const freelancerBefore = await token.balanceOf(freelancer.address)
      await escrow
        .connect(arbitrator)
        .resolveDispute(agreementId, milestoneId, amount)
      expect(await token.balanceOf(freelancer.address)).to.equal(
        freelancerBefore + amount,
      )
    })

    it('rejects failed outcome, expired attestation, replayed nonce, criteria mismatch, stale version, unauthorized signer, and cross-domain replay', async function () {
      const { deployer, client, freelancer, arbitrator, outsider, token, escrow } =
        await deployFixture()
      const verifier = outsider
      await escrow.connect(deployer).setAuthorizedVerifier(verifier.address, true)

      const criteriaHash = ethers.keccak256(ethers.toUtf8Bytes('criteria-v2'))
      const wrongCriteriaHash = ethers.keccak256(ethers.toUtf8Bytes('wrong-criteria'))
      const submissionHash = ethers.keccak256(ethers.toUtf8Bytes('artifact-v2'))

      const { agreementId, milestoneId, amount } = await createFundedMilestone(
        escrow,
        token,
        client,
        freelancer,
        arbitrator,
      )

      await escrow
        .connect(client)
        .setMilestoneVerificationCriteria(
          agreementId,
          milestoneId,
          criteriaHash,
          2n,
          0n,
        )

      // Cannot downgrade agreementVersion to a stale version
      await expect(
        escrow
          .connect(client)
          .setMilestoneVerificationCriteria(
            agreementId,
            milestoneId,
            criteriaHash,
            1n,
            0n,
          ),
      ).to.be.revertedWithCustomError(escrow, 'StaleAgreementVersion')

      // 1. Outcome != PASSED (e.g. 2 = FAILED, 3 = NEEDS_HUMAN_REVIEW)
      const failedAtt = await buildSignedAttestation(escrow, verifier, {
        agreementId,
        milestoneId,
        agreementVersion: 2n,
        criteriaHash,
        submissionHash,
        outcome: 2,
      })
      await expect(
        escrow
          .connect(freelancer)
          .submitVerificationAttestation(failedAtt.attestation, failedAtt.signature),
      ).to.be.revertedWithCustomError(escrow, 'VerificationNotPassed')

      // 2. Expired attestation
      const latestBlock = await ethers.provider.getBlock('latest')
      const expiredAtt = await buildSignedAttestation(escrow, verifier, {
        agreementId,
        milestoneId,
        agreementVersion: 2n,
        criteriaHash,
        submissionHash,
        outcome: 1,
        issuedAt: BigInt(latestBlock.timestamp) - 7200n,
        expiresAt: BigInt(latestBlock.timestamp) - 10n,
      })
      await expect(
        escrow
          .connect(freelancer)
          .submitVerificationAttestation(
            expiredAtt.attestation,
            expiredAtt.signature,
          ),
      ).to.be.revertedWithCustomError(escrow, 'AttestationExpired')

      // 3. Stale agreement version
      const staleVerAtt = await buildSignedAttestation(escrow, verifier, {
        agreementId,
        milestoneId,
        agreementVersion: 1n,
        criteriaHash,
        submissionHash,
        outcome: 1,
      })
      await expect(
        escrow
          .connect(freelancer)
          .submitVerificationAttestation(
            staleVerAtt.attestation,
            staleVerAtt.signature,
          ),
      ).to.be.revertedWithCustomError(escrow, 'StaleAgreementVersion')

      // 4. Criteria hash mismatch
      const badCriteriaAtt = await buildSignedAttestation(escrow, verifier, {
        agreementId,
        milestoneId,
        agreementVersion: 2n,
        criteriaHash: wrongCriteriaHash,
        submissionHash,
        outcome: 1,
      })
      await expect(
        escrow
          .connect(freelancer)
          .submitVerificationAttestation(
            badCriteriaAtt.attestation,
            badCriteriaAtt.signature,
          ),
      ).to.be.revertedWithCustomError(escrow, 'CriteriaMismatch')

      // 5. Unauthorized signer (signed by freelancer instead of authorized verifier)
      const unauthorizedAtt = await buildSignedAttestation(escrow, freelancer, {
        agreementId,
        milestoneId,
        agreementVersion: 2n,
        criteriaHash,
        submissionHash,
        outcome: 1,
      })
      await expect(
        escrow
          .connect(freelancer)
          .submitVerificationAttestation(
            unauthorizedAtt.attestation,
            unauthorizedAtt.signature,
          ),
      ).to.be.revertedWithCustomError(escrow, 'UnauthorizedVerifier')

      // 6. Cross-chain replay (wrong chainId in EIP-712 domain)
      const wrongChainAtt = await buildSignedAttestation(escrow, verifier, {
        agreementId,
        milestoneId,
        agreementVersion: 2n,
        criteriaHash,
        submissionHash,
        outcome: 1,
        domain: {
          name: 'FairworkMilestoneEscrow',
          version: '1',
          chainId: 1n,
          verifyingContract: await escrow.getAddress(),
        },
      })
      await expect(
        escrow
          .connect(freelancer)
          .submitVerificationAttestation(
            wrongChainAtt.attestation,
            wrongChainAtt.signature,
          ),
      ).to.be.revertedWithCustomError(escrow, 'UnauthorizedVerifier')

      // 7. Revoked verifier after key rotation
      await escrow.connect(deployer).setAuthorizedVerifier(verifier.address, false)
      const revokedAtt = await buildSignedAttestation(escrow, verifier, {
        agreementId,
        milestoneId,
        agreementVersion: 2n,
        criteriaHash,
        submissionHash,
        outcome: 1,
      })
      await expect(
        escrow
          .connect(freelancer)
          .submitVerificationAttestation(
            revokedAtt.attestation,
            revokedAtt.signature,
          ),
      ).to.be.revertedWithCustomError(escrow, 'UnauthorizedVerifier')

      // Re-authorize verifier and succeed once, then verify nonce replay protection on milestone 1
      await escrow.connect(deployer).setAuthorizedVerifier(verifier.address, true)
      const sharedNonce = ethers.keccak256(ethers.toUtf8Bytes('unique-nonce-999'))
      const validAtt = await buildSignedAttestation(escrow, verifier, {
        agreementId,
        milestoneId,
        agreementVersion: 2n,
        criteriaHash,
        submissionHash,
        outcome: 1,
        nonce: sharedNonce,
      })
      await escrow
        .connect(freelancer)
        .verifyAndReleaseMilestone(validAtt.attestation, validAtt.signature)

      // Duplicate release must revert
      await expect(
        escrow.connect(freelancer).releaseVerifiedMilestone(agreementId, milestoneId),
      ).to.be.revertedWithCustomError(escrow, 'InvalidState')

      // Add a second funded milestone and attempt to reuse the same nonce
      await escrow
        .connect(client)
        .addMilestoneWithCriteria(agreementId, amount, criteriaHash, 2n, 0n)
      await token.connect(client).approve(await escrow.getAddress(), amount)
      await escrow.connect(client).fundMilestone(agreementId, 1n)

      const replayedNonceAtt = await buildSignedAttestation(escrow, verifier, {
        agreementId,
        milestoneId: 1n,
        agreementVersion: 2n,
        criteriaHash,
        submissionHash,
        outcome: 1,
        nonce: sharedNonce,
      })
      await expect(
        escrow
          .connect(freelancer)
          .submitVerificationAttestation(
            replayedNonceAtt.attestation,
            replayedNonceAtt.signature,
          ),
      ).to.be.revertedWithCustomError(escrow, 'NonceAlreadyUsed')
    })

    it('end-to-end pipeline: backend sandboxed JS verifier evaluates deliverable, signs EIP-712 attestation, and MilestoneEscrow releases funds without client approval', async function () {
      const crypto = require('node:crypto')
      const {
        computeFrozenCriteriaHash,
        normalizeVerificationCriteria,
      } = await import(
        '../../backend/src/modules/verification/verification.criteria.js'
      )
      const { executeMilestoneVerification } = await import(
        '../../backend/src/modules/verification/verification.runner.js'
      )
      const { signVerificationAttestation } = await import(
        '../../backend/src/modules/verification/verification.attestation.js'
      )
      const { createEscrowVerifier } = await import(
        '../../backend/src/modules/blockchain/escrowVerifier.js'
      )

      const { deployer, client, freelancer, arbitrator, token, escrow } =
        await deployFixture()

      // Dedicated verifier wallet (Hardhat account #1 / 0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
      const verifierPk =
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
      const verifierWallet = new ethers.Wallet(verifierPk)
      await escrow
        .connect(deployer)
        .setAuthorizedVerifier(verifierWallet.address, true)

      // 1. Freeze verification criteria for software milestone
      const rawCriteria = normalizeVerificationCriteria(
        {
          acceptanceCriteria: [
            'Exports computeEscrowPayout(grossCents, feeBps) returning net payout in integer cents',
          ],
          requiredEvidence: {
            requireFile: true,
            minSizeBytes: 20,
          },
          automatedChecks: [
            {
              id: 'payout-js-suite',
              type: 'SANDBOX_JS_TEST',
              name: 'Escrow net payout calculation unit tests',
              config: {
                timeoutMs: 1500,
                assertions: [
                  {
                    name: 'computeEscrowPayout(10000, 250) === 9750',
                    fn: 'computeEscrowPayout',
                    args: [10000, 250],
                    expected: 9750,
                  },
                  {
                    name: 'computeEscrowPayout(50000, 0) === 50000',
                    fn: 'computeEscrowPayout',
                    args: [50000, 0],
                    expected: 50000,
                  },
                ],
              },
            },
          ],
        },
        'AUTOMATED_CHECK',
      )

      const criteriaHash = computeFrozenCriteriaHash({
        agreementVersion: 1,
        milestoneNumber: 1,
        title: 'M1: Escrow Payout Calculator',
        deliverableDescription: 'Deterministic JS module for net payout math',
        amount: 25000,
        verificationMethod: 'AUTOMATED_CHECK',
        verificationCriteria: rawCriteria,
        maxRevisions: 3,
        challengeWindowHours: 0,
      })

      // 2. Client creates agreement, adds milestone with frozen criteriaHash, and funds escrow on-chain
      const escrowAddress = await escrow.getAddress()
      const amountTokenBase = 250_000_000n // 250.00 USDC (6 decimals) for 25000 cents
      await escrow
        .connect(client)
        .createAgreement(
          client.address,
          freelancer.address,
          arbitrator.address,
          await token.getAddress(),
        )
      await escrow
        .connect(client)
        .addMilestoneWithCriteria(0n, amountTokenBase, criteriaHash, 1n, 0n)
      await token.connect(client).approve(escrowAddress, amountTokenBase)
      await escrow.connect(client).fundMilestone(0n, 0n)

      const milestoneModel = {
        verification_method: 'AUTOMATED_CHECK',
        verification_criteria: rawCriteria,
      }

      // 3. FAILURE CASE: Freelancer submits buggy implementation -> sandbox fails -> no attestation
      const buggyBytes = Buffer.from(
        `module.exports = { computeEscrowPayout(gross, bps) { return gross; } };`,
        'utf8',
      )
      const buggySha = crypto.createHash('sha256').update(buggyBytes).digest('hex')
      const failedRun = await executeMilestoneVerification({
        milestone: milestoneModel,
        submission: {
          id: 'sub-buggy-1',
          notes: 'First attempt',
          file_ref: 'payout.js',
          original_filename: 'payout.js',
          content_type: 'application/javascript',
          sha256_hash: buggySha,
        },
        readFileFn: async () => buggyBytes,
      })
      expect(failedRun.outcome).to.equal('FAILED')

      let signFailedError = null
      try {
        await signVerificationAttestation({
          verificationOutcome: failedRun.outcome,
          chainId: 31337,
          escrowAddress,
          onChainAgreementId: 0,
          onChainMilestoneId: 0,
          agreementVersion: 1,
          criteriaHash,
          artifactHash: failedRun.artifactHash,
          wallet: verifierWallet,
        })
      } catch (err) {
        signFailedError = err
      }
      expect(signFailedError).to.not.equal(null)

      // 4. SUCCESS CASE: Freelancer submits valid deliverable -> sandbox passes -> EIP-712 attestation signed
      const validBytes = Buffer.from(
        `
        module.exports = {
          computeEscrowPayout(grossCents, feeBps) {
            const fee = Math.floor((grossCents * feeBps) / 10000);
            return grossCents - fee;
          }
        };
        `,
        'utf8',
      )
      const validSha = crypto.createHash('sha256').update(validBytes).digest('hex')
      const passedRun = await executeMilestoneVerification({
        milestone: milestoneModel,
        submission: {
          id: 'sub-valid-2',
          notes: 'Verified implementation',
          file_ref: 'payout.js',
          original_filename: 'payout.js',
          content_type: 'application/javascript',
          sha256_hash: validSha,
        },
        readFileFn: async () => validBytes,
      })
      expect(passedRun.outcome).to.equal('PASSED')

      const latestBlock = await ethers.provider.getBlock('latest')
      const signed = await signVerificationAttestation({
        verificationOutcome: passedRun.outcome,
        chainId: 31337,
        escrowAddress,
        onChainAgreementId: 0,
        onChainMilestoneId: 0,
        agreementVersion: 1,
        criteriaHash,
        artifactHash: passedRun.artifactHash,
        issuedAt: Number(latestBlock.timestamp),
        expiresAt: Number(latestBlock.timestamp) + 3600,
        wallet: verifierWallet,
      })

      // 5. Smart contract validates signature & criteria and releases funds to freelancer WITHOUT client approval
      const freelancerBefore = await token.balanceOf(freelancer.address)
      const contractAttestation = {
        agreementId: BigInt(signed.onChainAgreementId),
        milestoneId: BigInt(signed.onChainMilestoneId),
        agreementVersion: BigInt(signed.agreementVersion),
        criteriaHash: signed.criteriaHash,
        submissionHash: signed.artifactHash,
        outcome: signed.outcome,
        nonce: signed.nonce,
        issuedAt: BigInt(signed.issuedAt),
        expiresAt: BigInt(signed.expiresAt),
      }

      const tx = await escrow
        .connect(freelancer)
        .verifyAndReleaseMilestone(contractAttestation, signed.signature)
      const receipt = await tx.wait()

      expect(await token.balanceOf(freelancer.address)).to.equal(
        freelancerBefore + amountTokenBase,
      )

      // 6. Backend escrowVerifier independently verifies the on-chain receipt & VerifiedMilestoneReleased event
      const verifierService = createEscrowVerifier({
        provider: ethers.provider,
        config: {
          chainId: 31337,
          rpcUrl: 'http://127.0.0.1:8545',
          escrowAddress,
          tokenDecimals: 6,
        },
      })
      const verifiedReceipt = await verifierService.verifyTransaction(
        receipt.hash,
        { expectedAppAmount: 25000 },
      )
      expect(verifiedReceipt.ok).to.equal(true)
      expect(verifiedReceipt.status).to.equal('RELEASED')
      expect(verifiedReceipt.eventName).to.equal('VerifiedMilestoneReleased')
      expect(verifiedReceipt.reconciliation.submissionHash).to.equal(
        passedRun.artifactHash,
      )
    })
  })
})

