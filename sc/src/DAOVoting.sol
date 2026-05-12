// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract DAOVoting is ERC2771Context {
    enum VoteType {
        AGAINST,
        FOR,
        ABSTAIN
    }

    struct Proposal {
        uint256 id;
        address proposer;
        address recipient;
        uint256 amount;
        uint256 deadline;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool executed;
    }

    uint256 public constant SECURITY_DELAY = 1 hours;

    mapping(address => uint256) public balanceOf;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => VoteType)) public votedAs;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => uint256)) private _voteWeight;

    uint256 public nextProposalId = 1;
    uint256 public totalDeposits;

    error ZeroAmount();
    error ZeroRecipient();
    error InvalidDeadline();
    error InsufficientQuorumToPropose();
    error ProposalNotFound();
    error VotingClosed();
    error VotingStillOpen();
    error NoVotingPower();
    error NotApproved();
    error AlreadyExecuted();
    error TransferFailed();

    event Funded(address indexed user, uint256 amount, uint256 newBalance);
    event ProposalCreated(
        uint256 indexed id, address indexed proposer, address recipient, uint256 amount, uint256 deadline
    );
    event Voted(uint256 indexed id, address indexed voter, VoteType voteType, uint256 weight);
    event ProposalExecuted(uint256 indexed id, address indexed recipient, uint256 amount);

    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) { }

    function fundDAO() external payable {
        if (msg.value == 0) revert ZeroAmount();
        address user = _msgSender();
        balanceOf[user] += msg.value;
        totalDeposits += msg.value;
        emit Funded(user, msg.value, balanceOf[user]);
    }

    function createProposal(address recipient, uint256 amount, uint256 deadline) external returns (uint256 id) {
        if (recipient == address(0)) revert ZeroRecipient();
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        address proposer = _msgSender();
        if (balanceOf[proposer] * 10 < totalDeposits) revert InsufficientQuorumToPropose();

        id = nextProposalId++;
        proposals[id] = Proposal({
            id: id,
            proposer: proposer,
            recipient: recipient,
            amount: amount,
            deadline: deadline,
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            executed: false
        });

        emit ProposalCreated(id, proposer, recipient, amount, deadline);
    }

    function vote(uint256 proposalId, VoteType voteType) external {
        Proposal storage p = proposals[proposalId];
        if (p.id == 0) revert ProposalNotFound();
        if (block.timestamp >= p.deadline) revert VotingClosed();

        address voter = _msgSender();
        uint256 currentBalance = balanceOf[voter];
        if (currentBalance == 0) revert NoVotingPower();

        uint256 weight;
        if (hasVoted[proposalId][voter]) {
            VoteType prev = votedAs[proposalId][voter];
            weight = _voteWeight[proposalId][voter];
            if (prev == voteType) {
                emit Voted(proposalId, voter, voteType, weight);
                return;
            }
            _subtractVote(p, prev, weight);
        } else {
            weight = currentBalance;
            _voteWeight[proposalId][voter] = weight;
            hasVoted[proposalId][voter] = true;
        }

        votedAs[proposalId][voter] = voteType;
        _addVote(p, voteType, weight);
        emit Voted(proposalId, voter, voteType, weight);
    }

    function executeProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (p.id == 0) revert ProposalNotFound();
        if (p.executed) revert AlreadyExecuted();
        if (block.timestamp < p.deadline + SECURITY_DELAY) revert VotingStillOpen();
        if (p.forVotes <= p.againstVotes) revert NotApproved();

        p.executed = true;
        (bool ok,) = p.recipient.call{ value: p.amount }("");
        if (!ok) revert TransferFailed();

        emit ProposalExecuted(proposalId, p.recipient, p.amount);
    }

    function getProposal(uint256 id) external view returns (Proposal memory) {
        return proposals[id];
    }

    function getUserBalance(address user) external view returns (uint256) {
        return balanceOf[user];
    }

    function _addVote(Proposal storage p, VoteType vt, uint256 weight) private {
        if (vt == VoteType.FOR) p.forVotes += weight;
        else if (vt == VoteType.AGAINST) p.againstVotes += weight;
        else p.abstainVotes += weight;
    }

    function _subtractVote(Proposal storage p, VoteType vt, uint256 weight) private {
        if (vt == VoteType.FOR) p.forVotes -= weight;
        else if (vt == VoteType.AGAINST) p.againstVotes -= weight;
        else p.abstainVotes -= weight;
    }

    receive() external payable {
        if (msg.value == 0) revert ZeroAmount();
        balanceOf[msg.sender] += msg.value;
        totalDeposits += msg.value;
        emit Funded(msg.sender, msg.value, balanceOf[msg.sender]);
    }
}
