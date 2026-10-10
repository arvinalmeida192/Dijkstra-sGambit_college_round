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

    uint256 public nextAgreementId;

    /// @notice Optional local/test operator that may configure timers and reclaim.
    ///         Auto-release stays permissionless once reviewDueAt is set.
    address public protectionOperator;

    mapping(uint256 => Agreement) public agreements;
    /// @dev agreementId => milestoneId => Milestone
    mapping(uint256 => mapping(uint256 => Milestone)) public milestones;
    /// @dev agreementId => next milestone id to assign
    mapping(uint256 => uint256) public nextMilestoneId;

    event ProtectionOperatorUpdated(address indexed previousOperator, address indexed newOperator);

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

    error InvalidAddress();
    error InvalidAmount();
    error AgreementMissing();
    error MilestoneMissing();
    error Unauthorized();
    error InvalidState();
    error RolesMustDiffer();
    error DeadlineNotPassed();
    error ReviewWindowNotExpired();

    modifier agreementExists(uint256 agreementId) {
        if (!agreements[agreementId].exists) revert AgreementMissing();
        _;
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
            (protectionOperator != address(0) && msg.sender == protectionOperator);
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
    ) external agreementExists(agreementId) returns (uint256 milestoneId) {
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
     * @notice Client refunds a Funded (non-disputed) milestone to themselves.
     */
    function refundMilestone(
        uint256 agreementId,
        uint256 milestoneId
    ) external nonReentrant agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (msg.sender != a.client) revert Unauthorized();

        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state != MilestoneState.Funded) revert InvalidState();

        uint256 amount = m.amount;
        m.state = MilestoneState.Refunded;

        a.token.safeTransfer(a.client, amount);

        emit MilestoneRefunded(agreementId, milestoneId, a.client, amount);
    }

    /**
     * @notice Client or freelancer opens a dispute on a Funded milestone.
     *         Blocks ordinary release/refund until the arbitrator resolves.
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
     *         REVERTS if milestone is Disputed or not Funded.
     */
    function reclaimUndeliveredMilestone(
        uint256 agreementId,
        uint256 milestoneId
    ) external nonReentrant agreementExists(agreementId) {
        Agreement storage a = agreements[agreementId];
        if (!_isProtectionAdmin(a)) revert Unauthorized();

        Milestone storage m = milestones[agreementId][milestoneId];
        if (m.state != MilestoneState.Funded) revert InvalidState();
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
