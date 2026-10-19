// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MilestoneEscrow
 * @notice Minimal multi-agreement escrow for Fairwork MVP (local/test tokens only).
 *
 * Enforced on-chain:
 * - Client funds milestones with the agreement ERC-20.
 * - Client may release or refund while Funded (not Disputed).
 * - Client or freelancer may open a dispute on a Funded milestone.
 * - Disputed funds cannot use ordinary release/refund; only the arbitrator resolves.
 * - Duplicate fund / release / refund / resolve are rejected by state checks.
 *
 * Amounts are raw ERC-20 base units (whatever decimals the token uses).
 * Backend/UI mapping of display units is off-chain.
 */
contract MilestoneEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum MilestoneState {
        None, // unset / not created
        Pending, // created, awaiting funding
        Funded,
        Released,
        Refunded,
        Disputed
    }

    struct Agreement {
        address client;
        address freelancer;
        address arbitrator;
        IERC20 token;
        bool exists;
    }

    struct Milestone {
        uint256 amount; // token base units
        MilestoneState state;
        uint256 deadlineWithGrace; // unix timestamp seconds (0 = unset)
        uint256 reviewDueAt; // unix timestamp seconds (0 = unset)
    }

    uint8 public constant OUTCOME_PASSED = 1;
    uint8 public constant OUTCOME_FAILED = 2;
    uint8 public constant OUTCOME_NEEDS_HUMAN_REVIEW = 3;

    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
    bytes32 public constant EIP712_NAME_HASH =
        keccak256("FairworkMilestoneEscrow");
    bytes32 public constant EIP712_VERSION_HASH = keccak256("1");
    bytes32 public constant ATTESTATION_TYPEHASH =
        keccak256(
            "MilestoneVerificationAttestation(uint256 agreementId,uint256 milestoneId,uint256 agreementVersion,bytes32 criteriaHash,bytes32 submissionHash,uint8 outcome,bytes32 nonce,uint256 issuedAt,uint256 expiresAt)"
        );

    struct VerificationAttestation {
        uint256 agreementId;
        uint256 milestoneId;
        uint256 agreementVersion;
        bytes32 criteriaHash;
        bytes32 submissionHash;
        uint8 outcome;
        bytes32 nonce;
        uint256 issuedAt;
        uint256 expiresAt;
    }

    struct MilestoneVerificationConfig {
        bytes32 criteriaHash;
        uint256 agreementVersion;
        uint64 challengeWindowSeconds;
        bool configured;
    }

    struct MilestoneVerificationState {
        bytes32 verifiedSubmissionHash;
        bytes32 criteriaHash;
        bytes32 attestationNonce;
        uint256 agreementVersion;
        address verifier;
        uint64 verifiedAt;
        uint64 challengeDeadline;
        bool verified;
    }

    uint256 public nextAgreementId;

    /// @notice Deployer / administrator who can manage authorized verifiers.
    address public admin;

    /// @notice Optional local/test operator that may configure timers and reclaim.
    ///         Auto-release stays permissionless once reviewDueAt is set.
    address public protectionOperator;

    uint256 private immutable _cachedChainId;
    bytes32 private immutable _cachedDomainSeparator;

    mapping(uint256 => Agreement) public agreements;
    /// @dev agreementId => milestoneId => Milestone
    mapping(uint256 => mapping(uint256 => Milestone)) public milestones;
    /// @dev agreementId => next milestone id to assign
    mapping(uint256 => uint256) public nextMilestoneId;

    /// @dev Authorized independent verifier signers (supports key rotation and revocation)
    mapping(address => bool) public authorizedVerifiers;

    /// @dev Replay protection for signed verification attestations
    mapping(bytes32 => bool) public usedNonces;

    /// @dev agreementId => milestoneId => verification criteria commitment
    mapping(uint256 => mapping(uint256 => MilestoneVerificationConfig))
        public milestoneVerificationConfigs;

    /// @dev agreementId => milestoneId => verified attestation state
    mapping(uint256 => mapping(uint256 => MilestoneVerificationState))
        public milestoneVerificationStates;

    event ProtectionOperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event VerifierUpdated(address indexed verifier, bool authorized);

    event AgreementCreated(
        uint256 indexed agreementId,
        address indexed client,
        address indexed freelancer,
        address arbitrator,
        address token
    );

    event MilestoneAdded(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        uint256 amount
    );

    event MilestoneFunded(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        address indexed funder,
        uint256 amount
    );

    event MilestoneReleased(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        address indexed to,
        uint256 amount
    );

    event MilestoneRefunded(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        address indexed to,
        uint256 amount
    );

    event DisputeOpened(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        address indexed openedBy
    );

    event DisputeResolved(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        address indexed arbitrator,
        uint256 releaseToFreelancer,
        uint256 refundToClient
    );

    event MilestoneAutoReleased(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        address indexed to,
        uint256 amount
    );

    event MilestoneReclaimed(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        address indexed to,
        uint256 amount
    );

    event MilestoneProtectionConfigured(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        uint256 deadlineWithGrace,
        uint256 reviewDueAt
    );

    event MilestoneVerificationConfigured(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        bytes32 criteriaHash,
        uint256 agreementVersion,
        uint64 challengeWindowSeconds
    );

    event MilestoneVerified(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        bytes32 submissionHash,
        bytes32 criteriaHash,
        uint256 agreementVersion,
        address indexed verifier,
        bytes32 nonce,
        uint64 challengeDeadline
    );

    event VerifiedMilestoneReleased(
        uint256 indexed agreementId,
        uint256 indexed milestoneId,
        address indexed to,
        uint256 amount,
        bytes32 submissionHash,
        bytes32 nonce
    );

    error InvalidAddress();
    error InvalidAmount();
    error AgreementMissing();
    error MilestoneMissing();
    error Unauthorized();
    error InvalidState();
    error RolesMustDiffer();
    error DeadlineNotPassed();
    error ReviewWindowNotExpired();
    error UnauthorizedVerifier();
    error NonceAlreadyUsed();
    error AttestationExpired();
    error InvalidSignature();
    error VerificationNotPassed();
    error CriteriaMismatch();
    error InvalidCriteria();
    error ChallengeWindowActive();
    error MilestoneNotVerified();
    error StaleAgreementVersion();

    constructor() {
        admin = msg.sender;
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();
    }

    modifier agreementExists(uint256 agreementId) {
        if (!agreements[agreementId].exists) revert AgreementMissing();
        _;
    }

    function domainSeparator() public view returns (bytes32) {
        if (block.chainid == _cachedChainId) {
            return _cachedDomainSeparator;
        }
        return _buildDomainSeparator();
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    EIP712_NAME_HASH,
                    EIP712_VERSION_HASH,
                    block.chainid,
                    address(this)
                )
            );
    }

    /**
     * @notice Authorize or revoke an independent verification signer.
     */
    function setAuthorizedVerifier(address verifier, bool authorized) external {
        if (
            msg.sender != admin &&
            (protectionOperator == address(0) || msg.sender != protectionOperator)
        ) {
            revert Unauthorized();
        }
        if (verifier == address(0)) revert InvalidAddress();
        authorizedVerifiers[verifier] = authorized;
        emit VerifierUpdated(verifier, authorized);
    }

    /**
     * @notice Set or rotate the protection operator used by scheduled local/test jobs.
     *         First caller may set when unset; afterwards only the current operator may change it.
     */
    function setProtectionOperator(address newOperator) external {
        if (protectionOperator != address(0) && msg.sender != protectionOperator) {
            revert Unauthorized();
        }
        address previous = protectionOperator;
        protectionOperator = newOperator;
        emit ProtectionOperatorUpdated(previous, newOperator);
    }

    function _isProtectionAdmin(Agreement storage a) internal view returns (bool) {
        return
            msg.sender == a.client ||
            msg.sender == a.arbitrator ||
            msg.sender == admin ||
            (protectionOperator != address(0) && msg.sender == protectionOperator);
    }

    function _isVerificationCaller(Agreement storage a) internal view returns (bool) {
        return
            msg.sender == a.freelancer ||
            msg.sender == a.client ||
            msg.sender == a.arbitrator ||
            msg.sender == admin ||
            (protectionOperator != address(0) && msg.sender == protectionOperator) ||
            authorizedVerifiers[msg.sender];
    }

    /**
     * @notice Create an escrow agreement bound to one ERC-20 token and three roles.
     * @dev Client, freelancer, and arbitrator must be distinct non-zero addresses.
     */
    function createAgreement(
        address client,
        address freelancer,
        address arbitrator,
        address token
    ) external returns (uint256 agreementId) {
        if (
            client == address(0) ||
            freelancer == address(0) ||
            arbitrator == address(0) ||
            token == address(0)
        ) {
            revert InvalidAddress();
        }
        if (
            client == freelancer ||
            client == arbitrator ||
            freelancer == arbitrator
        ) {
            revert RolesMustDiffer();
        }

        agreementId = nextAgreementId++;
        agreements[agreementId] = Agreement({
            client: client,
            freelancer: freelancer,
            arbitrator: arbitrator,
            token: IERC20(token),
            exists: true
        });

        emit AgreementCreated(
            agreementId,
            client,
            freelancer,
            arbitrator,
            token
        );
    }

    /**
     * @notice Register a milestone amount before funding. Only the client may add.
     */
    function addMilestone(
        uint256 agreementId,
        uint256 amount
    ) public agreementExists(agreementId) returns (uint256 milestoneId) {
        Agreement storage a = agreements[agreementId];
        if (msg.sender != a.client) revert Unauthorized();
        if (amount == 0) revert InvalidAmount();

        milestoneId = nextMilestoneId[agreementId]++;
        milestones[agreementId][milestoneId] = Milestone({
            amount: amount,
            state: MilestoneState.Pending,
            deadlineWithGrace: 0,
            reviewDueAt: 0
        });

        emit MilestoneAdded(agreementId, milestoneId, amount);
    }

    /**
     * @notice Register a milestone and bind its frozen verification criteria in one transaction.
     */
    function addMilestoneWithCriteria(
        uint256 agreementId,
        uint256 amount,
        bytes32 criteriaHash,
        uint256 agreementVersion,
        uint64 challengeWindowSeconds
    ) external agreementExists(agreementId) returns (uint256 milestoneId) {
        milestoneId = addMilestone(agreementId, amount);
        _setMilestoneVerificationCriteria(
            agreementId,
            milestoneId,
            criteriaHash,
            agreementVersion,
            challengeWindowSeconds
        );
    }

    /**
     * @notice Bind or update (on newer agreement version prior to verification) frozen verification criteria.
     */
    function setMilestoneVerificationCriteria(
        uint256 agreementId,
        uint256 milestoneId,
        bytes32 criteriaHash,
        uint256 agreementVersion,
        uint64 challengeWindowSeconds
    ) external agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (!_isProtectionAdmin(a)) revert Unauthorized();
        _setMilestoneVerificationCriteria(
            agreementId,
            milestoneId,
            criteriaHash,
            agreementVersion,
            challengeWindowSeconds
        );
    }

    function _setMilestoneVerificationCriteria(
        uint256 agreementId,
        uint256 milestoneId,
        bytes32 criteriaHash,
        uint256 agreementVersion,
        uint64 challengeWindowSeconds
    ) internal {
        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state == MilestoneState.None) revert MilestoneMissing();
        if (
            m.state != MilestoneState.Pending &&
            m.state != MilestoneState.Funded
        ) {
            revert InvalidState();
        }
        if (milestoneVerificationStates[agreementId][milestoneId].verified) {
            revert InvalidState();
        }
        if (criteriaHash == bytes32(0) || agreementVersion == 0) {
            revert InvalidCriteria();
        }

        MilestoneVerificationConfig storage cfg = milestoneVerificationConfigs[
            agreementId
        ][milestoneId];
        if (cfg.configured && agreementVersion < cfg.agreementVersion) {
            revert StaleAgreementVersion();
        }

        cfg.criteriaHash = criteriaHash;
        cfg.agreementVersion = agreementVersion;
        cfg.challengeWindowSeconds = challengeWindowSeconds;
        cfg.configured = true;

        emit MilestoneVerificationConfigured(
            agreementId,
            milestoneId,
            criteriaHash,
            agreementVersion,
            challengeWindowSeconds
        );
    }

    /**
     * @notice Client transfers `amount` token base units into escrow for a Pending milestone.
     */
    function fundMilestone(
        uint256 agreementId,
        uint256 milestoneId
    ) external nonReentrant agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (msg.sender != a.client) revert Unauthorized();

        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state != MilestoneState.Pending) revert InvalidState();

        uint256 amount = m.amount;
        m.state = MilestoneState.Funded;

        a.token.safeTransferFrom(msg.sender, address(this), amount);

        emit MilestoneFunded(agreementId, milestoneId, msg.sender, amount);
    }

    /**
     * @notice Client releases a Funded (non-disputed) milestone to the freelancer.
     */
    function releaseMilestone(
        uint256 agreementId,
        uint256 milestoneId
    ) external nonReentrant agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (msg.sender != a.client) revert Unauthorized();

        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state != MilestoneState.Funded) revert InvalidState();

        uint256 amount = m.amount;
        m.state = MilestoneState.Released;

        a.token.safeTransfer(a.freelancer, amount);

        emit MilestoneReleased(
            agreementId,
            milestoneId,
            a.freelancer,
            amount
        );
    }

    /**
     * @notice Client refunds a Funded (non-disputed, unverified) milestone to themselves.
     *         Blocked once a milestone has passed independent verification.
     */
    function refundMilestone(
        uint256 agreementId,
        uint256 milestoneId
    ) external nonReentrant agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (msg.sender != a.client) revert Unauthorized();

        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state != MilestoneState.Funded) revert InvalidState();
        if (milestoneVerificationStates[agreementId][milestoneId].verified) {
            revert InvalidState();
        }

        uint256 amount = m.amount;
        m.state = MilestoneState.Refunded;

        a.token.safeTransfer(a.client, amount);

        emit MilestoneRefunded(agreementId, milestoneId, a.client, amount);
    }

    /**
     * @notice Compute EIP-712 digest for a MilestoneVerificationAttestation.
     */
    function hashVerificationAttestation(
        VerificationAttestation calldata att
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                att.agreementId,
                att.milestoneId,
                att.agreementVersion,
                att.criteriaHash,
                att.submissionHash,
                att.outcome,
                att.nonce,
                att.issuedAt,
                att.expiresAt
            )
        );
        return
            keccak256(
                abi.encodePacked("\x19\x01", domainSeparator(), structHash)
            );
    }

    function _recoverSigner(
        bytes32 digest,
        bytes calldata signature
    ) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) {
            v += 27;
        }
        if (v != 27 && v != 28) revert InvalidSignature();
        // EIP-2 low-s malleability check
        if (
            uint256(s) >
            0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
        ) {
            revert InvalidSignature();
        }
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }

    /**
     * @notice Validate and record a signed verification attestation on-chain.
     *         Starts the bounded challenge window (or makes milestone immediately eligible if window is 0).
     */
    function submitVerificationAttestation(
        VerificationAttestation calldata att,
        bytes calldata signature
    ) public agreementExists(att.agreementId) {
        {
            Agreement storage a = agreements[att.agreementId];
            if (!_isVerificationCaller(a)) revert Unauthorized();

            Milestone storage m = milestones[att.agreementId][att.milestoneId];
            if (m.state == MilestoneState.None) revert MilestoneMissing();
            if (m.state != MilestoneState.Funded) revert InvalidState();
            if (m.amount == 0) revert InvalidAmount();
        }

        if (milestoneVerificationStates[att.agreementId][att.milestoneId].verified) {
            revert InvalidState();
        }

        if (att.outcome != OUTCOME_PASSED) revert VerificationNotPassed();
        if (
            att.criteriaHash == bytes32(0) ||
            att.submissionHash == bytes32(0) ||
            att.nonce == bytes32(0) ||
            att.agreementVersion == 0
        ) {
            revert InvalidCriteria();
        }
        if (
            block.timestamp > att.expiresAt ||
            att.issuedAt > block.timestamp + 300
        ) {
            revert AttestationExpired();
        }
        if (usedNonces[att.nonce]) revert NonceAlreadyUsed();

        uint64 challengeDeadline;
        {
            MilestoneVerificationConfig storage cfg = milestoneVerificationConfigs[
                att.agreementId
            ][att.milestoneId];
            if (cfg.configured) {
                if (att.agreementVersion != cfg.agreementVersion) {
                    revert StaleAgreementVersion();
                }
                if (att.criteriaHash != cfg.criteriaHash) {
                    revert CriteriaMismatch();
                }
            }
            challengeDeadline =
                uint64(block.timestamp) +
                cfg.challengeWindowSeconds;
        }

        address signer = _recoverSigner(
            hashVerificationAttestation(att),
            signature
        );
        if (!authorizedVerifiers[signer]) revert UnauthorizedVerifier();

        usedNonces[att.nonce] = true;

        MilestoneVerificationState storage vState = milestoneVerificationStates[
            att.agreementId
        ][att.milestoneId];
        vState.verifiedSubmissionHash = att.submissionHash;
        vState.criteriaHash = att.criteriaHash;
        vState.attestationNonce = att.nonce;
        vState.agreementVersion = att.agreementVersion;
        vState.verifier = signer;
        vState.verifiedAt = uint64(block.timestamp);
        vState.challengeDeadline = challengeDeadline;
        vState.verified = true;

        emit MilestoneVerified(
            att.agreementId,
            att.milestoneId,
            att.submissionHash,
            att.criteriaHash,
            att.agreementVersion,
            signer,
            att.nonce,
            challengeDeadline
        );
    }

    /**
     * @notice Release a Funded, verified milestone to the freelancer once any configured challenge window has elapsed.
     *         Does NOT require client approval. Blocked if milestone is Disputed or already settled.
     */
    function releaseVerifiedMilestone(
        uint256 agreementId,
        uint256 milestoneId
    ) public nonReentrant agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (!_isVerificationCaller(a)) revert Unauthorized();

        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state == MilestoneState.None) revert MilestoneMissing();
        if (m.state != MilestoneState.Funded) revert InvalidState();

        MilestoneVerificationState storage vState = milestoneVerificationStates[
            agreementId
        ][milestoneId];
        if (!vState.verified) revert MilestoneNotVerified();
        if (block.timestamp < vState.challengeDeadline) {
            revert ChallengeWindowActive();
        }

        uint256 amount = m.amount;
        m.state = MilestoneState.Released;

        a.token.safeTransfer(a.freelancer, amount);

        emit MilestoneReleased(
            agreementId,
            milestoneId,
            a.freelancer,
            amount
        );
        emit VerifiedMilestoneReleased(
            agreementId,
            milestoneId,
            a.freelancer,
            amount,
            vState.verifiedSubmissionHash,
            vState.attestationNonce
        );
    }

    /**
     * @notice Submit a signed verification attestation and release escrow in one transaction
     *         (when challengeWindowSeconds == 0).
     */
    function verifyAndReleaseMilestone(
        VerificationAttestation calldata att,
        bytes calldata signature
    ) external {
        submitVerificationAttestation(att, signature);
        releaseVerifiedMilestone(att.agreementId, att.milestoneId);
    }

    /**
     * @notice Client or freelancer opens a dispute on a Funded milestone.
     *         Blocks ordinary release/refund and verified release until the arbitrator resolves.
     */
    function openDispute(
        uint256 agreementId,
        uint256 milestoneId
    ) external agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (msg.sender != a.client && msg.sender != a.freelancer) {
            revert Unauthorized();
        }

        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state != MilestoneState.Funded) revert InvalidState();

        m.state = MilestoneState.Disputed;

        emit DisputeOpened(agreementId, milestoneId, msg.sender);
    }

    /**
     * @notice Arbitrator resolves a disputed milestone with a release/refund split.
     * @param releaseToFreelancer Token base units paid to freelancer (remainder to client).
     *        Must be <= milestone.amount. Use 0 for full refund, amount for full release.
     */
    function resolveDispute(
        uint256 agreementId,
        uint256 milestoneId,
        uint256 releaseToFreelancer
    ) external nonReentrant agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (msg.sender != a.arbitrator) revert Unauthorized();

        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state != MilestoneState.Disputed) revert InvalidState();
        if (releaseToFreelancer > m.amount) revert InvalidAmount();

        uint256 amount = m.amount;
        uint256 toFreelancer = releaseToFreelancer;
        uint256 toClient = amount - toFreelancer;

        // Terminal: treat full release / full refund / split distinctly for indexing.
        if (toFreelancer == amount) {
            m.state = MilestoneState.Released;
        } else if (toFreelancer == 0) {
            m.state = MilestoneState.Refunded;
        } else {
            // Split still settles funds; mark Released as the paid-out terminal for indexing.
            // Both sides received a payout; event carries the split amounts.
            m.state = MilestoneState.Released;
        }

        if (toFreelancer > 0) {
            a.token.safeTransfer(a.freelancer, toFreelancer);
        }
        if (toClient > 0) {
            a.token.safeTransfer(a.client, toClient);
        }

        emit DisputeResolved(
            agreementId,
            milestoneId,
            msg.sender,
            toFreelancer,
            toClient
        );
    }

    function getMilestone(
        uint256 agreementId,
        uint256 milestoneId
    ) external view returns (uint256 amount, MilestoneState state) {
        Milestone storage m = milestones[agreementId][milestoneId];
        return (m.amount, m.state);
    }

    function getMilestoneVerification(
        uint256 agreementId,
        uint256 milestoneId
    )
        external
        view
        returns (
            MilestoneVerificationConfig memory config,
            MilestoneVerificationState memory state
        )
    {
        return (
            milestoneVerificationConfigs[agreementId][milestoneId],
            milestoneVerificationStates[agreementId][milestoneId]
        );
    }

    /**
     * @notice Configure deadline and review window on a milestone.
     *         Client or arbitrator may set. Reverts if milestone is resolved or missing.
     */
    function setMilestoneProtection(
        uint256 agreementId,
        uint256 milestoneId,
        uint256 deadlineWithGrace,
        uint256 reviewDueAt
    ) external agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (!_isProtectionAdmin(a)) revert Unauthorized();

        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state == MilestoneState.None) revert MilestoneMissing();
        if (m.state == MilestoneState.Released || m.state == MilestoneState.Refunded) {
            revert InvalidState();
        }

        m.deadlineWithGrace = deadlineWithGrace;
        m.reviewDueAt = reviewDueAt;

        emit MilestoneProtectionConfigured(
            agreementId,
            milestoneId,
            deadlineWithGrace,
            reviewDueAt
        );
    }

    /**
     * @notice Auto-release a Funded milestone to the freelancer when review window expires.
     *         Callable when reviewDueAt has passed and milestone is Funded.
     *         REVERTS if milestone is Disputed or not Funded.
     */
    function autoReleaseMilestone(
        uint256 agreementId,
        uint256 milestoneId
    ) external nonReentrant agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        Milestone storage m = milestones[agreementId][milestoneId];

        if (m.state != MilestoneState.Funded) revert InvalidState();
        if (m.reviewDueAt == 0 || block.timestamp < m.reviewDueAt) {
            revert ReviewWindowNotExpired();
        }

        uint256 amount = m.amount;
        m.state = MilestoneState.Released;

        a.token.safeTransfer(a.freelancer, amount);

        emit MilestoneReleased(
            agreementId,
            milestoneId,
            a.freelancer,
            amount
        );
        emit MilestoneAutoReleased(
            agreementId,
            milestoneId,
            a.freelancer,
            amount
        );
    }

    /**
     * @notice Client or arbitrator reclaims funds for an undelivered milestone after deadline + grace.
     *         REVERTS if milestone is Disputed, already Verified, or not Funded.
     */
    function reclaimUndeliveredMilestone(
        uint256 agreementId,
        uint256 milestoneId
    ) external nonReentrant agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (!_isProtectionAdmin(a)) revert Unauthorized();

        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state != MilestoneState.Funded) revert InvalidState();
        if (milestoneVerificationStates[agreementId][milestoneId].verified) {
            revert InvalidState();
        }
        if (m.deadlineWithGrace == 0 || block.timestamp < m.deadlineWithGrace) {
            revert DeadlineNotPassed();
        }

        uint256 amount = m.amount;
        m.state = MilestoneState.Refunded;

        a.token.safeTransfer(a.client, amount);

        emit MilestoneRefunded(agreementId, milestoneId, a.client, amount);
        emit MilestoneReclaimed(agreementId, milestoneId, a.client, amount);
    }

    function getMilestoneProtection(
        uint256 agreementId,
        uint256 milestoneId
    ) external view returns (uint256 deadlineWithGrace, uint256 reviewDueAt) {
        Milestone storage m = milestones[agreementId][milestoneId];
        return (m.deadlineWithGrace, m.reviewDueAt);
    }
}
