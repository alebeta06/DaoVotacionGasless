// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { MinimalForwarder } from "../src/MinimalForwarder.sol";
import { DAOVoting } from "../src/DAOVoting.sol";

contract RevertingRecipient {
    receive() external payable {
        revert("nope");
    }
}

contract DAOVotingTest is Test {
    MinimalForwarder internal forwarder;
    DAOVoting internal dao;

    address internal alice;
    uint256 internal alicePk;
    address internal bob;
    uint256 internal bobPk;
    address internal charlie;
    uint256 internal charliePk;

    address internal recipient = makeAddr("recipient");

    string internal constant DESC = "Construir una escuela";

    bytes32 internal constant FW_TYPEHASH =
        keccak256("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)");

    function setUp() public {
        forwarder = new MinimalForwarder();
        dao = new DAOVoting(address(forwarder));

        (alice, alicePk) = makeAddrAndKey("alice");
        (bob, bobPk) = makeAddrAndKey("bob");
        (charlie, charliePk) = makeAddrAndKey("charlie");

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    // --- forwarder signing helpers ---

    function _domainSeparator() internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = forwarder.eip712Domain();
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
    }

    function _signForward(uint256 pk, MinimalForwarder.ForwardRequest memory req) internal view returns (bytes memory) {
        bytes32 structHash =
            keccak256(abi.encode(FW_TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, keccak256(req.data)));
        bytes32 digest = MessageHashUtils.toTypedDataHash(_domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _gaslessVote(uint256 pk, address voter, uint256 proposalId, DAOVoting.VoteType vt) internal {
        MinimalForwarder.ForwardRequest memory req = MinimalForwarder.ForwardRequest({
            from: voter,
            to: address(dao),
            value: 0,
            gas: 300_000,
            nonce: forwarder.getNonce(voter),
            data: abi.encodeCall(DAOVoting.vote, (proposalId, vt))
        });
        bytes memory sig = _signForward(pk, req);
        (bool ok,) = forwarder.execute(req, sig);
        require(ok, "gasless vote inner call reverted");
    }

    // --- fundDAO ---

    function test_FundDAO_IncreasesBalance() public {
        vm.prank(alice);
        dao.fundDAO{ value: 10 ether }();
        assertEq(dao.balanceOf(alice), 10 ether);
        assertEq(dao.totalDeposits(), 10 ether);
    }

    function test_FundDAO_Multiple() public {
        vm.prank(alice);
        dao.fundDAO{ value: 6 ether }();
        vm.prank(alice);
        dao.fundDAO{ value: 4 ether }();
        assertEq(dao.balanceOf(alice), 10 ether);
        assertEq(dao.totalDeposits(), 10 ether);
    }

    function testRevert_FundDAO_Zero() public {
        vm.prank(alice);
        vm.expectRevert(DAOVoting.ZeroAmount.selector);
        dao.fundDAO{ value: 0 }();
    }

    function test_Receive_CreditsRawTransfer() public {
        vm.prank(alice);
        (bool ok,) = address(dao).call{ value: 1 ether }("");
        assertTrue(ok);
        assertEq(dao.balanceOf(alice), 1 ether);
        assertEq(dao.totalDeposits(), 1 ether);
    }

    // --- createProposal (quorum 10% por balance) ---

    function _seedDeposits() internal {
        vm.prank(alice);
        dao.fundDAO{ value: 10 ether }();
        vm.prank(bob);
        dao.fundDAO{ value: 5 ether }();
    }

    function test_CreateProposal_AtQuorum() public {
        // alice has 10/15 = 66.6% >= 10% -> ok
        _seedDeposits();
        vm.prank(alice);
        uint256 id = dao.createProposal(recipient, 1 ether, block.timestamp + 1 days, DESC);
        assertEq(id, 1);
        DAOVoting.Proposal memory p = dao.getProposal(1);
        assertEq(p.proposer, alice);
        assertEq(p.recipient, recipient);
        assertEq(p.amount, 1 ether);
        assertEq(p.deadline, block.timestamp + 1 days);
        assertEq(p.description, DESC);
        assertFalse(p.executed);
    }

    function testRevert_CreateProposal_BelowQuorum() public {
        // dave with 0.5 ETH out of 15.5 total -> 0.5*10 = 5 < 15.5
        address dave = makeAddr("dave");
        vm.deal(dave, 1 ether);
        _seedDeposits();
        vm.prank(dave);
        dao.fundDAO{ value: 0.5 ether }();

        vm.prank(dave);
        vm.expectRevert(DAOVoting.InsufficientQuorumToPropose.selector);
        dao.createProposal(recipient, 1 ether, block.timestamp + 1 days, DESC);
    }

    function test_CreateProposal_ExactlyAtTenPercent() public {
        // alice deposits 1 ETH, then bob deposits 9 ETH. alice has 1/10 = 10% -> 1*10 == 10
        vm.prank(alice);
        dao.fundDAO{ value: 1 ether }();
        vm.prank(bob);
        dao.fundDAO{ value: 9 ether }();
        vm.prank(alice);
        uint256 id = dao.createProposal(recipient, 1 ether, block.timestamp + 1 days, DESC);
        assertEq(id, 1);
    }

    function testRevert_CreateProposal_ZeroRecipient() public {
        _seedDeposits();
        vm.prank(alice);
        vm.expectRevert(DAOVoting.ZeroRecipient.selector);
        dao.createProposal(address(0), 1 ether, block.timestamp + 1 days, DESC);
    }

    function testRevert_CreateProposal_ZeroAmount() public {
        _seedDeposits();
        vm.prank(alice);
        vm.expectRevert(DAOVoting.ZeroAmount.selector);
        dao.createProposal(recipient, 0, block.timestamp + 1 days, DESC);
    }

    function testRevert_CreateProposal_EmptyDescription() public {
        _seedDeposits();
        vm.prank(alice);
        vm.expectRevert(DAOVoting.EmptyDescription.selector);
        dao.createProposal(recipient, 1 ether, block.timestamp + 1 days, "");
    }

    function testRevert_CreateProposal_PastDeadline() public {
        _seedDeposits();
        vm.prank(alice);
        vm.expectRevert(DAOVoting.InvalidDeadline.selector);
        dao.createProposal(recipient, 1 ether, block.timestamp, DESC);
    }

    // --- vote (1 persona = 1 voto, directo sin forwarder) ---

    function _seedAndCreate() internal returns (uint256 id) {
        _seedDeposits();
        vm.prank(alice);
        id = dao.createProposal(recipient, 3 ether, block.timestamp + 1 days, DESC);
    }

    function test_Vote_For() public {
        uint256 id = _seedAndCreate();
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.FOR);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.forVotes, 1);
        assertEq(p.againstVotes, 0);
        assertEq(p.abstainVotes, 0);
    }

    function test_Vote_Against() public {
        uint256 id = _seedAndCreate();
        vm.prank(bob);
        dao.vote(id, DAOVoting.VoteType.AGAINST);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.forVotes, 0);
        assertEq(p.againstVotes, 1);
    }

    function test_Vote_Abstain() public {
        uint256 id = _seedAndCreate();
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.ABSTAIN);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.abstainVotes, 1);
    }

    function test_Vote_CountsPerUser() public {
        // cada votante suma exactamente 1, sin importar cuánto depositó
        uint256 id = _seedAndCreate();
        vm.prank(alice); // depositó 10
        dao.vote(id, DAOVoting.VoteType.FOR);
        vm.prank(bob); // depositó 5
        dao.vote(id, DAOVoting.VoteType.AGAINST);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.forVotes, 1);
        assertEq(p.againstVotes, 1);
    }

    function test_Vote_Change() public {
        uint256 id = _seedAndCreate();
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.FOR);
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.AGAINST);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.forVotes, 0);
        assertEq(p.againstVotes, 1);
    }

    function test_Vote_Idempotent_SameVoteNoDoubleCount() public {
        uint256 id = _seedAndCreate();
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.FOR);
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.FOR);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.forVotes, 1);
    }

    function test_Vote_OneVotePerUser_RegardlessOfDeposit() public {
        uint256 id = _seedAndCreate();
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.FOR); // cuenta 1
        vm.prank(alice);
        dao.fundDAO{ value: 50 ether }(); // depositar más no cambia el peso
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.AGAINST); // cambia el voto, sigue siendo 1
        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.forVotes, 0);
        assertEq(p.againstVotes, 1);
    }

    function testRevert_Vote_AfterDeadline() public {
        uint256 id = _seedAndCreate();
        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        vm.expectRevert(DAOVoting.VotingClosed.selector);
        dao.vote(id, DAOVoting.VoteType.FOR);
    }

    function testRevert_Vote_NoBalance() public {
        uint256 id = _seedAndCreate();
        vm.prank(charlie);
        vm.expectRevert(DAOVoting.NoVotingPower.selector);
        dao.vote(id, DAOVoting.VoteType.FOR);
    }

    function testRevert_Vote_NonExistent() public {
        _seedDeposits();
        vm.prank(alice);
        vm.expectRevert(DAOVoting.ProposalNotFound.selector);
        dao.vote(999, DAOVoting.VoteType.FOR);
    }

    // --- vote gasless (vía forwarder) ---

    function test_Vote_Gasless_AttributesToRealUser() public {
        uint256 id = _seedAndCreate();
        _gaslessVote(alicePk, alice, id, DAOVoting.VoteType.FOR);

        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertEq(p.forVotes, 1, "alice's vote should be credited, not the forwarder's");
        assertTrue(dao.hasVoted(id, alice));
        assertFalse(dao.hasVoted(id, address(forwarder)));
    }

    // --- executeProposal ---

    function _approveAndPass(uint256 id) internal {
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.FOR); // forVotes 1 > againstVotes 0
        DAOVoting.Proposal memory p = dao.getProposal(id);
        vm.warp(p.deadline + dao.SECURITY_DELAY() + 1);
    }

    function test_Execute_Success_RecipientReceivesEth() public {
        uint256 id = _seedAndCreate();
        _approveAndPass(id);
        uint256 before_ = recipient.balance;
        dao.executeProposal(id);
        assertEq(recipient.balance - before_, 3 ether);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        assertTrue(p.executed);
    }

    function testRevert_Execute_BeforeDeadline() public {
        uint256 id = _seedAndCreate();
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.FOR);
        vm.expectRevert(DAOVoting.VotingStillOpen.selector);
        dao.executeProposal(id);
    }

    function testRevert_Execute_BeforeSecurityDelay() public {
        uint256 id = _seedAndCreate();
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.FOR);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        // pasa el deadline pero no el delay
        vm.warp(p.deadline + 1);
        vm.expectRevert(DAOVoting.VotingStillOpen.selector);
        dao.executeProposal(id);
    }

    function testRevert_Execute_NotApproved() public {
        uint256 id = _seedAndCreate();
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.AGAINST);
        vm.prank(bob);
        dao.vote(id, DAOVoting.VoteType.FOR);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        vm.warp(p.deadline + dao.SECURITY_DELAY() + 1);
        // forVotes 1 vs againstVotes 1 -> no aprobada (estricto)
        vm.expectRevert(DAOVoting.NotApproved.selector);
        dao.executeProposal(id);
    }

    function testRevert_Execute_TieIsNotApproved() public {
        // empate 1-1 también NO aprueba: forVotes > againstVotes (estricto)
        uint256 id = _seedAndCreate();
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.FOR);
        vm.prank(bob);
        dao.vote(id, DAOVoting.VoteType.AGAINST);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        vm.warp(p.deadline + dao.SECURITY_DELAY() + 1);
        vm.expectRevert(DAOVoting.NotApproved.selector);
        dao.executeProposal(id);
    }

    function testRevert_Execute_Twice() public {
        uint256 id = _seedAndCreate();
        _approveAndPass(id);
        dao.executeProposal(id);
        vm.expectRevert(DAOVoting.AlreadyExecuted.selector);
        dao.executeProposal(id);
    }

    function testRevert_Execute_NonExistent() public {
        vm.expectRevert(DAOVoting.ProposalNotFound.selector);
        dao.executeProposal(999);
    }

    function testRevert_Execute_RecipientReverts() public {
        RevertingRecipient bad = new RevertingRecipient();
        _seedDeposits();
        vm.prank(alice);
        uint256 id = dao.createProposal(address(bad), 1 ether, block.timestamp + 1 days, DESC);
        vm.prank(alice);
        dao.vote(id, DAOVoting.VoteType.FOR);
        DAOVoting.Proposal memory p = dao.getProposal(id);
        vm.warp(p.deadline + dao.SECURITY_DELAY() + 1);
        vm.expectRevert(DAOVoting.TransferFailed.selector);
        dao.executeProposal(id);
    }

    // --- escenario completo del brief ---

    function test_FullScenario_FromBrief() public {
        // 1. Alice deposita 10 ETH
        vm.prank(alice);
        dao.fundDAO{ value: 10 ether }();
        // 2. Bob deposita 5 ETH
        vm.prank(bob);
        dao.fundDAO{ value: 5 ether }();
        // 3. Alice crea propuesta (10/15 = 66% >= 10%)
        vm.prank(alice);
        uint256 id = dao.createProposal(recipient, 4 ether, block.timestamp + 1 days, DESC);
        // 5. Alice vota A FAVOR (gasless)
        _gaslessVote(alicePk, alice, id, DAOVoting.VoteType.FOR);
        // 6. Bob vota EN CONTRA (gasless)
        _gaslessVote(bobPk, bob, id, DAOVoting.VoteType.AGAINST);
        // 7. Charlie deposita 20 ETH
        vm.prank(charlie);
        dao.fundDAO{ value: 20 ether }();
        // 8. Charlie vota A FAVOR (gasless)
        _gaslessVote(charliePk, charlie, id, DAOVoting.VoteType.FOR);
        // 9. Esperar deadline + delay
        DAOVoting.Proposal memory p = dao.getProposal(id);
        vm.warp(p.deadline + dao.SECURITY_DELAY() + 1);
        // 10. Daemon ejecuta
        uint256 before_ = recipient.balance;
        dao.executeProposal(id);
        assertEq(recipient.balance - before_, 4 ether);

        p = dao.getProposal(id);
        assertEq(p.forVotes, 2); // alice + charlie
        assertEq(p.againstVotes, 1); // bob
        assertTrue(p.executed);
    }
}
